-- Bulk mock data for the LOCAL database: a realistic amount of every case the
-- app has, on top of the dev seed. Run it with mock_data.py, which resets the
-- database first and passes the sizes:
--
--   python3 supabase/seeds/scripts/mock_data.py [--players 150] [--games 300] [--seed 42]
--
-- psql variables: players, games, seed (a number between -1 and 1).
--
-- What it makes (about, at the default size):
--   players   150 (mock001@example.com ... password Passw0rd!), across VIC,
--             NSW, QLD, WA, SA and ACT; a few signed up with Google but never
--             finished registering; a few hidden profiles; a few deleted
--             accounts ("Deleted User") at the end
--   groups    12, with admins, members and pending join requests; one or two
--             inactive
--   games     60% in the past, 40% upcoming:
--             past      completed singles, doubles and mixed doubles, small
--                       games and group sessions; cancelled (some late);
--                       no-shows, late withdrawals, declined requests; a few
--                       deleted by an admin
--             upcoming  open with places, full, only the host so far; requests
--                       waiting, accepted, declined, withdrawn, with messages;
--                       Request Game invitations (waiting, accepted,
--                       declined); cancelled; removed by the host; group games
--   results   recorded through submit_result, confirm_result and
--             raise_dispute as the players: confirmed, pending (recent games
--             only), disputed, expired, rejected by an admin, never recorded;
--             flags for admins; then every rating is replayed
--   also      blocks and reports (through the real functions), mini leagues
--             and standings, quick messages, check-ins, notifications of
--             every type (some read), admin posts
--
-- Upcoming games are written with every trigger on, the way the dev seed's
-- 03_upcoming_games.sql does: with no signed-in user the game triggers trust
-- the caller, and each request, acceptance or cancellation sends its real
-- notification. Past games cannot be posted through the app, so they are
-- written with triggers off, as 04_past_games.sql does.

\set ON_ERROR_STOP on
\pset footer off

\o /dev/null
select set_config('mock.players', :'players', false), set_config('mock.games', :'games', false);
select setseed(:seed);
\o

-- ---------------------------------------------------------------------------
-- Helpers (this session only)
-- ---------------------------------------------------------------------------

create function pg_temp.pick(a anyarray) returns anyelement
language sql volatile as $$
  select a[1 + floor(random() * cardinality(a))::int];
$$;

-- Weighted pick: wpick(array['a','b'], array[3,1]) gives 'a' three times as often.
create function pg_temp.wpick(a text[], w float8[]) returns text
language plpgsql volatile as $$
declare
  v_total float8 := 0;
  v_r float8;
  i int;
begin
  for i in 1 .. cardinality(w) loop v_total := v_total + w[i]; end loop;
  v_r := random() * v_total;
  for i in 1 .. cardinality(w) loop
    v_r := v_r - w[i];
    if v_r <= 0 then return a[i]; end if;
  end loop;
  return a[cardinality(a)];
end;
$$;

create function pg_temp.rint(lo int, hi int) returns int
language sql volatile as $$
  select lo + floor(random() * (hi - lo + 1))::int;
$$;

-- A Melbourne clock time p_days from today: melb(-3, 1110) is 6:30 pm three days ago.
create function pg_temp.melb(p_days int, p_minutes int) returns timestamptz
language sql stable as $$
  select (date_trunc('day', now() at time zone 'Australia/Melbourne')
          + make_interval(days => p_days, mins => p_minutes)) at time zone 'Australia/Melbourne';
$$;

-- Who the next function call runs as. as_system clears it: the game triggers
-- then trust the caller, as they do for the dev seed.
create function pg_temp.as_user(p_id uuid) returns void
language sql volatile as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_admin() returns void
language sql volatile as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', '00000000-0000-0000-0000-00000000a000',
                                      'role', 'authenticated',
                                      'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;

create function pg_temp.as_system() returns void
language sql volatile as $$
  select set_config('request.jwt.claims', '', true);
$$;

-- A legal best-of-three score, side a points first. p_a is the chance side a
-- wins any one game.
create function pg_temp.score(p_a float8) returns jsonb
language plpgsql volatile as $$
declare
  g jsonb := '[]'::jsonb;
  wa int := 0;
  wb int := 0;
  w int;
  l int;
  r float8;
begin
  while wa < 2 and wb < 2 loop
    r := random();
    if r < 0.04 then
      w := 21; l := floor(random() * 4)::int;           -- 21-0 to 21-3
    elsif r < 0.74 then
      w := 21; l := 4 + floor(random() * 16)::int;      -- 21-4 to 21-19
    elsif r < 0.96 then
      l := 20 + floor(random() * 8)::int; w := l + 2;   -- 22-20 to 29-27
    else
      w := 30; l := 28 + floor(random() * 2)::int;      -- 30-28, 30-29
    end if;
    if random() < p_a then
      g := g || jsonb_build_array(jsonb_build_array(w, l)); wa := wa + 1;
    else
      g := g || jsonb_build_array(jsonb_build_array(l, w)); wb := wb + 1;
    end if;
  end loop;
  return g;
end;
$$;

create temp table mock_player (
  n int primary key,
  id uuid not null unique,
  email text not null,
  username text,
  first_name text,
  last_name text,
  state text,
  suburb text,
  skill float8,      -- hidden true skill, drives who wins
  band text,         -- what they told us at sign-up (not always right)
  kind text,         -- player | unregistered | leaving (deleted at the end)
  activity float8    -- regulars (6) play far more often than the rest (1)
);

create temp table mock_group (n int, id uuid, state text, suburb text, deactivate boolean);

create temp table mock_game (
  id uuid primary key, past boolean, format text, state text, played_at timestamptz,
  status text, group_id uuid, organiser uuid, player_limit int
);

create temp table mock_match (
  result_id uuid, match_id uuid, post_id uuid, played_at timestamptz, outcome text
);

create temp table mock_venue as
select v.venue_id, s.name as suburb, s.state_code as state
from public.venue v join public.suburb s on s.suburb_id = v.suburb_id
where v.name not like '%(dev)%';

-- ---------------------------------------------------------------------------
-- 1. Players
-- ---------------------------------------------------------------------------
\echo '1/8 players'

