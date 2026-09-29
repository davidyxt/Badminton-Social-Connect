-- The game lifecycle: post, request to join, roster, then matches.
--
--   game_post          "doubles at Box Hill, Saturday, 4 places"
--     -> game_participant   players request, the organiser accepts or rejects
--        -> match           one or more matches played within that game
--           -> match_participant   drawn from the accepted roster, side a or b
--
-- Before this migration a match had no link to the post it came from, and
-- match_participant had no notion of sides, so a doubles match could not say
-- who partnered whom.

-- ---------------------------------------------------------------------------
-- 1. How many people a game is for
-- ---------------------------------------------------------------------------

alter table public.game_post
  add column player_limit integer not null default 4
    check (player_limit between 2 and 64);

comment on column public.game_post.player_limit is
  'Total places in the game, counting the organiser when an individual posts. '
  '"A game of 4" means four people on court, one of whom is the organiser.';

-- ---------------------------------------------------------------------------
-- 2. Requests to join, and the resulting roster
-- ---------------------------------------------------------------------------

create table public.game_participant (
  post_id uuid not null references public.game_post (post_id) on delete cascade,
  player_id uuid not null references public.player (player_id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'rejected', 'withdrawn')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (post_id, player_id)
);

comment on table public.game_participant is
  'One row per player who asked to join a game. The accepted rows are the '
  'roster that matches are drawn from. The primary key means a player cannot '
  'request the same game twice.';

create index game_participant_player_id_idx on public.game_participant (player_id);
create index game_participant_roster_idx
  on public.game_participant (post_id)
  where status = 'accepted';

-- An individual who posts a game is playing in it, so they take one of the
-- places straight away. A club post has no such person: all places are open.
create or replace function private.handle_new_game_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organiser_id is not null then
    insert into public.game_participant (post_id, player_id, status, responded_at)
    values (new.post_id, new.organiser_id, 'accepted', now())
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_game_post_created
  after insert on public.game_post
  for each row execute function private.handle_new_game_post();

-- A game cannot accept more players than it has places. Checked here rather
-- than in a check constraint because it counts other rows in the table.
create or replace function private.enforce_game_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_taken integer;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select gp.player_limit into v_limit
  from public.game_post gp
  where gp.post_id = new.post_id;

  select count(*) into v_taken
  from public.game_participant p
  where p.post_id = new.post_id
    and p.status = 'accepted'
    and p.player_id <> new.player_id;

  if v_taken >= v_limit then
    raise exception 'game % is full: % of % places already taken',
      new.post_id, v_taken, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger game_participant_capacity
  before insert or update on public.game_participant
  for each row execute function private.enforce_game_capacity();

-- ---------------------------------------------------------------------------
-- 3. Matches belong to a game
-- ---------------------------------------------------------------------------

alter table public.match
  add column post_id uuid references public.game_post (post_id) on delete cascade;

comment on column public.match.post_id is
  'The game this match was played within. Null for a league fixture or a '
  'one-off match that did not come from a post. A single game usually holds '
  'several matches.';

create index match_post_id_idx on public.match (post_id);

-- ---------------------------------------------------------------------------
-- 4. Sides
-- ---------------------------------------------------------------------------

alter table public.match_participant
  add column side text not null default 'a' check (side in ('a', 'b'));

-- The default exists only so the column can be added as NOT NULL. Every caller
-- must state the side explicitly from here on.
alter table public.match_participant
  alter column side drop default;

comment on column public.match_participant.side is
  'Which half of the net. Singles allows one player per side, doubles two. '
  'Enforced by the match_participant_validate trigger.';

-- Accepting or declining now happens on game_participant, so what is left to
-- record here is whether the player turned up.
update public.match_participant
set status = case status
  when 'invited'   then 'playing'
  when 'confirmed' then 'playing'
  when 'played'    then 'playing'
  when 'declined'  then 'withdrawn'
  else status
end;

alter table public.match_participant
  drop constraint match_participant_status_check;

alter table public.match_participant
  alter column status set default 'playing';

alter table public.match_participant
  add constraint match_participant_status_check
    check (status in ('playing', 'no_show', 'withdrawn'));

-- ---------------------------------------------------------------------------
-- 5. A doubles match is won by a side, not by a person
-- ---------------------------------------------------------------------------
-- winner_id could only ever name one of the two winners of a doubles match.

alter table public.match_result
  drop column winner_id;

alter table public.match_result
  add column winning_side text check (winning_side in ('a', 'b'));

alter table public.match_result
  add constraint match_result_confirmed_has_winner
    check (status <> 'confirmed' or winning_side is not null);

comment on column public.match_result.winning_side is
  'Which side won, matching match_participant.side. A result cannot be '
  'confirmed without one.';

-- ---------------------------------------------------------------------------
-- 6. Who may be put into a match, and on which side
-- ---------------------------------------------------------------------------

