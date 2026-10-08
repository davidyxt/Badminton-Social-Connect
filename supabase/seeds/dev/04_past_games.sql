-- Dev seed: games that have already happened, with their matches, results,
-- check-ins, a dispute, a no-show, a late withdrawal, a late cancellation and
-- a mini league (BL-052, BL-054, BL-060).
--
-- The app never lets anyone post a game in the past, so this file switches
-- triggers off (session_replication_role = replica) and writes every row the
-- triggers would have written itself. Foreign keys are not checked either
-- while it is off, so every id below must exist.
--
--   ...c101  alice v carol singles, 14 days ago, Spring Singles Ladder match:
--            alice won 21-15 21-17 (confirmed)
--   ...c102  bob's doubles, 10 days ago: carol + erin beat bob + alice
--            21-18 19-21 21-16 (confirmed); dan was a no-show
--   ...c103  carol v bob singles, 7 days ago: carol says 21-19 21-19, bob
--            disputes it
--   ...c104  henry v alice singles, 20 days ago: alice won (henry's account is
--            deleted in 06, so this shows "Deleted User")
--   ...c105  bob's singles 3 days ago, cancelled by bob 2 hours before: a late
--            cancellation
--   ...c106  alice v dan singles, 5 days ago: dan won; erin gave up her place
--            the evening before (late withdrawal)
--   ...c107  Old Court Group doubles, 30 days ago, before the group closed

set session_replication_role = replica;

insert into public.mini_league (league_id, organiser_id, name, start_date, end_date, status)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001',
        'Spring Singles Ladder', now() - interval '30 days', now() + interval '30 days', 'active');

insert into public.league_standing (league_id, player_id, wins, losses, points, position)
values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001', 2, 0, 6, 1),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a003', 1, 1, 3, 2),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a002', 0, 1, 0, 3);

insert into public.game_post (
  post_id, organiser_id, organiser_group_id, title, format, style, ability_level,
  venue_id, suburb, proposed_time, duration_minutes, player_limit, status, created_at
)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000a001', null,
   'Spring ladder: round 1', 'singles', 'competitive', 'intermediate',
   (select venue_id from public.venue where name = 'Melbourne Sports and Aquatic Centre@ MSAC'),
   'Albert Park', date_trunc('hour', now()) - interval '14 days' + interval '18 hours', 60, 2,
   'completed', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a002', null,
   'Clayton doubles', 'doubles', 'social', 'any',
   (select venue_id from public.venue where name = 'Melbourne Badminton Centre'),
   'Blackburn North', date_trunc('hour', now()) - interval '10 days' + interval '19 hours', 90, 6,
   'completed', now() - interval '15 days'),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000a003', null,
   'Spring ladder: round 2', 'singles', 'competitive', 'any',
   null, 'Box Hill South', date_trunc('hour', now()) - interval '7 days' + interval '19 hours', 60, 2,
   'completed', now() - interval '12 days'),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000a008', null,
   null, 'singles', 'social', 'any',
   null, 'Richmond', date_trunc('hour', now()) - interval '20 days' + interval '18 hours', 60, 2,
   'completed', now() - interval '25 days'),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000a002', null,
   'Morning singles', 'singles', 'social', 'any',
   null, 'Clayton', date_trunc('hour', now()) - interval '3 days' + interval '9 hours', 60, 2,
   'cancelled', now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000a001', null,
   'Spring ladder: round 3', 'singles', 'competitive', 'any',
   (select venue_id from public.venue where name = 'Melbourne Sports and Aquatic Centre@ MSAC'),
   'Albert Park', date_trunc('hour', now()) - interval '5 days' + interval '18 hours', 60, 2,
   'completed', now() - interval '9 days'),
  ('00000000-0000-0000-0000-00000000c107', null, '00000000-0000-0000-0000-00000000c003',
   'Old Court farewell night', 'doubles', 'social', 'any',
   null, 'Footscray', date_trunc('hour', now()) - interval '30 days' + interval '19 hours', 120, 8,
   'completed', now() - interval '35 days');

-- Rosters, with the history rows the history trigger would have written.
insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000a001', 'accepted', now() - interval '20 days', now() - interval '20 days', false),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000a003', 'accepted', now() - interval '19 days', now() - interval '18 days', false),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a002', 'accepted', now() - interval '15 days', now() - interval '15 days', false),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a001', 'accepted', now() - interval '14 days', now() - interval '14 days', false),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a003', 'accepted', now() - interval '14 days', now() - interval '13 days', false),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a005', 'accepted', now() - interval '13 days', now() - interval '13 days', false),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000a004', 'no_show',  now() - interval '13 days', now() - interval '12 days', false),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000a003', 'accepted', now() - interval '12 days', now() - interval '12 days', false),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000a002', 'accepted', now() - interval '11 days', now() - interval '11 days', false),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000a008', 'accepted', now() - interval '25 days', now() - interval '25 days', false),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000a001', 'accepted', now() - interval '24 days', now() - interval '24 days', false),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000a002', 'accepted', now() - interval '6 days', now() - interval '6 days', false),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000a005', 'accepted', now() - interval '5 days', now() - interval '5 days', false),
  ('00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000a001', 'accepted', now() - interval '9 days', now() - interval '9 days', false),
  ('00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000a004', 'accepted', now() - interval '8 days', now() - interval '8 days', false),
  ('00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000a005', 'withdrawn', now() - interval '8 days', now() - interval '8 days', true),
  ('00000000-0000-0000-0000-00000000c107', '00000000-0000-0000-0000-00000000a004', 'accepted', now() - interval '35 days', now() - interval '35 days', false),
  ('00000000-0000-0000-0000-00000000c107', '00000000-0000-0000-0000-00000000a005', 'accepted', now() - interval '34 days', now() - interval '34 days', false);

