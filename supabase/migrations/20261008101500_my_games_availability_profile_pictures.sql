-- Requested 2026-10-08 after the last frontend check:
--
-- 1. My games: get_my_games() lists every game the player hosts (themselves
--    or through a group they admin) or plays in, filterable by "all" or
--    "organised" (by you), upcoming or past. get_my_home's nextGames is the
--    same list, first three upcoming confirmed games. (Replaces nextGame.)
-- 2. Availability: when a player usually plays (mon_evening, sat_morning...)
--    and a short note. Edited with update_my_profile, shown on profiles.
-- 3. Profile pictures in Supabase Storage (bucket `avatars`): a player
--    uploads into their own folder, then set_my_profile_picture(url) saves
--    it; remove_my_profile_picture() clears it. profileImageUrl is filled in
--    on every screen that has it. Setup: docs/DEPLOYMENT.md.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Data
-- ---------------------------------------------------------------------------

alter table public.player_profile
  add column availability text[] not null default '{}'
    check (availability <@ array[
      'mon_morning', 'mon_afternoon', 'mon_evening', 'tue_morning', 'tue_afternoon', 'tue_evening',
      'wed_morning', 'wed_afternoon', 'wed_evening', 'thu_morning', 'thu_afternoon', 'thu_evening',
      'fri_morning', 'fri_afternoon', 'fri_evening', 'sat_morning', 'sat_afternoon', 'sat_evening',
      'sun_morning', 'sun_afternoon', 'sun_evening']::text[]),
  add column availability_note text check (length(availability_note) <= 200),
  add column profile_image_url text check (length(profile_image_url) <= 500);

comment on column public.player_profile.availability is
  'When the player usually plays: day_partofday values, e.g. {mon_evening,sat_morning}. '
  'Morning is before 12, afternoon 12-5 pm, evening from 5 pm.';
comment on column public.player_profile.availability_note is
  'Free text next to availability, e.g. "Most weeknights after 6".';
comment on column public.player_profile.profile_image_url is
  'Public URL of the player''s picture in the avatars bucket. Set with '
  'set_my_profile_picture, cleared with remove_my_profile_picture.';

-- ---------------------------------------------------------------------------
-- 2. Storage: the avatars bucket
-- ---------------------------------------------------------------------------
-- Public, so a picture loads from its URL without a token. The API only hands
-- the URL out where the profile itself may be seen; file names are random.
-- Each player writes only inside their own folder: avatars/<player id>/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: players upload into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: players see their own files"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: players replace their own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: players delete their own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

