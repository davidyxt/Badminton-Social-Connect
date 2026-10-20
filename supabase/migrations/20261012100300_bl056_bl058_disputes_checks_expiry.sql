-- BL-058 and BL-056: disputes, unusual-pattern checks, and expiry.
-- Player BE-2, see docs/features/M2-results-and-rankings.md.
--
--   raise_dispute          the opposing side challenges a pending result; the
--                          rating is held (a disputed result is never rated)
--   private.check_result   logs unusual patterns for an admin (they never block)
--   expire-pending-results hourly: a result nobody confirmed in 7 days is void
--
-- Resolving a dispute is left to the admin lane. Until then a disputed result
-- stays held, and admins can read it (dispute and result_flag both allow it).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. raise_dispute
-- ---------------------------------------------------------------------------

create or replace function public.raise_dispute(p_result_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  r public.match_result;
  v_post_id uuid;
  v_my_side text;
  v_sub_side text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_name text;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  if v_reason = '' then
    raise exception 'Say what is wrong with the result.' using errcode = '23514';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1000 characters.' using errcode = '23514';
  end if;

  select * into r from public.match_result where result_id = p_result_id for update;

  select mp.side into v_my_side from public.match_participant mp
  where mp.match_id = r.match_id and mp.player_id = v_me;

  if r.result_id is null or v_my_side is null then
    raise exception 'Result not found, or you did not play in this match.'
      using errcode = '42501';
  end if;

  select mp.side into v_sub_side from public.match_participant mp
  where mp.match_id = r.match_id and mp.player_id = r.submitted_by;

  -- Whoever recorded the score cannot dispute it; they can ask for it to be
  -- left to expire and record it again.
  if r.submitted_by = v_me or v_my_side = v_sub_side then
    raise exception 'Only your opponent can dispute this result.' using errcode = '42501';
  end if;

  if r.status = 'confirmed' then
    raise exception 'This result is already confirmed, so it can no longer be disputed.'
      using errcode = '23514';
  elsif r.status = 'disputed' then
    raise exception 'This result is already disputed.' using errcode = '23514';
  elsif r.status = 'rejected' then
    raise exception 'This result was rejected by an admin.' using errcode = '23514';
  elsif r.status = 'expired' or now() >= r.created_at + interval '7 days' then
    raise exception 'This result has expired.' using errcode = '23514';
  end if;

  update public.match_result set status = 'disputed' where result_id = p_result_id;

  insert into public.dispute (match_id, result_id, raised_by, reason, status)
  values (r.match_id, p_result_id, v_me, v_reason, 'open');

  select m.post_id into v_post_id from public.match m where m.match_id = r.match_id;
  select p.username into v_name from public.player p where p.player_id = v_me;

  perform private.dispatch_notification(
    r.submitted_by, 'dispute_update',
    v_name || ' disputed your result: ' || r.score || '.',
    'An administrator will review it. It does not count until then.',
    v_post_id, r.match_id);

  return private.match_card(r.match_id);
end;
$$;

comment on function public.raise_dispute(uuid, text) is
  'BL-058. The opposing side challenges a pending result: '
  'supabase.rpc(''raise_dispute'', { p_result_id, p_reason }). A reason is required. '
  'The result becomes disputed, the submitter is told, and the rating is held: a '
  'disputed result never counts until an admin resolves it. Returns the match as '
  'get_match does.';

revoke all on function public.raise_dispute(uuid, text) from public;
grant execute on function public.raise_dispute(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Unusual patterns (BL-023, BL-056)
-- ---------------------------------------------------------------------------
-- Logged for an admin; a flagged result still counts. The thresholds are
-- placeholders for the product owner to confirm:
--   repeat_pairing       the same players have 3 or more results within 7 days
--   unusual_win_pattern  one player won 8 or more of the last 10 between the
--                        same two, or this result has a game where the loser
--                        scored 0 or 1 and there are 5 or more of those among
--                        the players' results in the last 30 days
--   rating_swing         one match moved a player's rating by more than 150;
--                        logged by the nightly rating run
--                        (private.flag_rating_swings), once the result is rated

create or replace function private.check_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.match_result;
  m public.match;
  v_players uuid[];
  v_pair_results integer;
  v_lopsided_here boolean;
  v_lopsided_recent integer;
  v_wins integer;
  v_games integer;
  v_pa uuid;
  v_pb uuid;
begin
  select * into r from public.match_result where result_id = p_result_id;
  if r.result_id is null then
    return;
  end if;
  select * into m from public.match where match_id = r.match_id;

  select array_agg(mp.player_id order by mp.player_id) into v_players
  from public.match_participant mp where mp.match_id = m.match_id;

  -- Repeat pairings: the same players meeting again and again.
  select count(*) into v_pair_results
  from public.match_result r2
  join public.match m2 on m2.match_id = r2.match_id
  where r2.status in ('pending', 'confirmed', 'disputed')
    and coalesce(m2.played_at, r2.created_at)
        between coalesce(m.played_at, r.created_at) - interval '7 days'
            and coalesce(m.played_at, r.created_at) + interval '7 days'
    and (select array_agg(mp.player_id order by mp.player_id)
         from public.match_participant mp where mp.match_id = m2.match_id) = v_players;

  if v_pair_results >= 3 then
    insert into public.result_flag (result_id, match_id, kind, detail)
    values (p_result_id, m.match_id, 'repeat_pairing',
            jsonb_build_object('results_within_7_days', v_pair_results))
    on conflict (result_id, kind) do nothing;
  end if;

  -- One-sided history between the same two players (singles).
  if m.format = 'singles' then
    select (array_agg(mp.player_id) filter (where mp.side = 'a'))[1],
           (array_agg(mp.player_id) filter (where mp.side = 'b'))[1]
    into v_pa, v_pb
    from public.match_participant mp where mp.match_id = m.match_id;

    select count(*) filter (where won_by = v_pa), count(*) into v_wins, v_games
    from (
      select (select mp.player_id from public.match_participant mp
              where mp.match_id = r2.match_id and mp.side = r2.winning_side) as won_by
      from public.match_result r2
      join public.match m2 on m2.match_id = r2.match_id
      where r2.status in ('pending', 'confirmed', 'disputed')
        and m2.format = 'singles'
        and (select array_agg(mp.player_id order by mp.player_id)
             from public.match_participant mp where mp.match_id = m2.match_id) = v_players
      order by coalesce(m2.played_at, r2.created_at) desc
      limit 10
    ) last10;

    if v_games >= 8 and (v_wins >= 8 or v_games - v_wins >= 8) then
      insert into public.result_flag (result_id, match_id, kind, detail)
      values (p_result_id, m.match_id, 'unusual_win_pattern',
              jsonb_build_object('pattern', 'one_sided_head_to_head',
                                 'last_results', v_games, 'wins_by_first_player', v_wins))
      on conflict (result_id, kind) do nothing;
    end if;
  end if;

  -- Lopsided games: a game where the loser scored 0 or 1.
  select exists (
    select 1 from jsonb_array_elements(r.games) g
    where least((g ->> 0)::int, (g ->> 1)::int) <= 1) into v_lopsided_here;

  if v_lopsided_here then
    select count(*) into v_lopsided_recent
    from public.match_result r2
    join public.match m2 on m2.match_id = r2.match_id
    cross join lateral jsonb_array_elements(r2.games) g
    where r2.status in ('pending', 'confirmed', 'disputed')
      and coalesce(m2.played_at, r2.created_at) >= now() - interval '30 days'
      and least((g ->> 0)::int, (g ->> 1)::int) <= 1
      and exists (select 1 from public.match_participant mp
                  where mp.match_id = m2.match_id and mp.player_id = any (v_players));

    if v_lopsided_recent >= 5 then
      insert into public.result_flag (result_id, match_id, kind, detail)
      values (p_result_id, m.match_id, 'unusual_win_pattern',
              jsonb_build_object('pattern', 'lopsided_games_30_days',
                                 'lopsided_games', v_lopsided_recent))
      on conflict (result_id, kind) do nothing;
    end if;
  end if;
end;
$$;

revoke all on function private.check_result(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Expiry (BL-056)
-- ---------------------------------------------------------------------------

create or replace function private.expire_pending_results()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select res.result_id, res.match_id, res.submitted_by, res.score, m.post_id, m.format
    from public.match_result res
    join public.match m on m.match_id = res.match_id
    where res.status = 'pending' and res.created_at < now() - interval '7 days'
    order by res.created_at
    for update of res skip locked
  loop
    update public.match_result set status = 'expired' where result_id = r.result_id;
    update public.match set status = 'cancelled' where match_id = r.match_id;

    if r.submitted_by is not null then
      perform private.dispatch_notification(
        r.submitted_by, 'result_expired',
        'Your ' || private.label(r.format) || ' result (' || r.score
          || ') expired: your opponent did not confirm it in 7 days.',
        'It did not count. Record it again if it should.', r.post_id, r.match_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function private.expire_pending_results() is
  'Voids results nobody confirmed within 7 days (BL-056). Run hourly by pg_cron.';

revoke all on function private.expire_pending_results() from public;

select cron.schedule(
  'expire-pending-results',
  '10 * * * *',
  $$select private.expire_pending_results()$$
);

reset check_function_bodies;
