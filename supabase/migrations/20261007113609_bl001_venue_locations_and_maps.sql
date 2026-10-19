-- BL-001: venue coordinates and a Google Maps link for every venue.
--
-- The venue list itself is production seed data
-- (supabase/seeds/production/03_venues.sql): 144 venues across Australia,
-- from BadmintonHub's published venue pages (badmintonhub.com.au), with the
-- coordinates those pages publish. Use in production is pending BadmintonHub's
-- permission (team item 8).
--
-- maps_url is worked out by the database, so a venue an admin adds later gets
-- a link too:
--   * with coordinates: https://www.google.com/maps/search/?api=1&query=<lat>,<lng>
--   * without:          the same link searching for the name and address
-- The app opens it when the player taps the venue.

alter table public.venue
  add column latitude numeric(9, 6)
    check (latitude between -44.0 and -9.0),
  add column longitude numeric(9, 6)
    check (longitude between 112.0 and 160.0),
  add column source_url text,
  add column coordinates_source text
    check (coordinates_source in ('badmintonhub', 'openstreetmap', 'admin')),
  add constraint venue_coordinates_together
    check ((latitude is null) = (longitude is null));

comment on column public.venue.latitude is
  'Pin position. The checks keep it inside Australia. Null when the source''s '
  'pin was wrong; maps_url then searches by name and address.';
comment on column public.venue.source_url is
  'Where the listing came from, for attribution and corrections.';
comment on column public.venue.coordinates_source is
  'Where the pin came from: badmintonhub (its published venue data), '
  'openstreetmap (looked up with Nominatim; credit "(c) OpenStreetMap '
  'contributors", ODbL) or admin (entered by hand).';

-- Only letters, digits, spaces and commas go into the search text, so the
-- link needs no URL-encoding function.
alter table public.venue
  add column maps_url text generated always as (
    'https://www.google.com/maps/search/?api=1&query=' ||
    case
      when latitude is not null and longitude is not null
        then latitude::text || ',' || longitude::text
      else replace(
        regexp_replace(name || ', ' || coalesce(address, ''), '[^A-Za-z0-9 ,]', '', 'g'),
        ' ', '+')
    end
  ) stored;

comment on column public.venue.maps_url is
  'Opens the venue in Google Maps. Generated from the coordinates, or from the '
  'name and address when there are none.';
