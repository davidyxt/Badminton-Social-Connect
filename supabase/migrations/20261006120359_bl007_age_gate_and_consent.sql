-- BL-007: 18+ age gate and recorded consent (risk PHY-05, Go/No-Go).
--
-- A player is "registered" once they have given a date of birth showing they
-- are 18 or over, declared that they are 18+, and accepted a version of the
-- terms of use and the privacy notice. Until then the account exists but
-- cannot use the app: restrictive policies hide every other player and every
-- game from it, and stop it creating anything.
--
-- That second half is what makes the gate real. Sign-up metadata is written
-- by the client, and anyone can call the Supabase sign-up API directly, so a
-- check that only runs when a date of birth is supplied would be skipped by
-- simply not supplying one.
--
-- Two ways to register, both through private.complete_registration:
--   * at sign-up, by sending date_of_birth, age_declared, terms_version,
--     privacy_version and state in options.data. An under-18 date of birth
--     fails the sign-up itself, so no account is created.
--   * afterwards, with supabase.rpc('register_player', {...}). This is the
--     path for Google sign-in, which cannot carry a date of birth, and for
--     anyone whose sign-up form did not send the fields.
-- A minor's date of birth is never stored: the rejection happens first.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.player_private
  add column date_of_birth date,
  add column age_declared_at timestamptz,
  add column terms_version text check (length(trim(terms_version)) between 1 and 20),
  add column terms_accepted_at timestamptz,
  add column privacy_version text check (length(trim(privacy_version)) between 1 and 20),
  add column privacy_accepted_at timestamptz,
  add column registered_at timestamptz;

-- Registered means all of it was recorded, never part.
alter table public.player_private
  add constraint player_private_registration_complete
    check (
      registered_at is null
      or (
        date_of_birth is not null and age_declared_at is not null
        and terms_version is not null and terms_accepted_at is not null
        and privacy_version is not null and privacy_accepted_at is not null
      )
    );

comment on column public.player_private.date_of_birth is
  'Set once, by complete_registration, and only for adults. Not editable by '
  'the player (no column grant): changing it would let anyone rewrite the '
  'age check after the fact.';
comment on column public.player_private.age_declared_at is
  'When the player ticked the 18+ declaration.';
comment on column public.player_private.terms_version is
  'Version label of the terms of use the player accepted, e.g. 2026-10. '
  'The team decides the labels; the timestamp beside it is set by the server.';
comment on column public.player_private.registered_at is
  'Null until the age gate and consent are complete. While null, the '
  'restrictive registered-only policies keep the account out of the app.';

-- ---------------------------------------------------------------------------
-- 2. The check, in one place
-- ---------------------------------------------------------------------------

create or replace function private.complete_registration(
  p_player_id uuid,
  p_date_of_birth date,
  p_age_declared boolean,
  p_terms_version text,
  p_privacy_version text,
  p_state text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.player_private
    where player_id = p_player_id and registered_at is not null
  ) then
    raise exception 'This account has already completed registration.'
      using errcode = '23505';
  end if;

  if p_date_of_birth is null
     or p_date_of_birth < date '1900-01-01'
     or p_date_of_birth > current_date
  then
    raise exception 'Enter a valid date of birth.'
      using errcode = '22023';
  end if;

  -- Turning 18 today counts.
  if p_date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or over to use Badminton Social Connect.'
      using errcode = '23514';
  end if;

  if p_age_declared is not true then
    raise exception 'Please confirm that you are 18 or over.'
      using errcode = '23514';
  end if;

  if nullif(trim(p_terms_version), '') is null
     or nullif(trim(p_privacy_version), '') is null
  then
    raise exception 'Please accept the terms of use and the privacy notice.'
      using errcode = '23514';
  end if;

  if p_state is null or p_state not in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT') then
    raise exception 'Choose your state or territory.'
      using errcode = '22023';
  end if;

  update public.player_private
  set date_of_birth = p_date_of_birth,
      age_declared_at = now(),
      terms_version = trim(p_terms_version),
      terms_accepted_at = now(),
      privacy_version = trim(p_privacy_version),
      privacy_accepted_at = now(),
      registered_at = now()
  where player_id = p_player_id;

  update public.player_profile
  set state = p_state
  where player_id = p_player_id;
end;
$$;

comment on function private.complete_registration(uuid, date, boolean, text, text, text) is
  'The age gate. Rejects under-18s, a missing 18+ declaration, missing terms '
  'or privacy acceptance and a missing state, storing nothing on rejection. '
  'On success records date of birth, both acceptances with server timestamps, '
  'the state, and registered_at. Runs once per account.';

revoke all on function private.complete_registration(uuid, date, boolean, text, text, text) from public;

