-- Clubs are called groups (team decision, 2026-10-08), in the database as
-- well as on screen.
--
--   club                       -> groups        (`group` is an SQL keyword)
--   club_representative        -> group_member
--   club_id                    -> group_id
--   game_post.organiser_club_id -> organiser_group_id
--   report target_type 'club'  -> 'group'; report_club -> report_group
--   isClub in screen JSON      -> isGroup
--   every function, trigger, policy, constraint, index and description
--   that said club now says group.
--
-- A forward migration rather than edits to the old ones, so any database
-- built from the feature branches can follow. Generated from the database by
-- a one-off script; the function bodies are the previous ones with the names
-- changed and nothing else.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Tables and columns
-- ---------------------------------------------------------------------------

alter table public.club rename to groups;
alter table public.club_representative rename to group_member;
alter table public.groups rename column club_id to group_id;
alter table public.group_member rename column club_id to group_id;
alter table public.game_post rename column organiser_club_id to organiser_group_id;

-- Constraints (renaming a constraint renames its index too)
alter table public.groups rename constraint club_name_check to groups_name_check;
alter table public.groups rename constraint club_slug_check to groups_slug_check;
alter table public.groups rename constraint club_description_check to groups_description_check;
alter table public.groups rename constraint club_state_check to groups_state_check;
alter table public.groups rename constraint club_pkey to groups_pkey;
alter table public.groups rename constraint club_slug_key to groups_slug_key;
alter table public.groups rename constraint club_created_by_fkey to groups_created_by_fkey;
alter table public.group_member rename constraint club_representative_pkey to group_member_pkey;
alter table public.group_member rename constraint club_representative_club_id_fkey to group_member_group_id_fkey;
alter table public.group_member rename constraint club_representative_player_id_fkey to group_member_player_id_fkey;
alter table public.group_member rename constraint club_representative_role_check to group_member_role_check;
alter table public.group_member rename constraint club_representative_status_check to group_member_status_check;
alter table public.group_member rename constraint club_representative_admin_is_approved to group_member_admin_is_approved;
alter table public.game_post rename constraint game_post_organiser_club_id_fkey to game_post_organiser_group_id_fkey;

-- Other indexes
alter index public.club_representative_player_id_idx rename to group_member_player_id_idx;
alter index public.club_created_by_idx rename to groups_created_by_idx;
alter index public.club_location_idx rename to groups_location_idx;
alter index public.game_post_organiser_club_id_idx rename to game_post_organiser_group_id_idx;

-- Reports about a club are reports about a group.
alter table public.report drop constraint report_target_type_check;
update public.report set target_type = 'group' where target_type = 'club';

alter table public.report add constraint report_target_type_check CHECK ((target_type = ANY (ARRAY['player'::text, 'game_post'::text, 'match'::text, 'admin_post'::text, 'group'::text, 'mini_league'::text])));

-- ---------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------
-- New names first, then the functions that only mention clubs.

CREATE OR REPLACE FUNCTION private.can_post_for_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.group_member cr
    where cr.group_id = p_group_id
      and cr.player_id = (select auth.uid())
      and cr.role = 'admin'
      and cr.status = 'approved'
  );
$function$;

