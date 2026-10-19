-- Deleting an account keeps match results and rankings (items-to-confirm 5).
--
-- Before: deleting a user from auth.users cascaded to public.player, and from
-- there to every game they organised, with the matches and results of
-- everyone who played in them.
--
-- Now the player row stays, anonymised:
--   * username becomes "Deleted User", so every screen that shows names shows
--     that, with no change to any screen function;
--   * names, date of birth, consent records, bio, suburb, blocks, club
--     memberships and their own notifications are removed;
--   * their upcoming games are cancelled (players are told) and their places
--     in other upcoming games are given up;
--   * matches, results, rankings and reports stay.
-- The login itself (auth.users, with the email) is deleted.
--
-- It runs on any deletion of the auth user: delete_my_account() below, the
-- Supabase dashboard, or the Auth admin API. That also covers the APP 13
-- right to have personal information deleted.

-- ---------------------------------------------------------------------------
-- 1. The player row outlives the login
-- ---------------------------------------------------------------------------

alter table public.player drop constraint player_player_id_fkey;

alter table public.player add column deleted_at timestamptz;

comment on column public.player.deleted_at is
  'Set when the account was deleted. The row is kept, as "Deleted User", so '
  'match results and rankings survive.';

alter table public.player drop constraint player_username_format;
alter table public.player add constraint player_username_format check (
  (deleted_at is null and username ~ '^[A-Za-z0-9_.]{3,20}$')
  or (deleted_at is not null and username = 'Deleted User')
);

-- Many deleted players share the name "Deleted User".
drop index public.player_username_unique_idx;
create unique index player_username_unique_idx
  on public.player (lower(username)) where deleted_at is null;

-- A club closed because its last member deleted their account has nobody
-- left to keep as admin. anonymise_player sets bsc.club_closing for that.
create or replace function private.keep_one_club_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('bsc.club_closing', true) = 'on' then
    return coalesce(new, old);
  end if;

  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'approved')
  then
    -- Locking the club row serialises admin changes per club, so two admins
    -- stepping down at the same moment cannot both pass the check below.
    -- If the club row is already gone, this delete is the cascade from
    -- deleting the club itself, and there is nothing left to protect.
    perform 1 from public.club where club_id = old.club_id for update;
    if not found then
      return coalesce(new, old);
    end if;

    if not exists (
      select 1
      from public.club_representative cr
      where cr.club_id = old.club_id
        and cr.player_id <> old.player_id
        and cr.role = 'admin'
    ) then
      raise exception 'A club must keep at least one admin. Make another member an admin first.'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Anonymise
-- ---------------------------------------------------------------------------

create or replace function private.anonymise_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_name text;
  v_post record;
  v_club record;
  v_next uuid;
begin
  select username into v_old_name
  from public.player where player_id = p_player_id and deleted_at is null
  for update;

  if not found then
    return;
  end if;

  update public.player
  set username = 'Deleted User', deleted_at = now(), is_verified = false
  where player_id = p_player_id;

  -- Upcoming games they organise are cancelled, and their players told.
  for v_post in
    select gp.post_id from public.game_post gp
    where gp.organiser_id = p_player_id
      and gp.deleted_at is null and gp.status in ('open', 'full')
      and gp.proposed_time > now()
  loop
    perform set_config('bsc.game_post_action', 'cancel', true);
    update public.game_post set status = 'cancelled' where post_id = v_post.post_id;
    perform set_config('bsc.game_post_action', '', true);

    insert into public.cancellation_record (post_id, reason)
    values (v_post.post_id, 'The organiser deleted their account.')
    on conflict (post_id) do nothing;

    perform private.notify_game_players(
      v_post.post_id, 'game_cancelled',
      private.describe_game(v_post.post_id) || ' was cancelled: the organiser closed their account.'
    );
  end loop;

  -- Their requests and places in other upcoming games are given up. The host
  -- is told a place has opened up, as for any withdrawal.
  update public.game_participant x
  set status = 'withdrawn'
  from public.game_post gp
  where gp.post_id = x.post_id
    and x.player_id = p_player_id
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full')
    and gp.proposed_time > now();

  delete from public.game_request_message where player_id = p_player_id;

  -- Clubs: a club whose only admin this was gets a new admin, the longest-
  -- standing member. With no members left, it is deactivated, after its
  -- upcoming games are cancelled.
  for v_club in
    select cr.club_id from public.club_representative cr
    where cr.player_id = p_player_id and cr.role = 'admin' and cr.status = 'approved'
      and not exists (
        select 1 from public.club_representative o
        where o.club_id = cr.club_id and o.player_id <> p_player_id and o.role = 'admin'
      )
  loop
    select o.player_id into v_next
    from public.club_representative o
    join public.player p on p.player_id = o.player_id
    where o.club_id = v_club.club_id and o.player_id <> p_player_id
      and o.status = 'approved' and p.deleted_at is null
    order by o.added_at
    limit 1;

    if v_next is not null then
      update public.club_representative set role = 'admin'
      where club_id = v_club.club_id and player_id = v_next;
    else
      for v_post in
        select gp.post_id from public.game_post gp
        where gp.organiser_club_id = v_club.club_id
          and gp.deleted_at is null and gp.status in ('open', 'full')
          and gp.proposed_time > now()
      loop
        perform set_config('bsc.game_post_action', 'cancel', true);
        update public.game_post set status = 'cancelled' where post_id = v_post.post_id;
        perform set_config('bsc.game_post_action', '', true);
        insert into public.cancellation_record (post_id, reason)
        values (v_post.post_id, 'The club closed.')
        on conflict (post_id) do nothing;
        perform private.notify_game_players(
          v_post.post_id, 'game_cancelled',
          private.describe_game(v_post.post_id) || ' was cancelled: the club closed.'
        );
      end loop;

      update public.club set is_active = false where club_id = v_club.club_id;
      -- Nobody is left to keep as admin, so the guard has nothing to protect.
      perform set_config('bsc.club_closing', 'on', true);
      delete from public.club_representative where club_id = v_club.club_id;
      perform set_config('bsc.club_closing', '', true);
    end if;
  end loop;

  delete from public.club_representative where player_id = p_player_id;

  delete from public.blocks where blocker_id = p_player_id or blocked_id = p_player_id;
  delete from public.notification where player_id = p_player_id;

  -- Other players' notifications name them; those now say "Deleted User".
  update public.notification
  set message = replace(message, v_old_name, 'Deleted User')
  where v_old_name is not null
    and position(v_old_name in message) > 0;

  update public.player_private
  set first_name = null, last_name = null, date_of_birth = null,
      age_declared_at = null, terms_version = null, terms_accepted_at = null,
      privacy_version = null, privacy_accepted_at = null, registered_at = null
  where player_id = p_player_id;

  update public.player_profile
  set bio = null, suburb = null, is_discoverable = false, email_notifications = false
  where player_id = p_player_id;
end;
$$;

comment on function private.anonymise_player(uuid) is
  'Turns a player into "Deleted User": keeps results and rankings, removes '
  'personal details, cancels their upcoming games. Called when their auth user '
  'is deleted.';

revoke all on function private.anonymise_player(uuid) from public;

create or replace function private.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.anonymise_player(old.id);
  return old;
end;
$$;

revoke all on function private.handle_deleted_user() from public;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function private.handle_deleted_user();

-- ---------------------------------------------------------------------------
-- 3. Players delete their own account
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from auth.users where id = v_me;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the signed-in player''s account: supabase.rpc(''delete_my_account''). '
  'Results and rankings stay under "Deleted User"; everything personal goes. '
  'Cannot be undone. Sign the player out afterwards.';

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
