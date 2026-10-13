-- Gaps found preparing the frontend wiring (items-to-confirm 2, 15, 17).
--
-- 1. A game with no title is called "Badminton game" (was "Singles game").
--    Game cards also carry the venue's Google Maps link.
-- 2. get_game_form_options(): everything the Post a Game form needs in one
--    call: venues, formats, styles, levels, limits, and the clubs the player
--    can post for.
-- 3. update_my_profile also sets preferred format (BL-011) and the email
--    opt-out (BL-087).
-- 4. get_my_home's next game skips removed games and has a title and venue.

-- ---------------------------------------------------------------------------
-- 1. Game cards
-- ---------------------------------------------------------------------------

create or replace function private.game_card(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', gp.post_id,
    'title', coalesce(gp.title, 'Badminton game'),
    'format', private.label(gp.format),
    'style', private.label(gp.style),
    'rank', case when gp.ability_level = 'any' then 'Any Rank' else private.label(gp.ability_level) end,
    'startsAt', gp.proposed_time,
    'endsAt', gp.proposed_time + make_interval(mins => gp.duration_minutes),
    'date', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy, FMDD Mon'),
    'time', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'FMHH12:MI AM')
            || ' – '
            || to_char((gp.proposed_time + make_interval(mins => gp.duration_minutes))
                       at time zone 'Australia/Melbourne', 'FMHH12:MI AM'),
    'location', coalesce(v.name || ', ' || gp.suburb, gp.suburb),
    'suburb', gp.suburb,
    -- Opens the venue in Google Maps. Null for "other venue" games.
    'mapsUrl', v.maps_url,
    'playerCount', (
      select count(*) from public.game_participant x
      where x.post_id = gp.post_id and x.status = 'accepted'
    ),
    'maxPlayers', gp.player_limit,
    'status', gp.status,
    'imageUrl', null,
    'organiser', case
      when gp.organiser_club_id is not null then jsonb_build_object(
        'id', c.club_id, 'name', c.name, 'initials', private.initials(c.name),
        'isClub', true, 'isActive', c.is_active)
      else jsonb_build_object(
        'id', p.player_id, 'name', p.username, 'initials', private.initials(p.username),
        'isClub', false,
        'isDeleted', p.deleted_at is not null,
        -- BL-027: the blocker sees a Blocked badge on someone they blocked.
        'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]))
    end,
    'myStatus', (
      select private.request_status_label(me.status) from public.game_participant me
      where me.post_id = gp.post_id and me.player_id = (select auth.uid())
    )
  )
  from public.game_post gp
  left join public.venue v on v.venue_id = gp.venue_id
  left join public.player p on p.player_id = gp.organiser_id
  left join public.club c on c.club_id = gp.organiser_club_id
  where gp.post_id = p_post_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Post a Game form options
-- ---------------------------------------------------------------------------

