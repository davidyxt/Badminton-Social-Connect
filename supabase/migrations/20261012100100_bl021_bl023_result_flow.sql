-- BL-021 and BL-023: record a result, the opponent confirms it, and the
-- server-side safeguards. Player BE-2, see
-- docs/features/M2-results-and-rankings.md.
--
--   submit_result    creates the match and a pending result in one call
--   confirm_result   the opposing side confirms; ratings follow overnight
--   get_match, get_my_pending_results, and matches[] in get_game_details
--
-- Matches are created here, from the players on the game's accepted roster.
-- That replaces create_match, which was removed on 2026-10-08.
-- raise_dispute, the unusual-pattern checks and expiry come in phase 4.
-- Confirmed singles results are rated by the nightly run (phase 3).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Hook that a later phase replaces
-- ---------------------------------------------------------------------------

create or replace function private.check_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;  -- unusual-pattern flags (BL-056) arrive in phase 4
end;
$$;

revoke all on function private.check_result(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Score rules
-- ---------------------------------------------------------------------------
-- Best of three games to 21, win by two, capped at 30. Returns the score as
-- display text and the games each side won, or raises.

create or replace function private.validate_games(p_games jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  g jsonb;
  i integer := 0;
  a integer;
  b integer;
  hi integer;
  lo integer;
  wa integer := 0;
  wb integer := 0;
  v_score text := '';
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array'
     or jsonb_array_length(p_games) not between 2 and 3
  then
    raise exception 'A match is two or three games, for example [[21,15],[19,21],[21,16]].'
      using errcode = '23514';
  end if;

  for g in select * from jsonb_array_elements(p_games) loop
    i := i + 1;

    if wa = 2 or wb = 2 then
      raise exception 'The match was already decided after game %.', i - 1
        using errcode = '23514';
    end if;

    if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) <> 2
       or jsonb_typeof(g -> 0) <> 'number' or jsonb_typeof(g -> 1) <> 'number'
       or (g ->> 0) !~ '^[0-9]{1,2}$' or (g ->> 1) !~ '^[0-9]{1,2}$'
    then
      raise exception 'Game % must be two whole numbers, your points then your opponent''s.', i
        using errcode = '23514';
    end if;

    a := (g ->> 0)::integer;
    b := (g ->> 1)::integer;
    hi := greatest(a, b);
    lo := least(a, b);

    if not ((hi = 21 and lo <= 19)
            or (hi between 22 and 29 and lo = hi - 2)
            or (hi = 30 and lo in (28, 29)))
    then
      raise exception 'Game % (% to %) is not a legal score: games go to 21, win by 2, capped at 30.',
        i, a, b using errcode = '23514';
    end if;

    if a > b then wa := wa + 1; else wb := wb + 1; end if;
    v_score := v_score || case when i > 1 then ' ' else '' end || a || '-' || b;
  end loop;

  if wa < 2 and wb < 2 then
    raise exception 'The games are one all, so a third game is needed.'
      using errcode = '23514';
  end if;

  return jsonb_build_object('score', v_score, 'winsA', wa, 'winsB', wb);
end;
$$;

revoke all on function private.validate_games(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. Helpers for the screens
-- ---------------------------------------------------------------------------

create or replace function private.match_side(p_match_id uuid, p_side text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.player_id,
           'name', p.username,
           'initials', private.initials(p.username),
           'profileImageUrl', private.avatar_url(p.player_id),
           'isDeleted', p.deleted_at is not null,
           'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
           'isMe', p.player_id = (select auth.uid()),
           'noShow', mp.status = 'no_show')
         order by p.username), '[]'::jsonb)
  from public.match_participant mp
  join public.player p on p.player_id = mp.player_id
  where mp.match_id = p_match_id and mp.side = p_side
    and not mp.player_id = any ((select private.blocked_me_ids())::uuid[]);
$$;

