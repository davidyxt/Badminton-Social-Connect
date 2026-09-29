-- updated_at / updated_by on every table that can change.
--
-- Both are set by a trigger, never by the client. Two reasons: a client can
-- forget to send them, and a client can lie about them. A status field that
-- records who changed it is worthless if the person changing it chooses the
-- value.
--
-- updated_by is null when the change came from service_role, which is how
-- "a backend job did this" is represented.
--
-- It is deliberately NOT a foreign key to player, for two reasons:
--
--   * PostgREST resolves embeds through foreign keys. A second key from, say,
--     game_participant to player would make `player(display_name)` ambiguous
--     and every embed in the app would need naming as
--     `player!game_participant_player_id_fkey(...)`. The audit column is read
--     on rare detail screens; the roster is read constantly. The common case
--     wins.
--   * The trigger below is the only writer and it takes the value straight
--     from auth.uid(), so the column cannot hold anything but a real user id.
--     A constraint that no writer can violate protects nothing.
--
-- The cost is that deleting a player leaves their id behind in updated_by.
-- For an audit trail that is arguably the correct behaviour: the edit did
-- happen, and it was them.

-- ---------------------------------------------------------------------------
-- 1. The trigger
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'updated_at' - 'updated_by'
       = to_jsonb(old) - 'updated_at' - 'updated_by'
  then
    -- Nothing but the audit columns themselves changed. This is a PATCH that
    -- set a column to the value it already held, and it should not make the
    -- row look freshly edited.
    return new;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  return new;
end;
$$;

comment on function private.set_updated_metadata() is
  'Stamps updated_at and updated_by on insert and on any update that changes '
  'something other than those two columns. Deliberately not security definer: '
  'it only reads the caller''s own JWT.';

-- ---------------------------------------------------------------------------
-- 2. Apply it
-- ---------------------------------------------------------------------------
-- club_representative is absent on purpose: it has no updatable column and no
-- update policy. Rows are added and removed, never edited.

do $$
declare
  t text;
begin
  foreach t in array array[
    'player',
    'player_profile',
    'venue',
    'mini_league',
    'league_standing',
    'game_post',
    'game_participant',
    'cancellation_record',
    'club',
    'match',
    'match_participant',
    'check_in',
    'match_result',
    'dispute',
    'ranking',
    'notification',
    'report',
    'admin_post'
  ]
  loop
    execute format(
      'alter table public.%I
         add column updated_at timestamptz not null default now(),
         add column updated_by uuid',
      t);

    -- No index on updated_by. With no foreign key there is no cascade to
    -- speed up, and nothing queries by it yet. "Show me everything this
    -- player edited" is a plausible moderation screen; add the index then.

    execute format(
      'create trigger %I
         before insert or update on public.%I
         for each row execute function private.set_updated_metadata()',
      t || '_set_updated_metadata', t);

    execute format(
      $c$comment on column public.%I.updated_by is
        'The player who last changed this row. Null when the change came from '
        'service_role, meaning a backend job rather than a person. Set by the '
        '%I_set_updated_metadata trigger; a value sent by a client is ignored. '
        'Not a foreign key, so that player embeds stay unambiguous.'$c$,
      t, t);
  end loop;
end $$;
