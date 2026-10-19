-- BL-027 revised: one-sided blocking, following the frontend.
--
-- Replaces the symmetric rules in bl027_blocking. A block now works
-- differently for each side:
--
--   Blocker (Pat blocks Quinn)
--     * still finds Quinn in search_players and sees Quinn on game rosters
--       and in rankings, with isBlocked = true for a Blocked badge;
--     * still sees games Quinn organises (organiser.isBlocked = true), but
--       cannot join them.
--   Blocked (Quinn)
--     * cannot find Pat, open Pat's profile, or see Pat on rosters;
--     * cannot see or join games Pat organises or has joined, unless Quinn
--       was already in that game.
--   Both
--     * profiles stay closed both ways (get_player_profile returns null);
--     * rankings stay visible both ways. A leaderboard must hide the profile
--       picture and make the entry unclickable when either has blocked the
--       other (private.block_relation tells it which).
--
-- Because the blocker can see Quinn on a roster before joining, and Quinn
-- loses sight of any game Pat joins, the two no longer meet in a third
-- player's game without the blocker knowing.

-- ---------------------------------------------------------------------------
-- 1. Direction-aware helpers
-- ---------------------------------------------------------------------------

create or replace function private.blocked_by_me_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.blocked_id), '{}'::uuid[])
  from public.blocks b where b.blocker_id = (select auth.uid());
$$;

create or replace function private.blocked_me_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.blocker_id), '{}'::uuid[])
  from public.blocks b where b.blocked_id = (select auth.uid());
$$;

comment on function private.blocked_by_me_ids() is 'Players the caller has blocked.';
comment on function private.blocked_me_ids() is 'Players who have blocked the caller.';

-- For leaderboards and lists: how the caller and another player are related.
create or replace function private.block_relation(p_other uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.blocks b
                 where b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
      then 'blocked_by_me'
    when exists (select 1 from public.blocks b
                 where b.blocker_id = p_other and b.blocked_id = (select auth.uid()))
      then 'blocked_me'
  end;
$$;

comment on function private.block_relation(uuid) is
  'blocked_by_me, blocked_me or null. A leaderboard (BL-025) shows every '
  'entry, but when this is not null it hides the profile picture and makes '
  'the entry unclickable, and shows a Blocked badge for blocked_by_me.';

-- Is this game hidden from the caller because someone who blocked them
-- organises it or is playing in it? A game the caller is already in stays
-- visible, so they can see it and withdraw.
create or replace function private.game_hidden_from_me(p_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocked_me uuid[] := private.blocked_me_ids();
begin
  if cardinality(v_blocked_me) = 0 then
    return false;
  end if;

  if exists (
    select 1 from public.game_participant me
    where me.post_id = p_post_id and me.player_id = (select auth.uid())
      and me.status in ('requested', 'accepted')
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and (
        gp.organiser_id = any (v_blocked_me)
        or exists (
          select 1 from public.game_participant x
          where x.post_id = gp.post_id and x.status = 'accepted'
            and x.player_id = any (v_blocked_me)
        )
      )
  );
end;
$$;

comment on function private.game_hidden_from_me(uuid) is
  'True when someone who blocked the caller organises or is playing in the '
  'game, and the caller is not already in it.';

-- Who may join: not a game organised by either side of a block, and not a
-- game where someone who blocked the joiner is already playing.
create or replace function private.is_blocked_from_game(p_post_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_post gp
    where gp.post_id = p_post_id
      and gp.organiser_id is not null
      and private.is_block_between(gp.organiser_id, p_player_id)
  )
  or exists (
    select 1 from public.game_participant x
    join public.blocks b on b.blocker_id = x.player_id and b.blocked_id = p_player_id
    where x.post_id = p_post_id and x.status = 'accepted'
  );
$$;

revoke all on function private.blocked_by_me_ids() from public;
revoke all on function private.blocked_me_ids() from public;
revoke all on function private.block_relation(uuid) from public;
revoke all on function private.game_hidden_from_me(uuid) from public;
grant execute on function private.blocked_by_me_ids() to authenticated;
grant execute on function private.blocked_me_ids() to authenticated;
grant execute on function private.block_relation(uuid) to authenticated;
grant execute on function private.game_hidden_from_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Direct table reads
-- ---------------------------------------------------------------------------

drop policy "player: hidden between blocked players" on public.player;
drop policy "player_profile: hidden between blocked players" on public.player_profile;
drop policy "ranking: hidden between blocked players" on public.ranking;
drop policy "game_participant: hidden between blocked players" on public.game_participant;
drop policy "game_post: hidden between blocked players" on public.game_post;

-- Names: hidden only from the player who was blocked.
create policy "player: hidden from players the owner blocked"
  on public.player as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_me_ids())::uuid[]));

-- Profiles: closed both ways.
create policy "player_profile: hidden between blocked players"
  on public.player_profile as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_ids())::uuid[]));

-- Rosters: the blocked player does not see the blocker on them.
create policy "game_participant: hidden from players the owner blocked"
  on public.game_participant as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_me_ids())::uuid[]));

-- Games: hidden from the blocked player when the blocker organises or plays.
create policy "game_post: hidden from players blocked by an organiser or player"
  on public.game_post as restrictive for select to authenticated
  -- The cardinality check runs once per query, so players nobody has blocked
  -- (almost everyone) skip the per-row lookup.
  using (
    cardinality((select private.blocked_me_ids())::uuid[]) = 0
    or not private.game_hidden_from_me(post_id)
  );

-- Rankings: no block policy. They stay visible both ways.

-- ---------------------------------------------------------------------------
-- 3. Screen functions, with the one-sided rules
-- ---------------------------------------------------------------------------
-- Identical to their previous versions apart from the BL-027 lines.

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
        'isClub', false,
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
        -- BL-027: no games organised or joined by someone who blocked the caller.
        and not private.game_hidden_from_me(gp.post_id)
      order by gp.proposed_time, gp.post_id
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) g
  ), '[]'::jsonb);
end;
$$;

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
               'reliability', round(pp.reliability_score)::int,
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[])
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
        -- BL-027: players who blocked the caller are not found. Players the
        -- caller blocked are, with a Blocked badge.
        and not p.player_id = any ((select private.blocked_me_ids())::uuid[])
      order by lower(p.username)
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) r
  ), '[]'::jsonb);
end;
$$;

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
     -- BL-027: a game organised or joined by someone who blocked the caller
     -- does not exist for them.
     or private.game_hidden_from_me(p_post_id)
  then
    return null;
  end if;

  if v_post.organiser_id is not null then
    select jsonb_build_object(
             'id', p.player_id, 'name', p.username,
             'initials', private.initials(p.username), 'isClub', false,
             'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[])
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
               'host', p.player_id is not distinct from v_post.organiser_id,
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]))
             order by (p.player_id is not distinct from v_post.organiser_id) desc, x.responded_at)
      from public.game_participant x
      join public.player p on p.player_id = x.player_id
      where x.post_id = p_post_id and x.status = 'accepted'
        -- BL-027: someone who blocked the caller is left off the list.
        and not x.player_id = any ((select private.blocked_me_ids())::uuid[])
    ), '[]'::jsonb),
    'canManage', (select private.can_manage_post(p_post_id)),
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$$;
