-- BL-003 (remaining gaps): schema for results, ratings and quick messages.
-- Player BE-2, see docs/features/M2-results-and-rankings.md.
--
-- 1. match_result keeps its games as structured data, and who confirmed it.
--    The 'expired' status is new (BL-056).
-- 2. dispute is tied to the result it challenges.
-- 3. Rating state (private) and rating history, for the rating engine (BL-024).
-- 4. The 64 Gauss-Hermite nodes the engine integrates over, as constants.
-- 5. result_flag: checks that admins review (BL-023, BL-056).
-- 6. match_message and its fixed templates (BL-085).
-- 7. Two notification types.
-- 8. Every write to matches, results and disputes now goes through functions.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. match_result
-- ---------------------------------------------------------------------------

alter table public.match_result
  add column games jsonb not null default '[]'::jsonb
    check (jsonb_typeof(games) = 'array'),
  add column confirmed_by uuid references public.player (player_id) on delete set null,
  add column confirmed_at timestamptz;

alter table public.match_result
  drop constraint match_result_status_check,
  add constraint match_result_status_check
    check (status in ('pending', 'confirmed', 'disputed', 'rejected', 'expired'));

comment on column public.match_result.games is
  'The games as an ordered array of [side_a_points, side_b_points] pairs, for '
  'example [[21,15],[19,21],[21,16]]. Written only by submit_result, which checks '
  'the scores are legal. score is the same thing as display text.';
comment on column public.match_result.confirmed_by is
  'The opposing player who confirmed the result. Null until confirmed.';
comment on column public.match_result.status is
  'pending (waiting for the opponent), confirmed (counts for ratings), disputed '
  '(held until an admin resolves it), rejected (an admin threw it out) or '
  'expired (nobody confirmed it within 7 days; never counts).';

