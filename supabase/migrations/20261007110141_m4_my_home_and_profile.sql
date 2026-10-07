-- M4: the signed-in player's own data, for the Home page and the Profile page.
--
--   get_my_home()        Home: greeting name, top-bar initials, rating card
--                        (rating, level, matches, win rate, state rank), the
--                        next game, unread notification count.
--   get_my_profile()     Profile: name, level, reliability, location, rating,
--                        win rate, state rank, verified matches, plus every
--                        field the player can edit.
--   update_my_profile()  Saves any of those editable fields in one call.
--
-- These return the player's own real name: it is theirs to see. Other players
-- only ever get the username (get_player_profile).
--
-- Fields filled in by other branches once merged (null or absent until then):
--   rating, level grade (e.g. B1), monthly rating change  BL-024 rating calc
--   preferred format                                      BL-011 (M1)
--   blocked users count                                   BL-027 (M3)
--   live reliability, email opt-out                       BL-052 / BL-087 (M5)
-- Reliability here is player_profile.reliability_score, which M5 keeps in
-- sync with its live calculation.

-- ---------------------------------------------------------------------------
-- 1. Shared pieces
-- ---------------------------------------------------------------------------

-- 'upper_intermediate' -> 'Upper Intermediate'.
create or replace function private.band_label(p_band text)
returns text
language sql
immutable
set search_path = ''
as $$
  select initcap(replace(p_band, '_', ' '));
$$;