do $$
declare
  v_n int := current_setting('mock.players')::int;
  firsts text[] := array['Liam','Olivia','Noah','Charlotte','Jack','Amelia','William','Isla',
    'Oliver','Mia','Lucas','Ava','Leo','Zoe','Ethan','Chloe','Ryan','Sarah','Daniel','Hannah',
    'Kevin','Michelle','Tom','Emily','Sam','Ruby','Nathan','Ella','Ben','Lily','Matt','Jess',
    'Chris','Kate','Tim','Anna','Wei','Mei','Jun','Xin','Hiroshi','Yuki','Kenji','Aiko','Arjun',
    'Priya','Rohan','Ananya','Raj','Nisha','Minh','Linh','Thanh','Huong','Tuan','Duc','Jiwoo',
    'Seoyeon','Ahmed','Fatima','Omar','Layla','Mateo','Sofia','Lucia','Diego','Kai','Aroha'];
  lasts text[] := array['Nguyen','Tran','Le','Pham','Chen','Wang','Li','Zhang','Liu','Wong',
    'Lee','Kim','Park','Singh','Patel','Sharma','Kumar','Smith','Jones','Williams','Brown',
    'Wilson','Taylor','Anderson','Thompson','White','Martin','Harris','Kelly','Murphy','Ryan',
    'OBrien','Walsh','Rossi','Russo','Papadopoulos','Haddad','Khan','Ali','Tanaka','Sato',
    'Suzuki','Yamamoto','Garcia','Lopez','Santos','Silva','Costa','Novak','Kowalczyk','Muller',
    'Schmidt','Hansen','Clarke','Lewis','Walker','Hall','Young','Ngata','Tupou'];
  vic_near text[] := array['Carlton','Clayton','Box Hill','Brunswick','Footscray','Richmond',
    'Doncaster','Glen Waverley','Preston','Dandenong','Frankston','Werribee','Albert Park','Southbank'];
  v_first text;
  v_last text;
  v_base text;
  v_user text;
  v_k int;
  v_state text;
  v_suburb text;
  v_skill float8;
  v_seen float8;
  i int;
begin
  for i in 1 .. v_n loop
    v_first := pg_temp.pick(firsts);
    v_last := pg_temp.pick(lasts);
    v_base := left(lower(v_first) || pg_temp.pick(array['', '.', '_', '']) || lower(v_last), 16);
    if random() < 0.25 then
      v_base := left(lower(v_first) || pg_temp.rint(1, 99), 16);
    end if;
    v_user := v_base;
    v_k := 1;
    while exists (select 1 from mock_player m where lower(m.username) = lower(v_user))
       or exists (select 1 from public.player p where lower(p.username) = lower(v_user)) loop
      v_k := v_k + 1;
      v_user := v_base || v_k;
    end loop;

    v_state := pg_temp.wpick(array['VIC','NSW','QLD','WA','SA','ACT'], array[68,15,10,3,2,2]);
    if v_state = 'VIC' and random() < 0.7 then
      v_suburb := pg_temp.pick(vic_near);
    else
      select mv.suburb into v_suburb from mock_venue mv where mv.state = v_state
      order by random() limit 1;
    end if;

    -- Skill around 1500; what they tell us at sign-up is close, not exact.
    v_skill := 1500 + 260 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random());
    v_seen := v_skill + 160 * (random() - 0.5) * 2;

    insert into mock_player (n, id, email, username, first_name, last_name, state, suburb, skill, band, kind, activity)
    values (i, gen_random_uuid(), 'mock' || lpad(i::text, 3, '0') || '@example.com', v_user,
            v_first, v_last, v_state, v_suburb, v_skill,
            case when v_seen < 1200 then 'beginner' when v_seen < 1400 then 'lower_intermediate'
                 when v_seen < 1600 then 'intermediate' when v_seen < 1800 then 'upper_intermediate'
                 else 'advanced' end,
            case when i % 40 = 7 then 'unregistered' when i % 50 = 13 then 'leaving' else 'player' end,
            case when random() < 0.25 then 6 else 1 end);
  end loop;
end;
$$;

-- Accounts. Inserting into auth.users runs the sign-up trigger, which creates
-- the player rows and, with a date of birth, passes the age gate (see
-- 01_accounts.sql). The unregistered ones signed up with Google: no username,
-- no date of birth.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', m.id, 'authenticated', 'authenticated', m.email,
  extensions.crypt('Passw0rd!', extensions.gen_salt('bf', 4)), now(),
  case when m.kind = 'unregistered'
       then '{"provider":"google","providers":["google"]}'::jsonb
       else '{"provider":"email","providers":["email"]}'::jsonb end,
  case when m.kind = 'unregistered'
       then jsonb_build_object('full_name', m.first_name || ' ' || m.last_name, 'email_verified', true)
       else jsonb_build_object(
         'username', m.username, 'first_name', m.first_name, 'last_name', m.last_name,
         'date_of_birth', (date '1966-01-01' + (random() * 14000)::int)::text,
         'age_declared', true, 'terms_version', '2026-10', 'privacy_version', '2026-10',
         'state', m.state) end,
  now() - make_interval(days => 5 + (random() * 200)::int), now(),
  '', '', '', '', '', '', '', ''
from mock_player m
order by m.n;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), m.id, m.id::text,
       jsonb_build_object('sub', m.id::text, 'email', m.email, 'email_verified', true),
       'email', now(), now(), now()
from mock_player m;

do $$
declare
  bios text[] := array['Social doubles most weeknights.','Back on court after a few years off.',
    'Competitive singles, happy to play anyone.','Just moved here, looking for regular games.',
    'Weekend player, mornings preferred.','Club player keen for extra hits.',
    'Beginner, still learning the rules!','Love a long rally. Happy to drill too.',
    'Mixed doubles specialist.','Uni student, free most evenings.',
    'Coach my kids, finally playing myself.','Lefty, attacking style.',
    'Here for fun and a sweat.','Training for the state ladder.'];
  notes text[] := array['Usually free after 6 pm.','Weekends only during footy season.',
    'Can drive to the eastern suburbs.','Message me a day ahead.'];
  slots text[] := array['mon_morning','mon_afternoon','mon_evening','tue_morning','tue_afternoon',
    'tue_evening','wed_morning','wed_afternoon','wed_evening','thu_morning','thu_afternoon',
    'thu_evening','fri_morning','fri_afternoon','fri_evening','sat_morning','sat_afternoon',
    'sat_evening','sun_morning','sun_afternoon','sun_evening'];
  m record;
  v_avail text[];
  s text;
begin
  for m in select * from mock_player where kind <> 'unregistered' loop
    v_avail := '{}';
    foreach s in array slots loop
      if random() < (case when s like '%evening' or s like 'sat%' or s like 'sun%' then 0.35 else 0.08 end) then
        v_avail := v_avail || s;
      end if;
    end loop;

    update public.player p
    set self_rating_band = m.band,
        is_verified = random() < 0.12,
        joined_at = (select u.created_at from auth.users u where u.id = m.id)
    where p.player_id = m.id;

    update public.player_profile pp
    set suburb = m.suburb,
        bio = case when random() < 0.7 then pg_temp.pick(bios) end,
        is_discoverable = random() >= 0.08,
        preferred_format = pg_temp.wpick(array['any','singles','doubles','mixed_doubles'], array[40,25,25,10]),
        availability = v_avail,
        availability_note = case when random() < 0.2 then pg_temp.pick(notes) end,
        email_notifications = random() >= 0.15
    where pp.player_id = m.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Groups
-- ---------------------------------------------------------------------------
\echo '2/8 groups'