create index match_result_pending_idx
  on public.match_result (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. dispute knows its result
-- ---------------------------------------------------------------------------

alter table public.dispute
  add column result_id uuid references public.match_result (result_id) on delete cascade;

comment on column public.dispute.result_id is
  'The result being challenged. A match has one result, so this is set by '
  'raise_dispute.';

create index dispute_result_id_idx on public.dispute (result_id);

-- ---------------------------------------------------------------------------
-- 3. Rating state and history (singles)
-- ---------------------------------------------------------------------------
-- The state lives in the private schema: players read it only through the
-- screen functions. mean and variance are double precision, as in the
-- reference implementation, and are kept at full precision.

create table private.rating_state (
  player_id uuid primary key references public.player (player_id) on delete cascade,
  mean double precision not null,
  variance double precision not null check (variance > 0),
  trusted_matches integer not null default 0 check (trusted_matches >= 0),
  distinct_opponents integer not null default 0 check (distinct_opponents >= 0),
  is_established boolean not null default false,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table private.rating_state is
  'One row per player with a trusted singles result: the mean skill estimate, '
  'its variance (RD squared) and the placement counters. Rebuilt from confirmed '
  'results by private.rebuild_ratings().';

-- The covariance between two players' estimates. Only non-zero off-diagonal
-- entries are stored; the diagonal is rating_state.variance.
create table private.rating_covariance (
  player_lo uuid not null references public.player (player_id) on delete cascade,
  player_hi uuid not null references public.player (player_id) on delete cascade,
  cov double precision not null,
  primary key (player_lo, player_hi),
  check (player_lo < player_hi)
);

create index rating_covariance_hi_idx on private.rating_covariance (player_hi);

comment on table private.rating_covariance is
  'Off-diagonal covariance entries, one row per pair (lower player id first).';

revoke all on private.rating_state from public, anon, authenticated;
revoke all on private.rating_covariance from public, anon, authenticated;

create table public.rating_history (
  history_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player (player_id) on delete cascade,
  result_id uuid not null references public.match_result (result_id) on delete cascade,
  match_id uuid not null references public.match (match_id) on delete cascade,
  played_at timestamptz not null,
  rating_before double precision not null,
  rating_after double precision not null,
  rd_before double precision not null,
  rd_after double precision not null,
  is_established boolean not null,
  created_at timestamptz not null default now(),
  unique (result_id, player_id)
);

create index rating_history_player_idx on public.rating_history (player_id, played_at);

comment on table public.rating_history is
  'One row per player per processed result: the rating and RD before and after. '
  'The source for the rating trend and the rating change shown against a match.';

alter table public.rating_history enable row level security;

create policy "rating_history: your own, or an admin's"
  on public.rating_history for select to authenticated
  using (player_id = (select auth.uid()) or (select private.is_admin()));

revoke insert, update, delete on public.rating_history from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gauss-Hermite nodes (physicists', weight e^(-x^2)), from
--    numpy.polynomial.hermite.hermgauss(64)
-- ---------------------------------------------------------------------------

create table private.gauss_hermite_64 (
  j smallint primary key check (j between 1 and 64),
  x double precision not null,
  w double precision not null
);

revoke all on private.gauss_hermite_64 from public, anon, authenticated;

insert into private.gauss_hermite_64 (j, x, w) values
  (1, -10.526123167960547, 5.535706535856702e-49),
  (2, -9.89528758682954, 1.6797479901081265e-43),
  (3, -9.373159549646722, 3.421138011255724e-39),
  (4, -8.907249099964769, 1.5573906246298057e-35),
  (5, -8.477529083379864, 2.549660899112934e-32),
  (6, -8.073687285010225, 1.9291035954649948e-29),
  (7, -7.689540164040497, 7.86179778892592e-27),
  (8, -7.321013032780949, 1.9117068833006365e-24),
  (9, -6.965241120551108, 2.982862784279844e-22),
  (10, -6.620112262636027, 3.1522545665037683e-20),
  (11, -6.284011228774828, 2.3518847106758327e-18),
  (12, -5.955666326799486, 1.2800933913224332e-16),
  (13, -5.634052164349972, 5.218623726590811e-15),
  (14, -5.318325224633271, 1.6283407307097183e-13),
  (15, -5.007779602198768, 3.9591777669477106e-12),
  (16, -4.7018156474075, 7.615217250145398e-11),
  (17, -4.3999171682281375, 1.1736167423215559e-09),
  (18, -4.101634474566657, 1.4651253164761057e-08),
  (19, -3.8065715139453604, 1.4955329367272468e-07),
  (20, -3.5143759357409063, 1.2583402510311817e-06),
  (21, -3.2247312919920357, 8.788499230850359e-06),
  (22, -2.9373508230046217, 5.125929135786274e-05),
  (23, -2.651972435430635, 0.0002509836985130626),
  (24, -2.3683545886324016, 0.0010363290995075763),
  (25, -2.086272879881762, 0.0036225869785344584),
  (26, -1.805517171465545, 0.01075604050987913),
  (27, -1.5258891402098635, 0.02720312895368891),
  (28, -1.247200156943118, 0.05873998196409944),
  (29, -0.969269423071178, 0.10849834930618672),
  (30, -0.6919223058100445, 0.17168584234908366),
  (31, -0.4149888241210787, 0.23299478606267818),
  (32, -0.13830224498700974, 0.27137742494130396),
  (33, 0.13830224498700974, 0.27137742494130396),
  (34, 0.4149888241210787, 0.23299478606267818),
  (35, 0.6919223058100445, 0.17168584234908366),
  (36, 0.969269423071178, 0.10849834930618672),
  (37, 1.247200156943118, 0.05873998196409944),
  (38, 1.5258891402098635, 0.02720312895368891),
  (39, 1.805517171465545, 0.01075604050987913),
  (40, 2.086272879881762, 0.0036225869785344584),
  (41, 2.3683545886324016, 0.0010363290995075763),
  (42, 2.651972435430635, 0.0002509836985130626),
  (43, 2.9373508230046217, 5.125929135786274e-05),
  (44, 3.2247312919920357, 8.788499230850359e-06),
  (45, 3.5143759357409063, 1.2583402510311817e-06),
  (46, 3.8065715139453604, 1.4955329367272468e-07),
  (47, 4.101634474566657, 1.4651253164761057e-08),
  (48, 4.3999171682281375, 1.1736167423215559e-09),
  (49, 4.7018156474075, 7.615217250145398e-11),
  (50, 5.007779602198768, 3.9591777669477106e-12),
  (51, 5.318325224633271, 1.6283407307097183e-13),
  (52, 5.634052164349972, 5.218623726590811e-15),
  (53, 5.955666326799486, 1.2800933913224332e-16),
  (54, 6.284011228774828, 2.3518847106758327e-18),
  (55, 6.620112262636027, 3.1522545665037683e-20),
  (56, 6.965241120551108, 2.982862784279844e-22),
  (57, 7.321013032780949, 1.9117068833006365e-24),
  (58, 7.689540164040497, 7.86179778892592e-27),
  (59, 8.073687285010225, 1.9291035954649948e-29),
  (60, 8.477529083379864, 2.549660899112934e-32),
  (61, 8.907249099964769, 1.5573906246298057e-35),
  (62, 9.373159549646722, 3.421138011255724e-39),
  (63, 9.89528758682954, 1.6797479901081265e-43),
  (64, 10.526123167960547, 5.535706535856702e-49);

-- ---------------------------------------------------------------------------
-- 5. Result flags
-- ---------------------------------------------------------------------------

create table public.result_flag (
  flag_id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.match_result (result_id) on delete cascade,
  match_id uuid not null references public.match (match_id) on delete cascade,
  kind text not null check (kind in (
    'repeat_pairing', 'unusual_win_pattern', 'rating_swing'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (result_id, kind)
);

create index result_flag_match_id_idx on public.result_flag (match_id);

comment on table public.result_flag is
  'Unusual patterns logged for an admin to review (BL-023, BL-056). A flag never '
  'blocks a result. Written only by the result functions.';

alter table public.result_flag enable row level security;

create policy "result_flag: admins read"
  on public.result_flag for select to authenticated
  using ((select private.is_admin()));

revoke insert, update, delete on public.result_flag from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Match quick messages (BL-085)
-- ---------------------------------------------------------------------------

create table public.match_message_template (
  template_code text primary key,
  label text not null,
  sort_order smallint not null
);

comment on table public.match_message_template is
  'The fixed preset messages a player can send to the other player in a match. '
  'No free text: match_message.template_code must be one of these.';

insert into public.match_message_template (template_code, label, sort_order) values
  ('on_my_way',       'On my way',          1),
  ('running_late_5',  'Running 5 min late', 2),
  ('running_late_15', 'Running 15 min late', 3),
  ('arrived',         'I''ve arrived',      4),
  ('court_booked',    'Court is booked',    5),
  ('cant_make_it',    'Can''t make it',     6),
  ('good_game',       'Good game!',         7);

alter table public.match_message_template enable row level security;

create policy "match_message_template: readable by signed-in players"
  on public.match_message_template for select to authenticated
  using (true);

revoke insert, update, delete on public.match_message_template from anon, authenticated;

create table public.match_message (
  message_id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (match_id) on delete cascade,
  sender_id uuid not null references public.player (player_id) on delete cascade,
  template_code text not null references public.match_message_template (template_code),
  created_at timestamptz not null default now()
);

create index match_message_match_idx on public.match_message (match_id, created_at);

comment on table public.match_message is
  'A preset status message from one player in a match to the other(s). Access '
  'rules and the Realtime channel come in the BL-085 migration.';

alter table public.match_message enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Notification types
-- ---------------------------------------------------------------------------

alter table public.notification drop constraint notification_type_check;
alter table public.notification add constraint notification_type_check check (type in (
  'match_reminder', 'match_invite', 'result_submitted', 'dispute_update', 'league_update',
  'system', 'game_cancelled', 'game_removed', 'join_request', 'request_accepted',
  'request_declined', 'request_withdrawn', 'no_show', 'invite_accepted', 'invite_declined',
  'result_confirmed', 'result_expired'));

-- ---------------------------------------------------------------------------
-- 8. Matches, results and disputes are written only through functions
-- ---------------------------------------------------------------------------
-- A player who could insert or edit these directly could skip every check in
-- submit_result, confirm_result and raise_dispute, or delete a match whose
-- result already moved ratings. Players keep read access. Admins keep write
-- access for corrections (the admin lane replaces this with its own functions).

drop policy "match: record one in a game you are in, or a league you run" on public.match;
drop policy "match: creator, league organiser or admin edits" on public.match;
drop policy "match: creator, league organiser or admin deletes" on public.match;

create policy "match: admins create"
  on public.match for insert to authenticated
  with check ((select private.is_admin()));
create policy "match: admins edit"
  on public.match for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "match: admins delete"
  on public.match for delete to authenticated
  using ((select private.is_admin()));

drop policy "match_participant: join yourself, or be added by the organiser" on public.match_participant;
drop policy "match_participant: set own attendance, or the organiser sets any" on public.match_participant;
drop policy "match_participant: leave, or be removed by the organiser" on public.match_participant;

create policy "match_participant: admins add"
  on public.match_participant for insert to authenticated
  with check ((select private.is_admin()));
create policy "match_participant: admins edit"
  on public.match_participant for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "match_participant: admins remove"
  on public.match_participant for delete to authenticated
  using ((select private.is_admin()));

drop policy "match_result: participants submit a pending result" on public.match_result;
drop policy "dispute: participants raise one" on public.dispute;

-- Nobody inserts results or disputes directly, admins included: only
-- submit_result and raise_dispute create them.
revoke insert on public.match_result, public.dispute from anon, authenticated;

comment on table public.match is
  'One contest between two sides (match_participant.side a and b): 1 v 1 for singles, '
  '2 v 2 for doubles, within a game (post_id). Created by submit_result when a player '
  'records a result; players never write it directly. Admins may correct it.';
comment on table public.match_participant is
  'Who played on which side of a match. Written by submit_result from the game''s '
  'accepted roster; players never write it directly. Admins may correct it.';
comment on table public.match_result is
  'The result of a match: games (side a points first), the winning side and its status '
  '(pending, confirmed, disputed, rejected, expired). Created only by submit_result, '
  'confirmed by the other side with confirm_result, challenged with raise_dispute, and '
  'expired by an hourly job after 7 days. Admins may confirm, reject or remove one. A '
  'unique index keeps at most one confirmed result per match.';
comment on table public.dispute is
  'A challenge to a pending result, raised by the other side with raise_dispute. It '
  'holds the result out of the ratings until an admin decides it.';
