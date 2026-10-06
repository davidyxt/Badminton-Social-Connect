-- BL-028: report a player, a game post, a Mini League or a club.
--
-- Reports are filed only through report_player / report_post / report_league
-- / report_club, named as in the API spec (report_club is extra, because
-- clubs are reportable since M6). Each function:
--   * takes a category and optional details (details required for 'other');
--   * stores an evidence snapshot of the reported item, copied by the server
--     at that moment, so moderators see what was reported even if it is
--     edited or deleted afterwards, and the reporter cannot fake it;
--   * is rate-limited, and refuses a second open report on the same item.
-- Open reports form the admin queue (Admin BE, BL-038/039).
--
-- The category list and rate limits are a starting point awaiting the team
-- (team item 12).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.report
  add column category text not null default 'other'
    check (category in (
      'harassment', 'inappropriate_content', 'fake_account', 'spam',
      'safety_concern', 'underage', 'other'
    )),
  add column evidence jsonb not null default '{}'::jsonb;

-- reason becomes the optional details; required only for 'other'.
alter table public.report alter column reason drop not null;
alter table public.report drop constraint report_reason_check;
alter table public.report
  add constraint report_reason_check
    check (reason is null or length(trim(reason)) between 1 and 1000),
  add constraint report_other_needs_details
    check (category <> 'other' or reason is not null);

alter table public.report drop constraint report_target_type_check;
alter table public.report
  add constraint report_target_type_check
    check (target_type in ('player', 'game_post', 'match', 'admin_post', 'club', 'mini_league'));

comment on column public.report.category is
  'Why the item was reported. The list awaits team confirmation (item 12).';
comment on column public.report.reason is
  'Optional details from the reporter; required when category is other.';
comment on column public.report.evidence is
  'What the reported item looked like when it was reported, copied by the '
  'server. Never supplied by the reporter.';

-- One open report per reporter per item.
create unique index report_one_open_per_target_idx
  on public.report (reported_by_player_id, target_type, target_id)
  where status in ('open', 'under_review');

create index report_rate_limit_idx
  on public.report (reported_by_player_id, created_at desc);

-- Reports are only filed through the functions below.
drop policy "report: file as self" on public.report;
revoke insert on public.report from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Filing, in one place
-- ---------------------------------------------------------------------------

create or replace function private.file_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_reason text,
  p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_reason text := nullif(trim(p_reason), '');
  v_id uuid;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  if p_evidence is null then
    raise exception 'That item was not found.' using errcode = '42501';
  end if;

  if p_category = 'other' and v_reason is null then
    raise exception 'Tell us what happened.' using errcode = '23514';
  end if;

  if (select count(*) from public.report
      where reported_by_player_id = v_me and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.report
      where reported_by_player_id = v_me and created_at > now() - interval '1 day') >= 20
  then
    raise exception 'You have sent a lot of reports recently. Please try again later, or contact Badminton Victoria if someone is in danger.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.report
    where reported_by_player_id = v_me
      and target_type = p_target_type and target_id = p_target_id
      and status in ('open', 'under_review')
  ) then
    raise exception 'You have already reported this. An administrator will review it.'
      using errcode = '23505';
  end if;

  insert into public.report (reported_by_player_id, target_type, target_id, category, reason, evidence)
  values (v_me, p_target_type, p_target_id, p_category, v_reason,
          p_evidence || jsonb_build_object('captured_at', now()))
  returning report_id into v_id;

  return v_id;
end;
$$;

comment on function private.file_report(text, uuid, text, text, jsonb) is
  'Shared by the report_* functions: registration, details for other, rate '
  'limit (5 an hour, 20 a day), one open report per item, then the insert.';

revoke all on function private.file_report(text, uuid, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. What can be reported
-- ---------------------------------------------------------------------------
-- Each builds its evidence snapshot, or passes null when the item does not
-- exist. Reporting someone you have blocked is allowed: that is often the
-- reason for the block.

create or replace function public.report_player(
  p_player_id uuid, p_category text, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_player_id = (select auth.uid()) then
    raise exception 'You cannot report yourself.' using errcode = '23514';
  end if;

  return private.file_report('player', p_player_id, p_category, p_reason, (
    select jsonb_build_object(
      'username', p.username,
      'bio', pp.bio,
      'suburb', pp.suburb,
      'state', pp.state,
      'self_rating_band', p.self_rating_band,
      'is_verified', p.is_verified,
      'joined_at', p.joined_at)
    from public.player p
    join public.player_profile pp on pp.player_id = p.player_id
    where p.player_id = p_player_id
  ));
end;
$$;

create or replace function public.report_post(
  p_post_id uuid, p_category text, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.can_manage_post(p_post_id)) then
    raise exception 'You cannot report your own game.' using errcode = '23514';
  end if;

  return private.file_report('game_post', p_post_id, p_category, p_reason, (
    select jsonb_build_object(
      'title', gp.title,
      'notes', gp.notes,
      'format', gp.format,
      'suburb', gp.suburb,
      'venue', v.name,
      'proposed_time', gp.proposed_time,
      'status', gp.status,
      'organiser_username', p.username,
      'organiser_club', c.name)
    from public.game_post gp
    left join public.venue v on v.venue_id = gp.venue_id
    left join public.player p on p.player_id = gp.organiser_id
    left join public.club c on c.club_id = gp.organiser_club_id
    where gp.post_id = p_post_id
  ));
end;
$$;

create or replace function public.report_league(
  p_league_id uuid, p_category text, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.file_report('mini_league', p_league_id, p_category, p_reason, (
    select jsonb_build_object(
      'name', ml.name,
      'status', ml.status,
      'start_date', ml.start_date,
      'end_date', ml.end_date,
      'organiser_username', p.username)
    from public.mini_league ml
    left join public.player p on p.player_id = ml.organiser_id
    where ml.league_id = p_league_id
  ));
end;
$$;

create or replace function public.report_club(
  p_club_id uuid, p_category text, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.file_report('club', p_club_id, p_category, p_reason, (
    select jsonb_build_object(
      'name', c.name,
      'slug', c.slug,
      'description', c.description,
      'suburb', c.suburb,
      'is_verified', c.is_verified,
      'is_active', c.is_active,
      'created_by_username', p.username)
    from public.club c
    left join public.player p on p.player_id = c.created_by
    where c.club_id = p_club_id
  ));
end;
$$;

comment on function public.report_player(uuid, text, text) is
  'BL-028. supabase.rpc(''report_player'', { p_player_id, p_category, p_reason }) '
  'returns the report id. p_category: harassment, inappropriate_content, '
  'fake_account, spam, safety_concern, underage, other (p_reason required).';
comment on function public.report_post(uuid, text, text) is
  'Report a game post. Same categories and rules as report_player.';
comment on function public.report_league(uuid, text, text) is
  'Report a Mini League. Same categories and rules as report_player.';
comment on function public.report_club(uuid, text, text) is
  'Report a club. Same categories and rules as report_player.';

revoke all on function public.report_player(uuid, text, text) from public;
revoke all on function public.report_post(uuid, text, text) from public;
revoke all on function public.report_league(uuid, text, text) from public;
revoke all on function public.report_club(uuid, text, text) from public;
grant execute on function public.report_player(uuid, text, text) to authenticated;
grant execute on function public.report_post(uuid, text, text) to authenticated;
grant execute on function public.report_league(uuid, text, text) to authenticated;
grant execute on function public.report_club(uuid, text, text) to authenticated;