do $$
declare
  names text[] := array['Carlton Smashers','Clayton Shuttle Club','Box Hill Badminton Social',
    'Northern Feathers','Bayside Birdies','Westside Shuttlers','Eastern Rally Club',
    'Uni Night Badminton','Sydney Smash Social','Parramatta Shuttle Crew','Brisbane Birdies',
    'Gold Coast Rally','Perth Feather Club','Adelaide Drop Shots','Canberra Clears','Frankston Flyers'];
  states text[] := array['VIC','VIC','VIC','VIC','VIC','VIC','VIC','VIC','NSW','NSW','QLD','QLD',
    'WA','SA','ACT','VIC'];
  descs text[] := array['Friendly weeknight doubles for all levels.',
    'Competitive singles and doubles, ladder nights monthly.',
    'Social games, a cuppa afterwards.', 'Beginners welcome: we rotate partners every game.',
    'Serious training sessions and match play.'];
  v_count int := least(cardinality(names), greatest(4, current_setting('mock.players')::int / 12));
  v_id uuid;
  v_creator uuid;
  v_suburb text;
  v_member uuid;
  i int;
begin
  for i in 1 .. v_count loop
    select m.id, m.suburb into v_creator, v_suburb from mock_player m
    where m.kind = 'player' and m.state = states[i] order by random() limit 1;
    if v_creator is null then
      continue;
    end if;
    v_id := gen_random_uuid();

    insert into public.groups (group_id, name, slug, description, suburb, state, contact_email, created_by, is_verified, created_at)
    values (v_id, names[i], regexp_replace(lower(names[i]), '[^a-z0-9]+', '-', 'g'),
            pg_temp.pick(descs), v_suburb, states[i],
            case when random() < 0.5 then 'hello@' || regexp_replace(lower(names[i]), '[^a-z0-9]+', '', 'g') || '.example' end,
            v_creator, random() < 0.35, now() - make_interval(days => pg_temp.rint(60, 300)));

    insert into mock_group values (i, v_id, states[i], v_suburb, i % 8 = 5);

    -- Approved members, then a few asking to join.
    for v_member in
      select m.id from mock_player m
      where m.kind <> 'unregistered' and m.state = states[i] and m.id <> v_creator
      order by random() limit pg_temp.rint(4, 14)
    loop
      insert into public.group_member (group_id, player_id, role, status, added_at)
      values (v_id, v_member, 'member', 'approved', now() - make_interval(days => pg_temp.rint(5, 60)))
      on conflict do nothing;
    end loop;

    for v_member in
      select m.id from mock_player m
      where m.kind = 'player' and m.state = states[i]
        and not exists (select 1 from public.group_member gm where gm.group_id = v_id and gm.player_id = m.id)
      order by random() limit pg_temp.rint(0, 3)
    loop
      insert into public.group_member (group_id, player_id, role, status, added_at)
      values (v_id, v_member, 'member', 'pending', now() - make_interval(hours => pg_temp.rint(2, 96)));
    end loop;

    -- Some groups have a second admin (never someone whose account goes).
    if random() < 0.3 then
      update public.group_member gm set role = 'admin'
      where gm.group_id = v_id and gm.player_id = (
        select gm2.player_id from public.group_member gm2
        join mock_player m on m.id = gm2.player_id and m.kind = 'player'
        where gm2.group_id = v_id and gm2.status = 'approved' and gm2.role = 'member'
        order by random() limit 1);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Past games (triggers off, as 04_past_games.sql)
-- ---------------------------------------------------------------------------
\echo '3/8 past games'

set session_replication_role = replica;

do $$
declare
  v_past int := (current_setting('mock.games')::int * 6) / 10;
  titles text[] := array['Weeknight hit','Social doubles','Ladder match','Morning singles',
    'Friday night smash','Sunday session','Lunchtime rally','After-work doubles','Club night'];
  cancel_reasons text[] := array['Venue double-booked','Not enough players','Sick, sorry!',
    'Court closed for maintenance','Clashes with a tournament'];
  g_id uuid;
  v_org uuid;
  v_group uuid;
  v_state text;
  v_format text;
  v_limit int;
  v_played timestamptz;
  v_status text;
  v_venue uuid;
  v_suburb text;
  v_roster uuid[];
  v_p uuid;
  v_created timestamptz;
  i int;
  k int;
begin
  for i in 1 .. v_past loop
    g_id := gen_random_uuid();
    v_group := null;

    select m.id, m.state into v_org, v_state from mock_player m
    where m.kind <> 'unregistered' order by -ln(1 - random()) / m.activity limit 1;

    if random() < 0.2 then
      select g.id into v_group from mock_group g where g.state = v_state order by random() limit 1;
    end if;

    v_format := pg_temp.wpick(array['singles','doubles','mixed_doubles'], array[50,36,14]);
    v_limit := case
      when v_group is not null then pg_temp.pick(array[6, 8, 8, 10, 12])
      when v_format = 'singles' then pg_temp.wpick(array['2','4','6'], array[55,25,20])::int
      else pg_temp.wpick(array['4','6','8'], array[70,15,15])::int end;

    -- A quarter in the last week, so there are results still to confirm.
    v_played := pg_temp.melb(
      -case pg_temp.wpick(array['week','month','older'], array[25,35,40])
         when 'week' then pg_temp.rint(1, 5) when 'month' then pg_temp.rint(6, 30) else pg_temp.rint(31, 70) end,
      pg_temp.pick(array[540, 600, 660, 1080, 1110, 1140, 1170, 1200]));
    v_status := case when random() < 0.09 then 'cancelled' else 'completed' end;
    v_created := v_played - make_interval(days => pg_temp.rint(2, 12));

    if random() < 0.85 then
      select mv.venue_id, mv.suburb into v_venue, v_suburb from mock_venue mv
      where mv.state = v_state order by random() limit 1;
    else
      v_venue := null;
      select m.suburb into v_suburb from mock_player m where m.state = v_state and m.suburb is not null
      order by random() limit 1;
    end if;
    v_suburb := coalesce(v_suburb, 'Melbourne');

    insert into public.game_post (
      post_id, organiser_id, organiser_group_id, title, format, style, ability_level,
      venue_id, suburb, proposed_time, duration_minutes, player_limit, notes, status, created_at
    ) values (
      g_id, case when v_group is null then v_org end, v_group,
      case when random() < 0.8 then pg_temp.pick(titles) end, v_format,
      pg_temp.wpick(array['social','competitive'], array[70,30]),
      pg_temp.wpick(array['any','beginner','lower_intermediate','intermediate','upper_intermediate','advanced'],
                    array[45,8,12,18,11,6]),
      v_venue, v_suburb, v_played, pg_temp.pick(array[60, 60, 90, 90, 120]), v_limit,
      case when random() < 0.3 then 'Shuttles provided. Bring water.' end, v_status, v_created);

    insert into mock_game values (g_id, true, v_format, v_state, v_played, v_status, v_group,
                                  case when v_group is null then v_org end, v_limit);

    -- The roster: group members first for a group game, else players in the state.
    v_roster := array(
      select x.id from (
        select m.id, case when gm.player_id is not null then 0 else 1 end as pref,
               -ln(1 - random()) / m.activity as r
        from mock_player m
        left join public.group_member gm on gm.group_id = v_group and gm.player_id = m.id and gm.status = 'approved'
        where m.kind <> 'unregistered' and m.state = v_state and m.id <> coalesce(v_org, '00000000-0000-0000-0000-000000000000')
      ) x order by x.pref, x.r limit v_limit + 2);

    k := 0;
    if v_group is null then
      insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
      values (g_id, v_org, 'accepted', v_created, v_created, false);
      k := 1;
    end if;

    foreach v_p in array v_roster loop
      exit when k >= v_limit;
      insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
      values (g_id, v_p,
              case when v_status = 'completed' and random() < 0.05 then 'no_show' else 'accepted' end,
              v_created + interval '2 hours', v_created + interval '1 day', false);
      k := k + 1;
    end loop;

    -- Someone who gave up their place, half of them on the day (late), and a
    -- declined request.
    if random() < 0.1 and cardinality(v_roster) > k then
      insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
      values (g_id, v_roster[k + 1], 'withdrawn', v_created + interval '3 hours', v_created + interval '1 day',
              random() < 0.5)
      on conflict do nothing;
    end if;
    if random() < 0.1 and cardinality(v_roster) > k + 1 then
      insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
      values (g_id, v_roster[k + 2], 'rejected', v_created + interval '4 hours', v_created + interval '1 day', false)
      on conflict do nothing;
    end if;

    if v_status = 'cancelled' then
      insert into public.cancellation_record (post_id, cancelled_at, reason, updated_by)
      values (g_id,
              v_played - case when random() < 0.5 then interval '2 hours' else interval '3 days' end,
              pg_temp.pick(cancel_reasons), coalesce(v_org, v_roster[1]));
      insert into public.notification (player_id, type, message, post_id, is_read, created_at)
      select gp.player_id, 'game_cancelled',
             coalesce((select title from public.game_post where post_id = g_id), 'A game') || ' was cancelled by the organiser.',
             g_id, true, v_played - interval '2 hours'
      from public.game_participant gp
      where gp.post_id = g_id and gp.status = 'accepted' and gp.player_id is distinct from v_org;
    end if;
  end loop;
