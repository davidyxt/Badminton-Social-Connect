# Row Level Security: access model for review

This describes who can read and write each table in the Badminton Social
Connect database. The policies themselves live in the four migrations under
`supabase/migrations/`.

**Please read the "Open questions" section at the end.** Several rules were
inferred from the ER diagram rather than from a stated requirement, and a few
tables in the diagram had no way to express ownership at all.

---

## Why this matters more than usual

Our React app talks to Postgres over HTTP using a key that ships in the browser.
Anyone can open devtools, copy that key and issue their own queries. There is no
backend of ours in the middle deciding what they may see.

So the permission check has to live in the database. That is what Row Level
Security is: rules attached to a table saying which rows each caller may touch.
Postgres applies them to every query regardless of where it came from.

Two consequences worth internalising:

- **A table without RLS is public.** If someone adds a table in a later
  migration and forgets `enable row level security`, everything in it is
  readable and writable by anyone with the publishable key. Every table created
  so far has it enabled; new ones need it too.
- **Denied reads are silent.** A query that a policy blocks returns zero rows,
  not an error. An `update` that matches nothing reports success with zero rows
  affected. If data "mysteriously disappears" in the frontend, suspect a policy
  before suspecting the query.

## The four callers

| Caller | What it is | Gets |
|---|---|---|
| `anon` | Holding the publishable key, not signed in | **Nothing.** No policy grants anon anything. |
| `authenticated` | A signed-in player | Their own data, plus what the app is meant to show publicly |
| admin | A signed-in player with `role: admin` in their JWT `app_metadata` | Moderation and staff powers |
| `service_role` | The secret key, server-side only | Everything; bypasses RLS entirely |

Admin status is read from `app_metadata`, never `user_metadata`. The difference
matters: `user_metadata` is writable by the user themselves through a normal API
call, so anyone could make themselves an admin. `app_metadata` can only be
written with the secret key. To grant admin:

```bash
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<user-id>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"app_metadata": {"role": "admin"}}'
```

A JWT claim only refreshes when the user's token does, so a newly promoted admin
may need to sign out and back in.

---

## Read access

| Table | Who can read |
|---|---|
| `player` | Any signed-in player (the roster: names, bands, verified flag) |
| `player_profile` | Your own row; other players' rows only while `is_discoverable` is true |
| `venue` | Any signed-in player |
| `mini_league` | Any signed-in player |
| `league_standing` | Any signed-in player |
| `game_post` | Any signed-in player |
| `game_participant` | **Accepted** rows: any signed-in player, so the board can show places taken. **Pending or rejected** rows: only the player who asked, and the organiser |
| `cancellation_record` | Any signed-in player |
| `club` | Any signed-in player |
| `club_representative` | Any signed-in player |
| `match` | Any signed-in player |
| `match_participant` | Players in that match, plus whoever manages it |
| `check_in` | Players in that match, plus whoever manages it |
| `match_result` | Players in that match, plus whoever manages it |
| `dispute` | Players in that match, the person who raised it, plus whoever manages it |
| `ranking` | Any signed-in player (leaderboards) |
| `notification` | Yours only |
| `report` | Only the person who filed it, plus admins |
| `admin_post` | Published announcements only; admins also see drafts |

Admins can read everything in every table.

## Write access

| Table | Insert | Update | Delete |
|---|---|---|---|
| `player` | Trigger only, on sign-up | Own row, and only `display_name` / `self_rating_band` | Cascades from `auth.users` |
| `player_profile` | Trigger only, on sign-up | Own row, and only `bio` / `suburb` / `state` / `is_discoverable` | Cascades |
| `venue` | Admin | Admin | Admin |
| `mini_league` | Any player, as organiser | Organiser or admin | Organiser or admin |
| `league_standing` | League organiser or admin | Same | Same |
| `game_post` | As yourself, or as a club you represent | Organiser, club rep or admin | Organiser, club rep or admin |
| `game_participant` | Request to join as yourself, `status` forced to `requested`. The organiser may add people directly | The organiser decides accept/reject; you may only move your own row to `withdrawn` | Yourself, or the organiser |
| `cancellation_record` | Organiser of the post (player or club rep), or admin | Admin | Admin |
| `club` | Any player, as themselves | Representatives or admin, and not `is_verified` | Representatives or admin |
| `club_representative` | An existing representative, or admin | n/a | Yourself only, or admin |
| `match` | Anyone on the game's roster, or the league organiser for a fixture | Creator, game organiser, league organiser or admin | Same |
| `match_participant` | Yourself, or the match manager adding you. Must be on the game's roster | Your own attendance, or the manager's | Yourself, or the manager |
| `check_in` | Yourself, only if you are a participant, only unverified | Admin | Admin |
| `match_result` | Participants, `status` forced to `pending` | Admin | Admin |
| `dispute` | Participants, `status` forced to `open` | Admin | Admin |
| `ranking` | Nobody | Admin | Nobody |
| `notification` | Admin | Own row, and only `is_read` | Own row |
| `report` | Yourself, `status` forced to `open` | Admin | Admin |
| `admin_post` | Admin, as themselves | Admin | Admin |

