-- BL-050: notifications for requests and acceptances, delivered live.
--
--   * private.dispatch_notification is the single place a notification is
--     written (TDD: dispatch_notification). Email (BL-087) hangs off the same
--     insert, so nothing else needs to change for it.
--   * Triggers on game_participant notify the host of a new request or a
--     withdrawal, and the player when their request is accepted or declined.
--   * Notifications carry the game and match they are about, plus a second
--     line, matching the Notifications screen (title, message, target).
--   * The notification table joins the supabase_realtime publication, so the
--     app can subscribe instead of polling. RLS still applies: a player only
--     receives their own rows.
--   * get_notifications and mark_all_notifications_read serve the screen.
-- League notifications are added when Mini Leagues is built (Should Have).

-- ---------------------------------------------------------------------------
-- 1. Columns and types
-- ---------------------------------------------------------------------------

alter table public.notification
  add column post_id uuid references public.game_post (post_id) on delete cascade,
  add column detail text check (length(detail) <= 300);

create index notification_post_id_idx on public.notification (post_id);

comment on column public.notification.message is
  'The main line, e.g. "alice accepted your request to join Singles game on Sat 10 Oct, 6:00 PM in Carlton."';
comment on column public.notification.detail is
  'Optional second line, e.g. "Tap to view the game".';
comment on column public.notification.post_id is
  'The game this is about, so the app can open it. Null for system messages.';

alter table public.notification
  drop constraint notification_type_check,
  add constraint notification_type_check check (type in (
    'match_reminder', 'match_invite', 'result_submitted', 'dispute_update',
    'league_update', 'system', 'game_cancelled', 'game_removed',
    'join_request', 'request_accepted', 'request_declined', 'request_withdrawn'
  ));

-- ---------------------------------------------------------------------------
-- 2. The single place notifications are written
-- ---------------------------------------------------------------------------