end;
$$;

-- The participant history the trigger would have written.
insert into public.game_participant_history (post_id, player_id, from_status, to_status, changed_by, changed_at)
select x.post_id, x.player_id, null, 'requested', x.player_id, x.requested_at
from public.game_participant x join mock_game g on g.id = x.post_id
union all
select x.post_id, x.player_id, 'requested', 'accepted', coalesce(g.organiser, x.player_id), x.responded_at
from public.game_participant x join mock_game g on g.id = x.post_id
where x.status in ('accepted', 'no_show', 'withdrawn')
union all
select x.post_id, x.player_id, 'requested', 'rejected', coalesce(g.organiser, x.player_id), x.responded_at
from public.game_participant x join mock_game g on g.id = x.post_id
where x.status = 'rejected'
union all
select x.post_id, x.player_id, 'accepted', x.status, x.player_id, g.played_at - interval '10 hours'
from public.game_participant x join mock_game g on g.id = x.post_id
where x.status = 'withdrawn'
union all
select x.post_id, x.player_id, 'accepted', 'no_show', coalesce(g.organiser, x.player_id), g.played_at + interval '2 hours'
from public.game_participant x join mock_game g on g.id = x.post_id
where x.status = 'no_show';

set session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- 4. Results, through the real functions as the players
-- ---------------------------------------------------------------------------
\echo '4/8 results (submit, confirm, dispute)'

do $$
declare
  reasons text[] := array['The score was the other way round in game two.',
    'We only played two games, not three.', 'I won the third game 21-19.',
    'This was a practice hit, not a match.', 'Wrong opponent recorded.'];
  g record;
  v_roster uuid[];
  v_a uuid[];
  v_b uuid[];
  v_k int;
  v_m int;
  v_try int;
  v_pairs text[];
  v_key text;
  v_sa float8;
  v_sb float8;
  v_games jsonb;
  v_res jsonb;
  v_rid uuid;
  v_age float8;
  v_outcome text;
  v_ok int := 0;
  v_skipped int := 0;
  i int;
  x int;
  y int;
begin
  for g in select * from mock_game where past and status = 'completed' order by played_at loop
    v_roster := array(select gp.player_id from public.game_participant gp
                      where gp.post_id = g.id and gp.status = 'accepted' order by random());
    v_k := coalesce(cardinality(v_roster), 0);
    v_pairs := '{}';
    v_age := extract(epoch from now() - g.played_at) / 86400;

    if g.format = 'singles' then
      -- A singles session is close to a round robin.
      v_m := case when v_k < 2 then 0 when v_k = 2 then 1
                  else least(v_k * (v_k - 1) / 2, 2 * v_k) end;
    else
      v_m := case when v_k < 4 then 0 when v_k <= 5 then pg_temp.wpick(array['1','2'], array[60,40])::int
                  else v_k / 2 + pg_temp.rint(0, 2) end;
    end if;

    for i in 1 .. v_m loop
      -- Pick sides not used yet in this game (the same two sides are
      -- recorded once per game).
      v_try := 0;
      loop
        v_try := v_try + 1;
        exit when v_try > 20;
        if g.format = 'singles' then
          x := pg_temp.rint(1, v_k);
          y := pg_temp.rint(1, v_k);
          continue when x = y;
          v_a := array[v_roster[x]];
          v_b := array[v_roster[y]];
        else
          v_a := array(select r from unnest(v_roster) r order by random() limit 4);
          v_b := v_a[3:4];
          v_a := v_a[1:2];
        end if;
        v_key := (select string_agg(s::text, ',' order by s) from unnest(v_a) s) || '|'
                 || (select string_agg(s::text, ',' order by s) from unnest(v_b) s);
        exit when not v_key = any (v_pairs)
              and not ((select string_agg(s::text, ',' order by s) from unnest(v_b) s) || '|'
                       || (select string_agg(s::text, ',' order by s) from unnest(v_a) s)) = any (v_pairs);
      end loop;
      continue when v_try > 20;
      v_pairs := v_pairs || v_key;

      -- Some matches are never recorded.
      continue when random() < 0.07;

      select avg(m.skill) into v_sa from mock_player m where m.id = any (v_a);
      select avg(m.skill) into v_sb from mock_player m where m.id = any (v_b);
      v_games := pg_temp.score(1 / (1 + exp(-((v_sa - v_sb) + 120 * (random() - 0.5)) / 250)));

      v_outcome := case
        when v_age < 6 then pg_temp.wpick(array['pending','confirmed','disputed'], array[45,45,10])
        when v_age < 8.5 then pg_temp.wpick(array['confirmed','disputed'], array[90,10])
        else pg_temp.wpick(array['confirmed','expired','disputed','rejected'], array[84,7,6,3]) end;

      begin
        perform pg_temp.as_user(v_a[1]);
        v_res := public.submit_result(g.id, v_b, v_a[2], v_games);
        v_rid := (v_res ->> 'resultId')::uuid;

        if v_outcome in ('confirmed', 'rejected') then
          perform pg_temp.as_user(v_b[1]);
          perform public.confirm_result(v_rid);
        elsif v_outcome = 'disputed' then
          perform pg_temp.as_user(v_b[1]);
          perform public.raise_dispute(v_rid, pg_temp.pick(reasons));
        end if;

        insert into mock_match values (v_rid, (v_res ->> 'matchId')::uuid, g.id, g.played_at, v_outcome);
        v_ok := v_ok + 1;
      exception when others then
        v_skipped := v_skipped + 1;
      end;
      perform pg_temp.as_system();
    end loop;
  end loop;
  raise notice 'results recorded: %, skipped by the rules: %', v_ok, v_skipped;