## Things deliberately out of reach

Some columns hold values a player would obviously like to control and must not.
RLS decides which **rows** you may write, not which **columns**, so these are
locked another way: either a column-level grant, which makes the column
unreachable with the browser key so that changing it becomes a `service_role`
operation, or a trigger that overwrites whatever the client sent.

| Column | Why |
|---|---|
| `player.is_verified` | Otherwise any player awards themselves a verification badge |
| `club.is_verified` | Same. Anyone can register a club, so the badge is the only signal that it is genuine |
| `player_profile.reliability_score` | Derived from no-shows; self-reporting defeats the point |
| `player_profile.games_played`, `.no_show_count` | Same |
| `notification` (all but `is_read`) | Otherwise players rewrite the text of their own notifications |
| `ranking` (inserts and deletes) | Points are computed from confirmed results, never claimed |
| `updated_at` / `updated_by`, everywhere | A trigger overwrites whatever the client sends. A field recording who changed a status is worthless if the person changing it picks the value |

Four more rules are enforced in the policies rather than by grants:

- A player may **request** to join a game but cannot set their own status to
  `accepted`. Only the organiser can. The insert policy pins `status` to
  `requested`, and the update policy lets a player move their own row only to
  `withdrawn`.
- A player can only insert a `check_in` for themselves, for a match they are
  in, and only with `verified = false`. Staff verify separately.
- A submitted `match_result` must start as `pending`. Confirming it is a
  separate, privileged step.
- A `report` and a `dispute` must start as `open`, and the person who filed it
  cannot edit it afterwards, so the moderation trail holds.

There is also a partial unique index ensuring **at most one `confirmed` result
per match**, no matter how many are submitted.

## Integrity enforced by triggers

These rules cannot be check constraints, because they count rows in other
tables or depend on who is calling. They
run as triggers, so they apply to `service_role` and to anything written outside
the API as well.

| Trigger | Rule |
|---|---|
| `game_participant_capacity` | A game cannot accept more players than `player_limit` |
| `match_participant_validate` | Players must be on the game's accepted roster; one per side for singles, two for doubles |
| `match_completion_validate` | A match cannot become `completed` with sides that are not full |
| `<table>_set_updated_metadata` | Stamps `updated_at` and `updated_by` on all 18 changeable tables, ignoring anything the client sent |

Sides can be filled one player at a time, so the exact count is only required at
completion. All three raise `23514` (check violation), which PostgREST returns
as a `400` with the message intact, so the frontend can show it.

## Helper functions

Seven functions live in a `private` schema that is not exposed through the API
(it is absent from `db.schemas` in `config.toml`, and the test suite checks it
cannot be called as an RPC).

| Function | Purpose |
|---|---|
| `private.is_admin()` | Reads `role` from the caller's own JWT `app_metadata` |
| `private.is_match_participant(match_id)` | Are you in this match? |
| `private.can_manage_match(match_id)` | Did you create it, or do you organise its league? |
| `private.is_league_organiser(league_id)` | Do you organise this league? |
| `private.can_post_for_club(club_id)` | Are you a listed representative of this club? |
| `private.can_manage_post(post_id)` | Did you post this game, or represent the club that did? |
| `private.is_game_participant(post_id)` | Are you on this game's accepted roster? |

All but the first are `security definer`, which means they run with elevated
privileges and skip RLS on the tables they read. That is not laziness. It is
required: a policy on `match_participant` that needs to ask "is this person a
participant?" would re-enter `match_participant`'s own policy and recurse
forever. Each function checks `auth.uid()` internally, so it can only ever
answer questions about the caller.

`private.is_admin()` is deliberately **not** `security definer`: it reads only
the caller's own token and needs no extra privilege.

---

## Verifying it

`supabase/tests/rls_test.sh` runs 68 checks against the local stack. It signs up
two real players through the Auth API and drives PostgREST exactly as the
browser would, so it tests the policies as deployed rather than the SQL as
written.

```bash
supabase start
supabase db reset --local
./supabase/tests/rls_test.sh
```

All 68 pass as of this migration. It covers: the sign-up trigger, the
discoverability rule, cross-user writes, the escalation paths above, anonymous
access, game post ownership, the private schema not being exposed, club
representation, the exactly-one-organiser constraint, and organiser embedding.

