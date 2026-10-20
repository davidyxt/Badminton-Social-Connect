-- BL-015: find games by location, time and level, plus the data behind the
-- screens that follow from Find Games.
--
-- Following the current frontend, each function returns objects with the
-- screen's own keys so they can replace the mock data directly:
--
--   search_games       Find Games, Matches tab   (FindGamesPage.jsx `games`)
--   search_players     Find Games, Players tab   (FindGamesPage.jsx `players`)
--   get_game_details   Game Details              (GameDetailsPage.jsx)
--   get_join_requests  host's Play Request        (PlayRequestPage.jsx, BL-017)
--
-- game_post also gets the optional `title` the Find Games cards show.
--
-- Not yet: hiding games from blocked players (BL-027).

-- ---------------------------------------------------------------------------
-- 1. Title, and indexes for search
-- ---------------------------------------------------------------------------

alter table public.game_post
  add column title text check (length(trim(title)) between 1 and 80);

comment on column public.game_post.title is
  'Optional card title, e.g. "Friday Night Doubles". When empty, screens show '
  '"<Format> game".';

create index game_post_search_idx
  on public.game_post (proposed_time, format)
  where deleted_at is null and status in ('open', 'full');
create index game_post_suburb_search_idx
  on public.game_post (lower(suburb))
  where deleted_at is null;

-- Trigram indexes for the search box. `ilike '%carl%'` cannot use a normal
-- index, so without these every search reads the whole table. While tables
-- are small Postgres ignores them and scans, which is faster; they start
-- paying off from tens of thousands of rows. Searches shorter than three
-- characters cannot use them either way.
create extension if not exists pg_trgm with schema extensions;

create index player_username_trgm_idx
  on public.player using gin (username extensions.gin_trgm_ops);
create index player_profile_suburb_trgm_idx
  on public.player_profile using gin (suburb extensions.gin_trgm_ops);
create index game_post_title_trgm_idx
  on public.game_post using gin (title extensions.gin_trgm_ops)
  where deleted_at is null;
create index game_post_suburb_trgm_idx
  on public.game_post using gin (suburb extensions.gin_trgm_ops)
  where deleted_at is null;
create index venue_name_trgm_idx
  on public.venue using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Shared pieces
-- ---------------------------------------------------------------------------

