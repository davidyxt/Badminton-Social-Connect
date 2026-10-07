-- BL-052: every reliability figure, plus an overall band (items-to-confirm 14).
--
-- The formula is unchanged. A no-show already weighs twice a late change:
--   100 × (attended + 2) ÷ (attended + 2 + no-shows + ½ × (late withdrawals + late cancellations))
-- What changes is what the API sends. Wherever a reliability score appears,
-- the band appears with it, and profiles carry every count behind the score:
--   reliability, reliabilityBand, gamesPlayed, noShows, lateWithdrawals,
--   lateCancellations.
--
-- Bands (one place to change them: private.reliability_band):
--   New player            no games yet and nothing against them
--   Very reliable         90 and over
--   Reliable              75 to 89
--   Sometimes unreliable  50 to 74
--   Unreliable            under 50

create or replace function private.reliability_band(p_score numeric, p_games_played integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_games_played, 0) = 0 and p_score >= 100 then 'New player'
    when p_score >= 90 then 'Very reliable'
    when p_score >= 75 then 'Reliable'
    when p_score >= 50 then 'Sometimes unreliable'
    else 'Unreliable'
  end;
$$;

comment on function private.reliability_band(numeric, integer) is
  'BL-052: the words shown for a reliability score.';

-- ---------------------------------------------------------------------------
-- Profiles (get_player_profile) and everything built on player_stats
-- ---------------------------------------------------------------------------

create or replace function private.player_stats(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select (r.winning_side = mp.side) as won,
           coalesce(m.played_at, m.created_at) as played
    from public.match_participant mp
    join public.match m on m.match_id = mp.match_id
    join public.match_result r
      on r.match_id = m.match_id
     and r.status = 'confirmed'
     and not r.excluded_from_ranking
    where mp.player_id = p_player_id
  ),
  rel as (select private.reliability(p_player_id) as r)
  select jsonb_build_object(
    'rating', (
      select max(rk.ranking_points) from public.ranking rk where rk.player_id = p_player_id
    ),
    'wins', (select count(*) from results where won),
    'losses', (select count(*) from results where not won),
    'matches', (select count(*) from results),
    'status', case when (select count(*) from results) >= 10 then 'Established' else 'Provisional' end,
    'recentForm', coalesce((
      select jsonb_agg(case when won then 'W' else 'L' end order by played desc)
      from (select won, played from results order by played desc limit 5) last5
    ), '[]'::jsonb),
    'reliability', ((select r from rel) ->> 'score')::int,
    'reliabilityBand', private.reliability_band(
      ((select r from rel) ->> 'score')::numeric, ((select r from rel) ->> 'attended')::int),
    'gamesPlayed', ((select r from rel) ->> 'attended')::int,
    'noShows', ((select r from rel) ->> 'noShows')::int,
    'lateWithdrawals', ((select r from rel) ->> 'lateWithdrawals')::int,
    'lateCancellations', ((select r from rel) ->> 'lateCancellations')::int
  );
$$;

-- ---------------------------------------------------------------------------
-- The signed-in player's own profile: live figures, not the stored copies
-- ---------------------------------------------------------------------------

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_rel jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  v_rel := private.reliability(v_me);

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'lastName', pv.last_name,
      'name', coalesce(nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', null,
      'selfRatingBand', p.self_rating_band,
      'level', private.band_label(p.self_rating_band),
      'isVerified', p.is_verified,
      'bio', pp.bio,
      'suburb', pp.suburb,
      'state', pp.state,
      'stateName', (select s.name from public.state s where s.state_code = pp.state),
      'location', concat_ws(' · ',
        case when pp.suburb is not null then pp.suburb || ' area' end, pp.state),
      'isDiscoverable', pp.is_discoverable,
      'preferredFormat', pp.preferred_format,
      'emailNotifications', pp.email_notifications,
      'reliability', (v_rel ->> 'score')::int,
      'reliabilityBand', private.reliability_band((v_rel ->> 'score')::numeric, (v_rel ->> 'attended')::int),
      'gamesPlayed', (v_rel ->> 'attended')::int,
      'noShows', (v_rel ->> 'noShows')::int,
      'lateWithdrawals', (v_rel ->> 'lateWithdrawals')::int,
      'lateCancellations', (v_rel ->> 'lateCancellations')::int,
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      'joinedAt', p.joined_at
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    join public.player_profile pp on pp.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Player search: the stored copies, so search stays one query
-- ---------------------------------------------------------------------------

create or replace function public.search_players(
  p_query text default null,
  p_level text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_bands text[] := private.bands_for_level(p_level);
begin
  if not (select private.is_registered()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(row_obj order by name_sort)
    from (
      select lower(p.username) as name_sort,
             jsonb_build_object(
               'id', p.player_id,
               'name', p.username,
               'initials', private.initials(p.username),
               'rank', private.label(p.self_rating_band),
               'location', pp.suburb,
               'reliability', round(pp.reliability_score)::int,
               'reliabilityBand', private.reliability_band(pp.reliability_score, pp.games_played),
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[])
             ) as row_obj
      from public.player p
      join public.player_profile pp on pp.player_id = p.player_id
      join public.player_private pv on pv.player_id = p.player_id
      where pp.is_discoverable
        and pv.registered_at is not null
        and p.deleted_at is null
        and p.player_id <> (select auth.uid())
        and (v_bands is null or p.self_rating_band = any (v_bands))
        and (
          v_query is null
          or p.username ilike '%' || v_query || '%'
          or pp.suburb ilike '%' || v_query || '%'
          or replace(p.self_rating_band, '_', ' ') ilike '%' || v_query || '%'
        )
        -- BL-027: players who blocked the caller are not found. Players the
        -- caller blocked are, with a Blocked badge.
        and not p.player_id = any ((select private.blocked_me_ids())::uuid[])
      order by lower(p.username)
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Join requests and game details: band next to the score
-- ---------------------------------------------------------------------------

create or replace function public.get_join_requests(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
             'host', v_card -> 'organiser',
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
               'reliabilityBand', s -> 'reliabilityBand',
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
$$;

create or replace function public.get_game_details(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
             'initials', private.initials(p.username), 'isClub', false,
             'isDeleted', p.deleted_at is not null,
             'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[])
           ) || (
             select jsonb_build_object(
               'rating', s -> 'rating', 'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability',
               'reliabilityBand', s -> 'reliabilityBand')
             from (select private.player_stats(p.player_id) as s) x
           )
      into v_host
    from public.player p where p.player_id = v_post.organiser_id;
  else
    select jsonb_build_object(
             'id', c.club_id, 'name', c.name, 'initials', private.initials(c.name),
             'isClub', true, 'isActive', c.is_active, 'isVerified', c.is_verified)
      into v_host
    from public.club c where c.club_id = v_post.organiser_club_id;
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
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$$;