end;
$$;

-- A suspicious pair for the admin flags: the same two players record three
-- one-sided wins in a week (repeat_pairing, unusual_win_pattern).
create temp table mock_suspect as
select a.id as a, b.id as b, gen_random_uuid() as g1, gen_random_uuid() as g2, gen_random_uuid() as g3
from (select id from mock_player where kind = 'player' and state = 'VIC' order by n limit 1) a,
     (select id from mock_player where kind = 'player' and state = 'VIC' order by n desc limit 1) b;

set session_replication_role = replica;

insert into public.game_post (post_id, organiser_id, title, format, style, ability_level, suburb,
                              proposed_time, duration_minutes, player_limit, status, created_at)
select g, s.a, 'Rematch', 'singles', 'competitive', 'any', 'Albert Park',
       pg_temp.melb(-d, 1140), 60, 2, 'completed', pg_temp.melb(-d - 1, 600)
from mock_suspect s, lateral (values (s.g1, 6), (s.g2, 4), (s.g3, 2)) v(g, d);

insert into public.game_participant (post_id, player_id, status, requested_at, responded_at, late_withdrawal)
select g, p, 'accepted', now() - interval '8 days', now() - interval '8 days', false
from mock_suspect s, lateral (values (s.g1), (s.g2), (s.g3)) v(g), lateral (values (s.a), (s.b)) w(p);

insert into mock_game (id, past, format, state, played_at, status, organiser, player_limit)
select g, true, 'singles', 'VIC', pg_temp.melb(-d, 1140), 'completed', s.a, 2
from mock_suspect s, lateral (values (s.g1, 6), (s.g2, 4), (s.g3, 2)) v(g, d);

set session_replication_role = origin;

do $$
declare
  s record;
  v_g uuid;
  v_res jsonb;
begin
  select * into s from mock_suspect;
  foreach v_g in array array[s.g1, s.g2, s.g3] loop
    perform pg_temp.as_user(s.a);
    v_res := public.submit_result(v_g, array[s.b], null, '[[21,0],[21,1]]'::jsonb);
    perform pg_temp.as_user(s.b);
    perform public.confirm_result((v_res ->> 'resultId')::uuid);
    perform pg_temp.as_system();
    insert into mock_match select (v_res ->> 'resultId')::uuid, (v_res ->> 'matchId')::uuid, v_g,
                                  (select played_at from mock_game where id = v_g), 'confirmed';
  end loop;
end;
$$;

-- Put the results back in time: recorded an hour or a few after the game,
-- confirmed within two days. The notifications they sent move with them.
update public.match_result r
set created_at = least(mm.played_at + make_interval(mins => 60 + (random() * 300)::int),
                       now() - interval '30 minutes')
from mock_match mm
where r.result_id = mm.result_id;

update public.match_result r
set confirmed_at = least(r.created_at + make_interval(mins => 20 + (random() * 2400)::int),
                         now() - interval '5 minutes')
from mock_match mm
where r.result_id = mm.result_id and r.confirmed_at is not null;

update public.match m set created_at = r.created_at
from public.match_result r join mock_match mm on mm.result_id = r.result_id
where m.match_id = r.match_id;

update public.dispute d
set created_at = least(r.created_at + make_interval(mins => 30 + (random() * 1800)::int),
                       now() - interval '5 minutes')
from public.match_result r join mock_match mm on mm.result_id = r.result_id
where d.result_id = r.result_id;

-- Nobody confirmed these within 7 days.
select private.expire_pending_results() as expired_results;

-- An admin threw these out.
update public.match_result r set status = 'rejected'
from mock_match mm
where r.result_id = mm.result_id and mm.outcome = 'rejected';

update public.notification n
set created_at = case n.type
                   when 'result_submitted' then r.created_at
                   when 'result_confirmed' then coalesce(r.confirmed_at, r.created_at)
                   when 'dispute_update' then coalesce(d.created_at, r.created_at)
                   when 'result_expired' then r.created_at + interval '7 days 1 hour'
                   else n.created_at end
from public.match_result r
join mock_match mm on mm.result_id = r.result_id
left join public.dispute d on d.result_id = r.result_id
where n.match_id = r.match_id;

-- An admin deletes a few played games (their results stop counting).
do $$
declare
  v_post uuid;
begin
  for v_post in
    select g.id from mock_game g
    where g.past and g.status = 'completed'
      and exists (select 1 from mock_match mm where mm.post_id = g.id and mm.outcome = 'confirmed')
    order by random() limit greatest(1, (select count(*) from mock_game where past) / 50)
  loop
    begin
      perform pg_temp.as_admin();
      perform public.admin_delete_game_post(v_post, 'Reported as a fake game: the players were not there.');
    exception when others then
      raise notice 'admin delete skipped: %', sqlerrm;
    end;
    perform pg_temp.as_system();
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Upcoming games (every trigger on)
-- ---------------------------------------------------------------------------
\echo '5/8 upcoming games'

-- A group with no upcoming games can be closed; do it before posting any.
update public.groups g set is_active = false
from mock_group mg where mg.id = g.group_id and mg.deactivate;

do $$
declare
  v_upcoming int := current_setting('mock.games')::int - (current_setting('mock.games')::int * 6) / 10;
  titles text[] := array['Friday Night Doubles','Weeknight singles','Social hit','Ladder warm-up',
    'Morning doubles','Sunday session','Lunchtime rally','After-work smash','Beginners welcome',
    'Competitive doubles','Mixed doubles night','Drills and games'];
  notes text[] := array['Bring your own racquet. Shuttles provided.','Court 3, near the cafe.',
    'Text me if you are running late.','Feather shuttles, split the cost.',
    'All levels welcome, we rotate partners.','Warm-up from 10 minutes before.'];
  messages text[] := array['Hi! Keen to join if there is space.','New to the area, would love a game.',
    'Happy to bring shuttles.','I can make it, might be 5 minutes late.',
    'Played here last week, great group!','Is this suitable for an intermediate player?'];
  cancel_reasons text[] := array['Venue double-booked','Not enough players','Injured my ankle, sorry!',
    'Work came up','Court closed for a tournament'];
  g_id uuid;
  v_org uuid;
  v_group uuid;
  v_state text;
  v_format text;
  v_limit int;
  v_when timestamptz;
  v_venue uuid;
  v_suburb text;
  v_fill text;
  v_target int;
  v_taken int;
  v_p uuid;
  v_invitee uuid;
  v_kind text;
  i int;
