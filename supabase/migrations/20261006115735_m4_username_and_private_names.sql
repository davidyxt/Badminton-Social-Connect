-- M4: player-chosen usernames, and first / last names kept private.
--
-- Until now the public name was player.display_name, filled from sign-up
-- metadata key 'display_name'. The sign-up form sends first_name / last_name
-- instead, so every player was named after their email prefix (jane.smith87),
-- exposing part of their email address to every signed-in player.
--
-- Now:
--   * player.display_name becomes player.username: chosen by the player,
--     unique ignoring case, 3-20 letters, digits, _ or . (no spaces, no @).
--   * first_name / last_name live in player_private, readable only by the
--     owner and admins. BL-007 adds date of birth and consent to this table.
--
-- Sign-up metadata the trigger understands:
--   username             strict: a taken or malformed one fails the sign-up
--   display_name         legacy alias, best effort: used if valid and free,
--                        otherwise a username is generated from it
--   first_name/last_name from the sign-up form
--   given_name/family_name, full_name/name   from Google sign-in
-- With no username at all (the current form), one is generated from the first
-- name, e.g. jane_4821. The form should collect a username (team item 9).

-- ---------------------------------------------------------------------------
-- 1. Username generator
-- ---------------------------------------------------------------------------

create or replace function private.generate_username(p_base text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text := left(lower(regexp_replace(coalesce(p_base, ''), '[^A-Za-z0-9_.]', '', 'g')), 15);
  v_candidate text;
begin
  if length(v_base) < 3 then
    v_base := 'player';
  end if;

  loop
    v_candidate := v_base || '_' || (floor(random() * 9000) + 1000)::int;
    exit when not exists (
      select 1 from public.player p where lower(p.username) = v_candidate
    );
  end loop;

  return v_candidate;
end;
$$;

comment on function private.generate_username(text) is
  'Builds a free username from a name: lowercase, invalid characters removed, '
  'at most 15 characters, then _ and four random digits (jane_4821). Falls '
  'back to player_NNNN when the name is too short.';

-- ---------------------------------------------------------------------------
-- 2. display_name becomes username
-- ---------------------------------------------------------------------------
-- The column grant (update on username, self_rating_band) follows the rename.

alter table public.player rename column display_name to username;
alter table public.player drop constraint player_display_name_check;

-- Existing rows (local databases only; the hosted project has no players yet)
-- may not fit the new rules. Replace malformed names first, then duplicates,
-- keeping the earliest player's name in each clash.
update public.player
set username = private.generate_username(username)
where username !~ '^[A-Za-z0-9_.]{3,20}$';

update public.player p
set username = private.generate_username(p.username)
from (
  select player_id,
         row_number() over (partition by lower(username) order by joined_at, player_id) as n
  from public.player
) d
where d.player_id = p.player_id and d.n > 1;

alter table public.player
  add constraint player_username_format
    check (username ~ '^[A-Za-z0-9_.]{3,20}$');

create unique index player_username_unique_idx on public.player (lower(username));

comment on column public.player.username is
  'Public name, chosen by the player. Unique ignoring case '
  '(player_username_unique_idx); 3-20 letters, digits, _ or . '
  '(player_username_format). Never derived from the email address.';

-- ---------------------------------------------------------------------------
-- 3. Private personal details
-- ---------------------------------------------------------------------------

create table public.player_private (
  player_id uuid primary key references public.player (player_id) on delete cascade,
  first_name text check (length(trim(first_name)) between 1 and 50),
  last_name text check (length(trim(last_name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.player_private is
  'Personal details only the player and admins may see: first and last name '
  '(and, from BL-007, date of birth and consent). Other players see '
  'player.username instead.';
comment on column public.player_private.updated_by is
  'The player who last changed this row. Null when the change came from '
  'service_role. Set by the player_private_set_updated_metadata trigger; a '
  'value sent by a client is ignored. Not a foreign key, so that player '
  'embeds stay unambiguous.';

create trigger player_private_set_updated_metadata
  before insert or update on public.player_private
  for each row execute function private.set_updated_metadata();

alter table public.player_private enable row level security;

create policy "player_private: owner or admin reads"
  on public.player_private for select to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()));

create policy "player_private: owner or admin edits"
  on public.player_private for update to authenticated
  using ((select auth.uid()) = player_id or (select private.is_admin()))
  with check ((select auth.uid()) = player_id or (select private.is_admin()));

-- No insert policy: the row is created by the sign-up trigger.
-- No delete policy: it cascades from player.
revoke insert, update, delete on public.player_private from anon, authenticated;
grant update (first_name, last_name) on public.player_private to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sign-up trigger
-- ---------------------------------------------------------------------------

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

  -- A chosen username that is taken or malformed raises here, which fails
  -- the sign-up. The form should check public.is_username_available first.
  insert into public.player (player_id, username)
  values (new.id, v_username);

  insert into public.player_profile (player_id) values (new.id);

  insert into public.player_private (player_id, first_name, last_name)
  values (new.id, left(v_first, 50), left(v_last, 50));

  return new;
end;
$$;

comment on function private.handle_new_user() is
  'Creates player, player_profile and player_private for a new auth user. '
  'Username comes from metadata key username (strict), else display_name '
  '(legacy, best effort), else is generated from the first name. Names come '
  'from first_name/last_name, Google''s given_name/family_name, or a split '
  'full_name. Never uses the email address.';

-- Players who signed up before this migration get their names from the
-- metadata they signed up with.
insert into public.player_private (player_id, first_name, last_name)
select
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
                nullif(trim(u.raw_user_meta_data ->> 'given_name'), '')), 50),
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''),
                nullif(trim(u.raw_user_meta_data ->> 'family_name'), '')), 50)
from auth.users u
join public.player p on p.player_id = u.id
on conflict (player_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Availability check for the sign-up form
-- ---------------------------------------------------------------------------
-- In public so the form can call it as an RPC before the player has an
-- account. It reveals only whether a name is taken, and usernames are public
-- to signed-in players anyway.

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9_.]{3,20}$'
     and not exists (
       select 1 from public.player p where lower(p.username) = lower(p_username)
     );
$$;

comment on function public.is_username_available(text) is
  'True when the username is well formed and nobody has it, ignoring case. '
  'Call before sign-up: supabase.rpc(''is_username_available'', '
  '{ p_username }).';

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

revoke all on function private.generate_username(text) from public;
