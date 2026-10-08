-- Dummy data for local development ONLY. Never loaded into the hosted project:
-- the CI deploy job loads supabase/seeds/production/ and nothing else.
--
-- The dev seed fills every table so each screen and API has something to
-- show. Files run in name order:
--   01_accounts.sql          players, profiles, private details, rankings
--   02_groups.sql             groups, admins, members, a join request
--   03_upcoming_games.sql    games to find, requests, a cancelled and a removed game
--   04_past_games.sql        finished games, matches, results, a dispute, no-shows
--   05_safety_and_content.sql blocks, reports, admin posts, notifications, venues
--   06_deleted_account.sql   one account deleted, shown as "Deleted User"
--
-- Every account's password is Passw0rd!  (meets the local password policy)
--
--   admin@example.com   platform admin (app_metadata.role = admin)
--   alice@example.com   organiser, Smash Group admin, runs the Spring Singles Ladder,
--                       blocked frank
--   bob@example.com     asked to join Smash Group (pending), one late cancellation
--   carol@example.com   Northside Shuttlers admin, has a disputed result, invited ivy
--   dan@example.com     profile hidden (is_discoverable = false), one no-show, declined bob's invitation
--   erin@example.com    Smash Group member, one late withdrawal
--   frank@example.com   blocked by alice, reported by carol
--   grace@example.com   signed up with Google: no username, has not passed the
--                       age gate, so lands on /complete-registration
--   ivy@example.com     brand-new player: no games yet, an invitation from carol to answer
--   henry@example.com   deleted in 06_deleted_account.sql; cannot sign in
--
-- Game times are relative to today, at Melbourne clock times (6 pm, 7 pm), so after any `db reset` the upcoming games
-- are always upcoming and the past ones always past.

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- Inserting into auth.users fires on_auth_user_created, which creates the
-- player, player_profile and player_private rows and, for everyone who sends a
-- date of birth, passes the 18+ age gate. The empty-string token columns are
-- required: Supabase Auth cannot sign in a user whose tokens are null.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, extensions.crypt('Passw0rd!', extensions.gen_salt('bf')), now(),
  u.app_meta::jsonb,
  case when u.username is null
    -- Google sends names, never a username or date of birth.
    then jsonb_build_object('full_name', u.first_name || ' ' || u.last_name,
                            'email_verified', true)
    else jsonb_build_object(
      'username', u.username, 'first_name', u.first_name, 'last_name', u.last_name,
      'date_of_birth', u.dob, 'age_declared', true,
      'terms_version', '2026-10', 'privacy_version', '2026-10', 'state', u.state)
  end,
  now() - u.joined, now(), '', '', '', '', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000a000'::uuid, 'admin@example.com', 'bsc_admin', 'Admin', 'User',
   '1985-01-15', 'VIC', '{"provider":"email","providers":["email"],"role":"admin"}', interval '120 days'),
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'alice@example.com', 'alice', 'Alice', 'Nguyen',
   '1995-05-20', 'VIC', '{"provider":"email","providers":["email"]}', interval '90 days'),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'bob@example.com', 'bob', 'Bob', 'Smith',
   '1990-11-02', 'VIC', '{"provider":"email","providers":["email"]}', interval '80 days'),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'carol@example.com', 'carol', 'Carol', 'Chen',
   '1988-03-14', 'VIC', '{"provider":"email","providers":["email"]}', interval '75 days'),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'dan@example.com', 'dan', 'Dan', 'Kowalski',
   '1999-07-30', 'VIC', '{"provider":"email","providers":["email"]}', interval '60 days'),
  ('00000000-0000-0000-0000-00000000a005'::uuid, 'erin@example.com', 'erin', 'Erin', 'Walsh',
   '2001-09-09', 'VIC', '{"provider":"email","providers":["email"]}', interval '45 days'),
  ('00000000-0000-0000-0000-00000000a006'::uuid, 'frank@example.com', 'frank', 'Frank', 'Moore',
   '1993-12-01', 'NSW', '{"provider":"email","providers":["email"]}', interval '30 days'),
  ('00000000-0000-0000-0000-00000000a007'::uuid, 'grace@example.com', null, 'Grace', 'Lim',
   null, null, '{"provider":"google","providers":["google"]}', interval '1 day'),
  ('00000000-0000-0000-0000-00000000a008'::uuid, 'henry@example.com', 'henry', 'Henry', 'Brown',
   '1979-04-22', 'VIC', '{"provider":"email","providers":["email"]}', interval '100 days'),
  ('00000000-0000-0000-0000-00000000a009'::uuid, 'ivy@example.com', 'ivy', 'Ivy', 'Patel',
   '2004-02-29', 'QLD', '{"provider":"email","providers":["email"]}', interval '2 days')
) as u (id, email, username, first_name, last_name, dob, state, app_meta, joined);

