-- Request Game / Request to Play: invite one player to a singles game
-- (items-to-confirm 17, decided 2026-10-08).
--
-- It is Post a Game for two, aimed at one player, who accepts or declines.
--   invite_player(...)          the organiser posts it; returns the game id
--   accept_invite(p_post_id)    the invited player joins: the match is created
--   decline_invite(p_post_id)   the invited player says no
-- Notifications: the invited player gets match_invite; the organiser gets
-- invite_accepted or invite_declined; cancelling tells the invited player.
--
-- Rules:
--   * The game is visible only to its organiser, the invited player and admins.
--     Nobody else can find it, open it or join it.
--   * Only the invited player answers, and only through these functions: the
--     organiser cannot accept on their behalf.
--   * No inviting yourself, someone either of you has blocked, someone whose
--     profile you cannot see, or a deleted account.
--   * At most 10 unanswered invitations at a time.
--   * The invited player can open the organiser's profile to decide.
--   * Blocking or deleting an account closes open invitations, like requests.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Data
-- ---------------------------------------------------------------------------

alter table public.game_post
  add column invited_player_id uuid references public.player (player_id) on delete set null;

comment on column public.game_post.invited_player_id is
  'Set when the game is an invitation to one player (invite_player). Only the '
  'organiser, this player and admins can see the game.';

create index game_post_invited_player_id_idx
  on public.game_post (invited_player_id) where invited_player_id is not null;

alter table public.game_participant drop constraint game_participant_status_check;
alter table public.game_participant add constraint game_participant_status_check
  check (status in ('requested', 'invited', 'accepted', 'rejected', 'declined', 'withdrawn', 'no_show'));

comment on column public.game_participant.status is
  'requested (asked to join) or invited (asked by the organiser), then accepted, '
  'rejected (organiser said no), declined (invited player said no), withdrawn or no_show.';

alter table public.notification drop constraint notification_type_check;
alter table public.notification add constraint notification_type_check check (type in (
  'match_reminder', 'match_invite', 'result_submitted', 'dispute_update', 'league_update',
  'system', 'game_cancelled', 'game_removed', 'join_request', 'request_accepted',
  'request_declined', 'request_withdrawn', 'no_show', 'invite_accepted', 'invite_declined'));