-- How far along a result is, for the verification badge (BL-057): pending,
-- verified, under_review (confirmed but flagged), disputed, expired, rejected.
create or replace function private.verification_status(p_result_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case r.status
           when 'confirmed' then
             case when exists (select 1 from public.result_flag f where f.result_id = r.result_id)
                  then 'under_review' else 'verified' end
           else r.status
         end
  from public.match_result r
  where r.result_id = p_result_id;
$$;

revoke all on function private.match_side(uuid, text) from public;
revoke all on function private.verification_status(uuid) from public;

-- One match as the screens want it: the sides, and the result with what the
-- caller can do about it.
create or replace function private.match_card(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  m public.match;
  r public.match_result;
  v_my_side text;
  v_sub_side text;
  v_open boolean;
begin
  select * into m from public.match where match_id = p_match_id;
  if m.match_id is null then
    return null;
  end if;

  select * into r from public.match_result
  where match_id = p_match_id order by created_at desc limit 1;

  select mp.side into v_my_side from public.match_participant mp
  where mp.match_id = p_match_id and mp.player_id = v_me;
  select mp.side into v_sub_side from public.match_participant mp
  where mp.match_id = p_match_id and mp.player_id = r.submitted_by;

  v_open := r.status = 'pending' and v_my_side is not null
            and v_sub_side is not null and v_my_side <> v_sub_side
            and now() < r.created_at + interval '7 days';

  return jsonb_build_object(
    'matchId', m.match_id,
    'gameId', m.post_id,
    'format', private.label(m.format),
    'formatValue', m.format,
    'playedAt', m.played_at,
    'location', coalesce((select v.name from public.venue v where v.venue_id = m.venue_id), m.suburb),
    'mySide', v_my_side,
    'sides', jsonb_build_object(
      'a', private.match_side(m.match_id, 'a'),
      'b', private.match_side(m.match_id, 'b')),
    'result', case when r.result_id is null then null else jsonb_build_object(
      'id', r.result_id,
      'status', r.status,
      'verificationStatus', private.verification_status(r.result_id),
      'score', r.score,
      'games', r.games,
      'winningSide', r.winning_side,
      'iWon', case when v_my_side is null then null else v_my_side = r.winning_side end,
      'submittedBy', (select jsonb_build_object('id', p.player_id, 'name', p.username,
                                                'initials', private.initials(p.username))
                      from public.player p where p.player_id = r.submitted_by),
      'submittedAt', r.created_at,
      'confirmedAt', r.confirmed_at,
      'expiresAt', case when r.status = 'pending' then r.created_at + interval '7 days' end,
      'canConfirm', v_open,
      'canDispute', v_open,
      'dispute', (select jsonb_build_object('id', d.dispute_id, 'reason', d.reason,
                                            'status', d.status, 'createdAt', d.created_at,
                                            'raisedByMe', d.raised_by = v_me)
                  from public.dispute d where d.result_id = r.result_id
                  order by d.created_at desc limit 1),
      'ratingChange', (select jsonb_build_object(
                         'before', round(h.rating_before)::int,
                         'after', round(h.rating_after)::int,
                         'change', round(h.rating_after)::int - round(h.rating_before)::int)
                       from public.rating_history h
                       where h.result_id = r.result_id and h.player_id = v_me),
      -- A confirmed singles result waiting for the nightly rating run: the
      -- screen says "Your rating updates overnight".
      'ratingPending', m.format = 'singles' and r.status = 'confirmed'
                       and not r.excluded_from_ranking
                       and not exists (select 1 from public.rating_history h
                                       where h.result_id = r.result_id)
    ) end
  );
end;
$$;

revoke all on function private.match_card(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. submit_result
-- ---------------------------------------------------------------------------

create or replace function public.submit_result(
  p_post_id uuid,
  p_opponent_ids uuid[],
  p_partner_id uuid,
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_post public.game_post;
  v_need integer;
  v_a uuid[];
  v_b uuid[];
  v_all uuid[];
  v_a_sorted uuid[];
  v_b_sorted uuid[];
  v_checked jsonb;
  v_match uuid;
  v_result uuid;
  v_name text;
  v_opp uuid;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  -- Two people submitting at once must not both get through the duplicate check.
  perform pg_advisory_xact_lock(hashtextextended('submit_result:' || p_post_id::text, 0));

  select * into v_post from public.game_post where post_id = p_post_id;

  if v_post.post_id is null or v_post.deleted_at is not null or v_post.status = 'cancelled' then
    raise exception 'Results can only be recorded for a game that went ahead.'
      using errcode = '23514';
  end if;

  if v_post.proposed_time > now() then
    raise exception 'This game has not started yet.' using errcode = '23514';
  end if;

  -- Who plays: you, plus a partner in doubles, against one or two opponents.
  v_need := case when v_post.format = 'singles' then 1 else 2 end;
  v_a := array_remove(array[v_me, p_partner_id], null);
  v_b := coalesce(p_opponent_ids, '{}');

  if cardinality(v_b) <> v_need
     or (v_need = 1 and p_partner_id is not null)
     or (v_need = 2 and p_partner_id is null)
  then
    if v_need = 1 then
      raise exception 'A singles result needs exactly one opponent and no partner.'
        using errcode = '23514';
    end if;
    raise exception 'A doubles result needs your partner and two opponents.'
      using errcode = '23514';
  end if;

  v_all := v_a || v_b;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then
    raise exception 'A player cannot appear twice in a match.' using errcode = '23514';
  end if;

  -- Everyone must be on the game's accepted roster (BL-023: only accepted games).
  if (select count(*) from public.game_participant gp
      where gp.post_id = p_post_id and gp.status = 'accepted'
        and gp.player_id = any (v_all)) <> cardinality(v_all)
  then
    raise exception 'Everyone in the match must be an accepted player in this game, including you.'
      using errcode = '42501';
  end if;

  v_checked := private.validate_games(p_games);

  select array_agg(x order by x) into v_a_sorted from unnest(v_a) x;
  select array_agg(x order by x) into v_b_sorted from unnest(v_b) x;

  -- The same two sides cannot be recorded twice in a game (BL-023). An
  -- expired or rejected result does not count, so it can be recorded again.
  if exists (
    select 1
    from public.match m
    join public.match_result r on r.match_id = m.match_id
                              and r.status in ('pending', 'confirmed', 'disputed')
    cross join lateral (
      select (select array_agg(mp.player_id order by mp.player_id)
              from public.match_participant mp where mp.match_id = m.match_id and mp.side = 'a') as sa,
             (select array_agg(mp.player_id order by mp.player_id)
              from public.match_participant mp where mp.match_id = m.match_id and mp.side = 'b') as sb
    ) s
    where m.post_id = p_post_id
      and ((s.sa = v_a_sorted and s.sb = v_b_sorted) or (s.sa = v_b_sorted and s.sb = v_a_sorted))
  ) then
    raise exception 'A result for these players has already been recorded in this game.'
      using errcode = '23505';
  end if;

  -- The trigger on match wants both sides full before it is completed, so the
  -- match is created in progress and completed once the players are in.
  insert into public.match (post_id, venue_id, created_by, format, played_at, suburb, status)
  values (p_post_id, v_post.venue_id, v_me, v_post.format, v_post.proposed_time,
          v_post.suburb, 'in_progress')
  returning match_id into v_match;

  insert into public.match_participant (match_id, player_id, side)
  select v_match, x, 'a' from unnest(v_a) x
  union all
  select v_match, x, 'b' from unnest(v_b) x;

  update public.match set status = 'completed' where match_id = v_match;

  -- The submitter's side is always side a; the games are written from their
  -- point of view, and the server (not the client) decides who won.
  insert into public.match_result (match_id, score, games, status, winning_side, submitted_by)
  values (v_match, v_checked ->> 'score', p_games, 'pending',
          case when (v_checked ->> 'winsA')::int > (v_checked ->> 'winsB')::int then 'a' else 'b' end,
          v_me)
  returning result_id into v_result;

  select p.username into v_name from public.player p where p.player_id = v_me;

  foreach v_opp in array v_b loop
    perform private.dispatch_notification(
      v_opp, 'result_submitted',
      v_name || ' submitted the result of your ' || private.label(v_post.format)
        || ' game: ' || (v_checked ->> 'score') || '.',
      'Confirm or dispute it within 7 days.', p_post_id, v_match);
  end loop;

  perform private.check_result(v_result);

  return jsonb_build_object('matchId', v_match, 'resultId', v_result, 'status', 'pending');
end;
$$;

comment on function public.submit_result(uuid, uuid[], uuid, jsonb) is
  'BL-021. A player records the result of a match played in a game: '
  'supabase.rpc(''submit_result'', { p_post_id, p_opponent_ids: [id], p_partner_id: null '
  '(doubles: your partner), p_games: [[21,15],[19,21],[21,16]] }). The games are your '
  'points then your opponent''s. Creates the match and a pending result, and tells the '
  'opponents. Everyone must be accepted in the game, the game must have started, the '
  'scores must be legal (to 21, win by 2, cap 30, best of three) and the same two sides '
  'cannot be recorded twice. Returns { matchId, resultId, status }.';

-- ---------------------------------------------------------------------------
-- 5. confirm_result
-- ---------------------------------------------------------------------------

create or replace function public.confirm_result(p_result_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  r public.match_result;
  v_post_id uuid;
  v_my_side text;
  v_sub_side text;
  v_name text;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  select * into r from public.match_result where result_id = p_result_id for update;

  select mp.side into v_my_side from public.match_participant mp
  where mp.match_id = r.match_id and mp.player_id = v_me;

  if r.result_id is null or v_my_side is null then
    raise exception 'Result not found, or you did not play in this match.'
      using errcode = '42501';
  end if;

  select mp.side into v_sub_side from public.match_participant mp
  where mp.match_id = r.match_id and mp.player_id = r.submitted_by;

  -- BL-023: nobody confirms their own result, or their partner's.
  if r.submitted_by = v_me or v_my_side = v_sub_side then
    raise exception 'Your opponent has to confirm this result, not your side.'
      using errcode = '42501';
  end if;

  if r.status = 'confirmed' then
    raise exception 'This result is already confirmed.' using errcode = '23514';
  elsif r.status = 'disputed' then
    raise exception 'This result is disputed, so an admin will decide it.' using errcode = '23514';
  elsif r.status = 'rejected' then
    raise exception 'This result was rejected by an admin.' using errcode = '23514';
  elsif r.status = 'expired' or now() >= r.created_at + interval '7 days' then
    raise exception 'This result has expired. Ask for it to be recorded again.'
      using errcode = '23514';
  end if;

  update public.match_result
  set status = 'confirmed', confirmed_by = v_me, confirmed_at = now()
  where result_id = p_result_id;

  update public.match set status = 'completed'
  where match_id = r.match_id and status <> 'completed';

  select m.post_id into v_post_id from public.match m where m.match_id = r.match_id;
  select p.username into v_name from public.player p where p.player_id = v_me;

  perform private.dispatch_notification(
    r.submitted_by, 'result_confirmed',
    v_name || ' confirmed your result: ' || r.score || '.',
    'Your rating updates overnight.', v_post_id, r.match_id);

  perform private.check_result(p_result_id);

  return private.match_card(r.match_id);
end;
$$;

comment on function public.confirm_result(uuid) is
  'BL-021. The opposing side confirms a pending result: '
  'supabase.rpc(''confirm_result'', { p_result_id }). Not the submitter or their partner, '
  'and only within 7 days. Ratings update overnight: until then a singles result '
  'has ratingPending true and ratingChange null. Returns the match as get_match does.';

-- ---------------------------------------------------------------------------
-- 6. Reading matches and results
-- ---------------------------------------------------------------------------

create or replace function public.get_match(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.match_card(p_match_id)
  where (select private.is_registered())
    and ((select private.is_match_participant(p_match_id)) or (select private.is_admin()));
$$;

comment on function public.get_match(uuid) is
  'Match Details, Result Submitted and Result Confirmed: supabase.rpc(''get_match'', '
  '{ p_match_id }). Keys: matchId, gameId, format, playedAt, location, mySide, '
  'sides { a: [players], b: [players] } and result (null until one is recorded): id, '
  'status, verificationStatus, score, games, winningSide, iWon, submittedBy, expiresAt, '
  'canConfirm, canDispute, dispute, ratingChange { before, after, change } (null until '
  'the nightly rating run), ratingPending (true for a confirmed singles result not rated '
  'yet: "Your rating updates overnight"). Null unless you played in the match.';

-- Results waiting on the caller, and results the caller's side is waiting on.
create or replace function public.get_my_pending_results()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.match_id, r.status, r.created_at,
           (select mp.side from public.match_participant mp
            where mp.match_id = r.match_id and mp.player_id = r.submitted_by) as sub_side,
           mm.side as my_side
    from public.match_result r
    join public.match_participant mm on mm.match_id = r.match_id
                                    and mm.player_id = (select auth.uid())
    where r.status in ('pending', 'disputed')
      and (select private.is_registered())
  )
  select jsonb_build_object(
    'toConfirm', coalesce((select jsonb_agg(private.match_card(match_id) order by created_at)
                           from mine
                           where status = 'pending' and my_side <> sub_side
                             and now() < created_at + interval '7 days'), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(private.match_card(match_id) order by created_at)
                         from mine
                         where my_side = sub_side
                           and (status = 'disputed' or now() < created_at + interval '7 days')),
                        '[]'::jsonb)
  );
$$;

comment on function public.get_my_pending_results() is
  'supabase.rpc(''get_my_pending_results''): { toConfirm: [match], waiting: [match] }. '
  'toConfirm are pending results your opponent submitted; waiting are results your side '
  'submitted that are pending or disputed. Each match is shaped as get_match returns it.';

-- The matches of a game that the caller played in (or all of them, for an admin).
create or replace function private.game_matches(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.match_card(m.match_id) order by m.created_at), '[]'::jsonb)
  from public.match m
  where m.post_id = p_post_id
    and ((select private.is_match_participant(m.match_id)) or (select private.is_admin()));
$$;

revoke all on function private.game_matches(uuid) from public;

revoke all on function public.submit_result(uuid, uuid[], uuid, jsonb) from public;
revoke all on function public.confirm_result(uuid) from public;
revoke all on function public.get_match(uuid) from public;
revoke all on function public.get_my_pending_results() from public;
grant execute on function public.submit_result(uuid, uuid[], uuid, jsonb) to authenticated;
grant execute on function public.confirm_result(uuid) to authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.get_my_pending_results() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_game_details lists the caller's matches again
-- ---------------------------------------------------------------------------
-- Same as before, with matches[] filled in and canRecordResult added.

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
               'isBlocked', p.player_id = any ((select private.blocked_by_me_ids())::uuid[]),
               -- Marked absent by the host (BL-054). Only the host sees these players.
               'noShow', x.status = 'no_show')
             order by (p.player_id is not distinct from v_post.organiser_id) desc, x.responded_at)
      from public.game_participant x
      join public.player p on p.player_id = x.player_id
      where x.post_id = p_post_id
        and (x.status = 'accepted'
             or (x.status = 'no_show' and (select private.can_manage_post(p_post_id))))
        -- BL-027: someone who blocked the caller is left off the list.
        and not x.player_id = any ((select private.blocked_me_ids())::uuid[])
    ), '[]'::jsonb),
    'canManage', (select private.can_manage_post(p_post_id)),
    -- What the host can do on this page right now, with the times the rules
    -- change. Null for everyone else.
    'hostActions', case when (select private.can_manage_post(p_post_id)) then jsonb_build_object(
      'canCancel', v_post.deleted_at is null and v_post.status in ('open', 'full')
                   and v_post.proposed_time > now() + interval '4 hours',
      'cancelClosesAt', v_post.proposed_time - interval '4 hours',
      'cancelIsLateFrom', v_post.proposed_time - interval '24 hours',
      'canDelete', v_post.deleted_at is null
                   and not private.game_has_happened(p_post_id)
                   and (v_post.status = 'cancelled' or v_post.proposed_time > now() + interval '4 hours')
                   and not private.game_has_other_players(p_post_id),
      'canMarkNoShows', v_post.deleted_at is null and v_post.status <> 'cancelled'
                        and now() >= v_post.proposed_time
                        and now() <= v_post.proposed_time + make_interval(mins => v_post.duration_minutes)
                                     + interval '48 hours',
      'noShowsOpenAt', v_post.proposed_time,
      'noShowsCloseAt', v_post.proposed_time + make_interval(mins => v_post.duration_minutes)
                        + interval '48 hours'
    ) end,
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
    -- The matches of this game that the caller played in, with their results.
    'matches', private.game_matches(p_post_id),
    -- True for an accepted player once the game has started: they can record
    -- a result against another accepted player.
    'canRecordResult', v_post.deleted_at is null and v_post.status <> 'cancelled'
                       and v_post.proposed_time <= now()
                       and exists (select 1 from public.game_participant x
                                   where x.post_id = p_post_id and x.status = 'accepted'
                                     and x.player_id = (select auth.uid()))
  );
end;
$function$;

comment on function public.get_game_details(uuid) is
  'Game Details: supabase.rpc(''get_game_details'', { p_post_id }). The game card plus '
  'host, players, canManage, hostActions, invite, and matches (the matches you played in, '
  'each shaped as get_match returns it) and canRecordResult.';

reset check_function_bodies;
