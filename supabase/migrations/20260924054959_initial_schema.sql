-- Initial schema for Badminton Social Connect.
--
-- Derived from the ER diagram in docs/database-schema.md. Places where this
-- migration deviates from that diagram are marked with a "DEVIATION" comment
-- and are listed in docs/rls-policies.md for team review.
--
-- Conventions:
--   * lowercase snake_case identifiers throughout
--   * uuid primary keys; player_id is the auth.users id
--   * timestamptz for all points in time, never timestamp
--   * enum-like columns are text + check constraint, so values can be added
--     in a later migration without an ALTER TYPE
--   * every foreign key column carries an index

-- ---------------------------------------------------------------------------
-- 1. Private helper schema
-- ---------------------------------------------------------------------------
-- Not listed in config.toml's db.schemas, so nothing here is reachable through
-- the Data API. RLS policies call these helpers instead of inlining subqueries,
-- which keeps policies readable and avoids infinite recursion when a policy on
-- table A needs to read table B, whose own policy reads table A.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Core player identity
-- ---------------------------------------------------------------------------

create table public.player (
  player_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 50),
  self_rating_band text not null default 'beginner'
    check (self_rating_band in (
      'beginner', 'lower_intermediate', 'intermediate',
      'upper_intermediate', 'advanced'
    )),
  is_verified boolean not null default false,
  joined_at timestamptz not null default now()
);

comment on table public.player is
  'One row per signed-up player. player_id is the auth.users id, so deleting '
  'the auth user cascades the whole player record away.';
comment on column public.player.is_verified is
  'Set by staff after ID or skill verification. Players must never write this '
  'themselves - see the RLS policies below.';

