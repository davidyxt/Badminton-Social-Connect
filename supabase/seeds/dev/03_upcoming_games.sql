-- Dev seed: upcoming games (BL-013, BL-015, BL-017). Inserted with every
-- trigger on, exactly as the app would: the organiser goes on the roster, the
-- first acceptance creates the match, and each request or acceptance sends
-- its notification.
--
--   ...b001  alice   Friday Night Doubles at MSAC, in 2 days: carol and erin in,
--                    bob and ivy asking (bob with a message)
--   ...b002  bob     untitled singles ("Badminton game") at Melbourne Badminton
--                    Centre, in 3 days: dan asking, erin asked then withdrew
--   ...b003  carol   competitive singles at an "other venue" (suburb only), in 5 days
--   ...b004  Smash Club  club social night at Melbourne University, in 6 days
--   ...b005  alice   cancelled ("Venue double-booked")
--   ...b006  bob     removed by bob (hidden from everyone but admins)
--   ...b007  frank   singles in 4 days: alice blocked frank, so she sees a
--                    Blocked badge and frank cannot see alice anywhere
--   ...b008  henry   doubles in 7 days with carol in: cancelled when henry's
--                    account is deleted in 06

insert into public.game_post (
  post_id, organiser_id, organiser_club_id, title, format, style, ability_level,
  venue_id, suburb, proposed_time, duration_minutes, player_limit, notes
)
values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', null,
   'Friday Night Doubles', 'doubles', 'social', 'intermediate',
   (select venue_id from public.venue where name = 'Melbourne Sports and Aquatic Centre@ MSAC'), null,
   date_trunc('hour', now()) + interval '2 days 18 hours', 90, 4,
   'Bring your own racquet. Shuttles provided.'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a002', null,
   null, 'singles', 'social', 'any',
   (select venue_id from public.venue where name = 'Melbourne Badminton Centre'), null,
   date_trunc('hour', now()) + interval '3 days 10 hours', 60, 2, null),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a003', null,
   'Competitive singles', 'singles', 'competitive', 'upper_intermediate',
   null, 'Box Hill South',
   date_trunc('hour', now()) + interval '5 days 19 hours', 60, 2,
   'School hall on Station St. Text me on arrival.'),
  ('00000000-0000-0000-0000-00000000b004', null, '00000000-0000-0000-0000-00000000c001',
   'Smash Club social night', 'doubles', 'social', 'any',
   (select venue_id from public.venue where name = 'Melbourne University Badminton Club'), null,
   date_trunc('hour', now()) + interval '6 days 19 hours', 120, 8, 'All levels welcome.'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a001', null,
   'Sunday hit', 'doubles', 'social', 'any',
   (select venue_id from public.venue where name = 'Melbourne Sports and Aquatic Centre@ MSAC'), null,
   date_trunc('hour', now()) + interval '8 days 10 hours', 60, 4, null),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-00000000a002', null,
   'Removed post', 'singles', 'social', 'any',
   null, 'Clayton',
   date_trunc('hour', now()) + interval '9 days 18 hours', 60, 2, null),
  ('00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-00000000a006', null,
   'Lunchtime singles', 'singles', 'social', 'intermediate',
   (select venue_id from public.venue where name = 'Melbourne Unique Badminton Centre'), null,
   date_trunc('hour', now()) + interval '4 days 12 hours', 45, 2, null),
  ('00000000-0000-0000-0000-00000000b008', '00000000-0000-0000-0000-00000000a008', null,
   'Richmond doubles', 'doubles', 'social', 'any',
   null, 'Richmond',
   date_trunc('hour', now()) + interval '7 days 18 hours', 60, 4, null);

-- Requests and places. Inserting as accepted is what accept_request does.
insert into public.game_participant (post_id, player_id, status, requested_at)
values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a003', 'accepted',  now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a005', 'accepted',  now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002', 'requested', now() - interval '20 hours'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a009', 'requested', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a004', 'requested', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a005', 'requested', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-00000000a005', 'accepted',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-00000000a001', 'accepted',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a003', 'accepted',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b008', '00000000-0000-0000-0000-00000000a003', 'accepted',  now() - interval '1 day');

insert into public.game_request_message (post_id, player_id, message)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002',
        'Hi! New to doubles but keen to learn. Happy to bring shuttles.');

-- Erin changes her mind about Bob's game.
update public.game_participant set status = 'withdrawn'
where post_id = '00000000-0000-0000-0000-00000000b002'
  and player_id = '00000000-0000-0000-0000-00000000a005';

-- Alice cancels Sunday hit, the way cancel_game_post does. (The seed runs
-- with no signed-in user, which the game triggers trust.)
update public.game_post set status = 'cancelled'
where post_id = '00000000-0000-0000-0000-00000000b005';

insert into public.cancellation_record (post_id, reason, updated_by)
values ('00000000-0000-0000-0000-00000000b005', 'Venue double-booked',
        '00000000-0000-0000-0000-00000000a001');

select private.notify_game_players(
  '00000000-0000-0000-0000-00000000b005', 'game_cancelled',
  private.describe_game('00000000-0000-0000-0000-00000000b005') || ' was cancelled by the organiser.'
);

-- Bob removes his post, the way delete_game_post does.
update public.game_post
set deleted_at = now(), deleted_by = '00000000-0000-0000-0000-00000000a002',
    deletion_reason = 'Posted by mistake'
where post_id = '00000000-0000-0000-0000-00000000b006';