-- Self-rating bands a level filter matches. The screens offer beginner,
-- intermediate and advanced; intermediate covers the bands either side.
create or replace function private.bands_for_level(p_level text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case lower(p_level)
    when 'beginner' then array['beginner']
    when 'intermediate' then array['lower_intermediate', 'intermediate', 'upper_intermediate']
    when 'advanced' then array['advanced']
    else null
  end;
$$;

-- 'requested' -> 'pending', 'rejected' -> 'declined', as the screens say it.
create or replace function private.request_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'requested' then 'pending'
    when 'rejected' then 'declined'
    else p_status
  end;
$$;

-- One game as the Find Games card shows it. Access checks are the caller's job.
create or replace function private.game_card(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', gp.post_id,
    'title', coalesce(gp.title, private.label(gp.format) || ' game'),
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
        'isClub', false)
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

revoke all on function private.bands_for_level(text) from public;
revoke all on function private.request_status_label(text) from public;
revoke all on function private.game_card(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Find Games: Matches tab
-- ---------------------------------------------------------------------------

create or replace function public.search_games(
  p_query text default null,
  p_level text default null,
  p_format text default null,
  p_suburb text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_bands text[] := private.bands_for_level(p_level);
begin
  if not (select private.is_registered()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(private.game_card(g.post_id) order by g.proposed_time, g.post_id)
    from (
      select gp.post_id, gp.proposed_time
      from public.game_post gp
      left join public.venue v on v.venue_id = gp.venue_id
      where gp.deleted_at is null
        and gp.status in ('open', 'full')
        and gp.proposed_time > now()
        and gp.proposed_time >= coalesce(p_from, now())
        and (p_to is null or gp.proposed_time <= p_to)
        and (p_suburb is null or lower(gp.suburb) = lower(trim(p_suburb)))
        and (
          p_format is null
          or gp.format = lower(p_format)
          -- The screens offer singles and doubles; mixed doubles is doubles.
          or (lower(p_format) = 'doubles' and gp.format = 'mixed_doubles')
        )
        and (v_bands is null or gp.ability_level = 'any' or gp.ability_level = any (v_bands))
        and (
          v_query is null
          or gp.title ilike '%' || v_query || '%'
          or gp.suburb ilike '%' || v_query || '%'
          or v.name ilike '%' || v_query || '%'
          or replace(gp.ability_level, '_', ' ') ilike '%' || v_query || '%'
        )
        -- TODO(BL-027): leave out games organised by players either side has blocked.
      order by gp.proposed_time, gp.post_id
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) g
  ), '[]'::jsonb);
end;
$$;

comment on function public.search_games(text, text, text, text, timestamptz, timestamptz, integer, integer) is
  'BL-015. Upcoming open or full games, soonest first, as Find Games cards: '
  'supabase.rpc(''search_games'', { p_query, p_level, p_format, p_suburb, '
  'p_from, p_to, p_limit, p_offset }). Every filter is optional. p_query '
  'matches title, suburb, venue and level. p_level: beginner | intermediate '
  '| advanced (games open to any level always match). p_format: singles | '
  'doubles. Pages of up to 50.';

-- ---------------------------------------------------------------------------
-- 4. Find Games: Players tab
-- ---------------------------------------------------------------------------

create or replace function public.search_players(
  p_query text default null,
  p_level text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_bands text[] := private.bands_for_level(p_level);
begin
  if not (select private.is_registered()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(row_obj order by name_sort)
    from (
      select lower(p.username) as name_sort,
             jsonb_build_object(
               'id', p.player_id,
               'name', p.username,
               'initials', private.initials(p.username),
               'rank', private.label(p.self_rating_band),
               'location', pp.suburb,
               'reliability', round(pp.reliability_score)::int
             ) as row_obj
      from public.player p
      join public.player_profile pp on pp.player_id = p.player_id
      join public.player_private pv on pv.player_id = p.player_id
      where pp.is_discoverable
        and pv.registered_at is not null
        and p.player_id <> (select auth.uid())
        and (v_bands is null or p.self_rating_band = any (v_bands))
        and (
          v_query is null
          or p.username ilike '%' || v_query || '%'
          or pp.suburb ilike '%' || v_query || '%'
          or replace(p.self_rating_band, '_', ' ') ilike '%' || v_query || '%'
        )
        -- TODO(BL-027): leave out players either side has blocked.
      order by lower(p.username)
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) r
  ), '[]'::jsonb);
end;
$$;

comment on function public.search_players(text, text, integer, integer) is
  'Find Games Players tab: discoverable, registered players other than the '
  'caller, by username, suburb or level: supabase.rpc(''search_players'', '
  '{ p_query, p_level, p_limit, p_offset }). Never real names.';

-- ---------------------------------------------------------------------------
-- 5. Game Details
-- ---------------------------------------------------------------------------

create or replace function public.get_game_details(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_host jsonb;
begin
  select * into v_post from public.game_post where post_id = p_post_id;

  if v_post.post_id is null
     or not (select private.is_registered())
     or (v_post.deleted_at is not null and not (select private.is_admin()))
  then
    return null;
  end if;

  if v_post.organiser_id is not null then
    select jsonb_build_object(
             'id', p.player_id, 'name', p.username,
             'initials', private.initials(p.username), 'isClub', false
           ) || (
             select jsonb_build_object(
               'rating', s -> 'rating', 'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability')
             from (select private.player_stats(p.player_id) as s) x
           )
      into v_host
    from public.player p where p.player_id = v_post.organiser_id;
  else
    select jsonb_build_object(
             'id', c.club_id, 'name', c.name, 'initials', private.initials(c.name),
             'isClub', true, 'isActive', c.is_active, 'isVerified', c.is_verified)
      into v_host
    from public.club c where c.club_id = v_post.organiser_club_id;
  end if;

  return private.game_card(p_post_id) || jsonb_build_object(
    'duration', v_post.duration_minutes || ' mins',
    'durationMinutes', v_post.duration_minutes,
    'location', coalesce((select v.name from public.venue v where v.venue_id = v_post.venue_id), v_post.suburb),
    'locationDetail', v_post.suburb,
    'address', (select v.address from public.venue v where v.venue_id = v_post.venue_id),
    'venueId', v_post.venue_id,
    'notes', v_post.notes,
    'abilityLevel', v_post.ability_level,
    'host', v_host,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.player_id, 'name', p.username,
               'initials', private.initials(p.username),
               'host', p.player_id is not distinct from v_post.organiser_id)
             order by (p.player_id is not distinct from v_post.organiser_id) desc, x.responded_at)
      from public.game_participant x
      join public.player p on p.player_id = x.player_id
      where x.post_id = p_post_id and x.status = 'accepted'
    ), '[]'::jsonb),
    'canManage', (select private.can_manage_post(p_post_id)),
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$$;