create or replace function public.get_game_form_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.venue_id,
               'name', v.name,
               'address', v.address,
               'suburb', s.name,
               'state', s.state_code,
               'mapsUrl', v.maps_url)
             order by v.name)
      from public.venue v
      join public.suburb s on s.suburb_id = v.suburb_id
    ), '[]'::jsonb),
    'formats', jsonb_build_array(
      jsonb_build_object('value', 'singles', 'label', 'Singles', 'defaultPlayers', 2),
      jsonb_build_object('value', 'doubles', 'label', 'Doubles', 'defaultPlayers', 4),
      jsonb_build_object('value', 'mixed_doubles', 'label', 'Mixed Doubles', 'defaultPlayers', 4)),
    'styles', jsonb_build_array(
      jsonb_build_object('value', 'social', 'label', 'Social'),
      jsonb_build_object('value', 'competitive', 'label', 'Competitive')),
    'abilityLevels', jsonb_build_array(
      jsonb_build_object('value', 'any', 'label', 'Any Rank'),
      jsonb_build_object('value', 'beginner', 'label', 'Beginner'),
      jsonb_build_object('value', 'lower_intermediate', 'label', 'Lower Intermediate'),
      jsonb_build_object('value', 'intermediate', 'label', 'Intermediate'),
      jsonb_build_object('value', 'upper_intermediate', 'label', 'Upper Intermediate'),
      jsonb_build_object('value', 'advanced', 'label', 'Advanced')),
    'limits', jsonb_build_object(
      'minPlayers', 2, 'maxPlayers', 64,
      'minDurationMinutes', 15, 'maxDurationMinutes', 240, 'defaultDurationMinutes', 60,
      'titleMaxLength', 80, 'notesMaxLength', 300,
      'cancelCutoffHours', 4),
    'defaultTitle', 'Badminton game',
    -- "Post as": the player, or a club they are an admin of.
    'postAs', jsonb_build_array(jsonb_build_object(
        'type', 'player', 'id', (select auth.uid()), 'name',
        (select p.username from public.player p where p.player_id = (select auth.uid()))))
      || coalesce((
        select jsonb_agg(jsonb_build_object('type', 'club', 'id', c.club_id, 'name', c.name)
                         order by c.name)
        from public.club_representative cr
        join public.club c on c.club_id = cr.club_id
        where cr.player_id = (select auth.uid())
          and cr.role = 'admin' and cr.status = 'approved' and c.is_active
      ), '[]'::jsonb)
  )
  where (select private.is_registered());
$$;

comment on function public.get_game_form_options() is
  'Post a Game form data in one call: supabase.rpc(''get_game_form_options''). '
  'Venues (id to send as venue_id), formats, styles, ability levels, limits and '
  'who the player can post as. Null until the player is registered.';

revoke all on function public.get_game_form_options() from public;
grant execute on function public.get_game_form_options() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profile settings: preferred format and email opt-out
-- ---------------------------------------------------------------------------

drop function public.update_my_profile(text, text, text, text, text, text, text, boolean);

create function public.update_my_profile(
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_self_rating_band text default null,
  p_bio text default null,
  p_suburb text default null,
  p_state text default null,
  p_is_discoverable boolean default null,
  p_preferred_format text default null,
  p_email_notifications boolean default null
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

  if p_username is not null and lower(trim(p_username)) is distinct from (
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

  if p_preferred_format is not null
     and p_preferred_format not in ('singles', 'doubles', 'mixed_doubles', 'any')
  then
    raise exception 'Choose a format: singles, doubles, mixed_doubles or any.'
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
      is_discoverable = coalesce(p_is_discoverable, is_discoverable),
      preferred_format = coalesce(p_preferred_format, preferred_format),
      email_notifications = coalesce(p_email_notifications, email_notifications)
  where player_id = v_me;

  return public.get_my_profile();
end;
$$;

comment on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean) is
  'Profile settings: supabase.rpc(''update_my_profile'', { p_username, p_first_name, '
  'p_last_name, p_self_rating_band, p_bio, p_suburb, p_state, p_is_discoverable, '
  'p_preferred_format, p_email_notifications }). Send only what changed; returns '
  'get_my_profile().';

revoke all on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean) from public;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Home page next game
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
          'title', coalesce(gp.title, 'Badminton game'),
          'format', private.band_label(gp.format),
          'startsAt', gp.proposed_time,
          'date', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy, FMDD Mon'),
          'time', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'FMHH12:MI AM'),
          'suburb', gp.suburb,
          'location', coalesce(v.name || ', ' || gp.suburb, gp.suburb),
          'mapsUrl', v.maps_url,
          'isHost', gp.organiser_id = p.player_id,
          'playerCount', (
            select count(*) from public.game_participant x
            where x.post_id = gp.post_id and x.status = 'accepted'
          ),
          'maxPlayers', gp.player_limit
        )
        from public.game_participant me
        join public.game_post gp on gp.post_id = me.post_id
        left join public.venue v on v.venue_id = gp.venue_id
        where me.player_id = p.player_id
          and me.status = 'accepted'
          and gp.deleted_at is null
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
