-- Game Details: the host's actions on the game page (2026-10-08).
--
-- The host can cancel the game and mark no-shows from Game Details; the
-- functions already work on the game (cancel_game_post, mark_no_show and
-- clear_no_show take p_post_id). Game Details now says when they apply:
--
--   hostActions (null unless the caller runs the game):
--     canCancel         true until 4 hours before the start
--     cancelClosesAt    when cancelling stops (start - 4 h)
--     cancelIsLateFrom  from when cancelling counts as late (start - 24 h)
--     canDelete         as delete_game_post allows
--     canMarkNoShows    true from the start until 48 hours after the end
--     noShowsOpenAt / noShowsCloseAt
--   players[].noShow    the host also sees players marked absent, so the
--                       mark can be undone; other players don't see them.

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
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$function$;
