-- BL-025: rating summary, 30-day trend and leaderboards.
-- Player BE-2, see docs/features/M2-results-and-rankings.md.
-- For the Rankings screen.
--
-- Leaderboards list established players only (10 trusted singles matches,
-- 5 different opponents, RD at most 160). Provisional players see their own
-- progress on their rating summary instead. Scopes are the player's state
-- (Victoria for a VIC player) and Nearby (their suburb). A league tab comes
-- with Mini Leagues.
--
-- Ratings move once a night (phase 3), so each function returns
-- ratingsUpdatedAt, the end of the last rating run, for "Updated <date>".

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. The numbers behind the rating card
-- ---------------------------------------------------------------------------

create or replace function public.get_rating_summary(p_player_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := coalesce(p_player_id, (select auth.uid()));
  st private.rating_state;
  v_band text;
  v_state text;
  v_suburb text;
  v_state_rank integer;
  v_nearby_rank integer;
  v_state_total integer;
  v_nearby_total integer;
begin
  if not (select private.is_registered()) then
    return null;
  end if;

  if v_id is distinct from v_me and not (select private.can_see_profile(v_id)) then
    return null;
  end if;

  select * into st from private.rating_state s where s.player_id = v_id;
  select p.self_rating_band into v_band from public.player p where p.player_id = v_id;
  select pp.state, pp.suburb into v_state, v_suburb
  from public.player_profile pp where pp.player_id = v_id;

  if coalesce(st.is_established, false) then
    select 1 + count(*) filter (where o.mean > st.mean), count(*)
    into v_state_rank, v_state_total
    from private.rating_state o
    join public.player_profile op on op.player_id = o.player_id
    join public.player ot on ot.player_id = o.player_id
    join public.player_private ov on ov.player_id = o.player_id
    -- The same players the leaderboard lists: established, registered, and not
    -- hidden (apart from the player themselves).
    where o.is_established and ot.deleted_at is null and ov.registered_at is not null
      and (op.is_discoverable or o.player_id = v_id)
      and op.state is not distinct from v_state;

    select 1 + count(*) filter (where o.mean > st.mean), count(*)
    into v_nearby_rank, v_nearby_total
    from private.rating_state o
    join public.player_profile op on op.player_id = o.player_id
    join public.player ot on ot.player_id = o.player_id
    join public.player_private ov on ov.player_id = o.player_id
    where o.is_established and ot.deleted_at is null and ov.registered_at is not null
      and (op.is_discoverable or o.player_id = v_id)
      and op.state is not distinct from v_state
      and lower(op.suburb) = lower(v_suburb);
  end if;

  return jsonb_build_object(
    'playerId', v_id,
    -- Before the first trusted match this is the starting rating from the
    -- self-rating, flagged by isStartingRating.
    'rating', round(coalesce(st.mean, private.starting_rating(v_band)))::int,
    'isStartingRating', st.player_id is null,
    'rd', case when st.player_id is null then 350 else round(sqrt(st.variance))::int end,
    'grade', case when st.is_established then private.grade(st.mean) end,
    'status', case when coalesce(st.is_established, false) then 'Established' else 'Provisional' end,
    'placement', jsonb_build_object(
      'played', coalesce(st.trusted_matches, 0),
      'required', 10,
      'opponents', coalesce(st.distinct_opponents, 0),
      'opponentsRequired', 5),
    'state', v_state,
    'suburb', v_suburb,
    'stateRank', v_state_rank,
    'stateTotal', v_state_total,
    'nearbyRank', v_nearby_rank,
    'nearbyTotal', v_nearby_total,
    'change30Days', (
      select round((select h.rating_after from public.rating_history h
                    where h.player_id = v_id and h.played_at >= now() - interval '30 days'
                    order by h.played_at desc, h.created_at desc limit 1))::int
           - round((select h.rating_before from public.rating_history h
                    where h.player_id = v_id and h.played_at >= now() - interval '30 days'
                    order by h.played_at asc, h.created_at asc limit 1))::int
      where exists (select 1 from public.rating_history h
                    where h.player_id = v_id and h.played_at >= now() - interval '30 days')
    ),
    'ratingsUpdatedAt', (select b.last_run_at from private.rating_batch b)
  );
end;
$$;

comment on function public.get_rating_summary(uuid) is
  'BL-025. Rating card for the Rankings screen: supabase.rpc(''get_rating_summary'', '
  '{ p_player_id }) (omit for yourself). Keys: rating, isStartingRating, rd, grade, status '
  '(Provisional or Established), placement { played, required: 10, opponents, '
  'opponentsRequired: 5 }, state, suburb, stateRank, stateTotal, nearbyRank, nearbyTotal, '
  'change30Days, ratingsUpdatedAt (when the nightly rating run last finished). The grade '
  'and ranks are null while provisional. Null when the profile is private to you.';

-- ---------------------------------------------------------------------------
-- 2. 30-day trend
-- ---------------------------------------------------------------------------

create or replace function public.get_rating_trend(
  p_player_id uuid default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := coalesce(p_player_id, (select auth.uid()));
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Australia/Melbourne')::date;
begin
  if not (select private.is_registered()) then
    return null;
  end if;

  if v_id is distinct from v_me and not (select private.can_see_profile(v_id)) then
    return null;
  end if;

  -- One point per day: the last rating on or before the end of that day.
  -- Days before the player's first rated match have no point.
  return jsonb_build_object(
    'days', v_days,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'rating', d.rating) order by d.day)
      from (
        select gs.day::date as day,
               round((select h.rating_after from public.rating_history h
                      where h.player_id = v_id
                        and (h.played_at at time zone 'Australia/Melbourne')::date <= gs.day::date
                      order by h.played_at desc, h.created_at desc limit 1))::int as rating
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as gs(day)
      ) d
      where d.rating is not null
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_rating_trend(uuid, integer) is
  'BL-025. Rating over time for the trend chart: supabase.rpc(''get_rating_trend'', '
  '{ p_player_id, p_days }) (defaults: yourself, 30 days). { days, points: [{ date, rating }] }, '
  'one point per day from the first rated match, in Melbourne time.';

-- ---------------------------------------------------------------------------
-- 3. Leaderboards
-- ---------------------------------------------------------------------------

create or replace function public.get_leaderboard(
  p_scope text default 'state',
  p_state text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_state text;
  v_suburb text;
  v_scope text := lower(coalesce(p_scope, 'state'));
  v_result jsonb;
begin
  if not (select private.is_registered()) then
    return null;
  end if;

  if v_scope not in ('state', 'nearby') then
    raise exception 'Scope must be state or nearby.' using errcode = '22023';
  end if;

  select pp.state, pp.suburb into v_state, v_suburb
  from public.player_profile pp where pp.player_id = v_me;

  -- A state leaderboard defaults to your own state; Nearby is your suburb.
  v_state := coalesce(upper(p_state), v_state);

  with eligible as (
    select s.player_id, s.mean, p.username, pp.suburb
    from private.rating_state s
    join public.player p on p.player_id = s.player_id
    join public.player_profile pp on pp.player_id = s.player_id
    join public.player_private pv on pv.player_id = s.player_id
    where s.is_established
      and p.deleted_at is null
      and pv.registered_at is not null
      -- A hidden profile stays off the list, except for its owner.
      and (pp.is_discoverable or s.player_id = v_me)
      and pp.state is not distinct from v_state
      and (v_scope = 'state' or lower(pp.suburb) = lower(v_suburb))
  ), ranked as (
    select e.*, rank() over (order by e.mean desc) as pos
    from eligible e
  ), shaped as (
    select r.pos, r.mean, r.player_id,
           jsonb_build_object(
             'rank', r.pos,
             'id', r.player_id,
             'name', r.username,
             'initials', private.initials(r.username),
             'rating', round(r.mean)::int,
             'grade', private.grade(r.mean),
             'suburb', r.suburb,
             'isMe', r.player_id = v_me,
             'isBlocked', r.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
             -- blocked_by_me, blocked_me or null. When set, the screen hides the
             -- picture and makes the row unclickable (BL-027).
             'blockRelation', private.block_relation(r.player_id),
             'profileImageUrl', case when private.block_relation(r.player_id) is null
                                     then private.avatar_url(r.player_id) end
           ) as entry
    from ranked r
  )
  select jsonb_build_object(
    'scope', v_scope,
    'state', v_state,
    'suburb', case when v_scope = 'nearby' then v_suburb end,
    'total', (select count(*) from shaped),
    'entries', coalesce((
      select jsonb_agg(x.entry order by x.pos, x.mean desc, x.player_id)
      from (select * from shaped order by pos, mean desc, player_id
            limit v_limit offset v_offset) x
    ), '[]'::jsonb),
    -- Your own row, even when it is off this page. Null while provisional.
    'me', (select entry from shaped where player_id = v_me),
    'ratingsUpdatedAt', (select b.last_run_at from private.rating_batch b)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_leaderboard(text, text, integer, integer) is
  'BL-025. Leaderboard for the Rankings screen: supabase.rpc(''get_leaderboard'', '
  '{ p_scope: ''state'' | ''nearby'', p_state, p_limit, p_offset }). State defaults to '
  'yours (Victoria for a VIC player); nearby is your suburb. Established players only, '
  'highest rating first; exact ties share a rank. Entries: rank, id, name, initials, rating, '
  'grade, suburb, isMe, isBlocked, blockRelation (blocked_by_me, blocked_me or null: hide '
  'the picture and disable the row when set) and profileImageUrl. { scope, state, suburb, '
  'total, entries, me, ratingsUpdatedAt } where me is your own entry, or null while '
  'provisional, and ratingsUpdatedAt is when the nightly rating run last finished.';

revoke all on function public.get_rating_summary(uuid) from public;
revoke all on function public.get_rating_trend(uuid, integer) from public;
revoke all on function public.get_leaderboard(text, text, integer, integer) from public;
grant execute on function public.get_rating_summary(uuid) to authenticated;
grant execute on function public.get_rating_trend(uuid, integer) to authenticated;
grant execute on function public.get_leaderboard(text, text, integer, integer) to authenticated;

reset check_function_bodies;
