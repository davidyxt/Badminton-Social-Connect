-- Dummy data for local development ONLY. Never loaded into the hosted project:
-- the CI deploy job loads supabase/seeds/production/ and nothing else.
--
-- Every account's password is Passw0rd!  (meets the local password policy)
-- All are adults who have accepted the terms, so they pass the age gate.
--
--   admin@example.com   platform admin (app_metadata.role = admin)
--   alice@example.com   organises games, created the Smash Club
--   bob@example.com
--   carol@example.com
--   dan@example.com     profile hidden (is_discoverable = false)
--
-- Game times are relative to now(), so after any `db reset` there are always
-- upcoming games to find.

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- Inserting into auth.users fires on_auth_user_created, which creates the
-- matching player and player_profile rows. The empty-string token columns are
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
  -- display_name becomes the username. The date of birth and consent fields
  -- pass the 18+ age gate (BL-007) at sign-up, so the accounts can use the
  -- app straight away; before BL-007 the trigger ignores them.
  jsonb_build_object(
    'display_name', u.display_name, 'first_name', u.display_name,
    'date_of_birth', '1995-05-20', 'age_declared', true,
    'terms_version', 'dev', 'privacy_version', 'dev', 'state', 'VIC'
  ),
  now(), now(), '', '', '', '', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000a000'::uuid, 'admin@example.com', 'Admin',
   '{"provider":"email","providers":["email"],"role":"admin"}'),
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'alice@example.com', 'Alice',
   '{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'bob@example.com', 'Bob',
   '{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'carol@example.com', 'Carol',
   '{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'dan@example.com', 'Dan',
   '{"provider":"email","providers":["email"]}')
) as u (id, email, display_name, app_meta);

-- Email sign-in looks the user up through auth.identities.
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

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

update public.player set self_rating_band = v.band
from (values
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'intermediate'),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'beginner'),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'upper_intermediate'),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'advanced')
) as v (id, band)
where player_id = v.id;

update public.player_profile set suburb = v.suburb, state = 'VIC', bio = v.bio,
  is_discoverable = v.discoverable
from (values
  ('00000000-0000-0000-0000-00000000a001'::uuid, 'Carlton', 'Social doubles most weeknights.', true),
  ('00000000-0000-0000-0000-00000000a002'::uuid, 'Clayton', 'New to badminton, keen to improve.', true),
  ('00000000-0000-0000-0000-00000000a003'::uuid, 'Box Hill', 'Looking for competitive singles.', true),
  ('00000000-0000-0000-0000-00000000a004'::uuid, 'Albert Park', null, false)
) as v (id, suburb, bio, discoverable)
where player_id = v.id;

-- ---------------------------------------------------------------------------
-- A club and some games
-- ---------------------------------------------------------------------------
-- on_club_created makes Alice the club's first representative.

insert into public.club (club_id, name, slug, description, suburb, state, created_by)
values (
  '00000000-0000-0000-0000-00000000c001', 'Smash Club', 'smash-club',
  'Friendly club for weeknight doubles.', 'Carlton', 'VIC',
  '00000000-0000-0000-0000-00000000a001'
);

-- on_game_post_created puts an individual organiser on the roster.
insert into public.game_post (organiser_id, organiser_club_id, format, suburb, proposed_time, player_limit)
values
  ('00000000-0000-0000-0000-00000000a001', null, 'doubles', 'Carlton',
   date_trunc('hour', now()) + interval '2 days 18 hours', 4),
  ('00000000-0000-0000-0000-00000000a002', null, 'singles', 'Clayton',
   date_trunc('hour', now()) + interval '3 days 10 hours', 2),
  ('00000000-0000-0000-0000-00000000a003', null, 'singles', 'Box Hill South',
   date_trunc('hour', now()) + interval '5 days 19 hours', 2),
  (null, '00000000-0000-0000-0000-00000000c001', 'doubles', 'Carlton North',
   date_trunc('hour', now()) + interval '6 days 19 hours', 8);
