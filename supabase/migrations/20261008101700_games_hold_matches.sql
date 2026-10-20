-- A game holds several matches; a match is one contest between two sides
-- (decided 2026-10-08).
--
--   game   game_post: the session (time, venue, format, players)
--   match  match: one contest, side a against side b, within a game;
--          1 v 1 for singles, 2 v 2 for doubles and mixed doubles
--   result match_result: the score of one match (e.g. 21-15 19-21 21-17)
--
-- Changes:
-- 1. The host sets up a game's matches: create_match(p_post_id, p_side_a,
--    p_side_b) and remove_match(p_match_id). The players are notified
--    (match_scheduled).
-- 2. A match is created automatically only where it is obvious: a 2-player
--    singles game (the organiser against the one player, including Request
--    Game invitations). Before, every game got one empty match on its first
--    acceptance.
-- 3. get_game_details lists every match (matches[]: number, sides, status,
--    result) instead of a single matchId; hostActions.canSetUpMatches.

set check_function_bodies = off;

alter table public.notification drop constraint notification_type_check;
alter table public.notification add constraint notification_type_check check (type in (
  'match_reminder', 'match_invite', 'result_submitted', 'dispute_update', 'league_update',
  'system', 'game_cancelled', 'game_removed', 'join_request', 'request_accepted',
  'request_declined', 'request_withdrawn', 'no_show', 'invite_accepted', 'invite_declined',
  'match_scheduled'));

comment on table public.match is
  'One contest between two sides (match_participant.side a and b): 1 v 1 for singles, '
  '2 v 2 for doubles. A game (game_post) holds any number of matches, set up by its host '
  'with create_match; a 2-player singles game gets its one match automatically.';

create or replace function private.match_side(p_match_id uuid, p_side text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.player_id,
           'name', p.username,
           'initials', private.initials(p.username),
           'profileImageUrl', private.avatar_url(p.player_id),
           'isDeleted', p.deleted_at is not null,
           'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
           'noShow', mp.status = 'no_show')
         order by p.username), '[]'::jsonb)
  from public.match_participant mp
  join public.player p on p.player_id = mp.player_id
  where mp.match_id = p_match_id and mp.side = p_side
    and not mp.player_id = any ((select private.blocked_me_ids())::uuid[]);
$$;

revoke all on function private.match_side(uuid, text) from public;

CREATE OR REPLACE FUNCTION private.create_match_on_first_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_post public.game_post;
  v_match_id uuid;