begin
  for i in 1 .. v_upcoming loop
    g_id := gen_random_uuid();
    v_group := null;
    v_invitee := null;

    select m.id, m.state into v_org, v_state from mock_player m
    where m.kind <> 'unregistered' order by -ln(1 - random()) / m.activity limit 1;

    v_kind := pg_temp.wpick(array['player','group','invite'], array[70,20,10]);
    if v_kind = 'group' then
      select g.id into v_group from mock_group g where g.state = v_state and not g.deactivate
      order by random() limit 1;
      if v_group is null then v_kind := 'player'; end if;
    end if;

    v_format := case when v_kind = 'invite' then 'singles'
                     else pg_temp.wpick(array['singles','doubles','mixed_doubles'], array[38,42,20]) end;
    v_limit := case
      when v_kind = 'invite' then 2
      when v_kind = 'group' then pg_temp.pick(array[8, 8, 10, 12, 16])
      when v_format = 'singles' then pg_temp.wpick(array['2','4','6'], array[78,14,8])::int
      else pg_temp.wpick(array['4','6','8'], array[70,15,15])::int end;

    -- The first few start within a day (they get reminders); the rest over
    -- the next three weeks.
    v_when := case
      when i <= greatest(3, v_upcoming / 15) then now() + make_interval(hours => pg_temp.rint(3, 22))
      else pg_temp.melb(pg_temp.wpick(array['1','2','3','4','5','6','7','10','14','21'],
                                      array[12,12,12,10,10,10,10,9,8,7])::int + pg_temp.rint(0, 1),
                        pg_temp.pick(array[420, 540, 600, 720, 1080, 1110, 1140, 1170, 1200, 1230]))
    end;

    if random() < 0.85 then
      select mv.venue_id, mv.suburb into v_venue, v_suburb from mock_venue mv
      where mv.state = v_state order by random() limit 1;
    else
      v_venue := null;
      select m.suburb into v_suburb from mock_player m where m.state = v_state and m.suburb is not null
      order by random() limit 1;
    end if;

    if v_kind = 'invite' then
      select m.id into v_invitee from mock_player m
      where m.kind <> 'unregistered' and m.state = v_state and m.id <> v_org order by random() limit 1;
      if v_invitee is null then continue; end if;
    end if;

    insert into public.game_post (
      post_id, organiser_id, organiser_group_id, invited_player_id, title, format, style, ability_level,
      venue_id, suburb, proposed_time, duration_minutes, player_limit, notes, created_at
    ) values (
      g_id, case when v_group is null then v_org end, v_group, v_invitee,
      case when random() < 0.75 then pg_temp.pick(titles) end, v_format,
      pg_temp.wpick(array['social','competitive'], array[70,30]),
      pg_temp.wpick(array['any','beginner','lower_intermediate','intermediate','upper_intermediate','advanced'],
                    array[45,8,12,18,11,6]),
      v_venue, coalesce(v_suburb, 'Melbourne'), v_when, pg_temp.pick(array[45, 60, 60, 90, 90, 120]), v_limit,
      case when v_venue is null then 'School hall, side entrance. Text me on arrival.'
           when random() < 0.4 then pg_temp.pick(notes) end,
      least(now(), v_when - interval '1 day') - make_interval(hours => pg_temp.rint(1, 150)));

    insert into mock_game values (g_id, false, v_format, v_state, v_when, 'open', v_group,
                                  case when v_group is null then v_org end, v_limit);

    -- Request Game: the invited player has not answered, accepted or declined.
    if v_kind = 'invite' then
      insert into public.game_participant (post_id, player_id, status, requested_at)
      values (g_id, v_invitee, 'invited', now() - make_interval(hours => pg_temp.rint(1, 48)));
      if random() < 0.5 then
        insert into public.game_request_message (post_id, player_id, message)
        values (g_id, v_invitee, 'Keen for a singles hit? You looked like a good match on the rankings.');
      end if;
      case pg_temp.wpick(array['waiting','accepted','declined'], array[40,35,25])
        when 'accepted' then
          update public.game_participant set status = 'accepted', responded_at = now() - interval '1 hour'
          where post_id = g_id and player_id = v_invitee;
        when 'declined' then
          update public.game_participant set status = 'declined', responded_at = now() - interval '1 hour'
          where post_id = g_id and player_id = v_invitee;
        else null;
      end case;
      continue;
    end if;

    -- How full: only the host so far, some places taken, or full.
    v_fill := pg_temp.wpick(array['host_only','partly','full'], array[22,40,38]);
    v_taken := case when v_group is null then 1 else 0 end;
    v_target := case v_fill when 'host_only' then v_taken
                            when 'partly' then v_taken + pg_temp.rint(1, greatest(1, v_limit - v_taken - 1))
                            else v_limit end;

    for v_p in
      select x.id from (
        select m.id, case when gm.player_id is not null then 0 else 1 end as pref,
               -ln(1 - random()) / m.activity as r
        from mock_player m
        left join public.group_member gm on gm.group_id = v_group and gm.player_id = m.id and gm.status = 'approved'
        where m.kind <> 'unregistered' and m.state = v_state and m.id is distinct from v_org
      ) x order by x.pref, x.r
      limit (v_target - v_taken) + pg_temp.rint(0, 4)
    loop
      insert into public.game_participant (post_id, player_id, status, requested_at)
      values (g_id, v_p, 'requested', now() - make_interval(mins => pg_temp.rint(10, 4000)));
      if random() < 0.3 then
        insert into public.game_request_message (post_id, player_id, message)
        values (g_id, v_p, pg_temp.pick(messages));
      end if;

      if v_taken < v_target and random() < 0.92 then
        update public.game_participant set status = 'accepted', responded_at = now() - make_interval(mins => pg_temp.rint(5, 600))
        where post_id = g_id and player_id = v_p;
        v_taken := v_taken + 1;
        -- A few give up their place again (some within 24 hours: late).
        if random() < 0.05 then
          update public.game_participant set status = 'withdrawn' where post_id = g_id and player_id = v_p;
          v_taken := v_taken - 1;
        end if;
      elsif random() < 0.25 then
        update public.game_participant set status = 'rejected', responded_at = now() - make_interval(mins => pg_temp.rint(5, 600))
        where post_id = g_id and player_id = v_p;
      elsif random() < 0.2 then
        update public.game_participant set status = 'withdrawn' where post_id = g_id and player_id = v_p;
      end if;
      -- Anything else stays requested: waiting for the host.
    end loop;
  end loop;
end;
$$;

-- Hosts cancel some games and remove a few, the way cancel_game_post and
-- delete_game_post do (see 03_upcoming_games.sql).
do $$
declare
  reasons text[] := array['Venue double-booked','Not enough players','Injured my ankle, sorry!',
    'Work came up','Court closed for a tournament'];
  v_post uuid;
  v_by uuid;
begin
  for v_post, v_by in
    select g.id, g.organiser from mock_game g
    where not g.past and g.organiser is not null
      and not exists (select 1 from public.game_post gp where gp.post_id = g.id and gp.invited_player_id is not null)
    order by random() limit greatest(2, (select count(*) from mock_game where not past) / 16)
  loop
    update public.game_post set status = 'cancelled' where post_id = v_post;
    insert into public.cancellation_record (post_id, reason, updated_by)
    values (v_post, pg_temp.pick(reasons), v_by);
    perform private.notify_game_players(v_post, 'game_cancelled',
      private.describe_game(v_post) || ' was cancelled by the organiser.');
    update mock_game set status = 'cancelled' where id = v_post;
  end loop;

  for v_post, v_by in
    select g.id, g.organiser from mock_game g
    where not g.past and g.organiser is not null and g.status = 'open'
      and not exists (select 1 from public.game_participant gp
                      where gp.post_id = g.id and gp.player_id <> g.organiser)
    order by random() limit greatest(1, (select count(*) from mock_game where not past) / 30)
  loop
    update public.game_post
    set deleted_at = now() - interval '2 hours', deleted_by = v_by, deletion_reason = 'Posted by mistake'
    where post_id = v_post;
    update mock_game set status = 'removed' where id = v_post;
  end loop;
