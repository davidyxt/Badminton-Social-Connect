-- Australian states and territories. Production reference data.
-- Safe to run repeatedly: existing rows are updated, not duplicated.

insert into public.state (state_code, name) values
  ('ACT', 'Australian Capital Territory'),
  ('NSW', 'New South Wales'),
  ('NT',  'Northern Territory'),
  ('QLD', 'Queensland'),
  ('SA',  'South Australia'),
  ('TAS', 'Tasmania'),
  ('VIC', 'Victoria'),
  ('WA',  'Western Australia')
on conflict (state_code) do update set name = excluded.name;
