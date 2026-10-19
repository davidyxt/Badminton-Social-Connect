-- BL-007 fix: judge age by the player's local date, not the database's.
--
-- The database runs on UTC. complete_registration compared the date of birth
-- with current_date, which in Australia lags the local date for up to half a
-- day: a player turning 18 at midnight in Melbourne was refused until 11 am.
-- "Today" is now the date in the player's own state, which registration
-- already requires.

create or replace function private.state_timezone(p_state text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_state
    when 'VIC' then 'Australia/Melbourne'
    when 'NSW' then 'Australia/Sydney'
    when 'ACT' then 'Australia/Sydney'
    when 'TAS' then 'Australia/Hobart'
    when 'QLD' then 'Australia/Brisbane'
    when 'SA'  then 'Australia/Adelaide'
    when 'NT'  then 'Australia/Darwin'
    when 'WA'  then 'Australia/Perth'
  end;
$$;

comment on function private.state_timezone(text) is
  'IANA time zone for an Australian state or territory code, or null.';

revoke all on function private.state_timezone(text) from public;

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
declare
  v_today date;
begin
  if exists (
    select 1 from public.player_private
    where player_id = p_player_id and registered_at is not null
  ) then
    raise exception 'This account has already completed registration.'
      using errcode = '23505';
  end if;

  -- The state comes first now: it decides which date "today" is.
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
  'The age gate. Rejects under-18s (judged by the date in the player''s own '
  'state), a missing 18+ declaration, missing terms or privacy acceptance and '
  'a missing state, storing nothing on rejection. On success records date of '
  'birth, both acceptances with server timestamps, the state, and '
  'registered_at. Runs once per account.';