end;
$$;

-- Reminders for games starting within a day.
do $$
declare
  r record;
begin
  for r in
    select gp.player_id, g.id
    from mock_game g
    join public.game_post p on p.post_id = g.id and p.status = 'open' and p.deleted_at is null
    join public.game_participant gp on gp.post_id = g.id and gp.status = 'accepted'
    where not g.past and g.played_at < now() + interval '24 hours'
  loop
    perform private.dispatch_notification(
      r.player_id, 'match_reminder', 'Reminder: ' || private.describe_game(r.id) || ' starts soon.',
      'Tap to see the details and who is playing.', r.id, null);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Blocks, reports, leagues
-- ---------------------------------------------------------------------------
\echo '6/8 blocks, reports, leagues'

do $$
declare
  cats text[] := array['harassment','inappropriate_content','fake_account','spam','safety_concern','other'];
  block_reasons text[] := array['Kept messaging me after our game.','Rude on court.',
    'Do not want to be matched with this player.','Made me uncomfortable.', null];
  report_reasons text[] := array['Sent rude messages after the game.','Fake profile, photos are of someone else.',
    'Posting the same game over and over with a coaching ad.','Aggressive behaviour on court.',
    'Group is not real, nobody turned up.'];
  v_a uuid;
  v_b uuid;
  v_post uuid;
  v_group uuid;
  v_league uuid;
  v_org uuid;
  v_cat text;
  r record;
  i int;
  pos int;
begin
  -- Blocks, as block_player does them.
  for i in 1 .. greatest(3, current_setting('mock.players')::int / 30) loop
    select m.id into v_a from mock_player m where m.kind = 'player' order by random() limit 1;
    select m.id into v_b from mock_player m where m.kind <> 'unregistered' and m.id <> v_a order by random() limit 1;
    begin
      perform pg_temp.as_user(v_a);
      perform public.block_player(v_b, pg_temp.pick(cats), pg_temp.pick(block_reasons));
    exception when others then null;
    end;
    perform pg_temp.as_system();
  end loop;

  -- Reports of players, posts and groups, as report_* do them (they capture
  -- the evidence). An admin has worked through some.
  for i in 1 .. greatest(4, current_setting('mock.players')::int / 12) loop
    select m.id into v_a from mock_player m where m.kind = 'player' order by random() limit 1;
    v_cat := pg_temp.pick(cats);
    begin
      perform pg_temp.as_user(v_a);
      case pg_temp.wpick(array['player','post','group'], array[60,30,10])
        when 'player' then
          select m.id into v_b from mock_player m where m.kind <> 'unregistered' and m.id <> v_a order by random() limit 1;
          perform public.report_player(v_b, v_cat, pg_temp.pick(report_reasons));
        when 'post' then
          select g.id into v_post from mock_game g where not g.past order by random() limit 1;
          perform public.report_post(v_post, v_cat, pg_temp.pick(report_reasons));
        else
          select g.id into v_group from mock_group g order by random() limit 1;
          perform public.report_group(v_group, v_cat, pg_temp.pick(report_reasons));
      end case;
    exception when others then null;
    end;
    perform pg_temp.as_system();
  end loop;

  update public.report rp
  set status = pg_temp.wpick(array['open','under_review','resolved','dismissed'], array[40,25,20,15]),
      created_at = now() - make_interval(hours => pg_temp.rint(1, 600))
  where rp.reported_by_player_id in (select id from mock_player);

  -- Mini leagues: one running, one finished, one not started.
  for r in select * from (values ('Autumn Singles Ladder', 'completed', -90, -20),
                                 ('Spring Doubles League', 'active', -21, 35),
                                 ('Summer Social League', 'draft', 20, 80)) as t(name, status, s, e) loop
    select m.id into v_org from mock_player m where m.kind = 'player' and m.state = 'VIC' order by random() limit 1;
    v_league := gen_random_uuid();
    insert into public.mini_league (league_id, organiser_id, name, start_date, end_date, status, created_at)
    values (v_league, v_org, r.name, now() + make_interval(days => r.s), now() + make_interval(days => r.e),
            r.status, now() + make_interval(days => r.s - 14));
    if r.status <> 'draft' then
      pos := 0;
      for v_a in select m.id from mock_player m where m.kind <> 'unregistered' and m.state = 'VIC'
                 order by m.skill desc, random() limit pg_temp.rint(6, 10) loop
        pos := pos + 1;
        insert into public.league_standing (league_id, player_id, wins, losses, points, position)
        values (v_league, v_a, greatest(0, 9 - pos), pos - 1, 3 * greatest(0, 9 - pos), pos);
        if r.status = 'active' then
          perform private.dispatch_notification(v_a, 'league_update',
            'You are number ' || pos || ' in the ' || r.name || '.', null, null, null);
        end if;
      end loop;
    end if;
    if r.status = 'active' then
      begin
        select m.id into v_a from mock_player m where m.kind = 'player' order by random() limit 1;
        perform pg_temp.as_user(v_a);
        perform public.report_league(v_league, 'other', 'League organiser is not responding to messages.');
      exception when others then null;
      end;
      perform pg_temp.as_system();
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Quick messages, check-ins, notifications, admin posts
-- ---------------------------------------------------------------------------
\echo '7/8 quick messages, check-ins, notifications'

-- A quarter of the matches have a few quick messages around the game.
insert into public.match_message (match_id, sender_id, template_code, created_at)
select mm.match_id, mp.player_id,
       pg_temp.pick(array['on_my_way','running_late_5','running_late_15','arrived','court_booked','good_game']),
       least(mm.played_at + make_interval(mins => pg_temp.rint(-40, 90)), now() - interval '1 minute')
from mock_match mm
join public.match_participant mp on mp.match_id = mm.match_id
where (hashtext(mm.match_id::text) % 4) = 0 and random() < 0.6;

-- Check-ins on some matches.
insert into public.check_in (match_id, player_id, checked_in_at, method, verified)
select mm.match_id, mp.player_id, mm.played_at - make_interval(mins => pg_temp.rint(1, 20)),
       pg_temp.wpick(array['qr','geolocation','manual'], array[50,35,15]), random() < 0.75
from mock_match mm
join public.match_participant mp on mp.match_id = mm.match_id
where (hashtext(mm.match_id::text) % 5) in (0, 1)
on conflict do nothing;

-- Notifications the triggers did not send for this mock history.
insert into public.notification (player_id, type, message, created_at)
select m.id, 'system', 'Welcome to Badminton Social Connect! Find your first game.',
       (select u.created_at from auth.users u where u.id = m.id)
