-- BL-001: reference tables for states, suburbs and venue locations.
--
-- This migration creates the tables only. The rows are production reference
-- data and live in supabase/seeds/production/, so that fixing a venue address
-- is an edit to a seed file rather than a new migration. Locally they load on
-- every `db reset`; the hosted project gets them from the CI deploy job.
--
-- Suburbs cover all of Australia (GeoNames postal codes, CC BY 4.0). Postcode
-- is a column on suburb rather than its own table: one suburb can have several
-- postcodes and one postcode covers several suburbs, so the useful unit is the
-- (suburb, postcode, state) combination.

-- ---------------------------------------------------------------------------
-- 1. States and territories
-- ---------------------------------------------------------------------------

create table public.state (
  state_code text primary key
    check (state_code in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  name text not null unique
);

comment on table public.state is
  'The eight Australian states and territories. Reference data, loaded from '
  'supabase/seeds/production/. Codes match the state check constraints on '
  'player_profile and club.';

-- ---------------------------------------------------------------------------
-- 2. Suburbs
-- ---------------------------------------------------------------------------

create table public.suburb (
  suburb_id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  postcode text not null check (postcode ~ '^[0-9]{4}$'),
  state_code text not null references public.state (state_code) on delete restrict,
  latitude numeric(8, 5),
  longitude numeric(8, 5),
  constraint suburb_name_postcode_state_key unique (name, postcode, state_code)
);

comment on table public.suburb is
  'Australian suburbs and localities with their postcodes. Reference data from '
  'GeoNames (CC BY 4.0, https://www.geonames.org), loaded from '
  'supabase/seeds/production/. Mail-only postcodes (PO boxes, large-volume '
  'receivers) are excluded. Attribution to GeoNames is required wherever the '
  'data is shown.';
comment on column public.suburb.postcode is
  'Text, not integer: NT and ACT postcodes start with 0.';
comment on column public.suburb.latitude is
  'Approximate centre of the suburb, not of any person. For distance-based '
  'features such as the Nearby leaderboard.';

-- The suburb picker searches by name prefix ("carl" -> Carlton, Carlton
-- North), case-insensitively, usually within one state.
create index suburb_name_search_idx
  on public.suburb (state_code, lower(name) text_pattern_ops);
create index suburb_postcode_idx on public.suburb (postcode);
create index suburb_state_code_idx on public.suburb (state_code);

-- ---------------------------------------------------------------------------
-- 3. Venues get a location
-- ---------------------------------------------------------------------------
-- Venues are staff-maintained (see the venue policies in the initial schema),
-- so every venue can be tied to a real suburb. The hosted project has no
-- venues yet, so the column can be required from the start.

alter table public.venue
  add column suburb_id uuid not null
    references public.suburb (suburb_id) on delete restrict;

alter table public.venue
  add constraint venue_name_suburb_key unique (name, suburb_id);

comment on column public.venue.suburb_id is
  'Where the venue is. Find Games shows this suburb to everyone; the venue '
  'name and address are for accepted players only (PHY-02, BL-017).';

create index venue_suburb_id_idx on public.venue (suburb_id);

-- ---------------------------------------------------------------------------
-- 4. Access
-- ---------------------------------------------------------------------------
-- State and suburb are public reference data. anon can read them because the
-- sign-up form asks for a state before the player has an account. Nobody can
-- write them through the API: they change only through the production seed
-- files, which run as the database owner.

alter table public.state  enable row level security;
alter table public.suburb enable row level security;

create policy "state: readable by everyone"
  on public.state for select to anon, authenticated
  using (true);

create policy "suburb: readable by everyone"
  on public.suburb for select to anon, authenticated
  using (true);

revoke insert, update, delete on public.state  from anon, authenticated;
revoke insert, update, delete on public.suburb from anon, authenticated;
