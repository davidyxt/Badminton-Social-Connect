-- BL-013: post, edit, cancel and delete a game, plus additional features 3-5
-- from docs/additional-features.md.
--
--   * game_post gains the Post a Game form's fields: venue_id (from the seeded
--     venue list), style, duration_minutes, ability_level and notes.
--   * Cancelling goes through cancel_game_post: refused within 4 hours of the
--     start, records a cancellation_record and notifies players.
--   * Deleting hides a post instead of removing it (feature 4). Matches,
--     results and rankings are kept. Organisers may only delete games that
--     have not happened yet; deleting one that has is an admin action that
--     takes its results out of the rankings (feature 5).
--   * An inactive club cannot have upcoming games (feature 3).
--
-- Known gap, for BL-017: venue_id is readable by every signed-in player, so
-- the exact venue is visible before a request is accepted (PHY-02).

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

alter table public.game_post
  add column venue_id uuid references public.venue (venue_id) on delete set null,
  add column style text not null default 'social'
    check (style in ('social', 'competitive')),
  add column duration_minutes integer not null default 60
    check (duration_minutes between 15 and 240),
  add column ability_level text not null default 'any'
    check (ability_level in (
      'any', 'beginner', 'lower_intermediate', 'intermediate',
      'upper_intermediate', 'advanced'
    )),
  add column notes text check (length(notes) <= 300),
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column deletion_reason text check (length(deletion_reason) <= 500);

comment on column public.game_post.venue_id is
  'A venue from the seeded list, or null for "Other venue". When set, the '
  'suburb is copied from the venue.';
comment on column public.game_post.ability_level is
  'Who the game suits: any, or one of the player self-rating bands. The form '
  'offers any / beginner / intermediate / advanced.';
comment on column public.game_post.deleted_at is
  'Set when the post is deleted. Deleted posts are hidden from players but '
  'kept, with their matches and results. Only set through delete_game_post '
  'or admin_delete_game_post.';
comment on column public.game_post.deletion_reason is
  'Required when an admin deletes a game that has already happened.';

create index game_post_venue_id_idx on public.game_post (venue_id);

alter table public.match_result
  add column excluded_from_ranking boolean not null default false;

comment on column public.match_result.excluded_from_ranking is
  'True when an admin deleted the game this result belongs to. The result is '
  'kept for the record; the rating calculation (BL-024) must skip it.';

-- A game post is never removed now, so nothing should cascade from it to the
-- matches played in it. restrict makes even a service_role delete fail while
-- matches exist.
alter table public.match
  drop constraint match_post_id_fkey,
  add constraint match_post_id_fkey
    foreign key (post_id) references public.game_post (post_id) on delete restrict;

alter table public.notification
  drop constraint notification_type_check,
  add constraint notification_type_check check (type in (
    'match_reminder', 'match_invite', 'result_submitted', 'dispute_update',
    'league_update', 'system', 'game_cancelled', 'game_removed'
  ));

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

create or replace function private.game_has_happened(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and (
        gp.proposed_time <= now()
        or exists (select 1 from public.match m where m.post_id = gp.post_id)
      )
  );
$$;

comment on function private.game_has_happened(uuid) is
  'A game has happened once its start time has passed or any match has been '
  'recorded against it.';

