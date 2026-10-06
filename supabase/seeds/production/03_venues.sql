-- Badminton venues. Production reference data.
-- Safe to run repeatedly: a venue is matched on (name, suburb) and its address
-- updated, not duplicated.
--
-- STARTING LIST, NOT YET VERIFIED. Each venue was found in a public listing
-- (source noted per row) on 2026-10-06. Addresses are left null where no
-- source gave one; nothing is guessed. Confirm the list, names and addresses
-- with Badminton Victoria before launch.
--
-- Deliberately left out until confirmed:
--   * Melbourne Badminton Centre: the Post a Game form places it in Clayton,
--     a web listing gives "6-16 Joseph Street, Melbourne". Sources disagree.
--   * Venues listed only under an association's name (Doncaster-Templestowe,
--     Mountain District): the venue's own name is not known.

insert into public.venue (name, address, suburb_id)
select v.name, v.address, s.suburb_id
from (values
  -- Badminton Victoria's home venue. weekendnotes.com/badminton-clubs-melbourne
  ('Melbourne Sports and Aquatic Centre', '30 Aughtie Drive', 'Albert Park', '3206'),
  -- weekendnotes.com/badminton-clubs-melbourne
  ('Altona Badminton Centre', '271 Mason Street', 'Altona North', '3025'),
  -- weekendnotes.com/badminton-clubs-melbourne
  ('Heidelberg Badminton Centre', '653-661 Waterdale Road', 'Heidelberg West', '3081'),
  -- peakplay.com.au (the venue's own site)
  ('Peak Play', '50E Cherry Lane', 'Laverton North', '3026'),
  -- badmintoncourt.au/melbourne
  ('Aqualink Nunawading', null, 'Forest Hill', '3131'),
  -- badmintoncourt.au/melbourne
  ('Box Hill Action Indoor Sports', null, 'Box Hill South', '3128'),
  -- badmintoncourt.au/melbourne
  ('Badminton & Table Tennis Connect', null, 'Truganina', '3029'),
  -- Listed in the Post a Game form (Monash University, Clayton campus)
  ('Monash Sport', null, 'Clayton', '3168'),
  -- weekendnotes.com/badminton-clubs-melbourne
  ('Princes Hill Secondary College', 'Arnold Street', 'Carlton North', '3054'),
  -- Bayside Badminton Club's venue. weekendnotes.com/badminton-clubs-melbourne
  ('Sandringham Youth Centre', 'Thomas Street', 'Hampton', '3188')
) as v (name, address, suburb, postcode)
join public.suburb s
  on s.name = v.suburb and s.postcode = v.postcode and s.state_code = 'VIC'
on conflict (name, suburb_id) do update set address = excluded.address;
