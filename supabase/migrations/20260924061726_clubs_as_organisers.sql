-- Clubs and organisations as game post organisers.
--
-- A game post is now organised by exactly one of: a player, or a club. The two
-- are separate nullable columns with real foreign keys rather than one
-- polymorphic column, so Postgres enforces the reference and PostgREST can
-- still embed the organiser in a single request:
--
--   .select('*, player(display_name), club(name, logo_url)')
--
-- This replaces game_post.group_id, which referenced an entity that was never
-- defined.

-- ---------------------------------------------------------------------------
-- 1. Clubs
-- ---------------------------------------------------------------------------

create table public.club (
  club_id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (length(description) <= 2000),
  suburb text,
  state text check (state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  contact_email text,
  logo_url text,
  is_verified boolean not null default false,
  created_by uuid not null references public.player (player_id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.club is
  'A club or organisation that posts games. Not an account: a club cannot log '
  'in. Real people post on its behalf, listed in club_representative.';
comment on column public.club.slug is
  'URL-safe identifier for /clubs/<slug>. Lowercase letters, digits and single '
  'hyphens only, enforced by the check constraint.';
comment on column public.club.is_verified is
  'Staff-set badge confirming this is a genuine club. Anyone can create a club '
  'record, so unverified clubs exist and the UI should say so. Locked to '
  'service_role by the column grant below.';
comment on column public.club.created_by is
  'on delete restrict: deleting a player must not take a club and its posts '
  'with it. Hand the club over first.';

create index club_created_by_idx on public.club (created_by);
create index club_location_idx on public.club (state, suburb);

-- ---------------------------------------------------------------------------
-- 2. Representatives
-- ---------------------------------------------------------------------------
-- Deliberately not a membership table. This answers one question only: which
-- player accounts may post as this club. A general member roster, with roles
-- and join requests, is a separate feature and a later migration.

create table public.club_representative (
  club_id uuid not null references public.club (club_id) on delete cascade,
  player_id uuid not null references public.player (player_id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (club_id, player_id)
);

comment on table public.club_representative is
  'Who may post on a club''s behalf. Not membership: being a representative '
  'says nothing about playing for the club.';

-- The composite PK indexes club_id, but not player_id on its own. The frontend
-- asks "which clubs can I post as?" on every visit to the post form, which is
-- a lookup by player_id.
create index club_representative_player_id_idx
  on public.club_representative (player_id);

-- Whoever creates a club is immediately able to post for it, so a club can
-- never exist with no one able to speak for it.
create or replace function private.handle_new_club()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.club_representative (club_id, player_id)
  values (new.club_id, new.created_by)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_club_created
  after insert on public.club
  for each row execute function private.handle_new_club();

-- ---------------------------------------------------------------------------
-- 3. Game posts get a club organiser
-- ---------------------------------------------------------------------------

alter table public.game_post
  drop column group_id;

alter table public.game_post
  alter column organiser_id drop not null;

alter table public.game_post
  add column organiser_club_id uuid
    references public.club (club_id) on delete cascade;

-- Exactly one organiser, always. num_nonnulls counts the non-null arguments,
-- so this rejects both "posted by nobody" and "posted by both".
alter table public.game_post
  add constraint game_post_exactly_one_organiser
    check (num_nonnulls(organiser_id, organiser_club_id) = 1);

comment on column public.game_post.organiser_id is
  'Set when an individual player posts. Null when a club posts.';
comment on column public.game_post.organiser_club_id is
  'Set when a club posts. Null when an individual posts. The post form toggles '
  'between the two; game_post_exactly_one_organiser enforces that exactly one '
  'is filled in.';

create index game_post_organiser_club_id_idx
  on public.game_post (organiser_club_id);

-- ---------------------------------------------------------------------------
-- 4. RLS helper
-- ---------------------------------------------------------------------------

-- security definer for the same reason as the other helpers: a policy on
-- game_post needs to read club_representative, and doing that inline would
-- drag club_representative's own policies into the evaluation.
create or replace function private.can_post_for_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_representative cr
    where cr.club_id = p_club_id
      and cr.player_id = (select auth.uid())
  );
$$;

comment on function private.can_post_for_club(uuid) is
  'True when the caller is a listed representative of the club. Returns false '
  'for a null club_id, which is what an individually organised post passes.';

revoke all on function private.can_post_for_club(uuid) from public;
grant execute on function private.can_post_for_club(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS on the new tables
-- ---------------------------------------------------------------------------

alter table public.club                enable row level security;
alter table public.club_representative enable row level security;

-- --- club ------------------------------------------------------------------

create policy "club: readable by signed-in players"
  on public.club for select to authenticated
  using (true);

create policy "club: any player can register one"
  on public.club for insert to authenticated
  with check (
    (select auth.uid()) = created_by
    or (select private.is_admin())
  );

create policy "club: representatives or admin edit"
  on public.club for update to authenticated
  using ((select private.can_post_for_club(club_id)) or (select private.is_admin()))
  with check ((select private.can_post_for_club(club_id)) or (select private.is_admin()));

create policy "club: representatives or admin delete"
  on public.club for delete to authenticated
  using ((select private.can_post_for_club(club_id)) or (select private.is_admin()));

-- Same reasoning as player.is_verified: a badge you can award yourself is not
-- a badge. Verification is a service_role operation.
revoke update on public.club from authenticated;
grant update (name, slug, description, suburb, state, contact_email, logo_url)
  on public.club to authenticated;

-- --- club_representative ---------------------------------------------------

create policy "club_representative: readable by signed-in players"
  on public.club_representative for select to authenticated
  using (true);

create policy "club_representative: existing reps add others"
  on public.club_representative for insert to authenticated
  with check (
    (select private.can_post_for_club(club_id))
    or (select private.is_admin())
  );

-- Note the asymmetry with insert: a representative may add someone but may
-- only remove themselves. Otherwise two reps who fall out can remove each
-- other, and whoever clicks first wins the club. Admins settle those.
create policy "club_representative: step down, or be removed by an admin"
  on public.club_representative for delete to authenticated
  using (
    (select auth.uid()) = player_id
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 6. Game post policies, rewritten for two kinds of organiser
-- ---------------------------------------------------------------------------

drop policy "game_post: create as organiser"        on public.game_post;
drop policy "game_post: organiser or admin edits"   on public.game_post;
drop policy "game_post: organiser or admin deletes" on public.game_post;

-- When organiser_id is null the first clause is null rather than false, which
-- is fine: null or true is true, and null or false is null, which a policy
-- treats as a refusal.
create policy "game_post: post as yourself or on behalf of your club"
  on public.game_post for insert to authenticated
  with check (
    organiser_id = (select auth.uid())
    or (select private.can_post_for_club(organiser_club_id))
    or (select private.is_admin())
  );

create policy "game_post: organiser, club rep or admin edits"
  on public.game_post for update to authenticated
  using (
    organiser_id = (select auth.uid())
    or (select private.can_post_for_club(organiser_club_id))
    or (select private.is_admin())
  )
  with check (
    organiser_id = (select auth.uid())
    or (select private.can_post_for_club(organiser_club_id))
    or (select private.is_admin())
  );

create policy "game_post: organiser, club rep or admin deletes"
  on public.game_post for delete to authenticated
  using (
    organiser_id = (select auth.uid())
    or (select private.can_post_for_club(organiser_club_id))
    or (select private.is_admin())
  );

-- A club post has no organiser_id, so cancelling one has to go through the
-- club representative check as well.
drop policy "cancellation_record: organiser of the post records it"
  on public.cancellation_record;

create policy "cancellation_record: the post's organiser records it"
  on public.cancellation_record for insert to authenticated
  with check (
    exists (
      select 1 from public.game_post gp
      where gp.post_id = cancellation_record.post_id
        and (
          gp.organiser_id = (select auth.uid())
          or (select private.can_post_for_club(gp.organiser_club_id))
        )
    )
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 7. Reports can target a club
-- ---------------------------------------------------------------------------

alter table public.report
  drop constraint report_target_type_check;

alter table public.report
  add constraint report_target_type_check
    check (target_type in ('player', 'game_post', 'match', 'admin_post', 'club'));