-- Email sign-in looks the user up through auth.identities. Grace also gets an
-- email identity so tests can sign in as her without Google.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@example.com';

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(), '00000000-0000-0000-0000-00000000a007', '109876543210987654321',
  '{"sub":"109876543210987654321","email":"grace@example.com","email_verified":true,"full_name":"Grace Lim"}',
  'google', now(), now(), now()
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

update public.player set self_rating_band = v.band, is_verified = v.verified,
  joined_at = (select u.created_at from auth.users u where u.id = v.id)
from (values
  ('00000000-0000-0000-0000-00000000a000'::uuid, 'intermediate', false),
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'intermediate', true),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'beginner', false),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'upper_intermediate', true),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'advanced', false),
  ('00000000-0000-0000-0000-00000000a005'::uuid, 'lower_intermediate', false),
  ('00000000-0000-0000-0000-00000000a006'::uuid, 'intermediate', false),
  ('00000000-0000-0000-0000-00000000a007'::uuid, 'beginner', false),
  ('00000000-0000-0000-0000-00000000a008'::uuid, 'intermediate', false),
  ('00000000-0000-0000-0000-00000000a009'::uuid, 'beginner', false)
) as v (id, band, verified)
where player_id = v.id;

update public.player_profile
set suburb = v.suburb, bio = v.bio, is_discoverable = v.discoverable,
    preferred_format = v.format
from (values
  ('00000000-0000-0000-0000-00000000a000'::uuid, 'Melbourne', null, false, 'any'),
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'Carlton', 'Social doubles most weeknights.', true, 'doubles'),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'Clayton', 'New to badminton, keen to improve.', true, 'any'),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'Box Hill', 'Looking for competitive singles.', true, 'singles'),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'Albert Park', null, false, 'singles'),
  ('00000000-0000-0000-0000-00000000a005'::uuid, 'Brunswick', 'Group player, happy to make up numbers.', true, 'mixed_doubles'),
  ('00000000-0000-0000-0000-00000000a006'::uuid, 'Parramatta', 'Visiting Melbourne for work.', true, 'any'),
  ('00000000-0000-0000-0000-00000000a008'::uuid, 'Richmond', 'Weekend player.', true, 'doubles'),
  ('00000000-0000-0000-0000-00000000a009'::uuid, 'Southbank', 'Just moved here, looking for games.', true, 'any')
) as v (id, suburb, bio, discoverable, format)
where player_id = v.id;

-- ---------------------------------------------------------------------------
-- Rankings (BL-025 will calculate these; fixed numbers for now)
-- ---------------------------------------------------------------------------

insert into public.ranking (player_id, format, ranking_points, band, verified_games_count)
values
  ('00000000-0000-0000-0000-00000000a001', 'singles', 1240, 'intermediate', 3),
  ('00000000-0000-0000-0000-00000000a001', 'doubles', 1185, 'intermediate', 1),
  ('00000000-0000-0000-0000-00000000a002', 'doubles', 980, 'beginner', 1),
  ('00000000-0000-0000-0000-00000000a003', 'singles', 1310, 'upper_intermediate', 1),
  ('00000000-0000-0000-0000-00000000a003', 'doubles', 1205, 'upper_intermediate', 1),
  ('00000000-0000-0000-0000-00000000a004', 'singles', 1405, 'advanced', 1),
  ('00000000-0000-0000-0000-00000000a005', 'doubles', 1050, 'lower_intermediate', 1),
  ('00000000-0000-0000-0000-00000000a008', 'singles', 1100, 'intermediate', 1);
