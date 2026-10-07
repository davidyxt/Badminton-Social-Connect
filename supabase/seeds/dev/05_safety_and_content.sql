-- Dev seed: blocking, reports, admin posts, notifications and venue
-- geocoding (BL-027, BL-028, BL-050, admin_post, venue geocoding queue).

-- Alice blocked Frank (one-sided: Alice still sees Frank, badged; Frank can no
-- longer see Alice or any game she runs or joins).
insert into public.blocks (blocker_id, blocked_id, category, reason, created_at)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a006',
        'harassment', 'Kept messaging me after our game.', now() - interval '4 days');

-- Reports, with the evidence the report_* functions capture.
insert into public.report (reported_by_player_id, target_type, target_id, category, reason, status, evidence, created_at)
values
  ('00000000-0000-0000-0000-00000000a003', 'player', '00000000-0000-0000-0000-00000000a006',
   'harassment', 'Sent rude messages after I declined his game.', 'open',
   jsonb_build_object('username', 'frank', 'bio', 'Visiting Melbourne for work.',
                      'suburb', 'Parramatta', 'captured_at', now() - interval '3 days'),
   now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000a002', 'game_post', '00000000-0000-0000-0000-00000000b007',
   'spam', 'Same game posted three times with a coaching ad in the notes.', 'under_review',
   jsonb_build_object('title', 'Lunchtime singles', 'organiser', 'frank',
                      'captured_at', now() - interval '2 days'),
   now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a004', 'player', '00000000-0000-0000-0000-00000000a005',
   'fake_account', 'Thought this was someone I know pretending. My mistake.', 'dismissed',
   jsonb_build_object('username', 'erin', 'captured_at', now() - interval '20 days'),
   now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000a001', 'club', '00000000-0000-0000-0000-00000000c003',
   'other', 'Club still listed although it closed.', 'resolved',
   jsonb_build_object('name', 'Old Court Club', 'captured_at', now() - interval '25 days'),
   now() - interval '25 days');

-- Admin posts for the home page carousel.
insert into public.admin_post (created_by, title, body, image_url, display_order, status, published_at)
values
  ('00000000-0000-0000-0000-00000000a000', 'Welcome to Badminton Social Connect',
   'Find a game near you, meet new players and keep track of your results.', null, 1,
   'published', now() - interval '60 days'),
  ('00000000-0000-0000-0000-00000000a000', 'Every badminton venue in Australia',
   'Pick your venue from the list when you post a game, and tap it to open Google Maps.', null, 2,
   'published', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000000a000', 'Spring Singles Ladder finals',
   'Draft: finals night details to come.', null, 3, 'draft', null),
  ('00000000-0000-0000-0000-00000000a000', 'Winter social round-up',
   'Thanks to everyone who came along this winter.', null, 4, 'archived', now() - interval '90 days');

-- Notifications the game triggers would not have sent for the past games.
insert into public.notification (player_id, type, message, detail, post_id, match_id, is_read, created_at)
values
  ('00000000-0000-0000-0000-00000000a002', 'result_submitted',
   'carol submitted the result of your Singles game: 21-19 21-19.', 'Confirm or dispute it.',
   '00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000d103', true, now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000a003', 'dispute_update',
   'bob disputed the result of your Singles game.', 'An administrator will review it.',
   '00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000d103', false, now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000000a004', 'no_show',
   'bob marked you as a no-show for Clayton doubles.', 'This affects your reliability score.',
   '00000000-0000-0000-0000-00000000c102', null, false, now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000a001', 'league_update',
   'You are top of the Spring Singles Ladder.', null, null, null, false, now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000000a009', 'system',
   'Welcome to Badminton Social Connect! Find your first game.', null, null, null, false, now() - interval '2 days');

-- A venue added without a pin is queued for geocoding (pending), and one the
-- geocoder could not place (failed: the admin console sets its pin by hand).
insert into public.venue (venue_id, name, address, suburb_id)
values
  ('00000000-0000-0000-0000-0000000000f1', 'Parkville Community Hall (dev)', '103 Tin Alley, Parkville VIC 3010',
   (select suburb_id from public.suburb where name = 'Parkville' and postcode = '3052')),
  ('00000000-0000-0000-0000-0000000000f2', 'Unknown Sports Barn (dev)', 'Somewhere Rd',
   (select suburb_id from public.suburb where name = 'Footscray' and postcode = '3011'));

update public.venue_geocode_queue
set status = 'failed', attempts = 3, processed_at = now(),
    last_error = 'No match within 10 km of the suburb'
where venue_id = '00000000-0000-0000-0000-0000000000f2';
