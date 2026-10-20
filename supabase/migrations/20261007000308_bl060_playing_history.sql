-- BL-060: playing history on profiles.
--
-- get_player_history lists a player's verified matches, newest first, for
-- the history section of the Player Profile screen (BL-061): date, format,
-- result, score, opponents and partner. Games played, wins, losses, recent
-- form and reliability are already in get_player_profile (BL-019, BL-052).
--
-- Only confirmed results that still count towards rankings are listed. The
-- same privacy rules as the profile apply, and someone who has blocked the
-- viewer appears as "Player" with no id.
--
-- Rating trend over time waits for the rating calculation (BL-024).

create or replace function public.get_player_history(
  p_player_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocked_me uuid[] := private.blocked_me_ids();
  v_blocked_by_me uuid[] := private.blocked_by_me_ids();
begin
  if not (select private.can_see_profile(p_player_id)) then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(entry order by played desc)
    from (
      select
        coalesce(m.played_at, m.created_at) as played,
        jsonb_build_object(
          'matchId', m.match_id,
          'gameId', m.post_id,
          'playedAt', coalesce(m.played_at, m.created_at),
          'date', to_char(coalesce(m.played_at, m.created_at) at time zone 'Australia/Melbourne', 'Dy FMDD Mon YYYY'),
          'format', private.label(m.format),
          'location', coalesce(m.suburb, gp.suburb),
          'result', case when r.winning_side = me.side then 'W' else 'L' end,
          'score', r.score,
          'opponents', coalesce((
            select jsonb_agg(private.history_person(o.player_id, v_blocked_me, v_blocked_by_me))
            from public.match_participant o
            where o.match_id = m.match_id and o.side <> me.side
          ), '[]'::jsonb),
          'partner', (
            select private.history_person(pt.player_id, v_blocked_me, v_blocked_by_me)
            from public.match_participant pt
            where pt.match_id = m.match_id and pt.side = me.side and pt.player_id <> p_player_id
            limit 1
          )
        ) as entry
      from public.match_participant me
      join public.match m on m.match_id = me.match_id
      join public.match_result r
        on r.match_id = m.match_id and r.status = 'confirmed' and not r.excluded_from_ranking
      left join public.game_post gp on gp.post_id = m.post_id
      where me.player_id = p_player_id
      order by coalesce(m.played_at, m.created_at) desc
      limit least(greatest(coalesce(p_limit, 10), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) h
  ), '[]'::jsonb);
end;
$$;

-- One person in a history entry, with block rules applied.
create or replace function private.history_person(
  p_player_id uuid, p_blocked_me uuid[], p_blocked_by_me uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_player_id = any (p_blocked_me)
      then jsonb_build_object('id', null, 'name', 'Player', 'initials', 'P', 'isBlocked', false)
    else jsonb_build_object(
      'id', p.player_id, 'name', p.username, 'initials', private.initials(p.username),
      'isBlocked', p_player_id = any (p_blocked_by_me))
  end
  from public.player p where p.player_id = p_player_id;
$$;

revoke all on function private.history_person(uuid, uuid[], uuid[]) from public;

comment on function public.get_player_history(uuid, integer, integer) is
  'BL-060. supabase.rpc(''get_player_history'', { p_player_id, p_limit, '
  'p_offset }): verified matches, newest first, each with date, format, '
  'location, result (W/L), score, opponents and partner. Null when the '
  'profile is private to the caller.';

revoke all on function public.get_player_history(uuid, integer, integer) from public;
grant execute on function public.get_player_history(uuid, integer, integer) to authenticated;
