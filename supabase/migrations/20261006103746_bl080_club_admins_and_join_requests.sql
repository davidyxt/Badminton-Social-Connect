-- BL-080: clubs get admins, members and join requests, and are deactivated
-- rather than deleted.
--
-- The app uses clubs where the v1.2 documents say "groups" (M6). Rather than
-- a separate group_member table, club_representative becomes the membership
-- list, with two new columns:
--
--   role    'admin'  may rename the club, post games on its behalf and
--                    approve or remove members
--           'member' belongs to the club, nothing more
--   status  'pending'  a join request waiting for a club admin
--           'approved' an actual member (or admin)
--
-- Whoever creates a club is its first admin. A club can have several admins,
-- and must always have at least one.
--
-- Game posts are unchanged: a club post still has a null organiser_id and sets
-- organiser_club_id instead. What changes is who may make one. Every game post
-- policy goes through private.can_post_for_club (directly or via
-- can_manage_post), so redefining that helper to mean "approved club admin"
-- moves all of them over at once. Their names still say "club rep"; that now
-- means a club admin.

-- ---------------------------------------------------------------------------
-- 1. Role and status
-- ---------------------------------------------------------------------------

-- Added with status defaulting to 'approved' so existing rows, which were all
-- real representatives, stay approved. The default flips to 'pending' below.
alter table public.club_representative
  add column role text not null default 'member'
    check (role in ('admin', 'member')),
  add column status text not null default 'approved'
    check (status in ('pending', 'approved'));

-- Every existing representative could post for the club, which is now an
-- admin's right.
update public.club_representative set role = 'admin';

-- A bare insert of {club_id, player_id} is now a join request.
alter table public.club_representative
  alter column status set default 'pending';

alter table public.club_representative
  add constraint club_representative_admin_is_approved
    check (role <> 'admin' or status = 'approved');

comment on table public.club_representative is
  'Club membership, including pending join requests. role = admin may rename '
  'the club, post games on its behalf and manage members; role = member just '
  'belongs. status = pending is a request awaiting a club admin.';
comment on column public.club_representative.role is
  'admin or member. Only approved rows can be admin '
  '(club_representative_admin_is_approved).';
comment on column public.club_representative.status is
  'pending until a club admin approves the request. Players can only ever '
  'create their own row as pending; approval is an admin''s update.';

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Same signature, narrower meaning: from "any representative" to "an approved
-- club admin". can_manage_post and every game_post / cancellation_record
-- policy inherit this.
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
      and cr.role = 'admin'
      and cr.status = 'approved'
  );
$$;

comment on function private.can_post_for_club(uuid) is
  'True when the caller is an approved admin of the club: the people who may '
  'rename it, post games for it and manage its members. Returns false for a '
  'null club_id, which is what an individually organised post passes.';

-- The creator becomes the first admin, so a club never exists with nobody
-- able to run it.
create or replace function private.handle_new_club()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.club_representative (club_id, player_id, role, status)
  values (new.club_id, new.created_by, 'admin', 'approved')
  on conflict do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A club always keeps at least one admin
-- ---------------------------------------------------------------------------
-- Blocks the last admin stepping down or being demoted. Without it a club can
-- end up with members and posts but nobody able to manage either.

create or replace function private.keep_one_club_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'approved')
  then
    -- Locking the club row serialises admin changes per club, so two admins
    -- stepping down at the same moment cannot both pass the check below.
    -- If the club row is already gone, this delete is the cascade from
    -- deleting the club itself, and there is nothing left to protect.
    perform 1 from public.club where club_id = old.club_id for update;
    if not found then
      return coalesce(new, old);
    end if;

    if not exists (
      select 1
      from public.club_representative cr
      where cr.club_id = old.club_id
        and cr.player_id <> old.player_id
        and cr.role = 'admin'
    ) then
      raise exception 'A club must keep at least one admin. Make another member an admin first.'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger club_representative_keep_one_admin
  before update or delete on public.club_representative
  for each row execute function private.keep_one_club_admin();

-- ---------------------------------------------------------------------------
-- 4. Audit columns
-- ---------------------------------------------------------------------------
-- club_representative was left out of the audit_columns migration because its
-- rows were never edited. Approving a request and promoting a member are edits.

alter table public.club_representative
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid;

create trigger club_representative_set_updated_metadata
  before insert or update on public.club_representative
  for each row execute function private.set_updated_metadata();

comment on column public.club_representative.updated_by is
  'The player who last changed this row, e.g. the admin who approved the '
  'request. Null when the change came from service_role. Set by the '
  'club_representative_set_updated_metadata trigger; a value sent by a client '
  'is ignored. Not a foreign key, so that player embeds stay unambiguous.';

-- ---------------------------------------------------------------------------
-- 5. club_representative policies
-- ---------------------------------------------------------------------------