-- Initials from a real name if there is one ("John Doe" -> "JD"), otherwise
-- from the username ("alice_42" -> "AL").
create or replace function private.my_initials(p_first text, p_last text, p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(
    case
      when nullif(trim(p_first), '') is not null and nullif(trim(p_last), '') is not null
        then left(trim(p_first), 1) || left(trim(p_last), 1)
      when nullif(trim(p_first), '') is not null
        then left(trim(p_first), 2)
      else left(regexp_replace(coalesce(p_username, '?'), '[^A-Za-z]', '', 'g'), 2)
    end
  );
$$;

-- The rating card: best rating across formats, verified matches, win rate,
-- and rank among players in the same state.
create or replace function private.rating_card(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select (r.winning_side = mp.side) as won
    from public.match_participant mp
    join public.match_result r on r.match_id = mp.match_id and r.status = 'confirmed'
    where mp.player_id = p_player_id
  ),
  best as (
    select rk.format, rk.ranking_points, rk.band
    from public.ranking rk
    where rk.player_id = p_player_id
    order by rk.ranking_points desc
    limit 1
  ),
  me as (
    select pp.state from public.player_profile pp where pp.player_id = p_player_id
  )
  select jsonb_build_object(
    'rating', (select ranking_points from best),
    'ratingFormat', (select format from best),
    'band', (select private.band_label(band) from best),
    -- The A/B/C grade and the monthly change come with the rating
    -- calculation (BL-024).
    'grade', null,
    'ratingChangeThisMonth', null,
    'matches', (select count(*) from results),
    'wins', (select count(*) from results where won),
    'winRate', (
      select case when count(*) = 0 then 0
                  else round(100.0 * count(*) filter (where won) / count(*))::int end
      from results
    ),
    'rankState', (select state from me),
    -- Position among players in the same state, in the player's best
    -- format. Null until the player has a rating.
    'stateRank', case when exists (select 1 from best) then (
      select 1 + count(*)
      from public.ranking other
      join public.player_profile op on op.player_id = other.player_id
      where other.format = (select format from best)
        and op.state = (select state from me)
        and other.ranking_points > (select ranking_points from best)
    ) end,
    'status', case when (select count(*) from results) >= 10 then 'Established' else 'Provisional' end
  );
$$;

revoke all on function private.band_label(text) from public;
revoke all on function private.my_initials(text, text, text) from public;
revoke all on function private.rating_card(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Home page
-- ---------------------------------------------------------------------------

create or replace function public.get_my_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'greetingName', coalesce(
        nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', null,
      'registered', pv.registered_at is not null,
      'level', private.band_label(p.self_rating_band),
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      -- The soonest upcoming game the player is in, as host or player.
      'nextGame', (
        select jsonb_build_object(
          'id', gp.post_id,
          'format', private.band_label(gp.format),
          'startsAt', gp.proposed_time,
          'date', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy, FMDD Mon'),
          'time', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'FMHH12:MI AM'),
          'suburb', gp.suburb,
          'isHost', gp.organiser_id = p.player_id,
          'playerCount', (
            select count(*) from public.game_participant x
            where x.post_id = gp.post_id and x.status = 'accepted'
          ),
          'maxPlayers', gp.player_limit
        )
        from public.game_participant me
        join public.game_post gp on gp.post_id = me.post_id
        where me.player_id = p.player_id
          and me.status = 'accepted'
          and gp.status in ('open', 'full')
          and gp.proposed_time > now()
        order by gp.proposed_time
        limit 1
      )
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$$;

comment on function public.get_my_home() is
  'Home page: supabase.rpc(''get_my_home''). greetingName ("John Doe", or the '
  'username), initials for the top bar, level, ratingCard (rating, band, '
  'matches, winRate, stateRank, status), nextGame (null = "No game '
  'planned") and unreadNotifications.';

-- ---------------------------------------------------------------------------
-- 3. Profile page
-- ---------------------------------------------------------------------------

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'lastName', pv.last_name,
      'name', coalesce(nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', null,
      'selfRatingBand', p.self_rating_band,
      'level', private.band_label(p.self_rating_band),
      'isVerified', p.is_verified,
      'bio', pp.bio,
      'suburb', pp.suburb,
      'state', pp.state,
      -- Spelled out here: the state table arrives with BL-001 (foundation).
      'stateName', case pp.state
        when 'VIC' then 'Victoria' when 'NSW' then 'New South Wales'
        when 'QLD' then 'Queensland' when 'WA' then 'Western Australia'
        when 'SA' then 'South Australia' when 'TAS' then 'Tasmania'
        when 'ACT' then 'Australian Capital Territory' when 'NT' then 'Northern Territory'
      end,
      'location', concat_ws(' · ',
        case when pp.suburb is not null then pp.suburb || ' area' end, pp.state),
      'isDiscoverable', pp.is_discoverable,
      'reliability', round(pp.reliability_score)::int,
      'gamesPlayed', pp.games_played,
      'noShows', pp.no_show_count,
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      'joinedAt', p.joined_at
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    join public.player_profile pp on pp.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$$;

comment on function public.get_my_profile() is
  'Profile page and its edit screens: supabase.rpc(''get_my_profile''). The '
  'signed-in player''s own name, username, level, bio, suburb, state, '
  'location label, visibility, reliability, games played, ratingCard and '
  'unread count. Only ever returns the caller''s own data.';

-- ---------------------------------------------------------------------------
-- 4. Saving edits
-- ---------------------------------------------------------------------------
-- Every parameter is optional: null leaves that field unchanged. To clear
-- the bio or suburb, send an empty string.

create or replace function public.update_my_profile(
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_self_rating_band text default null,
  p_bio text default null,
  p_suburb text default null,
  p_state text default null,
  p_is_discoverable boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if p_username is not null and lower(trim(p_username)) <> (
       select lower(username) from public.player where player_id = v_me)
     and not public.is_username_available(trim(p_username))
  then
    raise exception 'That username is taken or not allowed. Use 3-20 letters, numbers, _ or .'
      using errcode = '23505';
  end if;

  if p_state is not null and p_state not in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT') then
    raise exception 'Choose a state or territory.' using errcode = '22023';
  end if;

  if p_self_rating_band is not null and p_self_rating_band not in (
       'beginner', 'lower_intermediate', 'intermediate', 'upper_intermediate', 'advanced')
  then
    raise exception 'Choose a level: beginner, lower_intermediate, intermediate, upper_intermediate or advanced.'
      using errcode = '22023';
  end if;

  if p_first_name is not null and nullif(trim(p_first_name), '') is null then
    raise exception 'First name cannot be empty.' using errcode = '23514';
  end if;

  update public.player
  set username = coalesce(trim(p_username), username),
      self_rating_band = coalesce(p_self_rating_band, self_rating_band)
  where player_id = v_me;

  update public.player_private
  set first_name = coalesce(trim(p_first_name), first_name),
      last_name = case when p_last_name is null then last_name else nullif(trim(p_last_name), '') end
  where player_id = v_me;

  update public.player_profile
  set bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
      suburb = case when p_suburb is null then suburb else nullif(trim(p_suburb), '') end,
      state = coalesce(p_state, state),
      is_discoverable = coalesce(p_is_discoverable, is_discoverable)
  where player_id = v_me;

  return public.get_my_profile();
end;
$$;

comment on function public.update_my_profile(text, text, text, text, text, text, text, boolean) is
  'Saves the signed-in player''s own profile: supabase.rpc(''update_my_profile'', '
  '{ p_username, p_first_name, p_last_name, p_self_rating_band, p_bio, '
  'p_suburb, p_state, p_is_discoverable }). Send only what changed; returns '
  'the updated profile. Errors carry a message safe to show.';

revoke all on function public.get_my_home() from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.get_my_home() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text, boolean) to authenticated;
