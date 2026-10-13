-- BL-017: request a spot, accept, decline, withdraw.
--
-- Following the current frontend (Game Details -> Request to Play, the host's
-- Play Request screen, Match Details):
--   * request_to_join / accept_request / decline_request / withdraw_request
--     RPCs, named as in the API spec.
--   * A request can carry a short message to the host. It lives in its own
--     table so it stays between the requester and the host, even after the
--     request is accepted and the roster row becomes public.
--   * Every status change is kept in game_participant_history.
--   * The first acceptance creates the game's match. For a singles game posted
--     by a player, the organiser and the accepted player are put on sides a
--     and b.
--   * Requests and status changes are only possible while the game is open:
--     not cancelled, not deleted, not started.
--
-- Not here, by decision: hiding the exact venue until a player is accepted
-- (PHY-02). The current UI shows the venue on Find Games and Game Details;
-- see team item 1. Withdrawal time windows and reliability are BL-054;
-- notifications for requests and acceptances are BL-050.

-- ---------------------------------------------------------------------------
-- 1. Request messages
-- ---------------------------------------------------------------------------

create table public.game_request_message (
  post_id uuid not null,
  player_id uuid not null,
  message text not null check (length(trim(message)) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (post_id, player_id),
  foreign key (post_id, player_id)
    references public.game_participant (post_id, player_id) on delete cascade
);

comment on table public.game_request_message is
  'The optional note a player sends with a join request ("Hi! I''d love to '
  'join..."). Readable by the requester, the game''s organiser or club admins, '
  'and admins only. Written by request_to_join.';

alter table public.game_request_message enable row level security;

create policy "game_request_message: requester, host or admin reads"
  on public.game_request_message for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

create policy "game_request_message: registered players only"
  on public.game_request_message as restrictive for all to authenticated
  using ((select private.is_registered()))
  with check ((select private.is_registered()));

revoke insert, update, delete on public.game_request_message from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Status history
-- ---------------------------------------------------------------------------

create table public.game_participant_history (
  history_id bigint generated always as identity primary key,
  post_id uuid not null,
  player_id uuid not null,
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  foreign key (post_id, player_id)
    references public.game_participant (post_id, player_id) on delete cascade
);

create index game_participant_history_lookup_idx
  on public.game_participant_history (post_id, player_id, changed_at);

comment on table public.game_participant_history is
  'Every status a join request has been through, who changed it and when. '
  'Written by a trigger; nobody can edit it. changed_by is null for system '
  'changes.';

alter table public.game_participant_history enable row level security;

create policy "game_participant_history: requester, host or admin reads"
  on public.game_participant_history for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

create policy "game_participant_history: registered players only"
  on public.game_participant_history as restrictive for all to authenticated
  using ((select private.is_registered()))
  with check ((select private.is_registered()));

revoke insert, update, delete on public.game_participant_history from anon, authenticated;

create or replace function private.record_participant_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.game_participant_history (post_id, player_id, from_status, to_status, changed_by)
    values (
      new.post_id, new.player_id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger game_participant_history_record
  after insert or update of status on public.game_participant
  for each row execute function private.record_participant_history();

-- ---------------------------------------------------------------------------
-- 3. Only while the game is open
-- ---------------------------------------------------------------------------
-- Applies to direct table writes and the RPCs alike. service_role (no
-- auth.uid()) is trusted and skips it.

create or replace function private.game_is_open_for_requests(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and gp.deleted_at is null
      and gp.status in ('open', 'full')
      and gp.proposed_time > now()
  );
$$;

create or replace function private.validate_participant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if not (select private.game_is_open_for_requests(new.post_id)) then
    raise exception 'This game is no longer taking requests: it has started, been cancelled or been removed.'
      using errcode = '23514';
  end if;

  if new.status in ('accepted', 'rejected') and new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

-- Runs after the capacity trigger (alphabetical order of BEFORE triggers).
create trigger game_participant_validate_change
  before insert or update on public.game_participant
  for each row execute function private.validate_participant_change();

-- ---------------------------------------------------------------------------
-- 4. "Has happened" means a result exists
-- ---------------------------------------------------------------------------
-- BL-013 counted any match. Now that acceptance creates the match up front,
-- that would stop organisers deleting an upcoming game they had accepted
-- someone into. A game has happened once it has started or a result has been
-- submitted.

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
        or exists (
          select 1 from public.match m
          join public.match_result r on r.match_id = m.match_id
          where m.post_id = gp.post_id
        )
      )
  );
$$;

comment on function private.game_has_happened(uuid) is
  'A game has happened once its start time has passed or any result has been '
  'submitted for one of its matches.';

-- ---------------------------------------------------------------------------
-- 5. The first acceptance creates the match
-- ---------------------------------------------------------------------------

