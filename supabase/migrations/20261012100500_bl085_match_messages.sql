-- BL-085: preset status messages between the players in a match.
-- Player BE-2, see docs/features/M2-results-and-rankings.md.
--
-- No free text: template_code must be one of match_message_template. Only the
-- players in the match can send or read a message, and each new one is
-- broadcast on the private Realtime channel match:{matchId}:messages.
--
-- A match exists once a result is recorded for it (submit_result), so
-- messages belong to matches that already have one.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Who may read and write
-- ---------------------------------------------------------------------------

create policy "match_message: the players in the match read them"
  on public.match_message for select to authenticated
  using ((select private.is_match_participant(match_id)));

create policy "match_message: send as yourself, as a player in the match"
  on public.match_message for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_registered())
    and (select private.is_match_participant(match_id))
  );

revoke update, delete on public.match_message from anon, authenticated;

comment on policy "match_message: send as yourself, as a player in the match"
  on public.match_message is
  'Send with supabase.from(''match_message'').insert({ match_id, sender_id, template_code }).';

-- A little protection against someone filling the other player's screen.
create or replace function private.limit_match_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.match_message x
      where x.match_id = new.match_id and x.sender_id = new.sender_id
        and x.created_at > now() - interval '10 minutes') >= 20
  then
    raise exception 'Too many messages. Wait a few minutes.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger match_message_limit
  before insert on public.match_message
  for each row execute function private.limit_match_messages();

-- ---------------------------------------------------------------------------
-- 2. Realtime: match:{matchId}:messages
-- ---------------------------------------------------------------------------

create or replace function private.broadcast_match_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.message_id,
      'matchId', new.match_id,
      'senderId', new.sender_id,
      'senderName', (select p.username from public.player p where p.player_id = new.sender_id),
      'templateCode', new.template_code,
      'label', (select t.label from public.match_message_template t
                where t.template_code = new.template_code),
      'createdAt', new.created_at),
    'message',
    'match:' || new.match_id::text || ':messages',
    true);
  return null;
end;
$$;

create trigger match_message_broadcast
  after insert on public.match_message
  for each row execute function private.broadcast_match_message();

-- Only the players in the match can listen to its channel.
create policy "match_message: players in the match listen to its channel"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and case
          when (select realtime.topic()) ~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:messages$'
          then (select private.is_match_participant(split_part((select realtime.topic()), ':', 2)::uuid))
          else false
        end
  );

revoke all on function private.limit_match_messages() from public;
revoke all on function private.broadcast_match_message() from public;

-- ---------------------------------------------------------------------------
-- 3. Reading the conversation
-- ---------------------------------------------------------------------------

create or replace function public.get_match_messages(p_match_id uuid, p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.msg order by x.created_at), '[]'::jsonb)
  from (
    select mm.created_at,
           jsonb_build_object(
             'id', mm.message_id,
             'senderId', mm.sender_id,
             'senderName', p.username,
             'isMe', mm.sender_id = (select auth.uid()),
             'templateCode', mm.template_code,
             'label', t.label,
             'createdAt', mm.created_at) as msg
    from public.match_message mm
    join public.match_message_template t on t.template_code = mm.template_code
    join public.player p on p.player_id = mm.sender_id
    where mm.match_id = p_match_id
      and (select private.is_registered())
      and (select private.is_match_participant(p_match_id))
      -- A player who blocked you is not heard from.
      and not mm.sender_id = any ((select private.blocked_me_ids())::uuid[])
    order by mm.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) x;
$$;

comment on function public.get_match_messages(uuid, integer) is
  'BL-085. The preset messages in a match, oldest first: supabase.rpc(''get_match_messages'', '
  '{ p_match_id, p_limit }). Each has id, senderId, senderName, isMe, templateCode, label, '
  'createdAt. Empty unless you played in the match. The labels to offer come from '
  'match_message_template. Live messages arrive on the private Realtime channel '
  'match:{matchId}:messages (event ''message'', same fields).';

revoke all on function public.get_match_messages(uuid, integer) from public;
grant execute on function public.get_match_messages(uuid, integer) to authenticated;

reset check_function_bodies;
