-- BL-024 and BL-062: ratings from confirmed results. Player BE-2, see
-- docs/features/M2-results-and-rankings.md. The method is the Bayesian score rating in the
-- Ranking Algorithm reports (7 October 2026):
--   01 Mathematical Verification  the update, equations 1 to 14
--   03 Ranking System Application starting ratings, placement, the 15 grades
--
-- Ratings are worked out once a night, not when a result is confirmed. At
-- 2 am Melbourne time pg_cron runs private.run_rating_batch, which rates every
-- confirmed singles result not yet rated, in the order they were confirmed,
-- committing every 100. For each result:
--   1. advance every estimate to the match time (variance grows 25 points^2 a
--      day, RD capped at 350)
--   2. weigh 64 candidate skill differences by how well they explain the score
--   3. move both means, and every correlated player's, by the posterior
--   4. shrink the covariance, with an RD floor of 80
-- The full covariance is kept (private.rating_covariance). Doubles and mixed
-- doubles results are recorded and confirmed but never rated.
--
-- The engine (private.rating_engine) loads the state into arrays once, does
-- the maths in memory, and writes the result back once. Its cost per result
-- grows with the square of the number of linked players: fine for hundreds,
-- slow past a few thousand (see the plan).
--
-- Event time. The method wants event times that never go backwards. A result
-- confirmed after a later-played one was already processed (play on Saturday,
-- confirm on Monday) is processed at the later of its played time and the
-- previous event, so ratings never rewind and a late confirmation costs no
-- replay. Replaying the confirmed results in confirmation order
-- (private.rebuild_ratings) gives the same numbers, so it is only needed when
-- a result that already counted stops counting. That sets a flag, and the
-- next nightly run replays everything.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Bookkeeping
-- ---------------------------------------------------------------------------
-- The covariance is a single matrix, so it moves forward in time as a whole:
-- Delta t is the days since the previous event anywhere.

create table private.rating_clock (
  id boolean primary key default true check (id),
  last_event_at timestamptz not null
);

revoke all on private.rating_clock from public, anon, authenticated;

-- The nightly run: when it last finished (shown as "Updated <date>"), and
-- whether a result that counted has since been taken away, which needs a full
-- replay.
create table private.rating_batch (
  id boolean primary key default true check (id),
  needs_rebuild boolean not null default false,
  last_run_at timestamptz
);

insert into private.rating_batch (id) values (true);

revoke all on private.rating_batch from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Small helpers
-- ---------------------------------------------------------------------------

