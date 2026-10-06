-- BL-027: block a player.
--
-- A block hides two players from each other, in both directions, and is
-- enforced in the database rather than the UI (PHY-03):
--   * each disappears from the other's player roster, profiles, rankings and
--     game rosters, and from search_players;
--   * games organised by either are hidden from the other, including in
--     search_games and get_game_details;
--   * neither can ask to join, or be accepted into, a game the other runs;
--   * at the moment of blocking, pending requests and places between them in
--     upcoming games are closed, so they do not end up on the same court.
-- Nothing tells the blocked player they were blocked: the blocker just looks
-- like a private profile. Blocks persist until the blocker removes them.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.player (player_id) on delete cascade,
  blocked_id uuid not null references public.player (player_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_id_idx on public.blocks (blocked_id);

comment on table public.blocks is
  'Who has blocked whom. Named as in the API spec (/blocks). Only the blocker '
  'can see their own rows; written by block_player / unblock_player.';

alter table public.blocks enable row level security;

create policy "blocks: blocker or admin reads"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()) or (select private.is_admin()));

create policy "blocks: registered players only"
  on public.blocks as restrictive for all to authenticated
  using ((select private.is_registered()))
  with check ((select private.is_registered()));

revoke insert, update, delete on public.blocks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Everyone in a block with the caller, either direction. Policies call it as
-- `= any ((select private.blocked_ids())::uuid[])`, so it runs once per query.
create or replace function private.blocked_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(other), '{}'::uuid[])
  from (
    select b.blocked_id as other from public.blocks b where b.blocker_id = (select auth.uid())
    union
    select b.blocker_id from public.blocks b where b.blocked_id = (select auth.uid())
  ) x;
$$;

create or replace function private.is_block_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Whether a player and a game's organiser are in a block. security definer
-- because the caller cannot see a blocked organiser's game, which would make
-- an ordinary lookup find nothing and let the request through.
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
  );
$$;

revoke all on function private.is_blocked_from_game(uuid, uuid) from public;
grant execute on function private.is_blocked_from_game(uuid, uuid) to authenticated;

comment on function private.blocked_ids() is
  'Players in a block with the caller, in either direction.';
comment on function private.is_block_between(uuid, uuid) is
  'True when either player has blocked the other.';

revoke all on function private.blocked_ids() from public;
revoke all on function private.is_block_between(uuid, uuid) from public;
grant execute on function private.blocked_ids() to authenticated;
grant execute on function private.is_block_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Hidden in direct table reads
-- ---------------------------------------------------------------------------
-- RESTRICTIVE, so they narrow the existing read policies without changing them.

create policy "player: hidden between blocked players"
  on public.player as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_ids())::uuid[]));

create policy "player_profile: hidden between blocked players"
  on public.player_profile as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_ids())::uuid[]));

create policy "ranking: hidden between blocked players"
  on public.ranking as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_ids())::uuid[]));

create policy "game_participant: hidden between blocked players"
  on public.game_participant as restrictive for select to authenticated
  using (not player_id = any ((select private.blocked_ids())::uuid[]));

create policy "game_post: hidden between blocked players"
  on public.game_post as restrictive for select to authenticated
  using (organiser_id is null or not organiser_id = any ((select private.blocked_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- 4. Functions from BL-015, BL-017 and BL-019, with the block check added
-- ---------------------------------------------------------------------------
-- Each is identical to its earlier version apart from the lines marked BL-027.

create or replace function private.can_see_profile(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_registered())
    -- BL-027: a block hides each player from the other, whatever else applies.
    and not (p_player_id = any ((select private.blocked_ids())::uuid[]))
    and (
    p_player_id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.player_profile pp
      join public.player_private pv on pv.player_id = pp.player_id
      where pp.player_id = p_player_id
        and pp.is_discoverable
        and pv.registered_at is not null
    )
    -- They asked to join a game I run.
    or exists (
      select 1 from public.game_participant gp
      where gp.player_id = p_player_id
        and (select private.can_manage_post(gp.post_id))
    )
    -- We are both on the same game's roster.
    or exists (
      select 1 from public.game_participant mine
      join public.game_participant theirs on theirs.post_id = mine.post_id
      where mine.player_id = (select auth.uid()) and mine.status = 'accepted'
        and theirs.player_id = p_player_id and theirs.status = 'accepted'
    )
  );
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
        -- BL-027: no games organised by a player either side has blocked.
        and (gp.organiser_id is null or not gp.organiser_id = any ((select private.blocked_ids())::uuid[]))
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
        -- BL-027: no players either side has blocked.
        and not p.player_id = any ((select private.blocked_ids())::uuid[])
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
     -- BL-027: a game run by someone either side has blocked does not exist for you.
     or v_post.organiser_id = any ((select private.blocked_ids())::uuid[])
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
      -- BL-027: requests from players either side has blocked are not shown.
      and not x.player_id = any ((select private.blocked_ids())::uuid[])
  ), '[]'::jsonb);
end;
$$;

create or replace function private.validate_participant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if not (select private.game_is_open_for_requests(new.post_id)) then
    raise exception 'This game is no longer taking requests: it has started, been cancelled or been removed.'
      using errcode = '23514';
  end if;

  -- BL-027: nobody can ask to join, or be let into, a game run by someone
  -- either side has blocked. The message does not reveal the block.
  if new.status in ('requested', 'accepted')
     and (select private.is_blocked_from_game(new.post_id, new.player_id))
  then
    raise exception 'This game is not available.' using errcode = '42501';
  end if;

  if new.status in ('accepted', 'rejected') and new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Block, unblock, list
-- ---------------------------------------------------------------------------

create or replace function public.block_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot block yourself.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.player where player_id = p_player_id) then
    raise exception 'Player not found.' using errcode = '42501';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_me, p_player_id)
  on conflict do nothing;

  -- In my upcoming games, the blocked player's request or place is closed.
  update public.game_participant x
  set status = 'rejected'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = v_me
    and x.player_id = p_player_id
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  -- In their upcoming games, my request or place is withdrawn.
  update public.game_participant x
  set status = 'withdrawn'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = p_player_id
    and x.player_id = v_me
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();
end;
$$;

comment on function public.block_player(uuid) is
  'BL-027. supabase.rpc(''block_player'', { p_player_id }). Hides both players '
  'from each other and closes requests and places between them in upcoming '
  'games. Blocking twice is harmless.';

create or replace function public.unblock_player(p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks
  where blocker_id = (select auth.uid()) and blocked_id = p_player_id;
$$;

comment on function public.unblock_player(uuid) is
  'Removes the caller''s own block. Requests closed by the block stay closed.';

create or replace function public.get_blocked_players()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.player_id,
           'name', p.username,
           'initials', private.initials(p.username),
           'blockedAt', b.created_at)
         order by b.created_at desc), '[]'::jsonb)
  from public.blocks b
  join public.player p on p.player_id = b.blocked_id
  where b.blocker_id = (select auth.uid());
$$;

comment on function public.get_blocked_players() is
  'The Blocked Users list on the Profile page: players the caller has blocked.';

revoke all on function public.block_player(uuid) from public;
revoke all on function public.unblock_player(uuid) from public;
revoke all on function public.get_blocked_players() from public;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.get_blocked_players() to authenticated;