begin
  select * into v_post from public.game_post where post_id = new.post_id;

  -- The organiser's own roster row is not an acceptance.
  if new.player_id is not distinct from v_post.organiser_id then
    return new;
  end if;

  -- Only a 2-player singles game has an obvious match (the organiser against
  -- the one player). Every other game's matches are set up by the host with
  -- create_match.
  if v_post.format <> 'singles' or v_post.player_limit <> 2 or v_post.organiser_id is null then
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
                   and (v_post.status = 'cancelled' or v_post.proposed_time > now() + interval '4 hours'),
      'canMarkNoShows', v_post.deleted_at is null and v_post.status <> 'cancelled'
                        and now() >= v_post.proposed_time
                        and now() <= v_post.proposed_time + make_interval(mins => v_post.duration_minutes)
                                     + interval '48 hours',
      'noShowsOpenAt', v_post.proposed_time,
      -- Set up or remove matches (create_match / remove_match).
      'canSetUpMatches', v_post.deleted_at is null and v_post.status <> 'cancelled',
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
    -- Every match in this game, in the order they were set up. Each is one
    -- contest between side a and side b. Players who blocked the caller are
    -- left off the sides, as on the roster.
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.match_id,
               'number', m.rn,
               'status', m.status,
               'format', private.label(m.format),
               'sideA', private.match_side(m.match_id, 'a'),
               'sideB', private.match_side(m.match_id, 'b'),
               'result', (
                 select jsonb_build_object('score', r.score, 'winningSide', r.winning_side, 'status', r.status)
                 from public.match_result r
                 where r.match_id = m.match_id
                 order by (r.status = 'confirmed') desc, r.created_at desc
                 limit 1),
               'playedAt', m.played_at)
             order by m.rn)
      from (
        select mm.*, row_number() over (order by mm.created_at, mm.match_id) as rn
        from public.match mm where mm.post_id = p_post_id
      ) m
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.create_match(
  p_post_id uuid,
  p_side_a uuid[],
  p_side_b uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_size integer;
  v_match uuid;
  v_player uuid;
  v_label text;
begin
  if not (select private.is_registered())
     or not ((select private.can_manage_post(p_post_id)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s host can set up its matches.' using errcode = '42501';
  end if;

  select * into v_post from public.game_post where post_id = p_post_id;
  if v_post.deleted_at is not null or v_post.status = 'cancelled' then
    raise exception 'This game was cancelled or removed.' using errcode = '23514';
  end if;

  v_size := case when v_post.format = 'singles' then 1 else 2 end;
  if coalesce(array_length(p_side_a, 1), 0) <> v_size
     or coalesce(array_length(p_side_b, 1), 0) <> v_size
  then
    raise exception 'A % match is % against %: choose % player(s) for each side.',
      private.label(v_post.format), v_size, v_size, v_size
      using errcode = '23514';
  end if;

  if (select count(distinct x) from unnest(p_side_a || p_side_b) x) <> 2 * v_size then
    raise exception 'A player can only be on one side of a match.' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(p_side_a || p_side_b) x
    where not exists (
      select 1 from public.game_participant gp
      where gp.post_id = p_post_id and gp.player_id = x and gp.status = 'accepted')
  ) then
    raise exception 'Every player in a match must have a place in this game.' using errcode = '23514';
  end if;

  insert into public.match (post_id, created_by, format, venue_id, suburb, played_at)
  values (p_post_id, (select auth.uid()), v_post.format, v_post.venue_id, v_post.suburb, v_post.proposed_time)
  returning match_id into v_match;

  insert into public.match_participant (match_id, player_id, side)
  select v_match, x, 'a' from unnest(p_side_a) x
  union all
  select v_match, x, 'b' from unnest(p_side_b) x;

  -- "alice and erin vs carol and dan"
  select string_agg(n, ' and ' order by n) filter (where s = 'a') || ' vs '
         || string_agg(n, ' and ' order by n) filter (where s = 'b')
    into v_label
  from (select p.username as n, mp.side as s
        from public.match_participant mp join public.player p on p.player_id = mp.player_id
        where mp.match_id = v_match) t;

  foreach v_player in array (p_side_a || p_side_b) loop
    if v_player is distinct from (select auth.uid()) then
      perform private.dispatch_notification(
        v_player, 'match_scheduled',
        'A match was set up in ' || private.describe_game(p_post_id) || ': ' || v_label || '.',
        'Tap to see the matches', p_post_id, v_match);
    end if;
  end loop;

  return v_match;
end;
$$;

comment on function public.create_match(uuid, uuid[], uuid[]) is
  'The host sets up a match in their game: supabase.rpc(''create_match'', { p_post_id, '
  'p_side_a: [playerIds], p_side_b: [playerIds] }) returns the match id. One player per '
  'side for singles, two for doubles; every player must have an accepted place in the '
  'game, and nobody can be on both sides. The same player can play several matches. The '
  'players are notified (match_scheduled).';

create or replace function public.remove_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid;
begin
  select post_id into v_post from public.match where match_id = p_match_id;

  if v_post is null or not (select private.is_registered())
     or not ((select private.can_manage_post(v_post)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s host can remove its matches.' using errcode = '42501';
  end if;

  if exists (select 1 from public.match_result r where r.match_id = p_match_id and r.status = 'confirmed') then
    raise exception 'This match has a confirmed result, so only an admin can remove it.'
      using errcode = '23514';
  end if;

  delete from public.match where match_id = p_match_id;
end;
$$;

comment on function public.remove_match(uuid) is
  'The host removes a match set up by mistake: supabase.rpc(''remove_match'', { p_match_id }). '
  'Refused once the match has a confirmed result.';

revoke all on function public.create_match(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.remove_match(uuid) from public, anon;
grant execute on function public.create_match(uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.remove_match(uuid) to authenticated;

comment on function public.get_game_details(uuid) is
  'Game Details screen: the card plus duration, venue, address, Maps link, notes, host, '
  'accepted players, matches (every match in the game: number, sideA, sideB, status, '
  'result), the caller''s request status, canManage and, for the host, hostActions. Null '
  'if the game is removed (admins excepted), hidden by a block, or the caller is not '
  'registered.';

reset check_function_bodies;