create or replace function private.softplus(z double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select greatest(z, 0::double precision) + ln(1 + exp(-abs(z)));
$$;

-- The start rating for each self-rating answer (BL-062). The spec gives
-- Beginner 1100, Intermediate 1500 and Advanced 1900 as the centres of C3, B3
-- and A3; the two in-between answers sit midway. Every start has RD 350.
create or replace function private.starting_rating(p_band text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case p_band
    when 'beginner' then 1100
    when 'lower_intermediate' then 1300
    when 'intermediate' then 1500
    when 'upper_intermediate' then 1700
    when 'advanced' then 1900
    else 1500
  end::double precision;
$$;

-- The 15 grades (03, table 3). 5 is the lowest sublevel in a band, 1 the
-- highest. Applied to the full-precision rating; exactly 1700 is A5 and
-- exactly 2020 is A1.
create or replace function private.grade(p_rating double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rating < 980  then 'C5' when p_rating < 1060 then 'C4'
    when p_rating < 1140 then 'C3' when p_rating < 1220 then 'C2'
    when p_rating < 1300 then 'C1'
    when p_rating < 1380 then 'B5' when p_rating < 1460 then 'B4'
    when p_rating < 1540 then 'B3' when p_rating < 1620 then 'B2'
    when p_rating < 1700 then 'B1'
    when p_rating < 1780 then 'A5' when p_rating < 1860 then 'A4'
    when p_rating < 1940 then 'A3' when p_rating < 2020 then 'A2'
    else 'A1'
  end;
$$;

-- ranking.band has five values; this cuts the rating into five equal-width
-- bands around B3, lining up with grade boundaries.
create or replace function private.band_for_rating(p_rating double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rating < 1220 then 'beginner'
    when p_rating < 1380 then 'lower_intermediate'
    when p_rating < 1620 then 'intermediate'
    when p_rating < 1780 then 'upper_intermediate'
    else 'advanced'
  end;
$$;

create or replace function private.games_are_valid(p_games jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform private.validate_games(p_games);
  return true;
exception when others then
  return false;
end;
$$;

-- Confirmed singles results that count and are not rated yet, in the order
-- they were confirmed. p_limit null means all of them.
create or replace function private.ratable_results(p_limit integer default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.result_id order by x.confirmed, x.result_id), '{}')
  from (
    select res.result_id, coalesce(res.confirmed_at, m.played_at, res.created_at) as confirmed
    from public.match_result res
    join public.match m on m.match_id = res.match_id
    where res.status = 'confirmed'
      and not res.excluded_from_ranking
      and m.format = 'singles'
      and not exists (select 1 from public.rating_history h where h.result_id = res.result_id)
      and (select count(*) filter (where mp.side = 'a') = 1
                  and count(*) filter (where mp.side = 'b') = 1
                  and count(distinct mp.player_id) = 2
           from public.match_participant mp where mp.match_id = m.match_id)
      and private.games_are_valid(res.games)
    order by 2, 1
    limit p_limit
  ) x;
$$;

revoke all on function private.softplus(double precision) from public;
revoke all on function private.starting_rating(text) from public;
revoke all on function private.grade(double precision) from public;
revoke all on function private.band_for_rating(double precision) from public;
revoke all on function private.games_are_valid(jsonb) from public;
revoke all on function private.ratable_results(integer) from public;

-- ---------------------------------------------------------------------------
-- 3. The engine
-- ---------------------------------------------------------------------------
-- Rates the given results (those that are ratable), in confirmation order,
-- and returns how many it rated. A result counts once, so passing one that is
-- already rated does nothing.
--
-- Everything is held in arrays while it works. Players are numbered 1..n; the
-- covariance is an n x n grid stored row by row, so cell (i, j) is
-- v_cov[(i - 1) * n + j] and the diagonal holds the variances.

create or replace function private.rating_engine(p_result_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  v_ids uuid[];
  v_mean double precision[];
  v_var double precision[];
  v_trusted integer[];
  v_opps integer[];
  v_est boolean[];
  v_last timestamptz[];
  v_cov double precision[];
  v_met boolean[];
  v_scale double precision[];
  v_a double precision[];
  v_touched integer[];
  v_x double precision[];
  v_lw double precision[];
  v_dd double precision[] := array_fill(0::double precision, array[64]);
  v_b double precision[] := array_fill(0::double precision, array[64]);
  v_clock timestamptz;
  r record;
  g jsonb;
  ia integer;
  ib integer;
  i integer;
  j integer;
  p integer;
  q integer;
  v_k integer;
  v_n integer;
  v_games integer;
  v_alpha double precision;
  v_t timestamptz;
  v_dt double precision;
  v_s double precision;
  v_ma double precision;
  v_mb double precision;
  v_va double precision;
  v_vb double precision;
  v_d0 double precision;
  v_v double precision;
  v_d1 double precision;
  v_v1 double precision;
  v_sq double precision;
  v_bmax double precision;
  v_sum double precision;
  v_rated integer := 0;
  -- History rows, written at the end.
  h integer := 0;
  h_player uuid[] := '{}';
  h_result uuid[] := '{}';
  h_match uuid[] := '{}';
  h_at timestamptz[] := '{}';
  h_before double precision[] := '{}';
  h_after double precision[] := '{}';
  h_rd_before double precision[] := '{}';
  h_rd_after double precision[] := '{}';
  h_est boolean[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtextextended('rating_engine', 0));

  if coalesce(cardinality(p_result_ids), 0) = 0 then
    return 0;
  end if;

  -- 1. Load. Everyone with a rating, then newcomers in these results, who
  -- start from their self-rating (BL-062) with RD 350 and no covariance.
  select array_agg(x.player_id order by x.newcomer, x.player_id),
         array_agg(x.mean order by x.newcomer, x.player_id),
         array_agg(x.variance order by x.newcomer, x.player_id),
         array_agg(x.trusted_matches order by x.newcomer, x.player_id),
         array_agg(x.distinct_opponents order by x.newcomer, x.player_id),
         array_agg(x.is_established order by x.newcomer, x.player_id),
         array_agg(x.last_event_at order by x.newcomer, x.player_id)
  into v_ids, v_mean, v_var, v_trusted, v_opps, v_est, v_last
  from (
    select s.player_id, false as newcomer, s.mean, s.variance, s.trusted_matches,
           s.distinct_opponents, s.is_established, s.last_event_at
    from private.rating_state s
    union all
    select p.player_id, true, private.starting_rating(p.self_rating_band),
           122500::double precision, 0, 0, false, null::timestamptz
    from public.player p
    where p.player_id in (select mp.player_id
                          from public.match_participant mp
                          join public.match_result res on res.match_id = mp.match_id
                          where res.result_id = any (p_result_ids))
      and not exists (select 1 from private.rating_state s where s.player_id = p.player_id)
  ) x;

  n := coalesce(cardinality(v_ids), 0);
  if n = 0 then
    return 0;
  end if;

  v_cov := array_fill(0::double precision, array[n * n]);
  v_met := array_fill(false, array[n * n]);
  for i in 1 .. n loop
    v_cov[(i - 1) * n + i] := v_var[i];
  end loop;

  for r in
    select pi.ord::integer as i, pj.ord::integer as j, c.cov
    from private.rating_covariance c
    join unnest(v_ids) with ordinality as pi(id, ord) on pi.id = c.player_lo
    join unnest(v_ids) with ordinality as pj(id, ord) on pj.id = c.player_hi
  loop
    v_cov[(r.i - 1) * n + r.j] := r.cov;
    v_cov[(r.j - 1) * n + r.i] := r.cov;
  end loop;

  -- Who has played whom, for the distinct-opponent count.
  for r in
    select distinct pi.ord::integer as i, pj.ord::integer as j
    from public.rating_history h1
    join public.rating_history h2 on h2.result_id = h1.result_id and h2.player_id <> h1.player_id
    join unnest(v_ids) with ordinality as pi(id, ord) on pi.id = h1.player_id
    join unnest(v_ids) with ordinality as pj(id, ord) on pj.id = h2.player_id
  loop
    v_met[(r.i - 1) * n + r.j] := true;
  end loop;

  select array_agg(gh.x order by gh.j), array_agg(ln(gh.w / sqrt(pi())) order by gh.j)
  into v_x, v_lw
  from private.gauss_hermite_64 gh;

  select c.last_event_at into v_clock from private.rating_clock c;

  -- 2. Each result in confirmation order.
  for r in
    select res.result_id, res.match_id, res.games,
           coalesce(m.played_at, res.created_at) as played_at,
           sides.a, sides.b
    from public.match_result res
    join public.match m on m.match_id = res.match_id
    cross join lateral (
      select array_agg(mp.player_id) filter (where mp.side = 'a') as a,
             array_agg(mp.player_id) filter (where mp.side = 'b') as b
      from public.match_participant mp
      where mp.match_id = res.match_id
    ) sides
    where res.result_id = any (p_result_ids)
      and res.status = 'confirmed'
      and not res.excluded_from_ranking
      and m.format = 'singles'
      and not exists (select 1 from public.rating_history hh where hh.result_id = res.result_id)
    order by coalesce(res.confirmed_at, m.played_at, res.created_at), res.result_id
  loop
    -- Only one player a side, and complete, legal scores, are rated.
    continue when cardinality(r.a) is distinct from 1
               or cardinality(r.b) is distinct from 1
               or r.a[1] = r.b[1];
    continue when not private.games_are_valid(r.games);
    ia := array_position(v_ids, r.a[1]);
    ib := array_position(v_ids, r.b[1]);
    continue when ia is null or ib is null;

    v_k := 0;
    v_n := 0;
    v_games := 0;
    for g in select * from jsonb_array_elements(r.games) loop
      v_k := v_k + (g ->> 0)::integer;
      v_n := v_n + (g ->> 0)::integer + (g ->> 1)::integer;
      v_games := v_games + 1;
    end loop;
    -- At most 6 effective points a game and 12 a match (01, equation 3).
    v_alpha := least(v_n, 6 * v_games, 12)::double precision / v_n;

    -- Never earlier than the previous event (see the note at the top).
    v_t := greatest(r.played_at, v_clock);

    -- Advance everyone to the match time (equation 9): variances grow, then
    -- any RD over 350 is scaled back, with its row and column. A newcomer who
    -- has not played yet sits at the cap with no covariance, so is skipped.
    if v_clock is not null then
      v_dt := extract(epoch from (v_t - v_clock)) / 86400.0;
      if v_dt > 0 then
        v_scale := array_fill(1::double precision, array[n]);
        for i in 1 .. n loop
          continue when v_trusted[i] = 0;
          p := (i - 1) * n + i;
          v_cov[p] := v_cov[p] + 25 * v_dt;
          v_scale[i] := least(1::double precision, 350.0 / sqrt(v_cov[p]));
        end loop;
        for i in 1 .. n loop
          continue when v_scale[i] = 1;
          for j in 1 .. n loop
            -- A pair where both are scaled is done once, from the later one.
            continue when j = i or (v_scale[j] < 1 and j < i);
            p := (i - 1) * n + j;
            continue when v_cov[p] = 0;
            v_cov[p] := v_cov[p] * v_scale[i] * v_scale[j];
            v_cov[(j - 1) * n + i] := v_cov[p];
          end loop;
          v_cov[(i - 1) * n + i] := 122500;
        end loop;
      end if;
    end if;

    v_ma := v_mean[ia];
    v_mb := v_mean[ib];
    v_va := v_cov[(ia - 1) * n + ia];
    v_vb := v_cov[(ib - 1) * n + ib];
    v_d0 := v_ma - v_mb;
    v_v := v_va + v_vb - 2 * v_cov[(ia - 1) * n + ib];
    if v_v is null or v_v <= 0 then
      raise exception 'The variance of the skill difference must be positive (result %).', r.result_id;
    end if;

    -- Posterior over the skill difference D on 64 Gauss-Hermite nodes
    -- (equations 11 to 14), then its mean d1 and variance V1.
    v_sq := sqrt(2 * v_v);
    v_bmax := null;
    for j in 1 .. 64 loop
      v_dd[j] := v_d0 + v_sq * v_x[j];
      v_b[j] := v_lw[j]
                - v_alpha * (v_k * private.softplus(-v_dd[j] / 800.0)
                             + (v_n - v_k) * private.softplus(v_dd[j] / 800.0));
      v_bmax := greatest(v_bmax, v_b[j]);
    end loop;
    v_sum := 0;
    for j in 1 .. 64 loop
      -- exp() raises on underflow, so far-off nodes get weight 0 directly.
      v_b[j] := case when v_b[j] - v_bmax < -700 then 0 else exp(v_b[j] - v_bmax) end;
      v_sum := v_sum + v_b[j];
    end loop;
    v_d1 := 0;
    for j in 1 .. 64 loop
      v_b[j] := v_b[j] / v_sum;
      v_d1 := v_d1 + v_b[j] * v_dd[j];
    end loop;
    v_v1 := 0;
    for j in 1 .. 64 loop
      v_v1 := v_v1 + v_b[j] * (v_dd[j] - v_d1) * (v_dd[j] - v_d1);
    end loop;

    -- Allocation across everyone correlated with A or B (equation 2):
    -- a_i = (C_iA - C_iB) / V.
    v_a := array_fill(0::double precision, array[n]);
    v_touched := array[ia, ib];
    for i in 1 .. n loop
      v_a[i] := (v_cov[(i - 1) * n + ia] - v_cov[(i - 1) * n + ib]) / v_v;
      if v_a[i] <> 0 and i <> ia and i <> ib then
        v_touched := v_touched || i;
      end if;
    end loop;

    -- Means move by a_i (d1 - d0), covariances by a_i a_j (V1 - V)
    -- (equation 7), then the RD floor of 80 (equation 10). Both halves of the
    -- grid get the same value, so it stays symmetric.
    for p in 1 .. cardinality(v_touched) loop
      i := v_touched[p];
      v_mean[i] := v_mean[i] + v_a[i] * (v_d1 - v_d0);
      for q in p .. cardinality(v_touched) loop
        j := v_touched[q];
        v_cov[(i - 1) * n + j] := v_cov[(i - 1) * n + j] + v_a[i] * v_a[j] * (v_v1 - v_v);
        if i <> j then
          v_cov[(j - 1) * n + i] := v_cov[(i - 1) * n + j];
        end if;
      end loop;
    end loop;
    foreach i in array v_touched loop
      v_cov[(i - 1) * n + i] := greatest(v_cov[(i - 1) * n + i], 6400);
    end loop;

    -- Placement counters. Established: 10 trusted singles matches, 5 different
    -- opponents, RD at most 160 (03, section 3). Once published it stays.
    v_trusted[ia] := v_trusted[ia] + 1;
    v_trusted[ib] := v_trusted[ib] + 1;
    v_last[ia] := v_t;
    v_last[ib] := v_t;
    if not v_met[(ia - 1) * n + ib] then
      v_met[(ia - 1) * n + ib] := true;
      v_met[(ib - 1) * n + ia] := true;
      v_opps[ia] := v_opps[ia] + 1;
      v_opps[ib] := v_opps[ib] + 1;
    end if;

    foreach i in array array[ia, ib] loop
      v_est[i] := v_est[i]
                  or (v_trusted[i] >= 10 and v_opps[i] >= 5
                      and sqrt(v_cov[(i - 1) * n + i]) <= 160);
      h := h + 1;
      h_player[h] := v_ids[i];
      h_result[h] := r.result_id;
      h_match[h] := r.match_id;
      h_at[h] := v_t;
      h_before[h] := case when i = ia then v_ma else v_mb end;
      h_after[h] := v_mean[i];
      h_rd_before[h] := sqrt(case when i = ia then v_va else v_vb end);
      h_rd_after[h] := sqrt(v_cov[(i - 1) * n + i]);
      h_est[h] := v_est[i];
    end loop;

    v_clock := v_t;
    v_rated := v_rated + 1;
  end loop;

  if v_rated = 0 then
    return 0;
  end if;

  -- 3. Write back once. Rows that did not change are left alone.
  for i in 1 .. n loop
    v_var[i] := v_cov[(i - 1) * n + i];
  end loop;

  insert into private.rating_state as s
    (player_id, mean, variance, trusted_matches, distinct_opponents, is_established,
     last_event_at, updated_at)
  select t.id, t.mean, t.var, t.trusted, t.opps, t.est, t.last, now()
  from unnest(v_ids, v_mean, v_var, v_trusted, v_opps, v_est, v_last)
       as t(id, mean, var, trusted, opps, est, last)
  where t.trusted > 0
  on conflict (player_id) do update
  set mean = excluded.mean,
      variance = excluded.variance,
      trusted_matches = excluded.trusted_matches,
      distinct_opponents = excluded.distinct_opponents,
      is_established = excluded.is_established,
      last_event_at = excluded.last_event_at,
      updated_at = excluded.updated_at
  where (s.mean, s.variance, s.trusted_matches, s.distinct_opponents, s.is_established,
         s.last_event_at)
        is distinct from
        (excluded.mean, excluded.variance, excluded.trusted_matches,
         excluded.distinct_opponents, excluded.is_established, excluded.last_event_at);

  insert into private.rating_covariance as c (player_lo, player_hi, cov)
  select least(pi.id, pj.id), greatest(pi.id, pj.id), x.v
  from unnest(v_cov) with ordinality as x(v, k)
  join unnest(v_ids) with ordinality as pi(id, ord) on pi.ord = (x.k - 1) / n + 1
  join unnest(v_ids) with ordinality as pj(id, ord) on pj.ord = (x.k - 1) % n + 1
  where pi.ord < pj.ord and x.v <> 0
  on conflict (player_lo, player_hi) do update
  set cov = excluded.cov
  where c.cov is distinct from excluded.cov;

  insert into public.rating_history
    (player_id, result_id, match_id, played_at, rating_before, rating_after,
     rd_before, rd_after, is_established)
  select *
  from unnest(h_player, h_result, h_match, h_at, h_before, h_after,
              h_rd_before, h_rd_after, h_est);

  insert into private.rating_clock (id, last_event_at) values (true, v_clock)
  on conflict (id) do update
  set last_event_at = greatest(private.rating_clock.last_event_at, excluded.last_event_at);

  -- The ranking table keeps a rounded copy for the screens that read it.
  insert into public.ranking as rk (player_id, format, ranking_points, band, verified_games_count)
  select t.id, 'singles', greatest(0, round(t.mean))::integer,
         private.band_for_rating(t.mean), t.trusted
  from unnest(v_ids, v_mean, v_trusted) as t(id, mean, trusted)
  where t.trusted > 0
  on conflict (player_id, format) do update
  set ranking_points = excluded.ranking_points,
      band = excluded.band,
      verified_games_count = excluded.verified_games_count
  where (rk.ranking_points, rk.band, rk.verified_games_count)
        is distinct from
        (excluded.ranking_points, excluded.band, excluded.verified_games_count);

  return v_rated;
end;
$$;

comment on function private.rating_engine(uuid[]) is
  'Rates the given confirmed singles results in confirmation order, each once, '
  'in memory, and writes the new state back. Returns how many it rated.';

-- Logged for an admin once a result is rated (BL-056): one match moved a
-- player's rating by more than 150 points. The threshold is a placeholder for
-- the product owner to confirm, like the others in private.check_result.
create or replace function private.flag_rating_swings(p_result_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.result_flag (result_id, match_id, kind, detail)
  select distinct on (h.result_id) h.result_id, h.match_id, 'rating_swing',
         jsonb_build_object('player_id', h.player_id,
                            'change', round((h.rating_after - h.rating_before)::numeric, 1))
  from public.rating_history h
  where h.result_id = any (p_result_ids)
    and abs(h.rating_after - h.rating_before) > 150
  order by h.result_id, abs(h.rating_after - h.rating_before) desc
  on conflict (result_id, kind) do nothing;
$$;

revoke all on function private.rating_engine(uuid[]) from public;
revoke all on function private.flag_rating_swings(uuid[]) from public;

-- ---------------------------------------------------------------------------
-- 4. The nightly run, replays, and what removing a result does
-- ---------------------------------------------------------------------------

-- Rates up to p_limit unrated results (all of them when null), flags big
-- swings, and stamps the run. Returns how many it rated. Handy locally too:
-- select private.rate_new_results();
create or replace function private.rate_new_results(p_limit integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := private.ratable_results(p_limit);
  v_rated integer;
begin
  v_rated := private.rating_engine(v_ids);
  perform private.flag_rating_swings(v_ids);
  update private.rating_batch set last_run_at = now() where true;
  return v_rated;
end;
$$;

-- Throws the ratings away, ready to replay from the first result.
create or replace function private.reset_ratings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('rating_engine', 0));

  delete from private.rating_covariance where true;
  delete from private.rating_state where true;
  delete from private.rating_clock where true;
  delete from public.rating_history where true;
  delete from public.ranking where format = 'singles';
  update private.rating_batch set needs_rebuild = false where true;
end;
$$;

-- Replays every counted singles result in confirmation order, in one
-- transaction. Safe to run at any time: it gives the same answer as rating
-- them night by night. Used after seeding and by admin_rebuild_ratings.
create or replace function private.rebuild_ratings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reset_ratings();
  return private.rate_new_results();
end;
$$;

comment on function private.rebuild_ratings() is
  'Replays all confirmed, counted singles results in confirmation order in one '
  'transaction. Used after seeding and by admin_rebuild_ratings.';

-- The nightly job. A procedure, so it can commit every p_chunk results: a
-- long run never holds one big transaction, and if it stops part way the next
-- run carries on from there. After a counted result was removed it starts
-- again from scratch (reset, then the same chunked loop). Not security
-- definer: transaction control is not allowed there. pg_cron runs it as the
-- database owner.
create or replace procedure private.run_rating_batch(p_chunk integer default 100)
language plpgsql
as $$
declare
  v_rated integer;
begin
  -- One run at a time.
  if not pg_try_advisory_lock(hashtextextended('rating_batch', 0)) then
    raise notice 'A rating run is already in progress.';
    return;
  end if;

  if (select b.needs_rebuild from private.rating_batch b) then
    perform private.reset_ratings();
    commit;
  end if;

  loop
    v_rated := private.rate_new_results(p_chunk);
    commit;
    exit when v_rated < p_chunk;
  end loop;

  perform pg_advisory_unlock(hashtextextended('rating_batch', 0));
end;
$$;

comment on procedure private.run_rating_batch(integer) is
  'Nightly (pg_cron rate-confirmed-results, 2 am Melbourne): rates confirmed '
  'singles results not yet rated, p_chunk per transaction, or replays them all '
  'after a counted result was removed. Run by hand with: call private.run_rating_batch();';

-- A result that counted stops counting (rejected by an admin, or excluded
-- when its game is deleted), or an excluded one counts again: the ratings
-- need a replay, which the next nightly run does. A newly confirmed result
-- needs nothing here; the nightly run picks it up.
create or replace function private.flag_ratings_for_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.status = 'confirmed' and not old.excluded_from_ranking)
     or (tg_op = 'UPDATE'
         and ((old.status = 'confirmed' and not old.excluded_from_ranking
               and (new.status <> 'confirmed' or new.excluded_from_ranking)
               and exists (select 1 from public.rating_history h
                           where h.result_id = old.result_id))
              or (old.status = 'confirmed' and new.status = 'confirmed'
                  and old.excluded_from_ranking and not new.excluded_from_ranking)))
  then
    update private.rating_batch set needs_rebuild = true where not needs_rebuild;
  end if;
  return null;
end;
$$;

create trigger match_result_flag_ratings_for_rebuild
  after update of status, excluded_from_ranking or delete on public.match_result
  for each row execute function private.flag_ratings_for_rebuild();

revoke all on function private.rate_new_results(integer) from public;
revoke all on function private.reset_ratings() from public;
revoke all on function private.rebuild_ratings() from public;
revoke all on procedure private.run_rating_batch(integer) from public;
revoke all on function private.flag_ratings_for_rebuild() from public;

select cron.schedule(
  'rate-confirmed-results',
  '0 15 * * *',
  $$call private.run_rating_batch()$$
);

-- For ops: rebuild every rating from the confirmed results, now.
create or replace function public.admin_rebuild_ratings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return private.rebuild_ratings();
end;
$$;

comment on function public.admin_rebuild_ratings() is
  'Admin only: supabase.rpc(''admin_rebuild_ratings''). Replays every confirmed '
  'singles result now, instead of waiting for the nightly run, and returns how '
  'many it rated. Safe to run again.';

revoke all on function public.admin_rebuild_ratings() from public;
grant execute on function public.admin_rebuild_ratings() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The rating on existing screens
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
  rel as (select private.reliability(p_player_id) as r),
  st as (select s.mean, s.is_established from private.rating_state s where s.player_id = p_player_id)
  select jsonb_build_object(
    'rating', (
      select max(rk.ranking_points) from public.ranking rk where rk.player_id = p_player_id
    ),
    -- The grade is published once the player is established (10 matches against
    -- 5 different opponents). Until then they are Provisional.
    'grade', (select case when is_established then private.grade(mean) end from st),
    'wins', (select count(*) from results where won),
    'losses', (select count(*) from results where not won),
    'matches', (select count(*) from results),
    'status', case when coalesce((select is_established from st), false)
                   then 'Established' else 'Provisional' end,
    'recentForm', coalesce((
      select jsonb_agg(case when won then 'W' else 'L' end order by played desc)
      from (select won, played from results order by played desc limit 5) last5
    ), '[]'::jsonb),
    'reliability', ((select r from rel) ->> 'score')::int,
    'gamesPlayed', ((select r from rel) ->> 'attended')::int,
    'noShows', ((select r from rel) ->> 'noShows')::int,
    'lateWithdrawals', ((select r from rel) ->> 'lateWithdrawals')::int,
    'lateCancellations', ((select r from rel) ->> 'lateCancellations')::int
  );
$$;

create or replace function private.rating_card(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select (r.winning_side = mp.side) as won
    from public.match_participant mp
    join public.match_result r on r.match_id = mp.match_id and r.status = 'confirmed'
                              and not r.excluded_from_ranking
    where mp.player_id = p_player_id
  ),
  best as (
    select rk.format, rk.ranking_points, rk.band
    from public.ranking rk
    where rk.player_id = p_player_id
    order by rk.ranking_points desc
    limit 1
  ),
  me as (
    select pp.state from public.player_profile pp where pp.player_id = p_player_id
  ),
  st as (
    select s.mean, s.is_established, s.trusted_matches, s.distinct_opponents
    from private.rating_state s where s.player_id = p_player_id
  ),
  recent as (
    select h.rating_before, h.rating_after, h.played_at
    from public.rating_history h
    where h.player_id = p_player_id and h.played_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'rating', (select ranking_points from best),
    'ratingFormat', (select format from best),
    'band', (select private.band_label(band) from best),
    'grade', (select case when is_established then private.grade(mean) end from st),
    -- Net change over the last 30 days, in displayed points.
    'ratingChangeThisMonth', (
      select round((select rating_after from recent order by played_at desc limit 1))::int
           - round((select rating_before from recent order by played_at asc limit 1))::int
      where exists (select 1 from recent)
    ),
    'matches', (select count(*) from results),
    'wins', (select count(*) from results where won),
    'winRate', (
      select case when count(*) = 0 then 0
                  else round(100.0 * count(*) filter (where won) / count(*))::int end
      from results
    ),
    'rankState', (select state from me),
    -- Position among established players in the same state. Null while the
    -- player is provisional: they are not on the leaderboard.
    'stateRank', case when coalesce((select is_established from st), false) then (
      select 1 + count(*)
      from private.rating_state other
      join public.player_profile op on op.player_id = other.player_id
      join public.player ot on ot.player_id = other.player_id
      join public.player_private ov on ov.player_id = other.player_id
      where other.is_established and ot.deleted_at is null and ov.registered_at is not null
        and (op.is_discoverable or other.player_id = p_player_id)
        and op.state = (select state from me)
        and other.mean > (select mean from st)
    ) end,
    'status', case when coalesce((select is_established from st), false)
                   then 'Established' else 'Provisional' end,
    'placement', jsonb_build_object(
      'played', coalesce((select trusted_matches from st), 0),
      'required', 10,
      'opponents', coalesce((select distinct_opponents from st), 0),
      'opponentsRequired', 5),
    -- Ratings move once a night; the screens show "Updated <date>".
    'ratingsUpdatedAt', (select b.last_run_at from private.rating_batch b)
  );
$$;

-- The matches in a player's history now say how the rating moved.
create or replace function public.get_player_history(
  p_player_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocked_me uuid[] := private.blocked_me_ids();
  v_blocked_by_me uuid[] := private.blocked_by_me_ids();
begin
  if not (select private.can_see_profile(p_player_id)) then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(entry order by played desc)
    from (
      select
        coalesce(m.played_at, m.created_at) as played,
        jsonb_build_object(
          'matchId', m.match_id,
          'gameId', m.post_id,
          'playedAt', coalesce(m.played_at, m.created_at),
          'date', to_char(coalesce(m.played_at, m.created_at) at time zone 'Australia/Melbourne', 'Dy FMDD Mon YYYY'),
          'format', private.label(m.format),
          'location', coalesce(m.suburb, gp.suburb),
          'result', case when r.winning_side = me.side then 'W' else 'L' end,
          'score', r.score,
          'verificationStatus', private.verification_status(r.result_id),
          'ratingChange', (
            select round(h.rating_after)::int - round(h.rating_before)::int
            from public.rating_history h
            where h.result_id = r.result_id and h.player_id = p_player_id),
          'opponents', coalesce((
            select jsonb_agg(private.history_person(o.player_id, v_blocked_me, v_blocked_by_me))
            from public.match_participant o
            where o.match_id = m.match_id and o.side <> me.side
          ), '[]'::jsonb),
          'partner', (
            select private.history_person(pt.player_id, v_blocked_me, v_blocked_by_me)
            from public.match_participant pt
            where pt.match_id = m.match_id and pt.side = me.side and pt.player_id <> p_player_id
            limit 1
          )
        ) as entry
      from public.match_participant me
      join public.match m on m.match_id = me.match_id
      join public.match_result r
        on r.match_id = m.match_id and r.status = 'confirmed' and not r.excluded_from_ranking
      left join public.game_post gp on gp.post_id = m.post_id
      where me.player_id = p_player_id
      order by coalesce(m.played_at, m.created_at) desc
      limit least(greatest(coalesce(p_limit, 10), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) h
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_player_history(uuid, integer, integer) is
  'BL-060. A player''s verified matches, newest first: supabase.rpc(''get_player_history'', '
  '{ p_player_id, p_limit, p_offset }). Each has matchId, gameId, playedAt, date, format, '
  'location, result (W or L), score, verificationStatus, ratingChange (displayed points, '
  'null for doubles), opponents and partner. Null when the profile is private to you.';

-- The admin warning before a played game is deleted: what each player's rating
-- got from this game's results, which is what would be taken back. Later
-- matches shift a little too, as the ratings are replayed without them.
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
      'rating_changes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'player_id', x.player_id, 'username', x.username,
                 'points_from_this_game', x.pts) order by x.username)
        from (
          select p.player_id, p.username,
                 round(sum(h.rating_after - h.rating_before))::int as pts
          from public.rating_history h
          join public.match m on m.match_id = h.match_id
          join public.player p on p.player_id = h.player_id
          where m.post_id = p_post_id
          group by p.player_id, p.username
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.admin_game_post_deletion_impact(uuid) is
  'What deleting this game would change, for the admin''s warning: matches, '
  'confirmed results that would stop counting, affected players, and '
  'rating_changes: the points each player''s rating gained or lost from this '
  'game''s results (taken back when the ratings are replayed).';

reset check_function_bodies;