create or replace function private.avatar_url(p_player_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pp.profile_image_url
  from public.player_profile pp
  join public.player p on p.player_id = pp.player_id
  where pp.player_id = p_player_id and p.deleted_at is null;
$$;

comment on function private.avatar_url(uuid) is
  'A player''s picture URL for screen JSON (profileImageUrl); null if none or deleted.';

create or replace function private.my_games(
  p_me uuid,
  p_filter text,
  p_when text,
  p_include_pending boolean,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_filter not in ('all', 'organised') then
    raise exception 'filter is all or organised.' using errcode = '22023';
  end if;
  if p_when not in ('upcoming', 'past') then
    raise exception 'when is upcoming or past.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(private.game_card(g.post_id) || jsonb_build_object('myRole', g.role)
                     order by case when p_when = 'upcoming' then g.proposed_time end asc,
                              case when p_when = 'past' then g.proposed_time end desc,
                              g.post_id)
    from (
      select gp.post_id, gp.proposed_time,
             case when gp.organiser_id = p_me
                    or exists (select 1 from public.group_member gm
                               where gm.group_id = gp.organiser_group_id and gm.player_id = p_me
                                 and gm.role = 'admin' and gm.status = 'approved')
                  then 'host' else 'player' end as role
      from public.game_post gp
      where gp.deleted_at is null
        and case p_when
              when 'upcoming' then gp.status in ('open', 'full') and gp.proposed_time > now()
              else gp.status <> 'cancelled' and gp.proposed_time <= now()
            end
        and (
          gp.organiser_id = p_me
          or exists (select 1 from public.group_member gm
                     where gm.group_id = gp.organiser_group_id and gm.player_id = p_me
                       and gm.role = 'admin' and gm.status = 'approved')
          or (p_filter = 'all' and exists (
                select 1 from public.game_participant x
                where x.post_id = gp.post_id and x.player_id = p_me
                  and (x.status in ('accepted', 'no_show')
                       or (p_include_pending and x.status in ('requested', 'invited')))))
        )
      order by case when p_when = 'upcoming' then gp.proposed_time end asc,
               case when p_when = 'past' then gp.proposed_time end desc,
               gp.post_id
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) g
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.my_games(uuid, text, text, boolean, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- 4. Screens
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.get_my_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'lastName', pv.last_name,
      'greetingName', coalesce(
        nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', private.avatar_url(p.player_id),
      'registered', pv.registered_at is not null,
      'level', private.band_label(p.self_rating_band),
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      -- The next three confirmed games (hosting or playing): the same list as
      -- get_my_games, upcoming, without pending requests or invitations.
      'nextGames', private.my_games(v_me, 'all', 'upcoming', false, 3, 0)
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_rel jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  v_rel := private.reliability(v_me);

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'lastName', pv.last_name,
      'name', coalesce(nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', private.avatar_url(p.player_id),
      'selfRatingBand', p.self_rating_band,
      'level', private.band_label(p.self_rating_band),
      'isVerified', p.is_verified,
      'bio', pp.bio,
      'suburb', pp.suburb,
      'state', pp.state,
      'stateName', (select s.name from public.state s where s.state_code = pp.state),
      'location', concat_ws(' · ',
        case when pp.suburb is not null then pp.suburb || ' area' end, pp.state),
      'isDiscoverable', pp.is_discoverable,
      'preferredFormat', pp.preferred_format,
      'availability', to_jsonb(pp.availability),
      'availabilityNote', pp.availability_note,
      'emailNotifications', pp.email_notifications,
      'reliability', (v_rel ->> 'score')::int,
      'gamesPlayed', (v_rel ->> 'attended')::int,
      'noShows', (v_rel ->> 'noShows')::int,
      'lateWithdrawals', (v_rel ->> 'lateWithdrawals')::int,
      'lateCancellations', (v_rel ->> 'lateCancellations')::int,
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      'joinedAt', p.joined_at
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    join public.player_profile pp on pp.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_profile(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'profileImageUrl', private.avatar_url(p.player_id),
      'availability', to_jsonb(pp.availability),
      'availabilityNote', pp.availability_note,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_join_requests(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
             'host', v_card -> 'host',
             'requester', jsonb_build_object(
               'id', p.player_id,
               'name', p.username,
               'initials', private.initials(p.username),
               'level', private.label(p.self_rating_band),
               'preferredFormat', private.label(pp.preferred_format),
               'profileImageUrl', private.avatar_url(p.player_id),
               'message', msg.message,
               'rating', s -> 'rating',
               'verifiedMatches', s -> 'matches',
               'reliability', s -> 'reliability',
               'noShows', s -> 'noShows',
               'lateWithdrawals', s -> 'lateWithdrawals'
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
$function$;

CREATE OR REPLACE FUNCTION public.search_players(p_query text DEFAULT NULL::text, p_level text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
               'profileImageUrl', private.avatar_url(p.player_id),
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
        and p.deleted_at is null
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
    -- The venue's name alone (null for an "other venue" game), and the length.
    'venue', v.name,
    'duration', gp.duration_minutes || ' mins',
    'durationMinutes', gp.duration_minutes,
    'suburb', gp.suburb,
    -- Opens the venue in Google Maps. Null for "other venue" games.
    'mapsUrl', v.maps_url,
    'playerCount', (
      select count(*) from public.game_participant x
      where x.post_id = gp.post_id and x.status = 'accepted'
    ),
    'maxPlayers', gp.player_limit,
    -- An invitation to one player (Request Game).
    'isInvite', gp.invited_player_id is not null,
    'status', gp.status,
    'imageUrl', null,
    -- Who runs the game: a player, or a group. Called host everywhere.
    'host', case
      when gp.organiser_group_id is not null then jsonb_build_object(
        'id', c.group_id, 'name', c.name, 'initials', private.initials(c.name),
        'isGroup', true, 'isActive', c.is_active)
      else jsonb_build_object(
        'id', p.player_id, 'name', p.username, 'initials', private.initials(p.username),
        'profileImageUrl', private.avatar_url(p.player_id),
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
             'profileImageUrl', private.avatar_url(p.player_id),
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
               'profileImageUrl', private.avatar_url(p.player_id),
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
    -- For an invitation: who was invited, their answer and the organiser's
    -- message. Null for ordinary games.
    'invite', (
      select jsonb_build_object(
        'playerId', ip.player_id,
        'name', ip.username,
        'initials', private.initials(ip.username),
        'status', x.status,
        'message', msg.message)
      from public.player ip
      left join public.game_participant x
        on x.post_id = p_post_id and x.player_id = ip.player_id
      left join public.game_request_message msg
        on msg.post_id = p_post_id and msg.player_id = ip.player_id
      where ip.player_id = v_post.invited_player_id
    ),
    'matchId', (select m.match_id from public.match m where m.post_id = p_post_id order by m.created_at limit 1)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_blocked_players()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.player_id,
           'name', p.username,
           'initials', private.initials(p.username),
           'profileImageUrl', private.avatar_url(p.player_id),
           'category', b.category,
           'categoryLabel', private.label(b.category),
           'reason', b.reason,
           'blockedAt', b.created_at)
         order by b.created_at desc), '[]'::jsonb)
  from public.blocks b
  join public.player p on p.player_id = b.blocked_id
  where b.blocker_id = (select auth.uid());
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
  perform set_config('bsc.participant_action', 'invite', true);
  update public.game_participant x
  set status = case when x.status = 'invited' then 'declined' else 'withdrawn' end
  from public.game_post gp
  where gp.post_id = x.post_id
    and x.player_id = p_player_id
    and x.status in ('requested', 'invited', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full')
    and gp.proposed_time > now();

  perform set_config('bsc.participant_action', '', true);

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
  set bio = null, suburb = null, is_discoverable = false, email_notifications = false,
      availability = '{}', availability_note = null, profile_image_url = null
  where player_id = p_player_id;
end;
$function$;

drop function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean);

CREATE FUNCTION public.update_my_profile(p_username text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_self_rating_band text DEFAULT NULL::text, p_bio text DEFAULT NULL::text, p_suburb text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_is_discoverable boolean DEFAULT NULL::boolean, p_preferred_format text DEFAULT NULL::text, p_email_notifications boolean DEFAULT NULL::boolean, p_availability text[] DEFAULT NULL::text[], p_availability_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if p_username is not null and lower(trim(p_username)) is distinct from (
       select lower(username) from public.player where player_id = v_me)
     and not public.is_username_available(trim(p_username))
  then
    raise exception 'That username is taken or not allowed. Use 3-20 letters, numbers, _ or .'
      using errcode = '23505';
  end if;

  if p_state is not null and p_state not in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT') then
    raise exception 'Choose a state or territory.' using errcode = '22023';
  end if;

  if p_self_rating_band is not null and p_self_rating_band not in (
       'beginner', 'lower_intermediate', 'intermediate', 'upper_intermediate', 'advanced')
  then
    raise exception 'Choose a level: beginner, lower_intermediate, intermediate, upper_intermediate or advanced.'
      using errcode = '22023';
  end if;

  if p_preferred_format is not null
     and p_preferred_format not in ('singles', 'doubles', 'mixed_doubles', 'any')
  then
    raise exception 'Choose a format: singles, doubles, mixed_doubles or any.'
      using errcode = '22023';
  end if;

  if p_availability is not null and exists (
       select 1 from unnest(p_availability) a
       where a !~ '^(mon|tue|wed|thu|fri|sat|sun)_(morning|afternoon|evening)$')
  then
    raise exception 'Availability is a list like mon_evening or sat_morning: a day (mon to sun) and morning, afternoon or evening.'
      using errcode = '22023';
  end if;

  if length(p_availability_note) > 200 then
    raise exception 'Keep the availability note under 200 characters.' using errcode = '23514';
  end if;

  if p_first_name is not null and nullif(trim(p_first_name), '') is null then
    raise exception 'First name cannot be empty.' using errcode = '23514';
  end if;

  update public.player
  set username = coalesce(trim(p_username), username),
      self_rating_band = coalesce(p_self_rating_band, self_rating_band)
  where player_id = v_me;

  update public.player_private
  set first_name = coalesce(trim(p_first_name), first_name),
      last_name = case when p_last_name is null then last_name else nullif(trim(p_last_name), '') end
  where player_id = v_me;

  update public.player_profile
  set bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
      suburb = case when p_suburb is null then suburb else nullif(trim(p_suburb), '') end,
      state = coalesce(p_state, state),
      is_discoverable = coalesce(p_is_discoverable, is_discoverable),
      preferred_format = coalesce(p_preferred_format, preferred_format),
      email_notifications = coalesce(p_email_notifications, email_notifications),
      availability = case when p_availability is null then availability
                          else array(select distinct a from unnest(p_availability) a order by a) end,
      availability_note = case when p_availability_note is null then availability_note
                               else nullif(trim(p_availability_note), '') end
  where player_id = v_me;

  return public.get_my_profile();
end;
$function$;

comment on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean, text[], text) is
  'Profile settings: supabase.rpc(''update_my_profile'', { p_username, p_first_name, '
  'p_last_name, p_self_rating_band, p_bio, p_suburb, p_state, p_is_discoverable, '
  'p_preferred_format, p_email_notifications, p_availability, p_availability_note }). Send '
  'only what changed. p_availability replaces the whole list, e.g. '
  '[''mon_evening'',''sat_morning''] ([] clears it); an empty p_availability_note clears it. '
  'Returns get_my_profile().';

revoke all on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean, text[], text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text, boolean, text, boolean, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. New functions
-- ---------------------------------------------------------------------------

create or replace function public.get_my_games(
  p_filter text default 'all',
  p_when text default 'upcoming',
  p_include_pending boolean default true,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_registered()) then
    return '[]'::jsonb;
  end if;
  return private.my_games((select auth.uid()), coalesce(p_filter, 'all'), coalesce(p_when, 'upcoming'),
                          coalesce(p_include_pending, true), p_limit, p_offset);
end;
$$;

comment on function public.get_my_games(text, text, boolean, integer, integer) is
  'My games: supabase.rpc(''get_my_games'', { p_filter, p_when, p_include_pending, p_limit, '
  'p_offset }). Game cards for every game the caller hosts (themselves, or through a group '
  'they admin) or plays in, with myRole (host | player) and myStatus. p_filter: all | '
  'organised (hosted by you). p_when: upcoming (soonest first) | past (latest first; '
  'cancelled games left out). p_include_pending (default true) adds games the caller asked '
  'to join or was invited to. Pages of up to 50. Home''s nextGames is the first 3 upcoming, '
  'without pending ones.';

revoke all on function public.get_my_games(text, text, boolean, integer, integer) from public, anon;
grant execute on function public.get_my_games(text, text, boolean, integer, integer) to authenticated;

create or replace function public.set_my_profile_picture(p_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_path text;
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  -- Only a file the player uploaded to their own folder of the avatars bucket.
  v_path := substring(p_url from '/storage/v1/object/public/avatars/(.+)$');
  if p_url !~ '^https?://[^/]+/storage/v1/object/public/avatars/'
     or v_path is null
     or split_part(v_path, '/', 1) <> v_me::text
     or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_path)
  then
    raise exception 'Upload the picture to your own folder in the avatars bucket first.'
      using errcode = '22023';
  end if;

  select profile_image_url into v_old from public.player_profile where player_id = v_me;

  update public.player_profile set profile_image_url = p_url where player_id = v_me;

  return jsonb_build_object(
    'profileImageUrl', p_url,
    -- The old file, for the app to delete from storage (null if none or the same).
    'previousPath', nullif(substring(v_old from '/storage/v1/object/public/avatars/(.+)$'), v_path));
end;
$$;

comment on function public.set_my_profile_picture(text) is
  'Profile picture: upload to storage first (avatars/<your id>/<file>), then '
  'supabase.rpc(''set_my_profile_picture'', { p_url: publicUrl }). Returns profileImageUrl and '
  'previousPath: delete that old file with supabase.storage.from(''avatars'').remove([previousPath]).';

create or replace function public.remove_my_profile_picture()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select profile_image_url into v_old from public.player_profile where player_id = v_me;
  update public.player_profile set profile_image_url = null where player_id = v_me;

  return jsonb_build_object(
    'previousPath', substring(v_old from '/storage/v1/object/public/avatars/(.+)$'));
end;
$$;

comment on function public.remove_my_profile_picture() is
  'Removes the profile picture: supabase.rpc(''remove_my_profile_picture''). Returns '
  'previousPath: delete that file with supabase.storage.from(''avatars'').remove([previousPath]).';

revoke all on function public.set_my_profile_picture(text) from public, anon;
revoke all on function public.remove_my_profile_picture() from public, anon;
grant execute on function public.set_my_profile_picture(text) to authenticated;
grant execute on function public.remove_my_profile_picture() to authenticated;

comment on function public.get_my_home() is
  'Home page: supabase.rpc(''get_my_home''). greetingName, firstName, lastName, initials, '
  'profileImageUrl, registered (false = send to /complete-registration), level, ratingCard, '
  'nextGames (the next 3 confirmed games, same cards as get_my_games; [] = "No game '
  'planned") and unreadNotifications.';

reset check_function_bodies;
