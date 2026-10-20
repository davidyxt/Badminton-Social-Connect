-- BL-027 follow-ups agreed by the team (items-to-confirm 13, notes for FE 4).
--
-- 1. The blocker can open the blocked player's profile. The blocked player
--    still cannot open the blocker's. Profiles say isBlocked, so the page can
--    show the badge and an Unblock button.
-- 2. A block can carry a category (the report categories) and a reason. Both
--    are optional and only the blocker (and platform admins) can read them.
-- 3. Players blocked in both directions, or by the caller, stay where they
--    were; a game both are in keeps both (the blocker's responsibility).

-- ---------------------------------------------------------------------------
-- 1. Why a player was blocked
-- ---------------------------------------------------------------------------

alter table public.blocks
  add column category text check (category in (
    'harassment', 'inappropriate_content', 'fake_account', 'spam',
    'safety_concern', 'underage', 'other'
  )),
  add column reason text check (length(reason) <= 500);

comment on column public.blocks.category is
  'Optional. Same list as report categories. Seen only by the blocker and admins.';
comment on column public.blocks.reason is
  'Optional note from the blocker. Seen only by the blocker and admins.';

grant select (category, reason) on public.blocks to authenticated;

drop function public.block_player(uuid);

create function public.block_player(
  p_player_id uuid,
  p_category text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_category text := nullif(trim(p_category), '');
  v_reason text := nullif(trim(p_reason), '');
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
  if v_category is not null and v_category not in (
    'harassment', 'inappropriate_content', 'fake_account', 'spam',
    'safety_concern', 'underage', 'other'
  ) then
    raise exception 'Choose one of the listed reasons.' using errcode = '23514';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '23514';
  end if;

  -- Blocking again updates the reason, so a player can add one later.
  insert into public.blocks (blocker_id, blocked_id, category, reason)
  values (v_me, p_player_id, v_category, v_reason)
  on conflict (blocker_id, blocked_id) do update
    set category = coalesce(excluded.category, public.blocks.category),
        reason = coalesce(excluded.reason, public.blocks.reason);

  perform set_config('bsc.suppress_notifications', 'on', true);

  update public.game_participant x
  set status = 'rejected'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = v_me
    and x.player_id = p_player_id
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  update public.game_participant x
  set status = 'withdrawn'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = p_player_id
    and x.player_id = v_me
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  perform set_config('bsc.suppress_notifications', '', true);
end;
$$;

comment on function public.block_player(uuid, text, text) is
  'supabase.rpc(''block_player'', { p_player_id, p_category?, p_reason? }). '
  'One-sided: the blocked player loses sight of the blocker. Category and '
  'reason are optional; blocking again updates them.';

revoke all on function public.block_player(uuid, text, text) from public;
grant execute on function public.block_player(uuid, text, text) to authenticated;

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
           'category', b.category,
           'categoryLabel', private.label(b.category),
           'reason', b.reason,
           'blockedAt', b.created_at)
         order by b.created_at desc), '[]'::jsonb)
  from public.blocks b
  join public.player p on p.player_id = b.blocked_id
  where b.blocker_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. The blocker can open the blocked player's profile
-- ---------------------------------------------------------------------------

create or replace function private.can_see_profile(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_registered())
    -- BL-027: someone who blocked the caller is hidden from them. The
    -- caller's own blocks do not hide anyone from the caller.
    and not (p_player_id = any ((select private.blocked_me_ids())::uuid[]))
    and (
    p_player_id = (select auth.uid())
    or (select private.is_admin())
    -- Players I blocked: I can still open their profile.
    or p_player_id = any ((select private.blocked_by_me_ids())::uuid[])
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
  )
  -- A deleted account has no profile to open.
  and not exists (
    select 1 from public.player d where d.player_id = p_player_id and d.deleted_at is not null
  );
$$;

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
      'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
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
