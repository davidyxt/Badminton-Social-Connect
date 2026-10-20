-- Dev seed: a pool of players and a season of confirmed singles matches, so
-- the Rankings screen has leaderboards to show (BL-024, BL-025).
--
-- The rating engine needs real numbers of matches before a player is
-- "established" (10 matches against 5 different opponents, RD 160 or less),
-- and a handful of accounts is too small a pool to get there. This adds 30
-- extra players, rally_01 to rally_30 (password Passw0rd!), and about 450
-- matches among them and the main accounts over the last 70 days. The same
-- random seed every time, so every `db reset` gives the same ratings.
--
-- After the matches, everything is replayed through the engine, and the stale
-- pending result from 04_past_games.sql is expired.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-0000-0000-0000000b' || lpad(n::text, 4, '0'))::uuid,
  'authenticated', 'authenticated',
  'rally' || lpad(n::text, 2, '0') || '@example.com',
  extensions.crypt('Passw0rd!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'username', 'rally_' || lpad(n::text, 2, '0'),
    'first_name', 'Rally', 'last_name', 'Player ' || n,
    'date_of_birth', '1992-06-15', 'age_declared', true,
    'terms_version', '2026-10', 'privacy_version', '2026-10', 'state', 'VIC'),
  now() - interval '80 days', now(), '', '', '', '', '', '', '', ''
from generate_series(1, 30) n;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like 'rally%@example.com';

-- Spread them over a few suburbs and the five self-rating answers.
update public.player p
set self_rating_band = (array['beginner', 'lower_intermediate', 'intermediate',
                              'upper_intermediate', 'advanced'])[1 + (x.n % 5)]
from (select player_id, row_number() over (order by username) as n
      from public.player where username like 'rally\_%') x
where p.player_id = x.player_id;

update public.player_profile pp
set suburb = (array['Carlton', 'Clayton', 'Box Hill', 'Brunswick', 'Richmond'])[1 + (x.n % 5)],
    state = 'VIC'
from (select player_id, row_number() over (order by username) as n
      from public.player where username like 'rally\_%') x
where pp.player_id = x.player_id;

-- The matches.
do $$
declare
  v_players uuid[];
  v_skill double precision[];
  v_n integer;
  v_i integer;
  v_a integer;
  v_b integer;
  v_match uuid;
  v_games jsonb;
  v_wins_a integer;
  v_wins_b integer;
  v_pg double precision;
  v_a_wins_game boolean;
  v_loser integer;
  v_score text;
  v_played timestamptz;
  g jsonb;
begin
  perform setseed(0.42);

  -- Alice to Frank, then the rally players. Hidden skill: the self-rating
  -- start, plus or minus up to 150.
  select array_agg(p.player_id order by p.username),
         array_agg(private.starting_rating(p.self_rating_band) + (random() - 0.5) * 300
                   order by p.username)
  into v_players, v_skill
  from public.player p
  where p.username in ('alice', 'bob', 'carol', 'dan', 'erin', 'frank')
     or p.username like 'rally\_%';

  v_n := array_length(v_players, 1);

  for v_i in 1..450 loop
    v_a := 1 + floor(random() * v_n)::int;
    loop
      v_b := 1 + floor(random() * v_n)::int;
      exit when v_b <> v_a;
    end loop;

    v_games := '[]'::jsonb;
    v_wins_a := 0;
    v_wins_b := 0;
    v_score := '';
    -- A game is won with a probability that follows the skill gap.
    v_pg := 1 / (1 + exp(-((v_skill[v_a] - v_skill[v_b]) + (random() - 0.5) * 240) / 250));

    while v_wins_a < 2 and v_wins_b < 2 loop
      v_a_wins_game := random() < v_pg;
      v_loser := case when random() < 0.12 then 20 else 7 + floor(random() * 12)::int end;
      -- A 20-point loser means a 22-20 or 23-21 game, win by two.
      g := case
        when v_loser >= 20 then
          case when v_a_wins_game then jsonb_build_array(v_loser + 2, v_loser)
                                  else jsonb_build_array(v_loser, v_loser + 2) end
        else
          case when v_a_wins_game then jsonb_build_array(21, v_loser)
                                  else jsonb_build_array(v_loser, 21) end
      end;
      v_games := v_games || jsonb_build_array(g);
      v_score := v_score || case when v_score = '' then '' else ' ' end
                 || (g ->> 0) || '-' || (g ->> 1);
      if v_a_wins_game then v_wins_a := v_wins_a + 1; else v_wins_b := v_wins_b + 1; end if;
    end loop;

    v_played := now() - make_interval(secs => (70 * 86400 * random())::int)
                - interval '1 day';
    v_match := gen_random_uuid();

    insert into public.match (match_id, created_by, format, played_at, status)
    values (v_match, v_players[v_a], 'singles', v_played, 'in_progress');
    insert into public.match_participant (match_id, player_id, side)
    values (v_match, v_players[v_a], 'a'), (v_match, v_players[v_b], 'b');
    update public.match set status = 'completed' where match_id = v_match;

    insert into public.match_result
      (match_id, score, games, status, winning_side, submitted_by, confirmed_by, confirmed_at, created_at)
    values
      (v_match, v_score, v_games, 'confirmed',
       case when v_wins_a > v_wins_b then 'a' else 'b' end,
       v_players[v_a], v_players[v_b], v_played + interval '1 hour', v_played);
  end loop;
end;
$$;

-- Replay everything through the rating engine, and void the stale pending
-- result from 04_past_games.sql (it is 30 days old).
select private.expire_pending_results();
select private.rebuild_ratings();