Add a case here whenever you add a policy. A policy that is subtly too
permissive is worse than no policy, because it looks like it is protecting you.

Also worth running after any schema change:

```bash
supabase db advisors --local --level warn
```

It currently reports nothing above INFO. The INFO entries are "unused index"
notices, which are expected on a database with no traffic yet.

---

## Open questions

These need a decision from the team. Each one is a guess I made to get the
schema working, marked `DEVIATION` in the migration.

1. **`updated_by` is not a foreign key to `player`.** Making it one gives every
   table a second relationship to `player`, which makes `player(display_name)`
   ambiguous in PostgREST and forces every embed in the app to name its foreign
   key explicitly. The trigger is the only writer and takes the value from
   `auth.uid()`, so the constraint would protect nothing. The cost is that a
   deleted player's id lingers in `updated_by` and joins to nothing. Worth a
   conscious nod from whoever owns the frontend queries.

2. **Anyone on the roster can record a match, not just the organiser.** At a
   session with two courts running, making one person record everything does not
   survive contact with reality. The cost is that any accepted player can create
   matches and add other roster players to them. Tighten to organiser-only if
   that turns out to be a problem.

3. **The organiser automatically takes one of the places.** I read "a game of 4"
   as four people on court including whoever posted it, so the
   `on_game_post_created` trigger adds them as `accepted`. If a post is
   sometimes made by someone arranging but not playing, this is wrong and the
   auto-join should become a choice on the form.

4. **A rejected player can ask again.** The update policy lets a player move
   their own row back to `requested`, so a rejection is not final. That is
   friendly but allows pestering. Should `rejected` be a dead end?

5. **Check-ins are per match, but people check in to a session.** `check_in` is
   keyed on `(match_id, player_id)`, which predates the game and match split. In
   practice you arrive once and play five matches. This probably wants to move
   to `(post_id, player_id)`, but I left it alone rather than guess.

6. **`game_post.status` does not update itself.** Nothing flips it to `full`
   when the last place is taken; the capacity trigger only refuses further
   acceptances. The frontend can compare accepted count against `player_limit`,
   or we add a trigger. I avoided one because it would fight with an organiser
   setting the status by hand.

7. **Anyone can register a club, and unverified clubs can post.** Nothing stops
   someone creating "Melbourne Badminton Association" and posting as it. The
   `is_verified` badge is the only signal, and it is staff-set. The alternatives
   are to let only admins create clubs (no self-service) or to block unverified
   clubs from posting until approved. I chose the open default to match how
   player verification already works, but this is an impersonation risk and
   worth a deliberate decision.

8. **Club representatives can add other representatives.** Whoever registers the
   club becomes the first one, and any representative can add more. A
   representative can only remove *themselves*, never another, so two people who
   fall out cannot remove each other in a race. Admins settle those disputes.
   If clubs should instead have a single owner who controls the list, say so.

9. **Deleting a club deletes its game posts.** `game_post.organiser_club_id`
   cascades. Representatives can delete the club, so one representative can
   destroy the club's whole posting history. Should deletion be admin-only, or
   should we soft-delete instead?

10. **`match` had no owner, so I added `created_by`.** A casual match created
   from a game post belongs to no league, so there was no way to say in a policy
   who may edit it. Without this column, casual matches would be editable by
   nobody or by everybody. Does that match the intended flow?

11. **`match_result.submitted_by` and `dispute.raised_by` are additions.** Both
   are needed for the policies to work: without them we cannot let a player see
   the dispute they raised, or tell who claimed which score when two results
   conflict.

12. **Matches are readable by every signed-in player.** I assumed matches are
   social and non-sensitive. If a private or invite-only match is a real
   requirement, this policy needs to narrow to participants and league members.

13. **Announcements are signed-in only.** `admin_post` is not readable by `anon`,
   so published announcements cannot appear on a logged-out landing page. Easy
   to relax if marketing wants that; I chose the safer default.

14. **Verification and reliability scores have no writer yet.** They are locked to
   `service_role`, which means something server-side has to update them: an
   Edge Function, or a scheduled job. Nothing does yet.

15. **`league_standing` is writable by the league organiser.** It is derived data,
   so arguably it should be `service_role` only like `ranking`. I left it open
   because a small-league organiser may need to correct a score by hand.

16. **`reliability_score` is `numeric(5,2)`, not a float.** The diagram says
   float. Exact decimals mean leaderboard ordering is deterministic and does not
   drift with rounding.

17. **`check_in.timestamp` renamed to `checked_in_at`.** `timestamp` is a SQL type
   name and reads ambiguously in queries.