create or replace function private.create_match_on_first_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_match_id uuid;
begin
  select * into v_post from public.game_post where post_id = new.post_id;

  -- The organiser's own roster row is not an acceptance.
  if new.player_id is not distinct from v_post.organiser_id then
    return new;
  end if;

  if exists (select 1 from public.match m where m.post_id = new.post_id) then
    return new;
  end if;

  insert into public.match (post_id, created_by, format, venue_id, suburb)
  values (
    new.post_id,
    coalesce((select auth.uid()), v_post.organiser_id),
    v_post.format, v_post.venue_id, v_post.suburb
  )
  returning match_id into v_match_id;

  if v_post.format = 'singles' and v_post.organiser_id is not null then
    insert into public.match_participant (match_id, player_id, side)
    values (v_match_id, v_post.organiser_id, 'a'), (v_match_id, new.player_id, 'b');
  end if;

  return new;
end;
$$;

comment on function private.create_match_on_first_acceptance() is
  'BL-017: the first accepted player (other than the organiser) creates the '
  'game''s match. Singles games posted by a player get both sides filled. '
  'Doubles sides are picked later on Match Details.';

create trigger game_participant_first_acceptance
  after insert or update of status on public.game_participant
  for each row
  when (new.status = 'accepted')
  execute function private.create_match_on_first_acceptance();

-- ---------------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_to_join(p_post_id uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_existing text;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.game_post where post_id = p_post_id and deleted_at is null) then
    raise exception 'Game not found.' using errcode = '42501';
  end if;

  if (select private.can_manage_post(p_post_id)) then
    raise exception 'You organise this game.' using errcode = '23514';
  end if;

  select status into v_existing
  from public.game_participant where post_id = p_post_id and player_id = v_me;

  if v_existing in ('requested', 'accepted') then
    raise exception 'You have already asked to join this game.' using errcode = '23505';
  elsif v_existing = 'rejected' then
    raise exception 'The organiser has declined your request for this game.' using errcode = '23514';
  elsif v_existing = 'withdrawn' then
    update public.game_participant
    set status = 'requested', requested_at = now(), responded_at = null
    where post_id = p_post_id and player_id = v_me;
  else
    insert into public.game_participant (post_id, player_id, status)
    values (p_post_id, v_me, 'requested');
  end if;

  if nullif(trim(p_message), '') is not null then
    insert into public.game_request_message (post_id, player_id, message)
    values (p_post_id, v_me, trim(p_message))
    on conflict (post_id, player_id) do update set message = excluded.message, created_at = now();
  end if;
end;
$$;

comment on function public.request_to_join(uuid, text) is
  'Ask to join a game, with an optional note to the host (max 300 chars): '
  'supabase.rpc(''request_to_join'', { p_post_id, p_message }). A withdrawn '
  'request can be made again; a declined one cannot.';

create or replace function private.respond_to_request(p_post_id uuid, p_player_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not (select private.is_registered())
     or not ((select private.can_manage_post(p_post_id)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s organiser can respond to requests.' using errcode = '42501';
  end if;

  select status into v_current
  from public.game_participant
  where post_id = p_post_id and player_id = p_player_id
  for update;

  if v_current is null then
    raise exception 'Request not found.' using errcode = '42501';
  elsif v_current <> 'requested' then
    raise exception 'This request has already been %.', v_current using errcode = '23514';
  end if;

  update public.game_participant
  set status = p_status
  where post_id = p_post_id and player_id = p_player_id;
end;
$$;

revoke all on function private.respond_to_request(uuid, uuid, text) from public;

create or replace function public.accept_request(p_post_id uuid, p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.respond_to_request(p_post_id, p_player_id, 'accepted');
$$;

comment on function public.accept_request(uuid, uuid) is
  'Organiser or club admin accepts a request: supabase.rpc(''accept_request'', '
  '{ p_post_id, p_player_id }). Refused when the game is full (check '
  'violation). The first acceptance creates the match.';

create or replace function public.decline_request(p_post_id uuid, p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.respond_to_request(p_post_id, p_player_id, 'rejected');
$$;

comment on function public.decline_request(uuid, uuid) is
  'Organiser or club admin declines a request: supabase.rpc(''decline_request'', '
  '{ p_post_id, p_player_id }). The player cannot ask again for this game.';

create or replace function public.withdraw_request(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  if (select private.can_manage_post(p_post_id)) then
    raise exception 'Organisers cancel the game instead.' using errcode = '23514';
  end if;

  update public.game_participant
  set status = 'withdrawn'
  where post_id = p_post_id
    and player_id = (select auth.uid())
    and status in ('requested', 'accepted');

  if not found then
    raise exception 'You have no request or place in this game.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.withdraw_request(uuid) is
  'A player withdraws their request or their accepted place: '
  'supabase.rpc(''withdraw_request'', { p_post_id }). Time windows and the '
  'effect on reliability come with BL-054. The API spec''s matchId parameter '
  'is replaced by the post, because a place belongs to the game.';

revoke all on function public.request_to_join(uuid, text) from public;
revoke all on function public.accept_request(uuid, uuid) from public;
revoke all on function public.decline_request(uuid, uuid) from public;
revoke all on function public.withdraw_request(uuid) from public;
grant execute on function public.request_to_join(uuid, text) to authenticated;
grant execute on function public.accept_request(uuid, uuid) to authenticated;
grant execute on function public.decline_request(uuid, uuid) to authenticated;
grant execute on function public.withdraw_request(uuid) to authenticated;