-- "Doubles game on Sat 10 Oct, 6:00 PM in Carlton", in Melbourne time.
create or replace function private.describe_game(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select initcap(replace(gp.format, '_', ' ')) || ' game on '
         || to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy FMDD Mon, FMHH12:MI AM')
         || coalesce(' in ' || gp.suburb, '')
  from public.game_post gp
  where gp.post_id = p_post_id;
$$;

-- Tell everyone who asked to join or was accepted, apart from whoever acted.
create or replace function private.notify_game_players(
  p_post_id uuid, p_type text, p_message text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification (player_id, type, message)
  select gpp.player_id, p_type, p_message
  from public.game_participant gpp
  where gpp.post_id = p_post_id
    and gpp.status in ('requested', 'accepted')
    and gpp.player_id is distinct from (select auth.uid());
$$;

revoke all on function private.game_has_happened(uuid) from public;
revoke all on function private.describe_game(uuid) from public;
revoke all on function private.notify_game_players(uuid, text, text) from public;

-- ---------------------------------------------------------------------------
-- 3. Rules on every insert and update
-- ---------------------------------------------------------------------------
-- Status 'cancelled' and the deleted_* columns can only be set by the
-- functions below, which mark the transaction with bsc.game_post_action. A
-- client cannot set that marker: set_config is not exposed through the API.
-- service_role (no auth.uid()) is trusted and skips these checks.

create or replace function private.validate_game_post()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_action text := current_setting('bsc.game_post_action', true);
  v_trusted boolean := (select auth.uid()) is null;
begin
  -- The suburb follows the venue, so Find Games shows the right area.
  if new.venue_id is not null
     and (tg_op = 'INSERT' or new.venue_id is distinct from old.venue_id)
  then
    select s.name into new.suburb
    from public.venue v join public.suburb s on s.suburb_id = v.suburb_id
    where v.venue_id = new.venue_id;
  end if;

  new.suburb := nullif(trim(new.suburb), '');
  if new.suburb is null then
    raise exception 'Choose a venue, or enter the suburb for another venue.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.proposed_time <= now() then
      raise exception 'The game must start in the future.' using errcode = '23514';
    end if;
    if not v_trusted and (new.status <> 'open' or new.deleted_at is not null) then
      raise exception 'A new game starts open.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.proposed_time is distinct from old.proposed_time and new.proposed_time <= now() then
    raise exception 'The game must start in the future.' using errcode = '23514';
  end if;

  if v_trusted then
    return new;
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled game cannot be reopened. Post a new one.'
      using errcode = '23514';
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled'
     and v_action is distinct from 'cancel'
  then
    raise exception 'Cancel a game with cancel_game_post, which checks the 4-hour rule.'
      using errcode = '42501';
  end if;

  if (new.deleted_at, new.deleted_by, new.deletion_reason)
       is distinct from (old.deleted_at, old.deleted_by, old.deletion_reason)
     and v_action is distinct from 'delete'
  then
    raise exception 'Delete a game with delete_game_post.' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.validate_game_post() is
  'Copies the suburb from the venue, requires a suburb and a future start, '
  'and stops cancelled or deleted states being set except through '
  'cancel_game_post, delete_game_post and admin_delete_game_post.';

create trigger game_post_validate
  before insert or update on public.game_post
  for each row execute function private.validate_game_post();

-- ---------------------------------------------------------------------------
-- 4. Deleted posts are hidden; nobody hard-deletes through the API
-- ---------------------------------------------------------------------------

drop policy "game_post: readable by signed-in players" on public.game_post;
drop policy "game_post: organiser, club rep or admin deletes" on public.game_post;

create policy "game_post: readable by signed-in players unless deleted"
  on public.game_post for select to authenticated
  using (deleted_at is null or (select private.is_admin()));

revoke delete on public.game_post from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cancel
-- ---------------------------------------------------------------------------

create or replace function public.cancel_game_post(p_post_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_admin boolean := (select private.is_admin());
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  select * into v_post from public.game_post where post_id = p_post_id for update;

  if v_post.post_id is null or v_post.deleted_at is not null
     or not (v_admin or (select private.can_manage_post(p_post_id)))
  then
    raise exception 'Game not found, or you do not organise it.' using errcode = '42501';
  end if;

  if v_post.status = 'cancelled' then
    raise exception 'This game is already cancelled.' using errcode = '23505';
  end if;

  if v_post.status = 'completed' or v_post.proposed_time <= now() then
    raise exception 'This game has already started or finished, so it cannot be cancelled. Mark no-shows instead.'
      using errcode = '23514';
  end if;

  if not v_admin and v_post.proposed_time < now() + interval '4 hours' then
    raise exception 'Games cannot be cancelled within 4 hours of the start time. Mark no-shows afterwards instead.'
      using errcode = '23514';
  end if;

  perform set_config('bsc.game_post_action', 'cancel', true);
  update public.game_post set status = 'cancelled' where post_id = p_post_id;
  perform set_config('bsc.game_post_action', '', true);

  insert into public.cancellation_record (post_id, reason)
  values (p_post_id, nullif(trim(p_reason), ''))
  on conflict (post_id) do update set reason = excluded.reason, cancelled_at = now();

  perform private.notify_game_players(
    p_post_id, 'game_cancelled',
    private.describe_game(p_post_id) || ' was cancelled by the organiser.'
  );
end;
$$;

comment on function public.cancel_game_post(uuid, text) is
  'Organiser or club admin cancels an upcoming game: '
  'supabase.rpc(''cancel_game_post'', { p_post_id, p_reason }). Refused '
  'within 4 hours of the start (admins excepted) and once the game has '
  'started. Writes cancellation_record and notifies players. The post stays '
  'visible as cancelled.';

-- ---------------------------------------------------------------------------
-- 6. Delete (hide) an upcoming game
-- ---------------------------------------------------------------------------

create or replace function public.delete_game_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  select * into v_post from public.game_post where post_id = p_post_id for update;

  if v_post.post_id is null or v_post.deleted_at is not null
     or not (select private.can_manage_post(p_post_id))
  then
    raise exception 'Game not found, or you do not organise it.' using errcode = '42501';
  end if;

  if (select private.game_has_happened(p_post_id)) then
    raise exception 'This game has already happened, so only an admin can delete it.'
      using errcode = '42501';
  end if;

  if v_post.status <> 'cancelled' and v_post.proposed_time < now() + interval '4 hours' then
    raise exception 'Games cannot be deleted within 4 hours of the start time.'
      using errcode = '23514';
  end if;

  perform set_config('bsc.game_post_action', 'delete', true);
  update public.game_post
  set deleted_at = now(), deleted_by = (select auth.uid())
  where post_id = p_post_id;
  perform set_config('bsc.game_post_action', '', true);

  if v_post.status <> 'cancelled' then
    perform private.notify_game_players(
      p_post_id, 'game_removed',
      private.describe_game(p_post_id) || ' was removed by the organiser.'
    );
  end if;
end;
$$;

comment on function public.delete_game_post(uuid) is
  'Organiser or club admin deletes a game that has not happened: '
  'supabase.rpc(''delete_game_post'', { p_post_id }). The post is hidden, not '
  'removed. Subject to the 4-hour rule unless already cancelled. Games that '
  'have happened need admin_delete_game_post.';

-- ---------------------------------------------------------------------------
-- 7. Admin delete, with the warning data first
-- ---------------------------------------------------------------------------

create or replace function public.admin_game_post_deletion_impact(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'post_id', p_post_id,
      'has_happened', private.game_has_happened(p_post_id),
      'matches', (select count(*) from public.match m where m.post_id = p_post_id),
      'confirmed_results', (
        select count(*) from public.match_result r
        join public.match m on m.match_id = r.match_id
        where m.post_id = p_post_id and r.status = 'confirmed' and not r.excluded_from_ranking
      ),
      'players', coalesce((
        select jsonb_agg(distinct jsonb_build_object('player_id', p.player_id, 'username', p.username))
        from public.match m
        join public.match_participant mp on mp.match_id = m.match_id
        join public.player p on p.player_id = mp.player_id
        where m.post_id = p_post_id
      ), '[]'::jsonb),
      -- Filled in once the rating calculation exists (BL-024, Player BE-2).
      'rating_changes', null
    )
  );
end;
$$;

comment on function public.admin_game_post_deletion_impact(uuid) is
  'What deleting this game would change, for the admin''s warning: matches, '
  'confirmed results that would stop counting, and affected players. '
  'rating_changes is null until BL-024 provides the rating calculation.';

create or replace function public.admin_delete_game_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_happened boolean;
begin
  if not (select private.is_admin()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Enter a reason for deleting this game.' using errcode = '23514';
  end if;

  select * into v_post from public.game_post where post_id = p_post_id for update;
  if v_post.post_id is null or v_post.deleted_at is not null then
    raise exception 'Game not found or already deleted.' using errcode = '42501';
  end if;

  v_happened := private.game_has_happened(p_post_id);

  perform set_config('bsc.game_post_action', 'delete', true);
  update public.game_post
  set deleted_at = now(), deleted_by = (select auth.uid()), deletion_reason = trim(p_reason)
  where post_id = p_post_id;
  perform set_config('bsc.game_post_action', '', true);

  -- Results stay for the record but stop counting towards rankings.
  update public.match_result r
  set excluded_from_ranking = true
  from public.match m
  where m.match_id = r.match_id and m.post_id = p_post_id;

  perform private.notify_game_players(
    p_post_id, 'game_removed',
    private.describe_game(p_post_id) || ' was removed by an administrator.'
      || case when v_happened then ' Its results no longer count towards rankings.' else '' end
  );

  -- TODO(BL-032): write an activity_log entry once Admin BE adds the table.
end;
$$;

comment on function public.admin_delete_game_post(uuid, text) is
  'Admin deletes any game, including one that has happened: '
  'supabase.rpc(''admin_delete_game_post'', { p_post_id, p_reason }). Hides '
  'the post, marks its results excluded_from_ranking, notifies players. Show '
  'admin_game_post_deletion_impact as a warning first.';

revoke all on function public.cancel_game_post(uuid, text) from public;
revoke all on function public.delete_game_post(uuid) from public;
revoke all on function public.admin_game_post_deletion_impact(uuid) from public;
revoke all on function public.admin_delete_game_post(uuid, text) from public;
grant execute on function public.cancel_game_post(uuid, text) to authenticated;
grant execute on function public.delete_game_post(uuid) to authenticated;
grant execute on function public.admin_game_post_deletion_impact(uuid) to authenticated;
grant execute on function public.admin_delete_game_post(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Inactive clubs cannot have upcoming games (feature 3)
-- ---------------------------------------------------------------------------

create or replace function private.club_has_no_upcoming_games()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upcoming integer;
begin
  if new.is_active = false and old.is_active = true then
    select count(*) into v_upcoming
    from public.game_post gp
    where gp.organiser_club_id = new.club_id
      and gp.deleted_at is null
      and gp.status in ('open', 'full')
      and gp.proposed_time > now();

    if v_upcoming > 0 then
      raise exception 'Cancel this club''s % upcoming game(s) before deactivating it.', v_upcoming
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger club_has_no_upcoming_games
  before update of is_active on public.club
  for each row execute function private.club_has_no_upcoming_games();