revoke all on function private.can_post_for_group(uuid) from public, anon;
grant execute on function private.can_post_for_group(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.group_must_be_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_group_id is not null and exists (
    select 1 from public.groups c
    where c.group_id = v_group_id and not c.is_active
  ) then
    raise exception 'This group is inactive. A group admin must reactivate it first.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.handle_new_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.group_member (group_id, player_id, role, status)
  values (new.group_id, new.created_by, 'admin', 'approved')
  on conflict do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_has_no_upcoming_games()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_upcoming integer;
begin
  if new.is_active = false and old.is_active = true then
    select count(*) into v_upcoming
    from public.game_post gp
    where gp.organiser_group_id = new.group_id
      and gp.deleted_at is null
      and gp.status in ('open', 'full')
      and gp.proposed_time > now();

    if v_upcoming > 0 then
      raise exception 'Cancel this group''s % upcoming game(s) before deactivating it.', v_upcoming
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_group(p_group_id uuid, p_category text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return private.file_report('group', p_group_id, p_category, p_reason, (
    select jsonb_build_object(
      'name', c.name,
      'slug', c.slug,
      'description', c.description,
      'suburb', c.suburb,
      'is_verified', c.is_verified,
      'is_active', c.is_active,
      'created_by_username', p.username)
    from public.groups c
    left join public.player p on p.player_id = c.created_by
    where c.group_id = p_group_id
  ));
end;
$function$;

revoke all on function report_group(uuid,text,text) from public, anon;
grant execute on function report_group(uuid,text,text) to authenticated;
grant execute on function report_group(uuid,text,text) to service_role;

CREATE OR REPLACE FUNCTION private.keep_one_group_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('bsc.group_closing', true) = 'on' then
    return coalesce(new, old);
  end if;

  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'approved')
  then
    -- Locking the group row serialises admin changes per group, so two admins
    -- stepping down at the same moment cannot both pass the check below.
    -- If the group row is already gone, this delete is the cascade from
    -- deleting the group itself, and there is nothing left to protect.
    perform 1 from public.groups where group_id = old.group_id for update;
    if not found then
      return coalesce(new, old);
    end if;

    if not exists (
      select 1
      from public.group_member cr
      where cr.group_id = old.group_id
        and cr.player_id <> old.player_id
        and cr.role = 'admin'
    ) then
      raise exception 'A group must keep at least one admin. Make another member an admin first.'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_manage_post(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.game_post gp
    where gp.post_id = p_post_id
      and (
        gp.organiser_id = (select auth.uid())
        or (select private.can_post_for_group(gp.organiser_group_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.game_hosts(p_post_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select gp.organiser_id
  from public.game_post gp
  where gp.post_id = p_post_id and gp.organiser_id is not null
  union
  select cr.player_id
  from public.game_post gp
  join public.group_member cr on cr.group_id = gp.organiser_group_id
  where gp.post_id = p_post_id and cr.role = 'admin' and cr.status = 'approved';
$function$;

CREATE OR REPLACE FUNCTION private.anonymise_player(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_name text;
  v_post record;
  v_group record;
  v_next uuid;
begin
  select username into v_old_name
  from public.player where player_id = p_player_id and deleted_at is null
  for update;

  if not found then
    return;
  end if;

  update public.player
  set username = 'Deleted User', deleted_at = now(), is_verified = false
  where player_id = p_player_id;

  -- Upcoming games they organise are cancelled, and their players told.
  for v_post in
    select gp.post_id from public.game_post gp
    where gp.organiser_id = p_player_id
      and gp.deleted_at is null and gp.status in ('open', 'full')
      and gp.proposed_time > now()
  loop
    perform set_config('bsc.game_post_action', 'cancel', true);
    update public.game_post set status = 'cancelled' where post_id = v_post.post_id;
    perform set_config('bsc.game_post_action', '', true);

    insert into public.cancellation_record (post_id, reason)
    values (v_post.post_id, 'The organiser deleted their account.')
    on conflict (post_id) do nothing;

    perform private.notify_game_players(
      v_post.post_id, 'game_cancelled',
      private.describe_game(v_post.post_id) || ' was cancelled: the organiser closed their account.'
    );
  end loop;

  -- Their requests and places in other upcoming games are given up. The host
  -- is told a place has opened up, as for any withdrawal.
  update public.game_participant x
  set status = 'withdrawn'
  from public.game_post gp
  where gp.post_id = x.post_id
    and x.player_id = p_player_id
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full')
    and gp.proposed_time > now();

  delete from public.game_request_message where player_id = p_player_id;

  -- Groups: a group whose only admin this was gets a new admin, the longest-
  -- standing member. With no members left, it is deactivated, after its
  -- upcoming games are cancelled.
  for v_group in
    select cr.group_id from public.group_member cr
    where cr.player_id = p_player_id and cr.role = 'admin' and cr.status = 'approved'
      and not exists (
        select 1 from public.group_member o
        where o.group_id = cr.group_id and o.player_id <> p_player_id and o.role = 'admin'
      )
  loop
    select o.player_id into v_next
    from public.group_member o
    join public.player p on p.player_id = o.player_id
    where o.group_id = v_group.group_id and o.player_id <> p_player_id
      and o.status = 'approved' and p.deleted_at is null
    order by o.added_at
    limit 1;

    if v_next is not null then
      update public.group_member set role = 'admin'
      where group_id = v_group.group_id and player_id = v_next;
    else
      for v_post in
        select gp.post_id from public.game_post gp
        where gp.organiser_group_id = v_group.group_id
          and gp.deleted_at is null and gp.status in ('open', 'full')
          and gp.proposed_time > now()
      loop
        perform set_config('bsc.game_post_action', 'cancel', true);
        update public.game_post set status = 'cancelled' where post_id = v_post.post_id;
        perform set_config('bsc.game_post_action', '', true);
        insert into public.cancellation_record (post_id, reason)
        values (v_post.post_id, 'The group closed.')
        on conflict (post_id) do nothing;
        perform private.notify_game_players(
          v_post.post_id, 'game_cancelled',
          private.describe_game(v_post.post_id) || ' was cancelled: the group closed.'
        );
      end loop;

      update public.groups set is_active = false where group_id = v_group.group_id;
      -- Nobody is left to keep as admin, so the guard has nothing to protect.
      perform set_config('bsc.group_closing', 'on', true);
      delete from public.group_member where group_id = v_group.group_id;
      perform set_config('bsc.group_closing', '', true);
    end if;
  end loop;

  delete from public.group_member where player_id = p_player_id;

  delete from public.blocks where blocker_id = p_player_id or blocked_id = p_player_id;
  delete from public.notification where player_id = p_player_id;

  -- Other players' notifications name them; those now say "Deleted User".
  update public.notification
  set message = replace(message, v_old_name, 'Deleted User')
  where v_old_name is not null
    and position(v_old_name in message) > 0;

  update public.player_private
  set first_name = null, last_name = null, date_of_birth = null,
      age_declared_at = null, terms_version = null, terms_accepted_at = null,
      privacy_version = null, privacy_accepted_at = null, registered_at = null
  where player_id = p_player_id;

  update public.player_profile
  set bio = null, suburb = null, is_discoverable = false, email_notifications = false
  where player_id = p_player_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.game_card(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      when gp.organiser_group_id is not null then jsonb_build_object(
        'id', c.group_id, 'name', c.name, 'initials', private.initials(c.name),
        'isGroup', true, 'isActive', c.is_active)
      else jsonb_build_object(
        'id', p.player_id, 'name', p.username, 'initials', private.initials(p.username),
        'isGroup', false,
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
  left join public.groups c on c.group_id = gp.organiser_group_id
  where gp.post_id = p_post_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_form_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
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
    -- "Post as": the player, or a group they are an admin of.
    'postAs', jsonb_build_array(jsonb_build_object(
        'type', 'player', 'id', (select auth.uid()), 'name',
        (select p.username from public.player p where p.player_id = (select auth.uid()))))
      || coalesce((
        select jsonb_agg(jsonb_build_object('type', 'group', 'id', c.group_id, 'name', c.name)
                         order by c.name)
        from public.group_member cr
        join public.groups c on c.group_id = cr.group_id
        where cr.player_id = (select auth.uid())
          and cr.role = 'admin' and cr.status = 'approved' and c.is_active
      ), '[]'::jsonb)
  )
  where (select private.is_registered());
$function$;

CREATE OR REPLACE FUNCTION public.report_post(p_post_id uuid, p_category text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'organiser_group', c.name)
    from public.game_post gp
    left join public.venue v on v.venue_id = gp.venue_id
    left join public.player p on p.player_id = gp.organiser_id
    left join public.groups c on c.group_id = gp.organiser_group_id
    where gp.post_id = p_post_id
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_details(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
             'initials', private.initials(p.username), 'isGroup', false,
             'isDeleted', p.deleted_at is not null,
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
             'id', c.group_id, 'name', c.name, 'initials', private.initials(c.name),
             'isGroup', true, 'isActive', c.is_active, 'isVerified', c.is_verified)
      into v_host
    from public.groups c where c.group_id = v_post.organiser_group_id;
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
               'isDeleted', p.deleted_at is not null,
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
$function$;

-- ---------------------------------------------------------------------------
-- 3. Triggers, pointed at the renamed functions
-- ---------------------------------------------------------------------------

drop trigger on_club_created on public.groups;
CREATE TRIGGER on_group_created AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION private.handle_new_group();
drop trigger club_set_updated_metadata on public.groups;
CREATE TRIGGER group_set_updated_metadata BEFORE INSERT OR UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION private.set_updated_metadata();
drop trigger club_representative_keep_one_admin on public.group_member;
CREATE TRIGGER group_member_keep_one_admin BEFORE DELETE OR UPDATE ON public.group_member FOR EACH ROW EXECUTE FUNCTION private.keep_one_group_admin();
drop trigger club_representative_set_updated_metadata on public.group_member;
CREATE TRIGGER group_member_set_updated_metadata BEFORE INSERT OR UPDATE ON public.group_member FOR EACH ROW EXECUTE FUNCTION private.set_updated_metadata();
drop trigger game_post_club_must_be_active on public.game_post;
CREATE TRIGGER game_post_group_must_be_active BEFORE INSERT OR UPDATE OF organiser_group_id ON public.game_post FOR EACH ROW EXECUTE FUNCTION private.group_must_be_active('organiser_group_id');
drop trigger club_representative_club_must_be_active on public.group_member;
CREATE TRIGGER group_member_group_must_be_active BEFORE INSERT ON public.group_member FOR EACH ROW EXECUTE FUNCTION private.group_must_be_active('group_id');
drop trigger club_has_no_upcoming_games on public.groups;
CREATE TRIGGER group_has_no_upcoming_games BEFORE UPDATE OF is_active ON public.groups FOR EACH ROW EXECUTE FUNCTION private.group_has_no_upcoming_games();

-- ---------------------------------------------------------------------------
-- 4. Policies, recreated with the new names
-- ---------------------------------------------------------------------------

drop policy "cancellation_record: the post's organiser records it" on public.cancellation_record;
create policy "cancellation_record: the post's organiser records it" on public.cancellation_record as permissive for insert to authenticated
  with check (((EXISTS ( SELECT 1
   FROM game_post gp
  WHERE ((gp.post_id = cancellation_record.post_id) AND ((gp.organiser_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_post_for_group(gp.organiser_group_id) AS can_post_for_group))))) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club_representative: club admins approve and promote members" on public.group_member;
create policy "group_member: group admins approve and promote members" on public.group_member as permissive for update to authenticated
  using (((( SELECT private.can_post_for_group(group_member.group_id) AS can_post_for_group) AND (role = 'member'::text)) OR ( SELECT private.is_admin() AS is_admin)))
  with check ((( SELECT private.can_post_for_group(group_member.group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club_representative: leave, or removed by a club admin" on public.group_member;
create policy "group_member: leave, or removed by a group admin" on public.group_member as permissive for delete to authenticated
  using (((player_id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.can_post_for_group(group_member.group_id) AS can_post_for_group) AND (role = 'member'::text)) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club_representative: members public, requests private" on public.group_member;
create policy "group_member: members public, requests private" on public.group_member as permissive for select to authenticated
  using (((status = 'approved'::text) OR (player_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_post_for_group(group_member.group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club_representative: players ask to join" on public.group_member;
create policy "group_member: players ask to join" on public.group_member as permissive for insert to authenticated
  with check (((player_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (role = 'member'::text)));
drop policy "club_representative: registered players only" on public.group_member;
create policy "group_member: registered players only" on public.group_member as restrictive for all to authenticated
  using (( SELECT private.is_registered() AS is_registered))
  with check (( SELECT private.is_registered() AS is_registered));
drop policy "club: any player can register one" on public.groups;
create policy "group: any player can register one" on public.groups as permissive for insert to authenticated
  with check (((( SELECT auth.uid() AS uid) = created_by) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club: club admins or platform admin edit" on public.groups;
create policy "group: group admins or platform admin edit" on public.groups as permissive for update to authenticated
  using ((( SELECT private.can_post_for_group(groups.group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)))
  with check ((( SELECT private.can_post_for_group(groups.group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "club: readable by signed-in players" on public.groups;
create policy "group: readable by signed-in players" on public.groups as permissive for select to authenticated
  using (true);
drop policy "club: registered players only" on public.groups;
create policy "group: registered players only" on public.groups as restrictive for all to authenticated
  using (( SELECT private.is_registered() AS is_registered))
  with check (( SELECT private.is_registered() AS is_registered));
drop policy "game_post: organiser, club rep or admin edits" on public.game_post;
create policy "game_post: organiser, group rep or admin edits" on public.game_post as permissive for update to authenticated
  using (((organiser_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_post_for_group(game_post.organiser_group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)))
  with check (((organiser_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_post_for_group(game_post.organiser_group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)));
drop policy "game_post: post as yourself or on behalf of your club" on public.game_post;
create policy "game_post: post as yourself or on behalf of your group" on public.game_post as permissive for insert to authenticated
  with check (((organiser_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_post_for_group(game_post.organiser_group_id) AS can_post_for_group) OR ( SELECT private.is_admin() AS is_admin)));

-- ---------------------------------------------------------------------------
-- 5. The old functions
-- ---------------------------------------------------------------------------

drop function private.can_post_for_club(uuid);
drop function private.club_must_be_active();
drop function private.handle_new_club();
drop function private.club_has_no_upcoming_games();
drop function report_club(uuid,text,text);
drop function private.keep_one_club_admin();

-- ---------------------------------------------------------------------------
-- 6. Descriptions
-- ---------------------------------------------------------------------------

comment on function private.can_manage_post(uuid) is 'True for the individual who posted the game, or for a representative of the group that posted it.';
comment on function private.can_post_for_group(uuid) is 'True when the caller is an approved admin of the group: the people who may rename it, post games for it and manage its members. Returns false for a null group_id, which is what an individually organised post passes.';
comment on function private.group_must_be_active() is 'Rejects a new game post or membership row for an inactive groups. Takes the name of the group id column as its trigger argument. Not security definer: group is readable by every signed-in player.';
comment on function report_group(uuid,text,text) is 'Report a groups. Same categories and rules as report_player.';
comment on function private.anonymise_player(uuid) is 'Turns a player into "Deleted User": keeps results and rankings, removes personal details, cancels their upcoming games. Called when their auth user is deleted.';
comment on function get_game_form_options() is 'Post a Game form data in one call: supabase.rpc(''get_game_form_options''). Formats, styles, ability levels, limits, the default title and who the player can post as. Venues come from search_venues as the player types. Null until the player is registered.';
comment on function report_post(uuid,text,text) is 'Report a game post. Same categories and rules as report_player.';
comment on function get_game_details(uuid) is 'Game Details screen: the card plus duration, venue, address, Maps link, notes, host (rating, verified matches, reliability %), accepted players, the caller''s request status and whether they manage the game. Null if the game is removed (admins excepted), hidden by a block, or the caller is not registered.';
comment on column public.game_post.organiser_id is 'Set when an individual player posts. Null when a group posts.';
comment on table public.groups is 'A group or organisation that posts games. Not an account: a group cannot log in. Real people post on its behalf, listed in group_member.';
comment on column public.groups.slug is 'URL-safe identifier for /groups/<slug>. Lowercase letters, digits and single hyphens only, enforced by the check constraint.';
comment on column public.groups.is_verified is 'Staff-set badge confirming this is a genuine groups. Anyone can create a group record, so unverified groups exist and the UI should say so. Locked to service_role by the column grant below.';
comment on column public.groups.created_by is 'on delete restrict: deleting a player must not take a group and its posts with it. Hand the group over first.';
comment on column public.game_post.organiser_group_id is 'Set when a group posts. Null when an individual posts. The post form toggles between the two; game_post_exactly_one_organiser enforces that exactly one is filled in.';
comment on table public.group_member is 'Group membership, including pending join requests. role = admin may rename the group, post games on its behalf and manage members; role = member just belongs. status = pending is a request awaiting a group admin.';
comment on column public.groups.updated_by is 'The player who last changed this row. Null when the change came from service_role, meaning a backend job rather than a person. Set by the group_set_updated_metadata trigger; a value sent by a client is ignored. Not a foreign key, so that player embeds stay unambiguous.';
comment on column public.group_member.role is 'admin or member. Only approved rows can be admin (group_member_admin_is_approved).';
comment on column public.group_member.status is 'pending until a group admin approves the request. Players can only ever create their own row as pending; approval is an admin''s update.';
comment on column public.group_member.updated_by is 'The player who last changed this row, e.g. the admin who approved the request. Null when the change came from service_role. Set by the group_member_set_updated_metadata trigger; a value sent by a client is ignored. Not a foreign key, so that player embeds stay unambiguous.';
comment on column public.groups.is_active is 'False once a group admin deactivates the groups. Its game posts and results are kept; it cannot post new games or take new members until reactivated. Groups are never deleted through the API.';
comment on table public.state is 'The eight Australian states and territories. Reference data, loaded from supabase/seeds/production/. Codes match the state check constraints on player_profile and groups.';
comment on table public.game_request_message is 'The optional note a player sends with a join request ("Hi! I''d love to join..."). Readable by the requester, the game''s organiser or group admins, and admins only. Written by request_to_join.';

-- Functions that mention clubs only in their description.
comment on function cancel_game_post(uuid,text) is 'Organiser or group admin cancels an upcoming game: supabase.rpc(''cancel_game_post'', { p_post_id, p_reason }). Refused within 4 hours of the start (admins excepted) and once the game has started. Writes cancellation_record and notifies players. The post stays visible as cancelled.';
comment on function delete_game_post(uuid) is 'Organiser or group admin deletes a game that has not happened: supabase.rpc(''delete_game_post'', { p_post_id }). The post is hidden, not removed. Subject to the 4-hour rule unless already cancelled. Games that have happened need admin_delete_game_post.';
comment on function accept_request(uuid,uuid) is 'Organiser or group admin accepts a request: supabase.rpc(''accept_request'', { p_post_id, p_player_id }). Refused when the game is full (check violation). The first acceptance creates the match.';
comment on function decline_request(uuid,uuid) is 'Organiser or group admin declines a request: supabase.rpc(''decline_request'', { p_post_id, p_player_id }). The player cannot ask again for this game.';

reset check_function_bodies;
