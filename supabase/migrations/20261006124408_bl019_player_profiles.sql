-- BL-019: see enough about another player to decide whether a match suits.
--
-- get_player_profile returns what the Player Profile screen
-- (frontend/src/pages/PlayerProfilePage.jsx) shows, using the screen's own
-- keys so it can be dropped straight in: name, initials, level, status,
-- rating, wins, losses, matches, reliability, recentForm, preferredFormat,
-- area, league.
--
-- Wins, losses and form are computed from confirmed results that still count
-- towards rankings. match_result rows are private to the players in a match,
-- so the counting happens in security definer helpers that return totals only,
-- never anyone's individual results.
--
-- Privacy: a profile is shown to the player themselves, admins, and anyone
-- while it is discoverable. A hidden profile is still shown to the host of a
-- game the player asked to join, and to players on the same game roster,
-- because they need it to decide on or prepare for the game.

-- ---------------------------------------------------------------------------
-- 1. Display helpers
-- ---------------------------------------------------------------------------

-- "jane_smith" -> "JS", "alice" -> "AL".
create or replace function private.initials(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(
    case
      when array_length(parts, 1) >= 2 then left(parts[1], 1) || left(parts[2], 1)
      else left(coalesce(parts[1], p_name), 2)
    end
  )
  from (
    select array_remove(regexp_split_to_array(p_name, '[^A-Za-z]+'), '') as parts
  ) s;
$$;

-- 'upper_intermediate' -> 'Upper Intermediate', 'mixed_doubles' -> 'Mixed Doubles'.
create or replace function private.label(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select initcap(replace(p_value, '_', ' '));
$$;

-- ---------------------------------------------------------------------------
-- 2. Totals from verified results
-- ---------------------------------------------------------------------------

create or replace function private.player_stats(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select (r.winning_side = mp.side) as won,
           coalesce(m.played_at, m.created_at) as played
    from public.match_participant mp
    join public.match m on m.match_id = mp.match_id
    join public.match_result r
      on r.match_id = m.match_id
     and r.status = 'confirmed'
     and not r.excluded_from_ranking
    where mp.player_id = p_player_id
  )
  select jsonb_build_object(
    'rating', (
      select max(rk.ranking_points) from public.ranking rk where rk.player_id = p_player_id
    ),
    'wins', (select count(*) from results where won),
    'losses', (select count(*) from results where not won),
    'matches', (select count(*) from results),
    -- Provisional until 10 verified games (BL-024).
    'status', case when (select count(*) from results) >= 10 then 'Established' else 'Provisional' end,
    'recentForm', coalesce((
      select jsonb_agg(case when won then 'W' else 'L' end order by played desc)
      from (select won, played from results order by played desc limit 5) last5
    ), '[]'::jsonb),
    'reliability', (
      select round(pp.reliability_score)::int from public.player_profile pp
      where pp.player_id = p_player_id
    )
  );
$$;

comment on function private.player_stats(uuid) is
  'Totals for one player from confirmed results that count towards rankings: '
  'rating (highest across formats, null before BL-024 fills ranking), wins, '
  'losses, matches, Provisional/Established, last five results as W/L, '
  'reliability.';

revoke all on function private.initials(text) from public;
revoke all on function private.label(text) from public;
revoke all on function private.player_stats(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Who may see a profile
-- ---------------------------------------------------------------------------

create or replace function private.can_see_profile(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_registered()) and (
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

comment on function private.can_see_profile(uuid) is
  'Self, admins, anyone while the profile is discoverable, the host of a game '
  'the player asked to join, and players on the same game roster.';

revoke all on function private.can_see_profile(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. The profile
-- ---------------------------------------------------------------------------

create or replace function public.get_player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_see_profile(p_player_id)) then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'name', p.username,
      'initials', private.initials(p.username),
      'level', private.label(p.self_rating_band),
      'preferredFormat', private.label(pp.preferred_format),
      'area', pp.suburb,
      'bio', pp.bio,
      'isVerified', p.is_verified,
      'profileImageUrl', null,
      'league', (
        select jsonb_build_object('id', ml.league_id, 'name', ml.name, 'position', ls.position)
        from public.league_standing ls
        join public.mini_league ml on ml.league_id = ls.league_id
        where ls.player_id = p.player_id
        order by ls.position nulls last, ml.start_date desc
        limit 1
      )
    ) || private.player_stats(p.player_id)
    from public.player p
    join public.player_profile pp on pp.player_id = p.player_id
    where p.player_id = p_player_id
  );
end;
$$;

comment on function public.get_player_profile(uuid) is
  'BL-019. supabase.rpc(''get_player_profile'', { p_player_id }) returns the '
  'Player Profile screen''s object, or null when the profile is private to '
  'the caller. Never includes real names, email or date of birth.';

revoke all on function public.get_player_profile(uuid) from public;
grant execute on function public.get_player_profile(uuid) to authenticated;