from mock_player m where m.kind <> 'unregistered';

insert into public.notification (player_id, type, message, detail, post_id, created_at)
select gp.player_id, 'no_show',
       'You were marked as a no-show for ' || private.describe_game(g.id) || '.',
       'This affects your reliability score.', g.id, g.played_at + interval '2 hours'
from mock_game g join public.game_participant gp on gp.post_id = g.id and gp.status = 'no_show'
where g.past;

-- Older ones are mostly read.
update public.notification n set is_read = true
where n.player_id in (select id from mock_player)
  and n.created_at < now() - interval '2 days'
  and random() < 0.75;

insert into public.admin_post (created_by, title, body, display_order, status, published_at)
values
  ('00000000-0000-0000-0000-00000000a000', 'Ratings are live',
   'Confirmed singles results now count towards your rating. Ratings update overnight.', 5,
   'published', now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000000a000', 'New venues in Queensland',
   'Ten more Brisbane and Gold Coast venues are now in the venue list.', 6,
   'published', now() - interval '12 days'),
  ('00000000-0000-0000-0000-00000000a000', 'Christmas closures',
   'Draft: venue closures over the holidays.', 7, 'draft', null);

-- ---------------------------------------------------------------------------
-- 8. Deleted accounts, reliability, ratings
-- ---------------------------------------------------------------------------
\echo '8/8 deleted accounts, reliability, ratings'

-- Deleting the login keeps the player as "Deleted User" (06_deleted_account.sql).
delete from auth.users u using mock_player m where u.id = m.id and m.kind = 'leaving';

do $$
declare
  v_id uuid;
begin
  for v_id in select p.player_id from public.player p loop
    perform private.refresh_reliability(v_id);
  end loop;
end;
$$;

\timing on
select private.rebuild_ratings() as results_rated;
\timing off

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

\echo ''
\echo 'What is in the database now (dev seed + mock data):'
select 'players' as what, count(*) filter (where deleted_at is null) as count,
       count(*) filter (where deleted_at is not null) || ' deleted' as detail from public.player
union all
select 'groups', count(*), count(*) filter (where not is_active) || ' inactive' from public.groups
union all
select 'games upcoming', count(*),
       count(*) filter (where status = 'cancelled') || ' cancelled, '
       || count(*) filter (where deleted_at is not null) || ' removed, '
       || count(*) filter (where invited_player_id is not null) || ' invitations, '
       || count(*) filter (where organiser_group_id is not null) || ' group games'
from public.game_post where proposed_time > now()
union all
select 'games past', count(*),
       count(*) filter (where status = 'cancelled') || ' cancelled, '
       || count(*) filter (where deleted_at is not null) || ' deleted by an admin'
from public.game_post where proposed_time <= now()
union all
select 'requests by status', count(*), (select string_agg(status || ' ' || c, ', ' order by status)
  from (select status, count(*) c from public.game_participant group by 1) s) from public.game_participant
union all
select 'results by status', count(*), (select string_agg(status || ' ' || c, ', ' order by status)
  from (select status, count(*) c from public.match_result group by 1) s) from public.match_result
union all
select 'rated players', count(*), count(*) filter (where is_established) || ' established' from private.rating_state
union all
select 'result flags', count(*), (select string_agg(kind || ' ' || c, ', ')
  from (select kind, count(*) c from public.result_flag group by 1) s) from public.result_flag
union all
select 'notifications', count(*), count(*) filter (where not is_read) || ' unread' from public.notification
union all
select 'blocks / reports', (select count(*) from public.blocks), (select count(*) from public.report) || ' reports'
union all
select 'quick messages', count(*), null from public.match_message;

\echo ''
\echo 'Accounts to sign in as (password Passw0rd!):'
select x.case_ as "case", coalesce(p.username, '(no username yet)') as username, u.email
from (
  select 'has a result to confirm' as case_, (
    select mp.player_id from public.match_result r
    join public.match_participant mp on mp.match_id = r.match_id
    join public.match_participant sp on sp.match_id = r.match_id and sp.player_id = r.submitted_by
    join mock_player m on m.id = mp.player_id and m.kind = 'player'
    where r.status = 'pending' and mp.side <> sp.side limit 1) as id, 1 as o
  union all select 'waiting for an opponent to confirm', (
    select r.submitted_by from public.match_result r
    join mock_player m on m.id = r.submitted_by and m.kind = 'player'
    where r.status = 'pending' limit 1), 2
  union all select 'a disputed result', (
    select r.submitted_by from public.match_result r
    join mock_player m on m.id = r.submitted_by and m.kind = 'player'
    where r.status = 'disputed' limit 1), 3
  union all select 'host with join requests waiting', (
    select p.organiser_id from public.game_post p
    join public.game_participant gp on gp.post_id = p.post_id and gp.status = 'requested'
    join mock_player m on m.id = p.organiser_id and m.kind = 'player'
    where p.status = 'open' and p.deleted_at is null and p.proposed_time > now() limit 1), 4
  union all select 'an invitation to answer', (
    select gp.player_id from public.game_post p
    join public.game_participant gp on gp.post_id = p.post_id and gp.status = 'invited'
    join mock_player m on m.id = gp.player_id and m.kind = 'player'
    where p.status = 'open' and p.deleted_at is null and p.proposed_time > now() limit 1), 5
  union all select 'group admin with members asking to join', (
    select ga.player_id from public.group_member ga
    join public.group_member gm on gm.group_id = ga.group_id and gm.status = 'pending'
    join mock_player m on m.id = ga.player_id and m.kind = 'player'
    where ga.role = 'admin' limit 1), 6
  union all select 'top of the VIC leaderboard', (
    select s.player_id from private.rating_state s
    join public.player_profile pp on pp.player_id = s.player_id and pp.state = 'VIC' and pp.is_discoverable
    where s.is_established order by s.mean desc limit 1), 7
  union all select 'provisional (placement in progress)', (
    select s.player_id from private.rating_state s
    join mock_player m on m.id = s.player_id and m.kind = 'player'
    where not s.is_established order by s.trusted_matches desc limit 1), 8
  union all select 'no rated match yet', (
    select m.id from mock_player m
    where m.kind = 'player' and not exists (select 1 from private.rating_state s where s.player_id = m.id)
    limit 1), 9
  union all select 'most no-shows (low reliability)', (
    select pp.player_id from public.player_profile pp join mock_player m on m.id = pp.player_id
    where m.kind = 'player' order by pp.no_show_count desc, pp.reliability_score limit 1), 10
  union all select 'blocked someone', (
    select b.blocker_id from public.blocks b
    join mock_player m on m.id = b.blocker_id and m.kind = 'player' limit 1), 11
  union all select 'hidden profile', (
    select pp.player_id from public.player_profile pp join mock_player m on m.id = pp.player_id
    where not pp.is_discoverable and m.kind = 'player' limit 1), 12
  union all select 'signed up with Google, registration not finished', (
    select m.id from mock_player m where m.kind = 'unregistered' limit 1), 13
) x
left join public.player p on p.player_id = x.id
left join auth.users u on u.id = x.id
order by x.o;