-- The RPC the app calls after sign-up. It can only ever register the caller.
create or replace function public.register_player(
  p_date_of_birth date,
  p_age_declared boolean,
  p_terms_version text,
  p_privacy_version text,
  p_state text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  perform private.complete_registration(
    (select auth.uid()), p_date_of_birth, p_age_declared,
    p_terms_version, p_privacy_version, p_state
  );
end;
$$;

comment on function public.register_player(date, boolean, text, text, text) is
  'Completes registration for the signed-in player: '
  'supabase.rpc(''register_player'', { p_date_of_birth, p_age_declared, '
  'p_terms_version, p_privacy_version, p_state }). Errors carry a message '
  'safe to show the player.';

revoke all on function public.register_player(date, boolean, text, text, text) from public;
grant execute on function public.register_player(date, boolean, text, text, text) to authenticated;

-- Is the caller allowed into the app? Admins always are.
create or replace function private.is_registered()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin())
      or exists (
        select 1 from public.player_private pp
        where pp.player_id = (select auth.uid())
          and pp.registered_at is not null
      );
$$;

comment on function private.is_registered() is
  'True when the caller has completed the age gate and consent, or is an '
  'admin. Used by the restrictive registered-only policies.';

revoke all on function private.is_registered() from public;
grant execute on function private.is_registered() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Registration at sign-up
-- ---------------------------------------------------------------------------
-- Same trigger as the username migration, plus: if the sign-up carries a
-- date of birth, run the age gate now. An exception here fails the sign-up,
-- so an under-18 never gets an account.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full text := nullif(trim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name')), '');
  v_first text := coalesce(
    nullif(trim(v_meta ->> 'first_name'), ''),
    nullif(trim(v_meta ->> 'given_name'), ''),
    nullif(split_part(v_full, ' ', 1), '')
  );
  v_last text := coalesce(
    nullif(trim(v_meta ->> 'last_name'), ''),
    nullif(trim(v_meta ->> 'family_name'), ''),
    nullif(trim(substr(v_full, length(split_part(v_full, ' ', 1)) + 2)), '')
  );
  v_username text := nullif(trim(v_meta ->> 'username'), '');
  v_legacy text := nullif(trim(v_meta ->> 'display_name'), '');
begin
  if v_username is null then
    if v_legacy ~ '^[A-Za-z0-9_.]{3,20}$'
       and not exists (select 1 from public.player p where lower(p.username) = lower(v_legacy))
    then
      v_username := v_legacy;
    else
      v_username := private.generate_username(coalesce(v_legacy, v_first));
    end if;
  end if;

  insert into public.player (player_id, username)
  values (new.id, v_username);

  insert into public.player_profile (player_id) values (new.id);

  insert into public.player_private (player_id, first_name, last_name)
  values (new.id, left(v_first, 50), left(v_last, 50));

  if nullif(trim(v_meta ->> 'date_of_birth'), '') is not null then
    perform private.complete_registration(
      new.id,
      (v_meta ->> 'date_of_birth')::date,
      coalesce((v_meta ->> 'age_declared')::boolean, false),
      v_meta ->> 'terms_version',
      v_meta ->> 'privacy_version',
      v_meta ->> 'state'
    );
  end if;

  return new;
end;
$$;

comment on function private.handle_new_user() is
  'Creates player, player_profile and player_private for a new auth user. '
  'Username from metadata username (strict), else display_name (legacy, best '
  'effort), else generated. Names from first_name/last_name or Google''s '
  'fields; never the email. If date_of_birth is sent, runs the age gate '
  '(complete_registration) and fails the sign-up for an under-18.';

-- ---------------------------------------------------------------------------
-- 4. Unregistered accounts are kept out
-- ---------------------------------------------------------------------------
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so they
-- narrow access without touching any other policy. An unregistered account
-- can still read and edit its own player, profile and private rows (to finish
-- registering and fix its name), and read states, suburbs, venues,
-- announcements and its own notifications. Everything involving other people
-- is closed until registration is complete.

-- Own rows stay reachable.
create policy "player: registered players only, own row always"
  on public.player as restrictive for all to authenticated
  using ((select auth.uid()) = player_id or (select private.is_registered()))
  with check ((select auth.uid()) = player_id or (select private.is_registered()));

create policy "player_profile: registered players only, own row always"
  on public.player_profile as restrictive for all to authenticated
  using ((select auth.uid()) = player_id or (select private.is_registered()))
  with check ((select auth.uid()) = player_id or (select private.is_registered()));

-- Community tables: nothing at all until registered.
do $$
declare
  t text;
begin
  foreach t in array array[
    'game_post', 'game_participant', 'cancellation_record',
    'club', 'club_representative',
    'match', 'match_participant', 'check_in', 'match_result', 'dispute',
    'mini_league', 'league_standing', 'ranking', 'report'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select private.is_registered()))
         with check ((select private.is_registered()))',
      t || ': registered players only', t);
  end loop;
end $$;