-- Invitation games are private to the two players (and admins).
create policy "game_post: invitations are private to the two players"
  on public.game_post as restrictive for select to authenticated
  using (
    invited_player_id is null
    or organiser_id = (select auth.uid())
    or invited_player_id = (select auth.uid())
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 2. Guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validate_participant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- BL-054: no-shows are recorded after the start, so they skip the
  -- open-game check, but only the no-show functions may make them.
  if new.status = 'no_show' or (tg_op = 'UPDATE' and old.status = 'no_show') then
    if current_setting('bsc.participant_action', true) is distinct from 'no_show' then
      raise exception 'Use mark_no_show to record a no-show.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Invitations change only through invite_player, accept_invite and
  -- decline_invite (or blocking and account deletion).
  if new.status in ('invited', 'declined')
     or (tg_op = 'UPDATE' and old.status in ('invited', 'declined'))
  then
    if current_setting('bsc.participant_action', true) is distinct from 'invite' then
      raise exception 'Use accept_invite or decline_invite to answer an invitation.'
        using errcode = '42501';
    end if;
  end if;

  -- Nobody but the two players can join an invitation game.
  if new.status in ('requested', 'accepted') and exists (
    select 1 from public.game_post gp
    where gp.post_id = new.post_id
      and gp.invited_player_id is not null
      and new.player_id is distinct from gp.invited_player_id
      and new.player_id is distinct from gp.organiser_id
  ) then
    raise exception 'This game is not available.' using errcode = '42501';
  end if;

  if not (select private.game_is_open_for_requests(new.post_id)) then
    raise exception 'This game is no longer taking requests: it has started, been cancelled or been removed.'
      using errcode = '23514';
  end if;

  if new.status in ('requested', 'accepted')
     and (select private.is_blocked_from_game(new.post_id, new.player_id))
  then
    raise exception 'This game is not available.' using errcode = '42501';
  end if;

  if new.status in ('accepted', 'rejected') and new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  -- BL-054: giving up an accepted place within 24 hours of the start.
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'withdrawn'
     and current_setting('bsc.suppress_notifications', true) is distinct from 'on'
  then
    select gp.proposed_time into v_start from public.game_post gp where gp.post_id = new.post_id;
    new.late_withdrawal := v_start < now() + interval '24 hours';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_game_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- Only invite_player makes an invitation, and it stays one.
  if not v_trusted
     and v_action is distinct from 'invite'
     and new.invited_player_id is distinct from (case when tg_op = 'UPDATE' then old.invited_player_id end)
  then
    raise exception 'Invite a player with invite_player.' using errcode = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION private.notify_participant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game text := private.describe_game(new.post_id);
  v_name text := (select p.username from public.player p where p.player_id = new.player_id);
  v_match uuid := (select m.match_id from public.match m where m.post_id = new.post_id order by m.created_at limit 1);
  v_host uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- The organiser's own roster row is not news.
  if new.player_id in (select private.game_hosts(new.post_id)) then
    return new;
  end if;

  if new.status = 'invited' then
    perform private.dispatch_notification(
      new.player_id, 'match_invite',
      coalesce((select p.username from public.game_post gp
                join public.player p on p.player_id = gp.organiser_id
                where gp.post_id = new.post_id), 'A player')
        || ' invited you to a ' || v_game || '.',
      coalesce((select m.message from public.game_request_message m
                where m.post_id = new.post_id and m.player_id = new.player_id),
               'Tap to accept or decline'),
      new.post_id, null);
  elsif tg_op = 'UPDATE' and old.status = 'invited' and new.status = 'accepted' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'invite_accepted',
        v_name || ' accepted your invitation to the ' || v_game || '.',
        'Tap to view match details', new.post_id, v_match);
    end loop;
  elsif new.status = 'declined' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'invite_declined',
        v_name || ' declined your invitation to the ' || v_game || '.',
        'Invite someone else, or post the game for anyone to join', new.post_id, null);
    end loop;
  elsif new.status = 'requested' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'join_request',
        v_name || ' asked to join your ' || v_game || '.',
        'Tap to review the request', new.post_id, null);
    end loop;

  elsif new.status = 'accepted' then
    perform private.dispatch_notification(
      new.player_id, 'request_accepted',
      'Your request to join ' || v_game || ' was accepted.',
      'Tap to view match details', new.post_id, v_match);

  elsif new.status = 'rejected' then
    perform private.dispatch_notification(
      new.player_id, 'request_declined',
      'Your request to join ' || v_game || ' was declined.',
      'Find another game or post your own', new.post_id, null);

  elsif new.status = 'withdrawn' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'request_withdrawn',
        v_name || ' withdrew from your ' || v_game || '.',
        case when old.status = 'accepted' then 'A place has opened up' end,
        new.post_id, null);
    end loop;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_game_players(p_post_id uuid, p_type text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
begin
  for r in
    select gpp.player_id
    from public.game_participant gpp
    where gpp.post_id = p_post_id
      and gpp.status in ('requested', 'invited', 'accepted')
      and gpp.player_id is distinct from (select auth.uid())
  loop
    perform private.dispatch_notification(
      r.player_id, p_type, p_message,
      case p_type when 'game_cancelled' then 'Find another game or post your own' end,
      p_post_id, null
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION private.game_hidden_from_me(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_blocked_me uuid[] := private.blocked_me_ids();
begin
  -- An invitation is hidden from everyone but its two players and admins.
  if exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and gp.invited_player_id is not null
      and gp.organiser_id is distinct from (select auth.uid())
      and gp.invited_player_id is distinct from (select auth.uid())
  ) and not (select private.is_admin()) then
    return true;
  end if;

  if cardinality(v_blocked_me) = 0 then
    return false;
  end if;

  if exists (
    select 1 from public.game_participant me
    where me.post_id = p_post_id and me.player_id = (select auth.uid())
      and me.status in ('requested', 'invited', 'accepted')
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and (
        gp.organiser_id = any (v_blocked_me)
        or exists (
          select 1 from public.game_participant x
          where x.post_id = gp.post_id and x.status = 'accepted'
            and x.player_id = any (v_blocked_me)
        )
      )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_to_join(p_post_id uuid, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (select 1 from public.game_post
             where post_id = p_post_id and invited_player_id is not null
               and invited_player_id is distinct from v_me) then
    raise exception 'Game not found.' using errcode = '42501';
  end if;
  if (select private.can_manage_post(p_post_id)) then
    raise exception 'You organise this game.' using errcode = '23514';
  end if;

  select status into v_existing
  from public.game_participant where post_id = p_post_id and player_id = v_me;

  if v_existing in ('invited', 'declined') then
    raise exception 'You were invited to this game: answer with accept_invite or decline_invite.'
      using errcode = '23514';
  elsif v_existing in ('requested', 'accepted') then
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
$function$;

CREATE OR REPLACE FUNCTION private.can_see_profile(p_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select private.is_registered())
    -- BL-027: someone who blocked the caller is hidden from them. The
    -- caller's own blocks do not hide anyone from the caller.
    and not (p_player_id = any ((select private.blocked_me_ids())::uuid[]))
    and (
    p_player_id = (select auth.uid())
    or (select private.is_admin())
    -- Players I blocked: I can still open their profile.
    or p_player_id = any ((select private.blocked_by_me_ids())::uuid[])
    or exists (
      select 1 from public.player_profile pp
      join public.player_private pv on pv.player_id = pp.player_id
      where pp.player_id = p_player_id
        and pp.is_discoverable
        and pv.registered_at is not null
    )
    -- They asked to join a game I run.
    or exists (
      select 1 from public.game_participant gp
      where gp.player_id = p_player_id
        and (select private.can_manage_post(gp.post_id))
    )
    -- They invited me to a game.
    or exists (
      select 1 from public.game_participant mine
      join public.game_post gp on gp.post_id = mine.post_id
      where mine.player_id = (select auth.uid())
        and mine.status in ('invited', 'declined')
        and gp.organiser_id = p_player_id
    )
    -- We are both on the same game's roster.
    or exists (
      select 1 from public.game_participant mine
      join public.game_participant theirs on theirs.post_id = mine.post_id
      where mine.player_id = (select auth.uid()) and mine.status = 'accepted'
        and theirs.player_id = p_player_id and theirs.status = 'accepted'
    )
  )
  -- A deleted account has no profile to open.
  and not exists (
    select 1 from public.player d where d.player_id = p_player_id and d.deleted_at is not null
  );
$function$;

CREATE OR REPLACE FUNCTION public.block_player(p_player_id uuid, p_category text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_category text := nullif(trim(p_category), '');
  v_reason text := nullif(trim(p_reason), '');
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot block yourself.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.player where player_id = p_player_id) then
    raise exception 'Player not found.' using errcode = '42501';
  end if;
  if v_category is not null and v_category not in (
    'harassment', 'inappropriate_content', 'fake_account', 'spam',
    'safety_concern', 'underage', 'other'
  ) then
    raise exception 'Choose one of the listed reasons.' using errcode = '23514';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '23514';
  end if;

  -- Blocking again updates the reason, so a player can add one later.
  insert into public.blocks (blocker_id, blocked_id, category, reason)
  values (v_me, p_player_id, v_category, v_reason)
  on conflict (blocker_id, blocked_id) do update
    set category = coalesce(excluded.category, public.blocks.category),
        reason = coalesce(excluded.reason, public.blocks.reason);

  perform set_config('bsc.suppress_notifications', 'on', true);
  perform set_config('bsc.participant_action', 'invite', true);

  update public.game_participant x
  set status = case when x.status = 'invited' then 'declined' else 'rejected' end
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = v_me
    and x.player_id = p_player_id
    and x.status in ('requested', 'invited', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  update public.game_participant x
  set status = case when x.status = 'invited' then 'declined' else 'withdrawn' end
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = p_player_id
    and x.player_id = v_me
    and x.status in ('requested', 'invited', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  perform set_config('bsc.participant_action', '', true);
  perform set_config('bsc.suppress_notifications', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION private.anonymise_player(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_name text;
  v_post record;
  v_group record;
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
  perform set_config('bsc.participant_action', 'invite', true);
  update public.game_participant x
  set status = case when x.status = 'invited' then 'declined' else 'withdrawn' end
  from public.game_post gp
  where gp.post_id = x.post_id
    and x.player_id = p_player_id
    and x.status in ('requested', 'invited', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full')
    and gp.proposed_time > now();

  perform set_config('bsc.participant_action', '', true);

  delete from public.game_request_message where player_id = p_player_id;

  -- Groups: a group whose only admin this was gets a new admin, the longest-
  -- standing member. With no members left, it is deactivated, after its
  -- upcoming games are cancelled.
  for v_group in
    select cr.group_id from public.group_member cr
    where cr.player_id = p_player_id and cr.role = 'admin' and cr.status = 'approved'
      and not exists (
        select 1 from public.group_member o
        where o.group_id = cr.group_id and o.player_id <> p_player_id and o.role = 'admin'
      )
  loop
    select o.player_id into v_next
    from public.group_member o
    join public.player p on p.player_id = o.player_id
    where o.group_id = v_group.group_id and o.player_id <> p_player_id
      and o.status = 'approved' and p.deleted_at is null
    order by o.added_at
    limit 1;

    if v_next is not null then
      update public.group_member set role = 'admin'
      where group_id = v_group.group_id and player_id = v_next;
    else
      for v_post in
        select gp.post_id from public.game_post gp
        where gp.organiser_group_id = v_group.group_id
          and gp.deleted_at is null and gp.status in ('open', 'full')
          and gp.proposed_time > now()
      loop
        perform set_config('bsc.game_post_action', 'cancel', true);
        update public.game_post set status = 'cancelled' where post_id = v_post.post_id;
        perform set_config('bsc.game_post_action', '', true);
        insert into public.cancellation_record (post_id, reason)
        values (v_post.post_id, 'The group closed.')
        on conflict (post_id) do nothing;
        perform private.notify_game_players(
          v_post.post_id, 'game_cancelled',
          private.describe_game(v_post.post_id) || ' was cancelled: the group closed.'
        );
      end loop;

      update public.groups set is_active = false where group_id = v_group.group_id;
      -- Nobody is left to keep as admin, so the guard has nothing to protect.
      perform set_config('bsc.group_closing', 'on', true);
      delete from public.group_member where group_id = v_group.group_id;
      perform set_config('bsc.group_closing', '', true);
    end if;
  end loop;

  delete from public.group_member where player_id = p_player_id;

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
$function$;

-- ---------------------------------------------------------------------------
-- 3. Screens: game cards and Game Details say when a game is an invitation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.game_card(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', gp.post_id,
    'title', coalesce(gp.title, 'Badminton game'),
    'format', private.label(gp.format),
    'style', private.label(gp.style),
    'rank', case when gp.ability_level = 'any' then 'Any Rank' else private.label(gp.ability_level) end,
    'startsAt', gp.proposed_time,
    'endsAt', gp.proposed_time + make_interval(mins => gp.duration_minutes),
    'date', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy, FMDD Mon'),
    'time', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'FMHH12:MI AM')
            || ' – '
            || to_char((gp.proposed_time + make_interval(mins => gp.duration_minutes))
                       at time zone 'Australia/Melbourne', 'FMHH12:MI AM'),
    'location', coalesce(v.name || ', ' || gp.suburb, gp.suburb),
    'suburb', gp.suburb,
    -- Opens the venue in Google Maps. Null for "other venue" games.
    'mapsUrl', v.maps_url,
    'playerCount', (
      select count(*) from public.game_participant x
      where x.post_id = gp.post_id and x.status = 'accepted'
    ),
    'maxPlayers', gp.player_limit,
    -- An invitation to one player (Request Game).
    'isInvite', gp.invited_player_id is not null,
    'status', gp.status,
    'imageUrl', null,
    'organiser', case
      when gp.organiser_group_id is not null then jsonb_build_object(
        'id', c.group_id, 'name', c.name, 'initials', private.initials(c.name),
        'isGroup', true, 'isActive', c.is_active)
      else jsonb_build_object(
        'id', p.player_id, 'name', p.username, 'initials', private.initials(p.username),
        'isGroup', false,
        'isDeleted', p.deleted_at is not null,
        -- BL-027: the blocker sees a Blocked badge on someone they blocked.
        'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]))
    end,
    'myStatus', (
      select private.request_status_label(me.status) from public.game_participant me
      where me.post_id = gp.post_id and me.player_id = (select auth.uid())
    )
  )
  from public.game_post gp
  left join public.venue v on v.venue_id = gp.venue_id
  left join public.player p on p.player_id = gp.organiser_id
  left join public.groups c on c.group_id = gp.organiser_group_id
  where gp.post_id = p_post_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_details(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_post public.game_post;
  v_host jsonb;
begin
  select * into v_post from public.game_post where post_id = p_post_id;

  if v_post.post_id is null
     or not (select private.is_registered())
     or (v_post.deleted_at is not null and not (select private.is_admin()))
     -- BL-027: a game organised or joined by someone who blocked the caller
     -- does not exist for them.
     or private.game_hidden_from_me(p_post_id)
  then
    return null;
  end if;

  if v_post.organiser_id is not null then
    select jsonb_build_object(
             'id', p.player_id, 'name', p.username,
             'initials', private.initials(p.username), 'isGroup', false,
             'isDeleted', p.deleted_at is not null,
             'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[])
           ) || (
             select jsonb_build_object(
               'rating', s -> 'rating', 'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability')
             from (select private.player_stats(p.player_id) as s) x
           )
      into v_host
    from public.player p where p.player_id = v_post.organiser_id;
  else
    select jsonb_build_object(
             'id', c.group_id, 'name', c.name, 'initials', private.initials(c.name),
             'isGroup', true, 'isActive', c.is_active, 'isVerified', c.is_verified)
      into v_host
    from public.groups c where c.group_id = v_post.organiser_group_id;
  end if;

  return private.game_card(p_post_id) || jsonb_build_object(
    'duration', v_post.duration_minutes || ' mins',
    'durationMinutes', v_post.duration_minutes,
    'location', coalesce((select v.name from public.venue v where v.venue_id = v_post.venue_id), v_post.suburb),
    'locationDetail', v_post.suburb,
    'address', (select v.address from public.venue v where v.venue_id = v_post.venue_id),
    'venueId', v_post.venue_id,
    'notes', v_post.notes,
    'abilityLevel', v_post.ability_level,
    'host', v_host,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.player_id, 'name', p.username,
               'initials', private.initials(p.username),
               'host', p.player_id is not distinct from v_post.organiser_id,
               'isDeleted', p.deleted_at is not null,
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]))
             order by (p.player_id is not distinct from v_post.organiser_id) desc, x.responded_at)
      from public.game_participant x
      join public.player p on p.player_id = x.player_id
      where x.post_id = p_post_id and x.status = 'accepted'
        -- BL-027: someone who blocked the caller is left off the list.
        and not x.player_id = any ((select private.blocked_me_ids())::uuid[])
    ), '[]'::jsonb),
    'canManage', (select private.can_manage_post(p_post_id)),
    -- For an invitation: who was invited, their answer and the organiser's
    -- message. Null for ordinary games.
    'invite', (
      select jsonb_build_object(
        'playerId', ip.player_id,
        'name', ip.username,
        'initials', private.initials(ip.username),
        'status', x.status,
        'message', msg.message)
      from public.player ip
      left join public.game_participant x
        on x.post_id = p_post_id and x.player_id = ip.player_id
      left join public.game_request_message msg
        on msg.post_id = p_post_id and msg.player_id = ip.player_id
      where ip.player_id = v_post.invited_player_id
    ),
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

create or replace function public.invite_player(
  p_player_id uuid,
  p_proposed_time timestamptz,
  p_venue_id uuid default null,
  p_suburb text default null,
  p_duration_minutes integer default 60,
  p_style text default 'social',
  p_ability_level text default 'any',
  p_title text default null,
  p_notes text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_post uuid;
  v_message text := nullif(trim(p_message), '');
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot invite yourself.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    where p.player_id = p_player_id and p.deleted_at is null and pv.registered_at is not null
  ) or private.block_relation(p_player_id) is not null
     or not (select private.can_see_profile(p_player_id))
  then
    raise exception 'This player is not available.' using errcode = '42501';
  end if;
  if length(v_message) > 300 then
    raise exception 'Keep the message under 300 characters.' using errcode = '23514';
  end if;
  if (select count(*) from public.game_participant x
      join public.game_post gp on gp.post_id = x.post_id
      where gp.organiser_id = v_me and x.status = 'invited'
        and gp.deleted_at is null and gp.status in ('open', 'full')
        and gp.proposed_time > now()) >= 10
  then
    raise exception 'You have 10 invitations waiting for an answer. Wait for some replies, or cancel one, before inviting anyone else.'
      using errcode = '23514';
  end if;

  perform set_config('bsc.game_post_action', 'invite', true);
  insert into public.game_post (
    organiser_id, invited_player_id, format, player_limit, proposed_time,
    venue_id, suburb, duration_minutes, style, ability_level, title, notes
  )
  values (
    v_me, p_player_id, 'singles', 2, p_proposed_time,
    p_venue_id, nullif(trim(p_suburb), ''), coalesce(p_duration_minutes, 60),
    coalesce(p_style, 'social'), coalesce(p_ability_level, 'any'),
    nullif(trim(p_title), ''), nullif(trim(p_notes), '')
  )
  returning post_id into v_post;
  perform set_config('bsc.game_post_action', '', true);

  -- Writing the invitation row sends the notification; the message is
  -- then added to it.
  perform set_config('bsc.participant_action', 'invite', true);
  insert into public.game_participant (post_id, player_id, status)
  values (v_post, p_player_id, 'invited');
  perform set_config('bsc.participant_action', '', true);

  if v_message is not null then
    insert into public.game_request_message (post_id, player_id, message)
    values (v_post, p_player_id, v_message);
    update public.notification
    set detail = v_message
    where post_id = v_post and player_id = p_player_id and type = 'match_invite';
  end if;

  return v_post;
end;
$$;

comment on function public.invite_player(uuid, timestamptz, uuid, text, integer, text, text, text, text, text) is
  'Request Game: invite one player to a singles game. supabase.rpc(''invite_player'', '
  '{ p_player_id, p_proposed_time, p_venue_id | p_suburb, p_duration_minutes, p_style, '
  'p_ability_level, p_title, p_notes, p_message }) returns the game id. Same fields as Post '
  'a Game, for two players. The invited player is notified (match_invite) and answers with '
  'accept_invite / decline_invite. Only the two players and admins can see the game. At '
  'most 10 unanswered invitations at a time.';

revoke all on function public.invite_player(uuid, timestamptz, uuid, text, integer, text, text, text, text, text) from public, anon;
grant execute on function public.invite_player(uuid, timestamptz, uuid, text, integer, text, text, text, text, text) to authenticated;

create or replace function private.answer_invite(p_post_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  select x.status into v_current
  from public.game_participant x
  join public.game_post gp on gp.post_id = x.post_id
  where x.post_id = p_post_id and x.player_id = (select auth.uid())
    and gp.invited_player_id = (select auth.uid())
  for update of x;

  if v_current is null then
    raise exception 'Invitation not found.' using errcode = '42501';
  elsif v_current <> 'invited' then
    raise exception 'You have already answered this invitation.' using errcode = '23505';
  end if;

  if not (select private.game_is_open_for_requests(p_post_id)) then
    raise exception 'This game has been cancelled or has already started.' using errcode = '23514';
  end if;

  perform set_config('bsc.participant_action', 'invite', true);
  update public.game_participant
  set status = p_status
  where post_id = p_post_id and player_id = (select auth.uid());
  perform set_config('bsc.participant_action', '', true);
end;
$$;

revoke all on function private.answer_invite(uuid, text) from public;

create or replace function public.accept_invite(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.answer_invite(p_post_id, 'accepted');
$$;

comment on function public.accept_invite(uuid) is
  'The invited player accepts a Request Game invitation: supabase.rpc(''accept_invite'', '
  '{ p_post_id }). They join the game, the match is created and the organiser is notified '
  '(invite_accepted).';

create or replace function public.decline_invite(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.answer_invite(p_post_id, 'declined');
$$;

comment on function public.decline_invite(uuid) is
  'The invited player declines a Request Game invitation: supabase.rpc(''decline_invite'', '
  '{ p_post_id }). The organiser is notified (invite_declined). Declining does not affect '
  'reliability.';

revoke all on function public.accept_invite(uuid) from public, anon;
revoke all on function public.decline_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;


reset check_function_bodies;