create or replace function private.validate_match_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
  v_format text;
  v_max_per_side integer;
  v_on_side integer;
begin
  select m.post_id, m.format into v_post_id, v_format
  from public.match m
  where m.match_id = new.match_id;

  -- A match played within a game can only involve that game's roster.
  if v_post_id is not null
     and not exists (
       select 1
       from public.game_participant gp
       where gp.post_id = v_post_id
         and gp.player_id = new.player_id
         and gp.status = 'accepted'
     )
  then
    raise exception 'player % is not on the accepted roster for game %',
      new.player_id, v_post_id
      using errcode = 'check_violation';
  end if;

  v_max_per_side := case when v_format = 'singles' then 1 else 2 end;

  select count(*) into v_on_side
  from public.match_participant mp
  where mp.match_id = new.match_id
    and mp.side = new.side
    and mp.player_id <> new.player_id;

  if v_on_side >= v_max_per_side then
    raise exception 'side % of this % match already holds % player(s)',
      new.side, v_format, v_on_side
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger match_participant_validate
  before insert or update on public.match_participant
  for each row execute function private.validate_match_participant();

-- Sides may be filled one player at a time, so the "exactly N per side" rule
-- is only applied at the point it has to hold: when the match is completed.
create or replace function private.validate_match_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_needed integer;
  v_a integer;
  v_b integer;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  v_needed := case when new.format = 'singles' then 1 else 2 end;

  select
    count(*) filter (where mp.side = 'a'),
    count(*) filter (where mp.side = 'b')
  into v_a, v_b
  from public.match_participant mp
  where mp.match_id = new.match_id;

  if v_a <> v_needed or v_b <> v_needed then
    raise exception
      'a completed % match needs % player(s) per side, found % and %',
      new.format, v_needed, v_a, v_b
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger match_completion_validate
  before insert or update on public.match
  for each row execute function private.validate_match_completion();

-- ---------------------------------------------------------------------------
-- 7. RLS helpers for the new relationships
-- ---------------------------------------------------------------------------

create or replace function private.can_manage_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_post gp
    where gp.post_id = p_post_id
      and (
        gp.organiser_id = (select auth.uid())
        or (select private.can_post_for_club(gp.organiser_club_id))
      )
  );
$$;

comment on function private.can_manage_post(uuid) is
  'True for the individual who posted the game, or for a representative of the '
  'club that posted it.';

create or replace function private.is_game_participant(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_participant gp
    where gp.post_id = p_post_id
      and gp.player_id = (select auth.uid())
      and gp.status = 'accepted'
  );
$$;

-- Whoever organises the game can now manage the matches played within it.
create or replace function private.can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match m
    left join public.mini_league l on l.league_id = m.league_id
    where m.match_id = p_match_id
      and (
        m.created_by = (select auth.uid())
        or l.organiser_id = (select auth.uid())
        or (select private.can_manage_post(m.post_id))
      )
  );
$$;

revoke all on function private.can_manage_post(uuid) from public;
revoke all on function private.is_game_participant(uuid) from public;
grant execute on function private.can_manage_post(uuid) to authenticated;
grant execute on function private.is_game_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS on game_participant
-- ---------------------------------------------------------------------------

alter table public.game_participant enable row level security;

-- The accepted line-up is public so the board can show "3 of 4 places taken".
-- A pending or rejected request is visible only to the player who made it and
-- to the organiser, so nobody has to see that they were turned down in public.
create policy "game_participant: roster is public, requests are private"
  on public.game_participant for select to authenticated
  using (
    status = 'accepted'
    or player_id = (select auth.uid())
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

create policy "game_participant: ask to join"
  on public.game_participant for insert to authenticated
  with check (
    (
      player_id = (select auth.uid())
      -- You may ask. You may not let yourself in.
      and status = 'requested'
    )
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

create policy "game_participant: organiser decides, player may withdraw"
  on public.game_participant for update to authenticated
  using (
    player_id = (select auth.uid())
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  )
  with check (
    (
      player_id = (select auth.uid())
      and status in ('requested', 'withdrawn')
    )
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

create policy "game_participant: cancel a request"
  on public.game_participant for delete to authenticated
  using (
    player_id = (select auth.uid())
    or (select private.can_manage_post(post_id))
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 9. Creating matches within a game
-- ---------------------------------------------------------------------------

drop policy "match: create as self, league matches by the organiser" on public.match;

-- Anyone on the roster can record a match, not just the organiser. At a
-- session with two courts running, making one person record everything does
-- not survive contact with reality.
create policy "match: record one in a game you are in, or a league you run"
  on public.match for insert to authenticated
  with check (
    (
      (select auth.uid()) = created_by
      and (
        post_id is null
        or (select private.is_game_participant(post_id))
        or (select private.can_manage_post(post_id))
      )
      and (
        league_id is null
        or (select private.is_league_organiser(league_id))
      )
    )
    or (select private.is_admin())
  );
