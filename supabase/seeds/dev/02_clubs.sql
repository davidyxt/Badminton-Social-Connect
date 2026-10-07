-- Dev seed: clubs (BL-080). See 01_accounts.sql for the accounts.
--
--   Smash Club           alice (admin), erin (member), bob (asked to join, pending)
--   Northside Shuttlers  carol (admin), alice (member), henry (member; his
--                        account is deleted in 06)
--   Old Court Club       dan (admin), inactive: shows "club inactive" on its
--                        past game
--
-- on_club_created makes each creator the club's first admin.

insert into public.club (club_id, name, slug, description, suburb, state, contact_email, created_by, is_verified)
values
  ('00000000-0000-0000-0000-00000000c001', 'Smash Club', 'smash-club',
   'Friendly club for weeknight doubles.', 'Carlton', 'VIC', 'hello@smashclub.example',
   '00000000-0000-0000-0000-00000000a001', true),
  ('00000000-0000-0000-0000-00000000c002', 'Northside Shuttlers', 'northside-shuttlers',
   'Competitive singles and doubles in the northern suburbs.', 'Preston', 'VIC', null,
   '00000000-0000-0000-0000-00000000a003', false),
  ('00000000-0000-0000-0000-00000000c003', 'Old Court Club', 'old-court-club',
   'No longer running.', 'Footscray', 'VIC', null,
   '00000000-0000-0000-0000-00000000a004', false);

-- Members join by asking; these were approved by the club's admin.
insert into public.club_representative (club_id, player_id, role, status, added_at)
values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a005', 'member', 'approved', now() - interval '40 days'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a002', 'member', 'pending',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000a001', 'member', 'approved', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000a008', 'member', 'approved', now() - interval '50 days');

-- Deactivated: no upcoming games, so the guard allows it.
update public.club set is_active = false
where club_id = '00000000-0000-0000-0000-00000000c003';