comment on function public.get_game_details(uuid) is
  'Game Details screen: the card plus duration, venue, address, notes, host '
  '(rating, verified matches, reliability), accepted players, the caller''s '
  'request status and whether they manage the game. Null if the game is '
  'deleted (admins excepted) or the caller is not registered.';

-- ---------------------------------------------------------------------------
-- 6. Play Request (host view, BL-017)
-- ---------------------------------------------------------------------------

create or replace function public.get_join_requests(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card jsonb;
begin
  if not (select private.is_registered())
     or not ((select private.can_manage_post(p_post_id)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s organiser can see its requests.' using errcode = '42501';
  end if;

  v_card := private.game_card(p_post_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.post_id || ':' || x.player_id,
             'status', private.request_status_label(x.status),
             'requestedAt', x.requested_at,
             'game', v_card,
             'host', v_card -> 'organiser',
             'requester', jsonb_build_object(
               'id', p.player_id,
               'name', p.username,
               'initials', private.initials(p.username),
               'level', private.label(p.self_rating_band),
               'preferredFormat', private.label(pp.preferred_format),
               'profileImageUrl', null,
               'message', msg.message,
               'rating', s -> 'rating',
               'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability'
             ))
             order by x.requested_at)
    from public.game_participant x
    join public.game_post gp on gp.post_id = x.post_id
    join public.player p on p.player_id = x.player_id
    join public.player_profile pp on pp.player_id = x.player_id
    left join public.game_request_message msg
      on msg.post_id = x.post_id and msg.player_id = x.player_id
    cross join lateral (select private.player_stats(x.player_id) as s) st
    where x.post_id = p_post_id
      and x.player_id is distinct from gp.organiser_id
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_join_requests(uuid) is
  'Play Request screen: every request for a game the caller organises, with '
  'the requester''s level, preferred format, rating, verified matches, '
  'reliability and message. Status uses the screen''s words: pending, '
  'accepted, declined, withdrawn. Respond with accept_request / decline_request.';

revoke all on function public.search_games(text, text, text, text, timestamptz, timestamptz, integer, integer) from public;
revoke all on function public.search_players(text, text, integer, integer) from public;
revoke all on function public.get_game_details(uuid) from public;
revoke all on function public.get_join_requests(uuid) from public;
grant execute on function public.search_games(text, text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.search_players(text, text, integer, integer) to authenticated;
grant execute on function public.get_game_details(uuid) to authenticated;
grant execute on function public.get_join_requests(uuid) to authenticated;
