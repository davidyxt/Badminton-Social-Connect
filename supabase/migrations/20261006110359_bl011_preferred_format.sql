-- BL-011: a player's preferred playing format.
--
-- Shown as "Preferred format" on a player's profile and on a join request, so
-- a host can judge whether the player suits the game. The frontend calls it
-- preferredFormat.
--
-- The first three values match game_post.format, so Find Games can later
-- filter or rank by it (BL-088). 'any' is the default so nobody has to answer
-- before they can use the app.

alter table public.player_profile
  add column preferred_format text not null default 'any'
    check (preferred_format in ('singles', 'doubles', 'mixed_doubles', 'any'));

comment on column public.player_profile.preferred_format is
  'The format the player would rather play: singles, doubles, mixed_doubles '
  'or any. Values match game_post.format. Owner-editable; visible to others '
  'under the same is_discoverable rule as the rest of the profile.';

-- player_profile updates are column-level: the derived counters stay
-- service_role only. Add the new column to what the owner may change.
grant update (preferred_format) on public.player_profile to authenticated;