insert into public.game_participant_history (post_id, player_id, from_status, to_status, changed_by, changed_at)
select x.post_id, x.player_id, null, 'requested', x.player_id, x.requested_at
from public.game_participant x
where x.post_id::text like '00000000-0000-0000-0000-00000000c1%'
union all
select x.post_id, x.player_id, 'requested', 'accepted', gp.organiser_id, x.responded_at
from public.game_participant x
join public.game_post gp on gp.post_id = x.post_id
where x.post_id::text like '00000000-0000-0000-0000-00000000c1%'
  and x.status in ('accepted', 'no_show', 'withdrawn')
union all
select x.post_id, x.player_id, 'accepted', x.status, x.player_id,
       gp.proposed_time - interval '14 hours'
from public.game_participant x
join public.game_post gp on gp.post_id = x.post_id
where x.post_id::text like '00000000-0000-0000-0000-00000000c1%'
  and x.status = 'withdrawn'
union all
select x.post_id, x.player_id, 'accepted', 'no_show', gp.organiser_id,
       gp.proposed_time + interval '2 hours'
from public.game_participant x
join public.game_post gp on gp.post_id = x.post_id
where x.post_id::text like '00000000-0000-0000-0000-00000000c1%'
  and x.status = 'no_show';

-- Bob called off Morning singles two hours before the start.
insert into public.cancellation_record (post_id, cancelled_at, reason, updated_by)
select post_id, proposed_time - interval '2 hours', 'Sick, sorry!', organiser_id
from public.game_post where post_id = '00000000-0000-0000-0000-00000000c105';

-- Matches, sides and results.
insert into public.match (match_id, post_id, league_id, venue_id, created_by, format, played_at, suburb, status, created_at)
select m.match_id, gp.post_id, m.league_id, gp.venue_id, gp.organiser_id, gp.format,
       gp.proposed_time, gp.suburb, 'completed', gp.created_at
from (values
  ('00000000-0000-0000-0000-00000000d101'::uuid, '00000000-0000-0000-0000-00000000c101'::uuid, '00000000-0000-0000-0000-00000000e001'::uuid),
  ('00000000-0000-0000-0000-00000000d102'::uuid, '00000000-0000-0000-0000-00000000c102'::uuid, null),
  ('00000000-0000-0000-0000-00000000d103'::uuid, '00000000-0000-0000-0000-00000000c103'::uuid, '00000000-0000-0000-0000-00000000e001'::uuid),
  ('00000000-0000-0000-0000-00000000d104'::uuid, '00000000-0000-0000-0000-00000000c104'::uuid, null),
  ('00000000-0000-0000-0000-00000000d106'::uuid, '00000000-0000-0000-0000-00000000c106'::uuid, '00000000-0000-0000-0000-00000000e001'::uuid),
  ('00000000-0000-0000-0000-00000000d107'::uuid, '00000000-0000-0000-0000-00000000c107'::uuid, null)
) as m (match_id, post_id, league_id)
join public.game_post gp on gp.post_id = m.post_id;

insert into public.match_participant (match_id, player_id, side, status)
values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000a001', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000a003', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a002', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a001', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a003', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a005', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a004', 'a', 'no_show'),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-00000000a003', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-00000000a002', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d104', '00000000-0000-0000-0000-00000000a008', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d104', '00000000-0000-0000-0000-00000000a001', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d106', '00000000-0000-0000-0000-00000000a001', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d106', '00000000-0000-0000-0000-00000000a004', 'b', 'playing'),
  ('00000000-0000-0000-0000-00000000d107', '00000000-0000-0000-0000-00000000a004', 'a', 'playing'),
  ('00000000-0000-0000-0000-00000000d107', '00000000-0000-0000-0000-00000000a005', 'b', 'playing');

insert into public.match_result (match_id, score, status, winning_side, submitted_by, created_at)
values
  ('00000000-0000-0000-0000-00000000d101', '21-15 21-17', 'confirmed', 'a', '00000000-0000-0000-0000-00000000a001', now() - interval '14 days'),
  ('00000000-0000-0000-0000-00000000d102', '21-18 19-21 21-16', 'confirmed', 'b', '00000000-0000-0000-0000-00000000a003', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000d103', '21-19 21-19', 'disputed', 'a', '00000000-0000-0000-0000-00000000a003', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000d104', '15-21 18-21', 'confirmed', 'b', '00000000-0000-0000-0000-00000000a001', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000d106', '17-21 21-23', 'confirmed', 'b', '00000000-0000-0000-0000-00000000a004', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000000d107', '21-12 21-14', 'pending', 'a', '00000000-0000-0000-0000-00000000a004', now() - interval '30 days');

insert into public.dispute (match_id, raised_by, reason, status, created_at)
values ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-00000000a002',
        'The score was 21-19 19-21 21-17. I won the third game.', 'open', now() - interval '6 days');

insert into public.check_in (match_id, player_id, checked_in_at, method, verified)
values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000a001', now() - interval '14 days', 'qr', true),
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000a003', now() - interval '14 days', 'qr', true),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a002', now() - interval '10 days', 'geolocation', true),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000a003', now() - interval '10 days', 'manual', false);

set session_replication_role = origin;

-- The profile copies of reliability (BL-052) are refreshed by triggers, which
-- were off above.
select private.refresh_reliability(player_id) from public.player;