create table public.player_profile (
  player_id uuid primary key references public.player (player_id) on delete cascade,
  bio text check (length(bio) <= 1000),
  suburb text,
  state text check (state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  reliability_score numeric(5, 2) not null default 100
    check (reliability_score between 0 and 100),
  games_played integer not null default 0 check (games_played >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  is_discoverable boolean not null default true
);

comment on table public.player_profile is
  'Extended, optional profile data. Split from player so the hot path (name, '
  'band) stays narrow.';
comment on column public.player_profile.reliability_score is
  'DEVIATION: the ERD types this as float. Stored as numeric(5,2) instead so '
  'the score is exact and comparisons in leaderboards are deterministic.';
comment on column public.player_profile.is_discoverable is
  'When false the profile is hidden from other players. Enforced by RLS, not '
  'by the frontend.';

create index player_profile_discoverable_idx
  on public.player_profile (is_discoverable)
  where is_discoverable;

-- ---------------------------------------------------------------------------
-- 3. Venues and leagues
-- ---------------------------------------------------------------------------

create table public.venue (
  venue_id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  address text,
  created_at timestamptz not null default now()
);

comment on table public.venue is
  'Shared reference data. Staff-maintained so players cannot create near-'
  'duplicate venues that fragment match history.';

create table public.mini_league (
  league_id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.player (player_id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint mini_league_dates_ordered check (end_date > start_date)
);

comment on column public.mini_league.organiser_id is
  'on delete restrict, not cascade: deleting a player must not silently delete '
  'a league other people are playing in. Reassign the organiser first.';

create index mini_league_organiser_id_idx on public.mini_league (organiser_id);
create index mini_league_status_idx on public.mini_league (status);

create table public.league_standing (
  league_id uuid not null references public.mini_league (league_id) on delete cascade,
  player_id uuid not null references public.player (player_id) on delete cascade,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  points integer not null default 0,
  position integer check (position > 0),
  primary key (league_id, player_id)
);

comment on table public.league_standing is
  'Derived standings, recalculated from confirmed match results. Written by '
  'trusted server-side code only.';

-- The composite PK indexes league_id, but not player_id on its own.
create index league_standing_player_id_idx on public.league_standing (player_id);

-- ---------------------------------------------------------------------------
-- 4. Game posts (the "looking for players" board)
-- ---------------------------------------------------------------------------

create table public.game_post (
  post_id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.player (player_id) on delete cascade,
  group_id uuid,
  format text not null
    check (format in ('singles', 'doubles', 'mixed_doubles')),
  suburb text,
  proposed_time timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);

comment on column public.game_post.group_id is
  'DEVIATION: the ERD has groupId but defines no GROUP entity, so this column '
  'has no foreign key and nothing enforces it. Either add a group table or '
  'drop this column - see docs/rls-policies.md.';

create index game_post_organiser_id_idx on public.game_post (organiser_id);
create index game_post_open_time_idx
  on public.game_post (proposed_time)
  where status = 'open';

create table public.cancellation_record (
  post_id uuid primary key references public.game_post (post_id) on delete cascade,
  cancelled_at timestamptz not null default now(),
  reason text,
  is_no_show boolean not null default false
);

comment on table public.cancellation_record is
  'At most one per game post, hence post_id as the primary key. Feeds the '
  'reliability score.';

-- ---------------------------------------------------------------------------
-- 5. Matches
-- ---------------------------------------------------------------------------

create table public.match (
  match_id uuid primary key default gen_random_uuid(),
  league_id uuid references public.mini_league (league_id) on delete cascade,
  venue_id uuid references public.venue (venue_id) on delete set null,
  created_by uuid references public.player (player_id) on delete set null,
  format text not null
    check (format in ('singles', 'doubles', 'mixed_doubles')),
  played_at timestamptz,
  suburb text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

comment on column public.match.league_id is
  'Nullable: casual matches created from a game post belong to no league.';
comment on column public.match.created_by is
  'DEVIATION: not in the ERD. Added because a casual match has no league '
  'organiser, so without an owner column there is no way to express in RLS who '
  'is allowed to edit it.';

create index match_league_id_idx on public.match (league_id);
create index match_venue_id_idx on public.match (venue_id);
create index match_created_by_idx on public.match (created_by);
create index match_played_at_idx on public.match (played_at desc);

create table public.match_participant (
  match_id uuid not null references public.match (match_id) on delete cascade,
  player_id uuid not null references public.player (player_id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'confirmed', 'declined', 'no_show', 'played')),
  primary key (match_id, player_id)
);

create index match_participant_player_id_idx on public.match_participant (player_id);

create table public.check_in (
  match_id uuid not null references public.match (match_id) on delete cascade,
  player_id uuid not null references public.player (player_id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null default 'manual'
    check (method in ('qr', 'geolocation', 'manual')),
  verified boolean not null default false,
  primary key (match_id, player_id)
);

comment on column public.check_in.checked_in_at is
  'DEVIATION: the ERD calls this "timestamp". Renamed because timestamp is a '
  'SQL type name and reads ambiguously in queries.';
comment on column public.check_in.verified is
  'Staff-controlled. RLS forbids a player inserting their own check-in with '
  'verified = true, which would otherwise let anyone self-certify attendance.';

create index check_in_player_id_idx on public.check_in (player_id);

create table public.match_result (
  result_id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (match_id) on delete cascade,
  score text not null,
  winner_id uuid references public.player (player_id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'disputed', 'rejected')),
  submitted_by uuid references public.player (player_id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.match_result is
  'The ERD allows many results per match, read here as "each side submits a '
  'score and one gets confirmed". The unique index below enforces that at most '
  'one result per match can reach confirmed status.';
comment on column public.match_result.submitted_by is
  'DEVIATION: not in the ERD. Needed to show who claimed what when a result is '
  'disputed.';

create unique index match_result_one_confirmed_per_match_idx
  on public.match_result (match_id)
  where status = 'confirmed';

create index match_result_match_id_idx on public.match_result (match_id);
create index match_result_winner_id_idx on public.match_result (winner_id);
create index match_result_submitted_by_idx on public.match_result (submitted_by);

create table public.dispute (
  dispute_id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (match_id) on delete cascade,
  raised_by uuid references public.player (player_id) on delete set null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

comment on column public.dispute.raised_by is
  'DEVIATION: not in the ERD. Without it, RLS cannot let a player see the '
  'dispute they themselves raised.';

create index dispute_match_id_idx on public.dispute (match_id);
create index dispute_raised_by_idx on public.dispute (raised_by);
create index dispute_open_idx on public.dispute (status) where status = 'open';

-- ---------------------------------------------------------------------------
-- 6. Rankings
-- ---------------------------------------------------------------------------

create table public.ranking (
  player_id uuid not null references public.player (player_id) on delete cascade,
  format text not null
    check (format in ('singles', 'doubles', 'mixed_doubles')),
  ranking_points integer not null default 0 check (ranking_points >= 0),
  band text not null default 'beginner'
    check (band in (
      'beginner', 'lower_intermediate', 'intermediate',
      'upper_intermediate', 'advanced'
    )),
  verified_games_count integer not null default 0 check (verified_games_count >= 0),
  primary key (player_id, format)
);

comment on table public.ranking is
  'Derived from confirmed match results. No player-facing write policy exists: '
  'only service_role can change these, so a player cannot award themselves '
  'points.';

create index ranking_leaderboard_idx on public.ranking (format, ranking_points desc);

-- ---------------------------------------------------------------------------
-- 7. Notifications, reports, announcements
-- ---------------------------------------------------------------------------

create table public.notification (
  notification_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player (player_id) on delete cascade,
  match_id uuid references public.match (match_id) on delete cascade,
  type text not null
    check (type in (
      'match_reminder', 'match_invite', 'result_submitted',
      'dispute_update', 'league_update', 'system'
    )),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.notification.match_id is
  'Nullable, from the ERD relationship MATCH ||--o{ NOTIFICATION : reminds. '
  'System notifications carry no match.';

create index notification_unread_idx
  on public.notification (player_id, created_at desc)
  where not is_read;
create index notification_match_id_idx on public.notification (match_id);

create table public.report (
  report_id uuid primary key default gen_random_uuid(),
  reported_by_player_id uuid not null references public.player (player_id) on delete cascade,
  target_type text not null
    check (target_type in ('player', 'game_post', 'match', 'admin_post')),
  target_id uuid not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

comment on column public.report.target_id is
  'Polymorphic: interpreted according to target_type, so Postgres cannot '
  'enforce a foreign key here. Application code must validate the target '
  'exists.';

create index report_reported_by_idx on public.report (reported_by_player_id);
create index report_target_idx on public.report (target_type, target_id);
create index report_open_idx on public.report (status) where status = 'open';

create table public.admin_post (
  admin_post_id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.player (player_id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  body text,
  image_url text,
  display_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_post_published_has_date
    check (status <> 'published' or published_at is not null)
);

comment on table public.admin_post is
  'Staff announcements shown in-app. Drafts must never be visible to players; '
  'that is enforced by the select policy below.';

create index admin_post_published_idx
  on public.admin_post (display_order, published_at desc)
  where status = 'published';
create index admin_post_created_by_idx on public.admin_post (created_by);

-- ---------------------------------------------------------------------------
-- 8. RLS helper functions
-- ---------------------------------------------------------------------------

-- Reads the caller's own JWT only, so it needs no elevated privileges and is
-- deliberately security invoker.
create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

comment on function private.is_admin() is
  'True when the caller has role=admin in app_metadata. app_metadata is '
  'writable only with the service key; user_metadata is writable by the user '
  'themselves and must never be used for authorisation.';

-- security definer: reads match_participant while that table''s own policy is
-- being evaluated, which would otherwise recurse. The auth.uid() check inside
-- keeps it from leaking anything about other players.
create or replace function private.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match_participant mp
    where mp.match_id = p_match_id
      and mp.player_id = (select auth.uid())
  );
$$;

create or replace function private.can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match m
    left join public.mini_league l on l.league_id = m.league_id
    where m.match_id = p_match_id
      and (
        m.created_by = (select auth.uid())
        or l.organiser_id = (select auth.uid())
      )
  );
$$;

comment on function private.can_manage_match(uuid) is
  'True for the player who created a casual match, or the organiser of the '
  'league the match belongs to.';

create or replace function private.is_league_organiser(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mini_league l
    where l.league_id = p_league_id
      and l.organiser_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_match_participant(uuid) from public;
revoke all on function private.can_manage_match(uuid) from public;
revoke all on function private.is_league_organiser(uuid) from public;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_match_participant(uuid) to authenticated;
grant execute on function private.can_manage_match(uuid) to authenticated;
grant execute on function private.is_league_organiser(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sign-up trigger
-- ---------------------------------------------------------------------------
-- A player row cannot be inserted by the client before it exists, so it is
-- created here the moment the auth user is created.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player (player_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );

  insert into public.player_profile (player_id) values (new.id);

  return new;
end;
$$;

comment on function private.handle_new_user() is
  'display_name comes from user_metadata, which the user controls. That is '
  'fine here: it is a display label, never an authorisation input.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------------
-- Every table below has RLS enabled. A table with RLS enabled and no matching
-- policy returns zero rows rather than an error. service_role bypasses RLS
-- entirely and is what trusted server-side jobs use.

alter table public.player                enable row level security;
alter table public.player_profile        enable row level security;
alter table public.venue                 enable row level security;
alter table public.mini_league           enable row level security;
alter table public.league_standing       enable row level security;
alter table public.game_post             enable row level security;
alter table public.cancellation_record   enable row level security;
alter table public.match                 enable row level security;
alter table public.match_participant     enable row level security;
alter table public.check_in              enable row level security;
alter table public.match_result          enable row level security;
alter table public.dispute               enable row level security;
alter table public.ranking               enable row level security;
alter table public.notification          enable row level security;
alter table public.report                enable row level security;
alter table public.admin_post            enable row level security;


-- Each table gets at most one policy per action, with the admin case folded in
-- as a trailing `or (select private.is_admin())`. Splitting admins into their
-- own `for all` policy reads more nicely but makes Postgres evaluate two
-- policies on every query, which the database linter flags as
-- multiple_permissive_policies.
--
-- auth.uid() is always wrapped in `(select ...)` so Postgres evaluates it once
-- per query instead of once per row.

-- --- player ----------------------------------------------------------------

create policy "player: signed-in players can read the roster"
  on public.player for select to authenticated
  using (true);

create policy "player: update own row"
  on public.player for update to authenticated
  using ((select auth.uid()) = player_id)
  with check ((select auth.uid()) = player_id);

-- RLS controls which rows you may update, not which columns. is_verified is
-- kept out of reach with a column-level grant instead, so a player cannot
-- award themselves a verification badge on a row they legitimately own.
-- This applies to admins too: verifying a player is a service_role operation,
-- deliberately unreachable from any browser session.
revoke update on public.player from authenticated;
grant update (display_name, self_rating_band) on public.player to authenticated;

-- No insert policy: rows are created by the on_auth_user_created trigger.
-- No delete policy: deletion cascades from auth.users.

-- --- player_profile --------------------------------------------------------

create policy "player_profile: read own, discoverable, or as admin"
  on public.player_profile for select to authenticated
  using (
    (select auth.uid()) = player_id
    or is_discoverable
    or (select private.is_admin())
  );

create policy "player_profile: update own or as admin"
  on public.player_profile for update to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()))
  with check ((select auth.uid()) = player_id or (select private.is_admin()));

-- Derived counters must not be self-reported, so they are service_role only.
revoke update on public.player_profile from authenticated;
grant update (bio, suburb, state, is_discoverable)
  on public.player_profile to authenticated;

-- No insert policy: the row is created by the on_auth_user_created trigger.

-- --- venue -----------------------------------------------------------------

create policy "venue: readable by signed-in players"
  on public.venue for select to authenticated
  using (true);

create policy "venue: admins add"
  on public.venue for insert to authenticated
  with check ((select private.is_admin()));

create policy "venue: admins edit"
  on public.venue for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "venue: admins remove"
  on public.venue for delete to authenticated
  using ((select private.is_admin()));

-- --- mini_league -----------------------------------------------------------

create policy "mini_league: readable by signed-in players"
  on public.mini_league for select to authenticated
  using (true);

create policy "mini_league: create as organiser"
  on public.mini_league for insert to authenticated
  with check (
    (select auth.uid()) = organiser_id
    or (select private.is_admin())
  );

create policy "mini_league: organiser or admin edits"
  on public.mini_league for update to authenticated
  using ((select auth.uid()) = organiser_id or (select private.is_admin()))
  with check ((select auth.uid()) = organiser_id or (select private.is_admin()));

create policy "mini_league: organiser or admin deletes"
  on public.mini_league for delete to authenticated
  using ((select auth.uid()) = organiser_id or (select private.is_admin()));

-- --- league_standing -------------------------------------------------------

create policy "league_standing: readable by signed-in players"
  on public.league_standing for select to authenticated
  using (true);

create policy "league_standing: organiser or admin adds"
  on public.league_standing for insert to authenticated
  with check (
    (select private.is_league_organiser(league_id))
    or (select private.is_admin())
  );

create policy "league_standing: organiser or admin edits"
  on public.league_standing for update to authenticated
  using (
    (select private.is_league_organiser(league_id))
    or (select private.is_admin())
  )
  with check (
    (select private.is_league_organiser(league_id))
    or (select private.is_admin())
  );

create policy "league_standing: organiser or admin removes"
  on public.league_standing for delete to authenticated
  using (
    (select private.is_league_organiser(league_id))
    or (select private.is_admin())
  );

-- --- game_post -------------------------------------------------------------

create policy "game_post: readable by signed-in players"
  on public.game_post for select to authenticated
  using (true);

create policy "game_post: create as organiser"
  on public.game_post for insert to authenticated
  with check (
    (select auth.uid()) = organiser_id
    or (select private.is_admin())
  );

create policy "game_post: organiser or admin edits"
  on public.game_post for update to authenticated
  using ((select auth.uid()) = organiser_id or (select private.is_admin()))
  with check ((select auth.uid()) = organiser_id or (select private.is_admin()));

create policy "game_post: organiser or admin deletes"
  on public.game_post for delete to authenticated
  using ((select auth.uid()) = organiser_id or (select private.is_admin()));

-- --- cancellation_record ---------------------------------------------------

create policy "cancellation_record: readable by signed-in players"
  on public.cancellation_record for select to authenticated
  using (true);

create policy "cancellation_record: organiser of the post records it"
  on public.cancellation_record for insert to authenticated
  with check (
    exists (
      select 1 from public.game_post gp
      where gp.post_id = cancellation_record.post_id
        and gp.organiser_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy "cancellation_record: admins amend"
  on public.cancellation_record for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "cancellation_record: admins remove"
  on public.cancellation_record for delete to authenticated
  using ((select private.is_admin()));

-- --- match -----------------------------------------------------------------

create policy "match: readable by signed-in players"
  on public.match for select to authenticated
  using (true);

create policy "match: create as self, league matches by the organiser"
  on public.match for insert to authenticated
  with check (
    (
      (select auth.uid()) = created_by
      and (
        league_id is null
        or (select private.is_league_organiser(league_id))
      )
    )
    or (select private.is_admin())
  );

create policy "match: creator, league organiser or admin edits"
  on public.match for update to authenticated
  using ((select private.can_manage_match(match_id)) or (select private.is_admin()))
  with check ((select private.can_manage_match(match_id)) or (select private.is_admin()));

create policy "match: creator, league organiser or admin deletes"
  on public.match for delete to authenticated
  using ((select private.can_manage_match(match_id)) or (select private.is_admin()));

-- --- match_participant -----------------------------------------------------

create policy "match_participant: the line-up is visible to those in it"
  on public.match_participant for select to authenticated
  using (
    (select auth.uid()) = player_id
    or (select private.is_match_participant(match_id))
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "match_participant: join yourself, or be added by the organiser"
  on public.match_participant for insert to authenticated
  with check (
    (select auth.uid()) = player_id
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "match_participant: set own attendance, or the organiser sets any"
  on public.match_participant for update to authenticated
  using (
    (select auth.uid()) = player_id
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  )
  with check (
    (select auth.uid()) = player_id
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "match_participant: leave, or be removed by the organiser"
  on public.match_participant for delete to authenticated
  using (
    (select auth.uid()) = player_id
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

-- --- check_in --------------------------------------------------------------

create policy "check_in: visible to everyone in the match"
  on public.check_in for select to authenticated
  using (
    (select auth.uid()) = player_id
    or (select private.is_match_participant(match_id))
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "check_in: check yourself in, unverified"
  on public.check_in for insert to authenticated
  with check (
    (
      (select auth.uid()) = player_id
      and (select private.is_match_participant(match_id))
      -- A player must not be able to self-certify attendance.
      and verified = false
    )
    or (select private.is_admin())
  );

create policy "check_in: admins verify"
  on public.check_in for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "check_in: admins remove"
  on public.check_in for delete to authenticated
  using ((select private.is_admin()));

-- --- match_result ----------------------------------------------------------

create policy "match_result: visible to everyone in the match"
  on public.match_result for select to authenticated
  using (
    (select private.is_match_participant(match_id))
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "match_result: participants submit a pending result"
  on public.match_result for insert to authenticated
  with check (
    (
      (select auth.uid()) = submitted_by
      and (select private.is_match_participant(match_id))
      -- Confirming a result is a separate, privileged step.
      and status = 'pending'
    )
    or (select private.is_admin())
  );

create policy "match_result: admins confirm or reject"
  on public.match_result for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "match_result: admins remove"
  on public.match_result for delete to authenticated
  using ((select private.is_admin()));

-- --- dispute ---------------------------------------------------------------

create policy "dispute: visible to everyone in the match"
  on public.dispute for select to authenticated
  using (
    (select auth.uid()) = raised_by
    or (select private.is_match_participant(match_id))
    or (select private.can_manage_match(match_id))
    or (select private.is_admin())
  );

create policy "dispute: participants raise one"
  on public.dispute for insert to authenticated
  with check (
    (
      (select auth.uid()) = raised_by
      and (select private.is_match_participant(match_id))
      and status = 'open'
    )
    or (select private.is_admin())
  );

create policy "dispute: admins resolve"
  on public.dispute for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "dispute: admins remove"
  on public.dispute for delete to authenticated
  using ((select private.is_admin()));

-- --- ranking ---------------------------------------------------------------

create policy "ranking: leaderboards are readable by signed-in players"
  on public.ranking for select to authenticated
  using (true);

create policy "ranking: admins correct"
  on public.ranking for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- No insert or delete policy. Rankings are computed by trusted server-side
-- code, never claimed by a player.

-- --- notification ----------------------------------------------------------

create policy "notification: read own"
  on public.notification for select to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()));

create policy "notification: admins send"
  on public.notification for insert to authenticated
  with check ((select private.is_admin()));

create policy "notification: mark own as read"
  on public.notification for update to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()))
  with check ((select auth.uid()) = player_id or (select private.is_admin()));

create policy "notification: dismiss own"
  on public.notification for delete to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()));

-- Players cannot insert notifications, otherwise anyone could spam anyone.
-- Only is_read is theirs to change.
revoke update on public.notification from authenticated;
grant update (is_read) on public.notification to authenticated;

-- --- report ----------------------------------------------------------------

create policy "report: read own submissions"
  on public.report for select to authenticated
  using (
    (select auth.uid()) = reported_by_player_id
    or (select private.is_admin())
  );

create policy "report: file as self"
  on public.report for insert to authenticated
  with check (
    (
      (select auth.uid()) = reported_by_player_id
      and status = 'open'
    )
    or (select private.is_admin())
  );

create policy "report: admins triage"
  on public.report for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "report: admins remove"
  on public.report for delete to authenticated
  using ((select private.is_admin()));

-- Reporters cannot edit a report after filing, so the moderation trail holds.

-- --- admin_post ------------------------------------------------------------

create policy "admin_post: players read published announcements"
  on public.admin_post for select to authenticated
  using (status = 'published' or (select private.is_admin()));

create policy "admin_post: admins write"
  on public.admin_post for insert to authenticated
  with check (
    (select private.is_admin())
    and (select auth.uid()) = created_by
  );

create policy "admin_post: admins edit"
  on public.admin_post for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin_post: admins remove"
  on public.admin_post for delete to authenticated
  using ((select private.is_admin()));
