-- BL-052: whether someone turns up, shown on profiles and game cards.
--
-- Reliability is worked out from what happened, in one function, so it is
-- never out of date on screen:
--   attended            accepted places in games that have finished
--                       (not cancelled or deleted, not marked no-show)
--   no-shows            marked by the host (BL-054)
--   late withdrawals    accepted places given up within 24 hours (BL-054)
--   late cancellations  games the player organised and cancelled within
--                       24 hours of the start
--   score               100 * (attended + 2)
--                       / (attended + 2 + no_shows + 0.5 * (late withdrawals
--                          + late cancellations)), rounded
-- The "+ 2" gives new players a fair start: one late withdrawal on a first
-- game gives 80%, not 0%. A no-show weighs twice a late change. The formula
-- awaits team confirmation (team item 14).
--
-- player_profile keeps copies (games_played, no_show_count,
-- reliability_score and two new counters) for anything that reads the table
-- directly, such as the admin console and search_players. They are refreshed
-- when something changes and, because games finish without any event, by an
-- hourly pg_cron job.

-- ---------------------------------------------------------------------------
-- 1. The calculation
-- ---------------------------------------------------------------------------

create or replace function private.reliability(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with counts as (
    select
      (select count(*) from public.game_participant x
       join public.game_post gp on gp.post_id = x.post_id
       where x.player_id = p_player_id and x.status = 'accepted'
         and gp.deleted_at is null and gp.status <> 'cancelled'
         and gp.proposed_time + make_interval(mins => gp.duration_minutes) < now()
      ) as attended,
      (select count(*) from public.game_participant x
       where x.player_id = p_player_id and x.status = 'no_show'
      ) as no_shows,
      (select count(*) from public.game_participant x
       where x.player_id = p_player_id and x.late_withdrawal
      ) as late_withdrawals,
      (select count(*) from public.cancellation_record cr
       join public.game_post gp on gp.post_id = cr.post_id
       where gp.organiser_id = p_player_id
         and cr.updated_by = p_player_id
         and cr.cancelled_at > gp.proposed_time - interval '24 hours'
      ) as late_cancellations
  )
  select jsonb_build_object(
    'score', round(100.0 * (attended + 2)
                   / (attended + 2 + no_shows + 0.5 * (late_withdrawals + late_cancellations)))::int,
    'attended', attended,
    'noShows', no_shows,
    'lateWithdrawals', late_withdrawals,
    'lateCancellations', late_cancellations
  )
  from counts;
$$;

comment on function private.reliability(uuid) is
  'BL-052. Score (0-100) and the counts behind it, computed from games, '
  'no-shows, late withdrawals and late cancellations. The single source of '
  'truth; the player_profile columns are copies.';

revoke all on function private.reliability(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Copies on player_profile
-- ---------------------------------------------------------------------------

alter table public.player_profile
  add column late_withdrawal_count integer not null default 0 check (late_withdrawal_count >= 0),
  add column late_cancellation_count integer not null default 0 check (late_cancellation_count >= 0);

comment on column public.player_profile.reliability_score is
  'Copy of private.reliability().score, refreshed on each change and hourly. '
  'service_role only, like the other counters.';

create or replace function private.refresh_reliability(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := private.reliability(p_player_id);
begin
  update public.player_profile
  set reliability_score = (r ->> 'score')::numeric,
      games_played = (r ->> 'attended')::int,
      no_show_count = (r ->> 'noShows')::int,
      late_withdrawal_count = (r ->> 'lateWithdrawals')::int,
      late_cancellation_count = (r ->> 'lateCancellations')::int
  where player_id = p_player_id
    and (reliability_score, games_played, no_show_count, late_withdrawal_count, late_cancellation_count)
        is distinct from
        ((r ->> 'score')::numeric, (r ->> 'attended')::int, (r ->> 'noShows')::int,
         (r ->> 'lateWithdrawals')::int, (r ->> 'lateCancellations')::int);
end;
$$;

revoke all on function private.refresh_reliability(uuid) from public;

-- When a status changes (no-show, withdrawal, cancellation of the game).
create or replace function private.refresh_reliability_on_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_reliability(new.player_id);
  return new;
end;
$$;

create trigger game_participant_refresh_reliability
  after update of status, late_withdrawal on public.game_participant
  for each row
  when (new.status in ('withdrawn', 'no_show', 'accepted'))
  execute function private.refresh_reliability_on_participant();

create or replace function private.refresh_reliability_on_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organiser uuid := (select gp.organiser_id from public.game_post gp where gp.post_id = new.post_id);
begin
  if v_organiser is not null then
    perform private.refresh_reliability(v_organiser);
  end if;
  return new;
end;
$$;

create trigger cancellation_record_refresh_reliability
  after insert or update on public.cancellation_record
  for each row execute function private.refresh_reliability_on_cancellation();

-- Games finish without any event, so refresh everyone in games that ended
-- in the last two hours, every hour.
create or replace function private.refresh_recent_reliability()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
  v_count integer := 0;
begin
  for v_player in
    select distinct x.player_id
    from public.game_participant x
    join public.game_post gp on gp.post_id = x.post_id
    where gp.proposed_time + make_interval(mins => gp.duration_minutes)
          between now() - interval '2 hours' and now()
  loop
    perform private.refresh_reliability(v_player);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.refresh_recent_reliability() from public;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'refresh-reliability',
  '5 * * * *',
  $$select private.refresh_recent_reliability()$$
);

-- ---------------------------------------------------------------------------
-- 3. Screens use the live figure
-- ---------------------------------------------------------------------------
-- Same as the BL-019 version, except reliability comes from
-- private.reliability, and gamesPlayed / noShows are added.

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
    'gamesPlayed', ((select r from rel) ->> 'attended')::int,
    'noShows', ((select r from rel) ->> 'noShows')::int,
    'lateWithdrawals', ((select r from rel) ->> 'lateWithdrawals')::int
  );
$$;
