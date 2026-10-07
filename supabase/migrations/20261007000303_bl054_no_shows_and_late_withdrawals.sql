-- BL-054: cancellations and no-shows handled fairly.
--
--   * Players may withdraw any time before the game starts. Withdrawing from
--     an accepted place within 24 hours of the start is a late withdrawal,
--     recorded on the row and counted against reliability (BL-052).
--   * Organisers keep the 4-hour cancellation rule (BL-013). Cancelling
--     within 24 hours is a late cancellation, counted the same way.
--   * The host marks a no-show with mark_no_show, from the start of the game
--     until 48 hours after it ends, and can undo it in the same window. The
--     player is notified.
-- These windows await team confirmation (team item 14).

-- ---------------------------------------------------------------------------
-- 1. Status and columns
-- ---------------------------------------------------------------------------

alter table public.game_participant
  drop constraint game_participant_status_check,
  add constraint game_participant_status_check
    check (status in ('requested', 'accepted', 'rejected', 'withdrawn', 'no_show'));

alter table public.game_participant
  add column late_withdrawal boolean not null default false;

comment on column public.game_participant.late_withdrawal is
  'True when the player gave up an accepted place within 24 hours of the '
  'start. Set by a trigger; counts against reliability.';

alter table public.notification
  drop constraint notification_type_check,
  add constraint notification_type_check check (type in (
    'match_reminder', 'match_invite', 'result_submitted', 'dispute_update',
    'league_update', 'system', 'game_cancelled', 'game_removed',
    'join_request', 'request_accepted', 'request_declined', 'request_withdrawn',
    'no_show'
  ));

-- ---------------------------------------------------------------------------
-- 2. Rules on status changes
-- ---------------------------------------------------------------------------
-- Same as the BL-027 version, plus: no-show changes are allowed after the
-- start, but only through mark_no_show / clear_no_show, and late withdrawals
-- are flagged.

create or replace function private.validate_participant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- BL-054: no-shows are recorded after the start, so they skip the
  -- open-game check, but only the no-show functions may make them.
  if new.status = 'no_show' or (tg_op = 'UPDATE' and old.status = 'no_show') then
    if current_setting('bsc.participant_action', true) is distinct from 'no_show' then
      raise exception 'Use mark_no_show to record a no-show.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not (select private.game_is_open_for_requests(new.post_id)) then
    raise exception 'This game is no longer taking requests: it has started, been cancelled or been removed.'
      using errcode = '23514';
  end if;

  if new.status in ('requested', 'accepted')
     and (select private.is_blocked_from_game(new.post_id, new.player_id))
  then
    raise exception 'This game is not available.' using errcode = '42501';
  end if;

  if new.status in ('accepted', 'rejected') and new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  -- BL-054: giving up an accepted place within 24 hours of the start.
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'withdrawn'
     and current_setting('bsc.suppress_notifications', true) is distinct from 'on'
  then
    select gp.proposed_time into v_start from public.game_post gp where gp.post_id = new.post_id;
    new.late_withdrawal := v_start < now() + interval '24 hours';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Marking a no-show
-- ---------------------------------------------------------------------------

create or replace function private.set_no_show(p_post_id uuid, p_player_id uuid, p_no_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.game_post;
  v_status text;
begin
  if not (select private.is_registered())
     or not ((select private.can_manage_post(p_post_id)) or (select private.is_admin()))
  then
    raise exception 'Only the game''s host can record a no-show.' using errcode = '42501';
  end if;

  select * into v_post from public.game_post where post_id = p_post_id;

  if v_post.deleted_at is not null or v_post.status = 'cancelled' then
    raise exception 'This game was cancelled or removed.' using errcode = '23514';
  end if;

  if v_post.proposed_time > now() then
    raise exception 'A no-show can only be recorded once the game has started.' using errcode = '23514';
  end if;

  if now() > v_post.proposed_time + make_interval(mins => v_post.duration_minutes) + interval '48 hours' then
    raise exception 'No-shows must be recorded within 48 hours of the game.' using errcode = '23514';
  end if;

  if p_player_id = v_post.organiser_id then
    raise exception 'The organiser cannot be marked as a no-show.' using errcode = '23514';
  end if;

  select status into v_status from public.game_participant
  where post_id = p_post_id and player_id = p_player_id for update;

  if p_no_show and v_status is distinct from 'accepted' then
    raise exception 'Only accepted players can be marked as no-shows.' using errcode = '23514';
  end if;
  if not p_no_show and v_status is distinct from 'no_show' then
    raise exception 'This player is not marked as a no-show.' using errcode = '23514';
  end if;

  -- The status flips must not look like a request being accepted (BL-050).
  perform set_config('bsc.participant_action', 'no_show', true);
  perform set_config('bsc.suppress_notifications', 'on', true);

  -- Match entries require the player to be on the accepted roster, so the
  -- match side changes while they still are: first when marking, last when
  -- undoing.
  if p_no_show then
    update public.match_participant mp
    set status = 'no_show'
    from public.match m
    where m.match_id = mp.match_id and m.post_id = p_post_id and mp.player_id = p_player_id;

    update public.game_participant
    set status = 'no_show'
    where post_id = p_post_id and player_id = p_player_id;
  else
    update public.game_participant
    set status = 'accepted'
    where post_id = p_post_id and player_id = p_player_id;

    update public.match_participant mp
    set status = 'playing'
    from public.match m
    where m.match_id = mp.match_id and m.post_id = p_post_id and mp.player_id = p_player_id;
  end if;

  perform set_config('bsc.participant_action', '', true);
  perform set_config('bsc.suppress_notifications', '', true);

  if p_no_show then
    perform private.dispatch_notification(
      p_player_id, 'no_show',
      'You were marked as a no-show for ' || private.describe_game(p_post_id) || '.',
      'If this is wrong, report it from the game and an administrator will review it',
      p_post_id, null);
  end if;
end;
$$;

revoke all on function private.set_no_show(uuid, uuid, boolean) from public;

create or replace function public.mark_no_show(p_post_id uuid, p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.set_no_show(p_post_id, p_player_id, true);
$$;

create or replace function public.clear_no_show(p_post_id uuid, p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.set_no_show(p_post_id, p_player_id, false);
$$;

comment on function public.mark_no_show(uuid, uuid) is
  'BL-054. Host marks an accepted player absent: supabase.rpc(''mark_no_show'', '
  '{ p_post_id, p_player_id }). From the start until 48 hours after the game '
  'ends. Notifies the player; counts against reliability. The API spec''s '
  'matchId parameter is replaced by the game, where attendance belongs.';
comment on function public.clear_no_show(uuid, uuid) is
  'Undoes a mistaken no-show, within the same window.';

revoke all on function public.mark_no_show(uuid, uuid) from public;
revoke all on function public.clear_no_show(uuid, uuid) from public;
grant execute on function public.mark_no_show(uuid, uuid) to authenticated;
grant execute on function public.clear_no_show(uuid, uuid) to authenticated;

