-- Matches are left to the teammate building results and rankings
-- (decided 2026-10-08), and deleting a game needs an empty game.
--
-- 1. Removed: create_match, remove_match, the match_scheduled notification,
--    and the automatic match on a game's first acceptance. Games no longer
--    create or link matches: get_game_details returns matches: [] (no
--    canSetUpMatches), and acceptance notifications open the game, not a
--    match. The match tables and their access rules stay as they were.
-- 2. delete_game_post is refused once anyone has a request, invitation or
--    place in the game (other than the host); the host cancels instead.
--    hostActions.canDelete follows.

set check_function_bodies = off;

drop function public.create_match(uuid, uuid[], uuid[]);
drop function public.remove_match(uuid);
drop function private.match_side(uuid, text);

drop trigger game_participant_first_acceptance on public.game_participant;
drop function private.create_match_on_first_acceptance();

delete from public.notification where type = 'match_scheduled';
alter table public.notification drop constraint notification_type_check;
alter table public.notification add constraint notification_type_check check (type in (
  'match_reminder', 'match_invite', 'result_submitted', 'dispute_update', 'league_update',
  'system', 'game_cancelled', 'game_removed', 'join_request', 'request_accepted',
  'request_declined', 'request_withdrawn', 'no_show', 'invite_accepted', 'invite_declined'));

comment on table public.match is
  'One contest between two sides (match_participant.side a and b). Matches within a game '
  'are being built separately (with results and rankings); games do not create them.';

create or replace function private.game_has_other_players(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_participant x
    join public.game_post gp on gp.post_id = x.post_id
    where x.post_id = p_post_id
      and x.player_id is distinct from gp.organiser_id
      and x.status in ('requested', 'invited', 'accepted', 'no_show')
  );
$$;

comment on function private.game_has_other_players(uuid) is
  'True once anyone other than the host has a request, invitation or place in the game.';

revoke all on function private.game_has_other_players(uuid) from public;

CREATE OR REPLACE FUNCTION private.notify_participant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game text := private.describe_game(new.post_id);
  v_name text := (select p.username from public.player p where p.player_id = new.player_id);
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
        'Tap to view the game', new.post_id, null);
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
      'Tap to view the game', new.post_id, null);

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

CREATE OR REPLACE FUNCTION public.delete_game_post(p_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Once anyone has asked to join, been invited or been accepted, the game
  -- is theirs too: the host cancels it instead (they are told).
  if (select private.game_has_other_players(p_post_id)) then
    raise exception 'Players have asked to join this game, so it can''t be deleted. Cancel it instead.'
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
             'profileImageUrl', private.avatar_url(p.player_id),
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
               'profileImageUrl', private.avatar_url(p.player_id),
               'host', p.player_id is not distinct from v_post.organiser_id,
               'isDeleted', p.deleted_at is not null,
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
               -- Marked absent by the host (BL-054). Only the host sees these players.
               'noShow', x.status = 'no_show')
             order by (p.player_id is not distinct from v_post.organiser_id) desc, x.responded_at)
      from public.game_participant x
      join public.player p on p.player_id = x.player_id
      where x.post_id = p_post_id
        and (x.status = 'accepted'
             or (x.status = 'no_show' and (select private.can_manage_post(p_post_id))))
        -- BL-027: someone who blocked the caller is left off the list.
        and not x.player_id = any ((select private.blocked_me_ids())::uuid[])
    ), '[]'::jsonb),
    'canManage', (select private.can_manage_post(p_post_id)),
    -- What the host can do on this page right now, with the times the rules
    -- change. Null for everyone else.
    'hostActions', case when (select private.can_manage_post(p_post_id)) then jsonb_build_object(
      'canCancel', v_post.deleted_at is null and v_post.status in ('open', 'full')
                   and v_post.proposed_time > now() + interval '4 hours',
      'cancelClosesAt', v_post.proposed_time - interval '4 hours',
      'cancelIsLateFrom', v_post.proposed_time - interval '24 hours',
      'canDelete', v_post.deleted_at is null
                   and not private.game_has_happened(p_post_id)
                   and (v_post.status = 'cancelled' or v_post.proposed_time > now() + interval '4 hours')
                   and not private.game_has_other_players(p_post_id),
      'canMarkNoShows', v_post.deleted_at is null and v_post.status <> 'cancelled'
                        and now() >= v_post.proposed_time
                        and now() <= v_post.proposed_time + make_interval(mins => v_post.duration_minutes)
                                     + interval '48 hours',
      'noShowsOpenAt', v_post.proposed_time,
      'noShowsCloseAt', v_post.proposed_time + make_interval(mins => v_post.duration_minutes)
                        + interval '48 hours'
    ) end,
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
    -- Matches within a game are being built separately (with results and
    -- rankings). Until then the list is always empty.
    'matches', '[]'::jsonb
  );
end;
$function$;

comment on function public.delete_game_post(uuid) is
  'Organiser or group admin deletes a game: supabase.rpc(''delete_game_post'', { p_post_id }). '
  'Only while nobody else has asked to join, been invited or been accepted (cancel it '
  'instead), before it has happened, and not within 4 hours of the start unless already '
  'cancelled. The post is hidden, not removed.';

reset check_function_bodies;
