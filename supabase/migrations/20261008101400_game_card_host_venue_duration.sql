-- Game cards, agreed 2026-10-08 after the last frontend check:
--
-- 1. `organiser` is called `host`, as on every screen (Game Details already
--    said host). Same object: id, name, initials, isGroup, isBlocked,
--    isDeleted and, for a group, isActive.
-- 2. Cards carry `venue` (the venue name, null for an "other venue" game),
--    `duration` ("60 mins") and `durationMinutes`, which the Play Request
--    screen shows for the game being requested.
--
-- get_game_details keeps its richer `host` (rating, reliability...) on top.

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
    -- The venue's name alone (null for an "other venue" game), and the length.
    'venue', v.name,
    'duration', gp.duration_minutes || ' mins',
    'durationMinutes', gp.duration_minutes,
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
    -- Who runs the game: a player, or a group. Called host everywhere.
    'host', case
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

CREATE OR REPLACE FUNCTION public.get_join_requests(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_card jsonb;
begin
  if not (select private.is_registered())
     or not ((select private.can_manage_post(p_post_id)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s organiser can see its requests.' using errcode = '42501';
  end if;

  v_card := private.game_card(p_post_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.post_id || ':' || x.player_id,
             'status', private.request_status_label(x.status),
             'requestedAt', x.requested_at,
             'game', v_card,
             'host', v_card -> 'host',
             'requester', jsonb_build_object(
               'id', p.player_id,
               'name', p.username,
               'initials', private.initials(p.username),
               'level', private.label(p.self_rating_band),
               'preferredFormat', private.label(pp.preferred_format),
               'profileImageUrl', null,
               'message', msg.message,
               'rating', s -> 'rating',
               'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability',
               'noShows', s -> 'noShows',
               'lateWithdrawals', s -> 'lateWithdrawals'
             ))
             order by x.requested_at)
    from public.game_participant x
    join public.game_post gp on gp.post_id = x.post_id
    join public.player p on p.player_id = x.player_id
    join public.player_profile pp on pp.player_id = x.player_id
    left join public.game_request_message msg
      on msg.post_id = x.post_id and msg.player_id = x.player_id
    cross join lateral (select private.player_stats(x.player_id) as s) st
    where x.post_id = p_post_id
      and x.player_id is distinct from gp.organiser_id
      -- BL-027: requests from players either side has blocked are not shown.
      and not x.player_id = any ((select private.blocked_ids())::uuid[])
  ), '[]'::jsonb);
end;
$function$;
