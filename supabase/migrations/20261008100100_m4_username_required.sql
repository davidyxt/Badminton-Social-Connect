-- M4: players always choose their username (items-to-confirm 9).
--
-- The sign-up trigger no longer makes up a username (e.g. "jane_4821") when
-- the sign-up data has none:
--   * an email sign-up must send `username`, or the sign-up fails;
--   * a Google sign-up cannot send one, so the player starts with no username
--     and chooses it on the age-gate page: register_player now takes
--     p_username, and refuses to finish without one.
-- An unregistered player is invisible to everyone else (BL-007), so a missing
-- username is never shown.

alter table public.player alter column username drop not null;

comment on column public.player.username is
  'Public name, chosen by the player, unique ignoring case. Null only for a '
  'Google sign-up that has not completed registration yet.';

-- ---------------------------------------------------------------------------
-- 1. Sign-up trigger
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
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
  -- display_name is the key the first sign-up form used. Still accepted as
  -- the username, but never altered: a taken or invalid one fails.
  v_username text := coalesce(
    nullif(trim(v_meta ->> 'username'), ''),
    nullif(trim(v_meta ->> 'display_name'), '')
  );
begin
  if v_username is null and v_provider = 'email' then
    raise exception 'Choose a username.' using errcode = '23514';
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
      v_meta ->> 'state',
      null
    );
  end if;

  return new;
end;
$$;

drop function private.generate_username(text);

-- ---------------------------------------------------------------------------
-- 2. Registration sets the username when the player has none
-- ---------------------------------------------------------------------------

drop function private.complete_registration(uuid, date, boolean, text, text, text);

create function private.complete_registration(
  p_player_id uuid,
  p_date_of_birth date,
  p_age_declared boolean,
  p_terms_version text,
  p_privacy_version text,
  p_state text,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_current text;
  v_username text := nullif(trim(p_username), '');
begin
  if exists (
    select 1 from public.player_private
    where player_id = p_player_id and registered_at is not null
  ) then
    raise exception 'This account has already completed registration.'
      using errcode = '23505';
  end if;

  select username into v_current from public.player where player_id = p_player_id;

  if v_username is null and v_current is null then
    raise exception 'Choose a username.' using errcode = '23514';
  end if;

  if v_username is not null and v_username is distinct from v_current then
    if v_username !~ '^[A-Za-z0-9_.]{3,20}$' then
      raise exception 'Usernames are 3-20 letters, numbers, _ or .' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.player
      where lower(username) = lower(v_username) and player_id <> p_player_id
    ) then
      raise exception 'That username is taken.' using errcode = '23505';
    end if;
  end if;

  -- The state comes first: it decides which date "today" is.
  if p_state is null or private.state_timezone(p_state) is null then
    raise exception 'Choose your state or territory.'
      using errcode = '22023';
  end if;

  v_today := (now() at time zone private.state_timezone(p_state))::date;

  if p_date_of_birth is null
     or p_date_of_birth < date '1900-01-01'
     or p_date_of_birth > v_today
  then
    raise exception 'Enter a valid date of birth.'
      using errcode = '22023';
  end if;

  -- Turning 18 today, in the player's own time zone, counts.
  if p_date_of_birth > (v_today - interval '18 years')::date then
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

  if v_username is not null and v_username is distinct from v_current then
    update public.player set username = v_username where player_id = p_player_id;
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

comment on function private.complete_registration(uuid, date, boolean, text, text, text, text) is
  'BL-007 age gate. Checks the username (when given or missing), the state, the '
  'date of birth in the state''s time zone, the 18+ declaration and consent, then '
  'records them and registered_at. Runs once per account.';

revoke all on function private.complete_registration(uuid, date, boolean, text, text, text, text) from public;

drop function public.register_player(date, boolean, text, text, text);

create function public.register_player(
  p_date_of_birth date,
  p_age_declared boolean,
  p_terms_version text,
  p_privacy_version text,
  p_state text,
  p_username text default null
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
    p_terms_version, p_privacy_version, p_state, p_username
  );
end;
$$;

comment on function public.register_player(date, boolean, text, text, text, text) is
  'Completes the 18+ age gate after sign-up (Google sign-ins always need it): '
  'supabase.rpc(''register_player'', { p_date_of_birth, p_age_declared, '
  'p_terms_version, p_privacy_version, p_state, p_username }). p_username is '
  'required when the account has none yet (Google), optional otherwise. Errors '
  'carry a message safe to show.';

revoke all on function public.register_player(date, boolean, text, text, text, text) from public;
grant execute on function public.register_player(date, boolean, text, text, text, text) to authenticated;