create or replace function private.dispatch_notification(
  p_player_id uuid,
  p_type text,
  p_message text,
  p_detail text default null,
  p_post_id uuid default null,
  p_match_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Changes made while blocking someone are silent, so a block is never
  -- announced (see block_player).
  if current_setting('bsc.suppress_notifications', true) = 'on' then
    return;
  end if;

  insert into public.notification (player_id, type, message, detail, post_id, match_id)
  values (p_player_id, p_type, p_message, p_detail, p_post_id, p_match_id);
end;
$$;

comment on function private.dispatch_notification(uuid, text, text, text, uuid, uuid) is
  'Writes one notification. Every notification goes through here, so wording '
  'and suppression live in one place, and the email webhook (BL-087) sees '
  'every one.';

revoke all on function private.dispatch_notification(uuid, text, text, text, uuid, uuid) from public;

-- Cancel and delete (BL-013) now go through dispatch too, with the game attached.
create or replace function private.notify_game_players(
  p_post_id uuid, p_type text, p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select gpp.player_id
    from public.game_participant gpp
    where gpp.post_id = p_post_id
      and gpp.status in ('requested', 'accepted')
      and gpp.player_id is distinct from (select auth.uid())
  loop
    perform private.dispatch_notification(
      r.player_id, p_type, p_message,
      case p_type when 'game_cancelled' then 'Find another game or post your own' end,
      p_post_id, null
    );
  end loop;
end;
$$;

-- Who hosts a game: the organiser, or every admin of the club that posted it.
create or replace function private.game_hosts(p_post_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gp.organiser_id
  from public.game_post gp
  where gp.post_id = p_post_id and gp.organiser_id is not null
  union
  select cr.player_id
  from public.game_post gp
  join public.club_representative cr on cr.club_id = gp.organiser_club_id
  where gp.post_id = p_post_id and cr.role = 'admin' and cr.status = 'approved';
$$;

revoke all on function private.game_hosts(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Requests, acceptances, declines, withdrawals
-- ---------------------------------------------------------------------------

create or replace function private.notify_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game text := private.describe_game(new.post_id);
  v_name text := (select p.username from public.player p where p.player_id = new.player_id);
  v_match uuid := (select m.match_id from public.match m where m.post_id = new.post_id order by m.created_at limit 1);
  v_host uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- The organiser's own roster row is not news.
  if new.player_id in (select private.game_hosts(new.post_id)) then
    return new;
  end if;

  if new.status = 'requested' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'join_request',
        v_name || ' asked to join your ' || v_game || '.',
        'Tap to review the request', new.post_id, null);
    end loop;

  elsif new.status = 'accepted' then
    perform private.dispatch_notification(
      new.player_id, 'request_accepted',
      'Your request to join ' || v_game || ' was accepted.',
      'Tap to view match details', new.post_id, v_match);

  elsif new.status = 'rejected' then
    perform private.dispatch_notification(
      new.player_id, 'request_declined',
      'Your request to join ' || v_game || ' was declined.',
      'Find another game or post your own', new.post_id, null);

  elsif new.status = 'withdrawn' then
    for v_host in select private.game_hosts(new.post_id) loop
      perform private.dispatch_notification(
        v_host, 'request_withdrawn',
        v_name || ' withdrew from your ' || v_game || '.',
        case when old.status = 'accepted' then 'A place has opened up' end,
        new.post_id, null);
    end loop;
  end if;

  return new;
end;
$$;

comment on function private.notify_participant_change() is
  'BL-050: host hears about requests and withdrawals; the player hears about '
  'acceptance and decline. Runs after the match is created, so an acceptance '
  'can link straight to it.';

-- Named to sort after game_participant_first_acceptance, so the match exists.
create trigger game_participant_notify
  after insert or update of status on public.game_participant
  for each row execute function private.notify_participant_change();

-- ---------------------------------------------------------------------------
-- 4. Blocking stays silent
-- ---------------------------------------------------------------------------
-- block_player closes requests between the two players. Those changes must
-- not notify anyone, or the blocked player would learn about the block.
-- Same function as bl027_blocking, plus the two set_config lines.

create or replace function public.block_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot block yourself.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.player where player_id = p_player_id) then
    raise exception 'Player not found.' using errcode = '42501';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_me, p_player_id)
  on conflict do nothing;

  perform set_config('bsc.suppress_notifications', 'on', true);

  update public.game_participant x
  set status = 'rejected'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = v_me
    and x.player_id = p_player_id
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  update public.game_participant x
  set status = 'withdrawn'
  from public.game_post gp
  where gp.post_id = x.post_id
    and gp.organiser_id = p_player_id
    and x.player_id = v_me
    and x.status in ('requested', 'accepted')
    and gp.deleted_at is null and gp.status in ('open', 'full') and gp.proposed_time > now();

  perform set_config('bsc.suppress_notifications', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Live delivery
-- ---------------------------------------------------------------------------
-- supabase.channel('notifications').on('postgres_changes', { event: 'INSERT',
-- schema: 'public', table: 'notification', filter: `player_id=eq.${me}` }, ...)
-- RLS ("notification: read own") decides what each subscriber receives.

alter publication supabase_realtime add table public.notification;

-- ---------------------------------------------------------------------------
-- 6. The Notifications screen
-- ---------------------------------------------------------------------------

create or replace function public.get_notifications(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.notification_id,
           'type', n.type,
           'title', n.message,
           'message', n.detail,
           'createdAt', n.created_at,
           'unread', not n.is_read,
           'postId', n.post_id,
           'matchId', n.match_id)
         order by n.created_at desc), '[]'::jsonb)
  from (
    select * from public.notification
    where player_id = (select auth.uid())
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) n;
$$;

comment on function public.get_notifications(integer, integer) is
  'Notifications screen: newest first, with the screen''s keys (title, '
  'message, unread, createdAt) plus postId / matchId for the tap target. '
  'Runs with the caller''s rights, so RLS limits it to their own.';

create or replace function public.mark_all_notifications_read()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.notification set is_read = true
    where player_id = (select auth.uid()) and not is_read
    returning 1
  )
  select count(*)::integer from updated;
$$;

comment on function public.mark_all_notifications_read() is
  'Marks all the caller''s notifications read and returns how many changed.';

revoke all on function public.get_notifications(integer, integer) from public;
revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.get_notifications(integer, integer) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