drop policy "club_representative: readable by signed-in players"
  on public.club_representative;
drop policy "club_representative: existing reps add others"
  on public.club_representative;
drop policy "club_representative: step down, or be removed by an admin"
  on public.club_representative;

-- Membership is public to signed-in players. A pending request is not: it
-- says "this person wants to join", which only they and the club's admins
-- need to see.
create policy "club_representative: members public, requests private"
  on public.club_representative for select to authenticated
  using (
    status = 'approved'
    or player_id = (select auth.uid())
    or (select private.can_post_for_club(club_id))
    or (select private.is_admin())
  );

-- A player may only ask to join, as themselves, as a plain member. Club admins
-- can add someone directly, at any role.
create policy "club_representative: request to join, or added by a club admin"
  on public.club_representative for insert to authenticated
  with check (
    (
      player_id = (select auth.uid())
      and status = 'pending'
      and role = 'member'
    )
    or (select private.can_post_for_club(club_id))
    or (select private.is_admin())
  );

-- Club admins approve requests and promote members. They cannot touch another
-- admin's row, for the same reason representatives could not remove each
-- other before: two admins who fall out should not be able to lock each other
-- out. Platform admins settle those. A requester has no update right at all,
-- so nobody can approve themselves.
create policy "club_representative: club admins approve and promote members"
  on public.club_representative for update to authenticated
  using (
    ((select private.can_post_for_club(club_id)) and role = 'member')
    or (select private.is_admin())
  )
  with check (
    (select private.can_post_for_club(club_id))
    or (select private.is_admin())
  );

-- Anyone can leave or withdraw their own request. Club admins can decline
-- requests and remove members, but not other admins. An admin stepping down
-- is the "yourself" case, subject to keep_one_club_admin.
create policy "club_representative: leave, or removed by a club admin"
  on public.club_representative for delete to authenticated
  using (
    player_id = (select auth.uid())
    or ((select private.can_post_for_club(club_id)) and role = 'member')
    or (select private.is_admin())
  );

-- Only role and status change. Moving a row to another club or player is a
-- delete and a new request.
revoke update on public.club_representative from authenticated;
grant update (role, status) on public.club_representative to authenticated;

-- ---------------------------------------------------------------------------
-- 6. club policies
-- ---------------------------------------------------------------------------
-- The update policy already used can_post_for_club, so renaming is now
-- admin-only without changing it. It is recreated only for an accurate name.

drop policy "club: representatives or admin edit"   on public.club;
drop policy "club: representatives or admin delete" on public.club;

create policy "club: club admins or platform admin edit"
  on public.club for update to authenticated
  using ((select private.can_post_for_club(club_id)) or (select private.is_admin()))
  with check ((select private.can_post_for_club(club_id)) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- 7. Clubs are deactivated, never deleted
-- ---------------------------------------------------------------------------
-- Deleting a club used to cascade through its game posts to every match,
-- result and dispute played in them, including other players' confirmed
-- scores. A club is now switched off instead: its posts, matches and results
-- stay, and the club page shows it as inactive.

alter table public.club
  add column is_active boolean not null default true;

comment on column public.club.is_active is
  'False once a club admin deactivates the club. Its game posts and results '
  'are kept; it cannot post new games or take new members until reactivated. '
  'Clubs are never deleted through the API.';

grant update (is_active) on public.club to authenticated;

-- No delete policy, and no delete privilege either, so not even a platform
-- admin can delete a club with the browser key. Removing one for a legal
-- erasure request is a deliberate service_role operation.
revoke delete on public.club from authenticated;

-- Even then, a club with game posts cannot be deleted: the posts must be dealt
-- with first. Previously this cascaded.
alter table public.game_post
  drop constraint game_post_organiser_club_id_fkey,
  add constraint game_post_organiser_club_id_fkey
    foreign key (organiser_club_id) references public.club (club_id)
    on delete restrict;

-- An inactive club cannot post games or take members. Leaving, editing and
-- cancelling existing posts still work, so an inactive club can wind down.
-- Read through to_jsonb because the column is organiser_club_id on game_post
-- and club_id on club_representative; the trigger argument names it.
create or replace function private.club_must_be_active()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_club_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_club_id is not null and exists (
    select 1 from public.club c
    where c.club_id = v_club_id and not c.is_active
  ) then
    raise exception 'This club is inactive. A club admin must reactivate it first.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.club_must_be_active() is
  'Rejects a new game post or membership row for an inactive club. Takes the '
  'name of the club id column as its trigger argument. Not security definer: '
  'club is readable by every signed-in player.';

create trigger game_post_club_must_be_active
  before insert or update of organiser_club_id on public.game_post
  for each row execute function private.club_must_be_active('organiser_club_id');

create trigger club_representative_club_must_be_active
  before insert on public.club_representative
  for each row execute function private.club_must_be_active('club_id');
