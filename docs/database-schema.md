# Database Schema

Implemented across 50 migrations in `supabase/migrations/`, including Player BE-2 0.4. This describes the shared database; the Admin Edge API adds the Final v6 restrictions in [admin-api.md](admin-api.md).

| Migration | What it adds |
|---|---|
| `..._initial_schema.sql` | The 16 tables from the original ER diagram, with RLS |
| `..._clubs_as_organisers.sql` | `club`, `club_representative` (now `groups`, `group_member`), and clubs as game post organisers |
| `..._game_participants_and_match_sides.sql` | The join flow, the game-to-match link, and sides |
| `..._audit_columns.sql` | `updated_at` / `updated_by` on every table that can change |
| `..._bl080_club_admins_and_join_requests.sql` | Club (now group) admins, members and join requests (M6); deactivated instead of deleted |
| `..._bl011_preferred_format.sql` | `player_profile.preferred_format` (BL-011) |
| `..._bl001_states_suburbs_venues.sql` | `state` and `suburb` reference tables; venues get a suburb (BL-001) |
| `..._m4_username_and_private_names.sql` | `display_name` renamed `username` (unique, player-chosen); first and last names in owner-only `player_private` |
| `..._bl007_age_gate_and_consent.sql` | 18+ age gate, consent records, `register_player`; unregistered accounts locked out (BL-007) |
| `..._bl013_game_posts.sql` | Post a Game fields, cancel with the 4-hour rule, delete hides, admin-only delete of games that happened, inactive groups have no upcoming games (BL-013) |
| `..._bl017_join_requests.sql` | Join request RPCs, request messages, status history (BL-017) |
| `..._bl019_player_profiles.sql` | `get_player_profile` and the stats behind it (BL-019) |
| `..._bl015_find_games.sql` | `game_post.title`, `search_games`, `search_players`, `get_game_details`, `get_join_requests` (BL-015) |
| `..._bl007_age_gate_local_date.sql` | Fix: age judged by the date in the player's state, not UTC |
| `..._bl027_blocking.sql` | `blocks`; blocked players hidden from each other everywhere (BL-027) |
| `..._bl028_reports.sql` | Report categories, server-captured evidence, rate limits, `report_*` functions (BL-028) |
| `..._bl027_one_sided_blocking.sql` | Blocking revised to be one-sided: the blocker still sees the blocked player, badged (BL-027) |
| `..._bl050_notifications.sql` | `dispatch_notification`, request/acceptance notifications, Realtime, notification screen functions (BL-050) |
| `..._bl054_no_shows_and_late_withdrawals.sql` | `no_show` status, `late_withdrawal`, `mark_no_show` / `clear_no_show` (BL-054) |
| `..._bl052_reliability.sql` | `private.reliability`, profile copies refreshed on change and hourly by `pg_cron` (BL-052) |
| `..._bl060_playing_history.sql` | `get_player_history` (BL-060) |
| `..._bl087_email_notifications.sql` | Email for every notification via `pg_net` and the `send-email-notification` Edge Function; opt-out (BL-087) |
| `..._bl001_venue_locations_and_maps.sql` | Venue `latitude`, `longitude`, `source_url` and a generated Google Maps `maps_url` |
| `..._venue_geocoding_queue.sql` | Venues without a pin are queued and geocoded by the `geocode-venues` Edge Function (Nominatim, one worker, 1 request/s) |
| `..._m4_my_home_and_profile.sql` | `get_my_home`, `get_my_profile`, `update_my_profile` for the Home and Profile pages |
| `..._bl080_join_by_request_only.sql` | Players join groups only by asking; admins cannot add members directly (team item 4) |
| `..._m4_username_required.sql` | No generated usernames: email sign-ups must send one, Google sign-ups choose it in `register_player(p_username)` (item 9) |
| `..._account_deletion.sql` | Deleting an account keeps the player as "Deleted User" with results and rankings; `delete_my_account` (item 5) |
| `..._bl028_report_details_required.sql` | Every report needs details (item 12) |
| `..._bl027_block_reasons_and_blocker_profiles.sql` | Blocks carry an optional category and reason; the blocker can open the blocked player's profile (item 13) |
| `..._bl052_reliability_band.sql` | Every reliability count on the API (item 14); its band was dropped again in `venue_search_and_no_reliability_band` |
| `..._wiring_form_options_and_profile_fields.sql` | `get_game_form_options`, "Badminton game" default title, Maps links on cards, preferred format and email opt-out in `update_my_profile` |
| `..._revoke_anon_function_access.sql` | Signed-out visitors can call only `is_username_available` |
| `..._api_descriptions.sql` | Function descriptions used to build the API spec |
| `..._clubs_are_groups.sql` | Clubs renamed groups everywhere: `club` → `groups` (`group` is an SQL keyword), `club_representative` → `group_member`, `club_id` → `group_id`, `organiser_club_id` → `organiser_group_id`, `report_club` → `report_group`, `isClub` → `isGroup`, and every function, policy, trigger and description |
| `..._request_game_invitations.sql` | Request Game: `invite_player`, `accept_invite`, `decline_invite`; `game_post.invited_player_id`; `invited` and `declined` participant statuses; invitation games private to the two players |
| `..._my_home_last_name.sql` | `get_my_home` also returns `lastName` |
| `..._find_games_one_search_bar.sql` | The Find Games search bar matches a location, day, time, date, level, format, style or title |
| `..._game_card_host_venue_duration.sql` | Game cards call the organiser `host` (as every screen does) and carry `venue`, `duration` and `durationMinutes` |
| `..._my_games_availability_profile_pictures.sql` | `get_my_games` (Home's `nextGames` is its first 3); `player_profile.availability`, `availability_note`, `profile_image_url`; the `avatars` Storage bucket and its policies; `set_my_profile_picture`, `remove_my_profile_picture` |
| `..._game_details_host_actions.sql` | Game Details' `hostActions` (when the host can cancel, delete and mark no-shows) and no-show players on the host's roster |
| `..._games_hold_matches.sql` | `create_match` / `remove_match` and `matches[]` on Game Details (removed again by the next migration) |
| `..._matches_left_out_delete_needs_empty_game.sql` | Matches left to the teammate building results: no `create_match` / `remove_match`, no automatic match on acceptance, `matches: []` on Game Details. `delete_game_post` refused once anyone has asked to join |
| `..._bl003_results_ratings_messages_schema.sql` | Player BE-2 schema: `match_result.games`, `confirmed_by`, `confirmed_at`, status `expired`; `dispute.result_id`; the private rating state; `rating_history`; `result_flag`; `match_message` and its templates; writes to match, result and dispute tables only through functions |
| `..._bl021_bl023_result_flow.sql` | `submit_result` (creates the match), `confirm_result`, `get_match`, `get_my_pending_results`, `matches[]` and `canRecordResult` on Game Details |
| `..._bl024_bl062_rating_engine.sql` | The rating engine and its nightly pg_cron run, starting ratings, grades, the rating card, `ratingChange` in history, `admin_rebuild_ratings` |
| `..._bl056_bl058_disputes_checks_expiry.sql` | `raise_dispute`, result flags, hourly expiry of pending results |
| `..._bl025_rankings.sql` | `get_rating_summary`, `get_rating_trend`, `get_leaderboard` |
| `..._bl085_match_messages.sql` | Quick messages: access rules, send limit, private Realtime channel, `get_match_messages` |
| `..._venue_search_and_no_reliability_band.sql` | `search_venues` for the venue dropdown (trigram indexes on venue and suburb names); `get_game_form_options` no longer lists venues; no reliability band, the screens show a % |

Access rules are documented separately in [rls-policies.md](./rls-policies.md),
which also lists the open questions this schema left unresolved.

## Conventions

- Lowercase `snake_case` identifiers, unquoted everywhere.
- `uuid` primary keys. `player.player_id` **is** the `auth.users` id. Deleting
  the auth user does not delete the player: `on_auth_user_deleted` turns them
  into "Deleted User" (`player.deleted_at`), keeping their results and rankings
  and removing everything personal.
- `timestamptz` for every point in time, never bare `timestamp`.
- Enum-like columns are `text` plus a `check` constraint rather than a Postgres
  `enum` type, so a later migration can add a value without `alter type`.
- Every foreign key column has an index. Postgres does not create these
  automatically, and without them both joins and cascading deletes fall back to
  sequential scans.
- Money and reliability copies use exact numeric types. Ranking points are rounded integers; Bayesian rating state/history uses double precision, and per-game scores are integers in JSON arrays.
- Every table that can change carries `updated_at` and `updated_by`, stamped by
  a trigger. See [Audit columns](#audit-columns) below.

## Entity relationships

Mutable domain rows carry `updated_at` and `updated_by`; append-only history/messages, blocks and reference tables have their own timestamp rules. The audit columns are stamped by a trigger and ignore anything
a client sends; `updated_by` is shown without an `FK` marker because it
deliberately is not one. See [Audit columns](#audit-columns) for why.

```mermaid
erDiagram
    PLAYER {
        uuid player_id PK "= auth.users.id"
        text username UK "player-chosen, unique ignoring case"
        text self_rating_band
        boolean is_verified "service_role only"
        timestamptz joined_at
        timestamptz deleted_at "set when the account is deleted: Deleted User"
        timestamptz updated_at
        uuid updated_by
    }

    PLAYER_PRIVATE {
        uuid player_id PK,FK
        text first_name "owner and admins only"
        text last_name "owner and admins only"
        date date_of_birth "set once, adults only"
        timestamptz age_declared_at
        text terms_version
        timestamptz terms_accepted_at
        text privacy_version
        timestamptz privacy_accepted_at
        timestamptz registered_at "null = locked out"
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    PLAYER_PROFILE {
        uuid player_id PK,FK
        text bio
        text suburb
        text state
        text preferred_format "singles | doubles | mixed_doubles | any"
        numeric reliability_score "service_role only"
        int games_played "service_role only"
        int no_show_count "service_role only"
        int late_withdrawal_count "service_role only"
        int late_cancellation_count "service_role only"
        boolean is_discoverable
        boolean email_notifications "email opt-out"
        text_array availability "e.g. mon_evening, sat_morning"
        text availability_note
        text profile_image_url "public URL in the avatars bucket"
        timestamptz updated_at
        uuid updated_by
    }

    NOTIFICATION {
        uuid notification_id PK
        uuid player_id FK
        uuid match_id FK "nullable"
        text type
        text message
        text detail "second line, e.g. the request message"
        uuid post_id FK "the game to open"
        boolean is_read
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    BLOCKS {
        uuid blocker_id PK,FK
        uuid blocked_id PK,FK
        text category "optional, report categories"
        text reason "optional, blocker and admins only"
        timestamptz created_at
    }

    REPORT {
        uuid report_id PK
        uuid reported_by_player_id FK
        text target_type "player, game_post, group, mini_league, ..."
        uuid target_id "polymorphic, no FK"
        text category "harassment, spam, underage, ..."
        text reason "details required for every report"
        jsonb evidence "copied by the server"
        text status
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    GAME_POST {
        uuid post_id PK
        uuid organiser_id FK "set when a player posts"
        uuid organiser_group_id FK "set when a group posts"
        text format
        text suburb "copied from the venue when one is chosen"
        uuid venue_id FK "seeded venue, null = other venue"
        text title "optional card title"
        text style "social | competitive"
        int duration_minutes
        text ability_level "any or a rating band"
        text notes
        int player_limit "places, organiser included"
        timestamptz proposed_time
        text status
        timestamptz deleted_at "hidden from players when set"
        uuid deleted_by
        text deletion_reason
        uuid invited_player_id FK "Request Game: private to the two players"
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    GAME_REQUEST_MESSAGE {
        uuid post_id PK,FK
        uuid player_id PK,FK
        text message "requester and host only"
        timestamptz created_at
    }

    GAME_PARTICIPANT_HISTORY {
        bigint history_id PK
        uuid post_id FK
        uuid player_id FK
        text from_status
        text to_status
        uuid changed_by
        timestamptz changed_at
    }

    GAME_PARTICIPANT {
        uuid post_id PK,FK
        uuid player_id PK,FK
        text status "requested/invited/accepted/rejected/declined/withdrawn/no_show"
        timestamptz requested_at
        timestamptz responded_at
        boolean late_withdrawal "gave up a place within 24 hours"
        timestamptz updated_at
        uuid updated_by
    }

    GROUPS {
        uuid group_id PK
        text name
        text slug UK
        text description
        text suburb
        text state
        text contact_email
        text logo_url
        boolean is_verified "service_role only"
        boolean is_active "false = deactivated"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    GROUP_MEMBER {
        uuid group_id PK,FK
        uuid player_id PK,FK
        text role "admin | member"
        text status "pending | approved"
        timestamptz added_at
        timestamptz updated_at
        uuid updated_by
    }

    ADMIN_POST {
        uuid admin_post_id PK
        uuid created_by FK
        text title
        text body
        text image_url
        int display_order
        text status
        timestamptz published_at
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    MINI_LEAGUE {
        uuid league_id PK
        uuid organiser_id FK
        text name
        timestamptz start_date
        timestamptz end_date
        text status
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    STATE {
        text state_code PK "NSW, VIC, ..."
        text name UK
    }

    SUBURB {
        uuid suburb_id PK
        text name
        text postcode "4 digits, text"
        text state_code FK
        numeric latitude
        numeric longitude
    }

    VENUE {
        uuid venue_id PK
        text name
        text address
        uuid suburb_id FK
        numeric latitude "null if the source pin was wrong"
        numeric longitude
        text source_url "where the listing came from"
        text coordinates_source "badmintonhub, openstreetmap or admin"
        text maps_url "generated Google Maps link"
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    VENUE_GEOCODE_QUEUE {
        bigint queue_id PK
        uuid venue_id FK
        text status "pending/done/failed"
        int attempts
        text last_error
        timestamptz created_at
        timestamptz processed_at
    }

    LEAGUE_STANDING {
        uuid league_id PK,FK
        uuid player_id PK,FK
        int wins
        int losses
        int points
        int position
        timestamptz updated_at
        uuid updated_by
    }

    CANCELLATION_RECORD {
        uuid post_id PK,FK
        timestamptz cancelled_at
        text reason
        boolean is_no_show
        timestamptz updated_at
        uuid updated_by
    }

    MATCH {
        uuid match_id PK
        uuid post_id FK "the game it was played in"
        uuid league_id FK "nullable, casual matches"
        uuid venue_id FK "nullable"
        uuid created_by FK "added, see note 2"
        text format
        timestamptz played_at
        text suburb
        text status
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    CHECK_IN {
        uuid match_id PK,FK
        uuid player_id PK,FK
        timestamptz checked_in_at "renamed from timestamp"
        text method
        boolean verified "staff only"
        timestamptz updated_at
        uuid updated_by
    }

    MATCH_PARTICIPANT {
        uuid match_id PK,FK
        uuid player_id PK,FK
        text side "a or b"
        text status "playing/no_show/withdrawn"
        timestamptz updated_at
        uuid updated_by
    }

    MATCH_RESULT {
        uuid result_id PK
        uuid match_id FK
        text score "display text, side a first"
        jsonb games "points per game, side a first"
        text winning_side "a or b, not a player"
        uuid submitted_by FK "added, see note 3"
        text status "pending/confirmed/disputed/rejected/expired"
        uuid confirmed_by FK
        timestamptz confirmed_at
        boolean excluded_from_ranking "game deleted by an admin"
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    DISPUTE {
        uuid dispute_id PK
        uuid match_id FK
        uuid result_id FK
        uuid raised_by FK "added, see note 3"
        text reason
        text status
        timestamptz created_at
        timestamptz updated_at
        uuid updated_by
    }

    RANKING {
        uuid player_id PK,FK
        text format PK
        int ranking_points
        text band
        int verified_games_count
        timestamptz updated_at
        uuid updated_by
    }

    RATING_HISTORY {
        uuid history_id PK
        uuid player_id FK
        uuid result_id FK
        uuid match_id FK
        timestamptz played_at "when the engine processed it"
        float rating_before
        float rating_after
        float rd_before
        float rd_after
        boolean is_established
    }

    RESULT_FLAG {
        uuid flag_id PK
        uuid result_id FK
        uuid match_id FK
        text kind "repeat_pairing/unusual_win_pattern/rating_swing"
        jsonb detail
        timestamptz created_at
    }

    MATCH_MESSAGE_TEMPLATE {
        text template_code PK
        text label
        smallint sort_order
    }

    MATCH_MESSAGE {
        uuid message_id PK
        uuid match_id FK
        uuid sender_id FK
        text template_code FK "preset only, no free text"
        timestamptz created_at
    }

    PLAYER ||--|| PLAYER_PROFILE : has
    PLAYER ||--|| PLAYER_PRIVATE : has
    PLAYER ||--o{ NOTIFICATION : receives
    PLAYER ||--o{ REPORT : files
    PLAYER ||--o{ GAME_POST : organises
    PLAYER ||--o{ ADMIN_POST : authors
    PLAYER ||--o{ MINI_LEAGUE : organises
    PLAYER ||--o{ LEAGUE_STANDING : tracks
    PLAYER ||--o{ RANKING : holds
    PLAYER ||--o{ CHECK_IN : checks_in
    PLAYER ||--o{ MATCH_PARTICIPANT : plays_in
    PLAYER ||--o{ MATCH : creates
    PLAYER ||--o{ GROUPS : registers
    PLAYER ||--o{ GROUP_MEMBER : belongs_to
    PLAYER ||--o{ GAME_PARTICIPANT : requests_to_join
    GROUPS ||--o{ GROUP_MEMBER : has_members
    GROUPS ||--o{ GAME_POST : organises
    GAME_POST ||--o{ GAME_PARTICIPANT : receives
    GAME_POST ||--o{ MATCH : contains
    MINI_LEAGUE ||--o{ LEAGUE_STANDING : maintains
    GAME_POST ||--o| CANCELLATION_RECORD : may_incur
    MINI_LEAGUE ||--o{ MATCH : hosts
    VENUE ||--o{ MATCH : hosts
    STATE ||--o{ SUBURB : contains
    SUBURB ||--o{ VENUE : locates
    VENUE ||--o{ VENUE_GEOCODE_QUEUE : waits_for_a_pin
    PLAYER ||--o{ GAME_POST : invited_to
    MATCH ||--o{ NOTIFICATION : reminds
    MATCH ||--o{ CHECK_IN : verified_by
    MATCH ||--o{ MATCH_PARTICIPANT : includes
    MATCH ||--o{ MATCH_RESULT : produces
    MATCH ||--o{ DISPUTE : may_raise
    MATCH_RESULT ||--o{ DISPUTE : challenged_by
    MATCH_RESULT ||--o{ RATING_HISTORY : moves_ratings
    MATCH_RESULT ||--o{ RESULT_FLAG : flagged_by
    PLAYER ||--o{ RATING_HISTORY : has
    MATCH ||--o{ MATCH_MESSAGE : carries
    MATCH_MESSAGE_TEMPLATE ||--o{ MATCH_MESSAGE : worded_by
```

## The game lifecycle

This is the spine of the app, so it is worth reading in order.

```
game_post              "doubles at Box Hill, Saturday, 4 places"
  |
  +-- game_participant     players ask to join; the organiser accepts or rejects
  |                        the accepted rows are the roster
  |
  +-- match                one or more matches played within that game
        |
        +-- match_participant   drawn from the roster, each on side a or b
        |
        +-- match_result        score, and which side won
```

**A game is not a match.** One Saturday session is one `game_post` and usually
several `match` rows: you rotate partners, you play best of three, you swap
courts. `match.post_id` is what ties them together, and it is nullable so league
fixtures and one-off matches still work.

**The roster gates the matches.** A player can only appear in a match if they
are an `accepted` participant of that game. This is enforced by the
`match_participant_validate` trigger, not by the frontend, so it holds even if
someone drives the API directly.

**Sides, not players, win matches.** `match_participant.side` is `a` or `b`, and
`match_result.winning_side` names one of them. A `winner_id` pointing at a
single player cannot express a doubles win, which is why that column is gone.

Three rules are enforced by triggers because they count other rows, which a
check constraint cannot do:

| Trigger | Rule |
|---|---|
| `game_participant_capacity` | A game cannot accept more players than `player_limit` |
| `game_post_validate` | Suburb copied from the venue and required; start time in the future; `cancelled` and `deleted_*` only through the game functions |
| `group_has_no_upcoming_games` | A group cannot be deactivated while it has upcoming games |
| `match_participant_validate` | Players must be on the roster; one per side for singles, two for doubles |
| `match_completion_validate` | A match cannot be marked `completed` with sides that are not full |

Sides may be filled one player at a time, so the "exactly N per side" rule is
only applied at completion, when it has to hold.

## Audit columns

Every table that can change carries two columns:

| Column | Meaning |
|---|---|
| `updated_at` | When the row last changed. `timestamptz`, never null, defaults to `now()` |
| `updated_by` | The player who made that change. Null means it came from `service_role`, so a backend job rather than a person |

**Both are set by a trigger, never by the client.** `set_updated_metadata` runs
before every insert and update. A client that sends its own `updated_by` is
ignored, which matters because a status field recording who changed it is
worthless if the person changing it picks the value.

The trigger skips rows where nothing but the audit columns changed, so a `PATCH`
that writes a column the value it already held does not make the row look
freshly edited.

**`updated_by` is not a foreign key**, which is a deliberate trade against the
grain. Two reasons:

- PostgREST resolves embeds through foreign keys. A second key from, say,
  `game_participant` to `player` makes `player(username)` ambiguous, and
  every embed in the app would have to be written `player!player_id(...)`. The
  audit column appears on rare detail screens; the roster is read constantly.
- The trigger is the only writer and it takes the value from `auth.uid()`, so
  the column cannot hold anything but a real user id. A constraint that no
  writer can violate protects nothing.

The cost is that deleting a player leaves their id behind in `updated_by`, and
it will not join to anything. For an audit trail that is arguably right: the
edit did happen, and it was them.

## Embedding the organiser: a gotcha

`game_participant` gives `game_post` a second path to `player` (many-to-many
through the join table) on top of the direct `organiser_id` foreign key. So this
now fails with `PGRST201`, "more than one relationship was found":

```js
supabase.from('game_post').select('*, player(username)')   // ambiguous
```

Say which link you mean with `!`, and alias it to something readable with `:`

```js
supabase.from('game_post').select(`
  post_id, player_limit, status,
  organiser:player!organiser_id(username),
  groups(name, logo_url),
  game_participant(status, player(username))
`)
```

That returns the post, whichever organiser applies (the other is null), and the
full roster in one round trip. There is a test covering exactly this query.

Two details worth knowing:

- The hint after `!` can be **the column name** (`organiser_id`) or the
  constraint name (`game_post_organiser_id_fkey`). Both work. Prefer the column
  name: it is shorter, it is the thing you mean, and it does not break
  if someone renames a constraint.
- `player(username)` still works *inside* `game_participant`, because from
  there the route is unambiguous again.

**Do not scatter this across the codebase.** Write the query once in a data
access function and call that from the components. The disambiguation is easy
to forget, the failure only appears at runtime, and any new foreign key to
`player` can make a previously fine query ambiguous. One place to fix beats
twenty.

## Notes on the tables

**Games and matches.** A game (`game_post`) is the session. A match (`match`, side `a` against side `b`) is created by `submit_result` when a player records a result, from players on the game's accepted roster, together with its `match_result`. Players never write `match`, `match_participant`, `match_result` or `dispute` directly: every change goes through `submit_result`, `confirm_result`, `raise_dispute` and the hourly expiry job. `get_game_details` lists the caller's matches in `matches[]`. See [features/M2-results-and-rankings.md](./features/M2-results-and-rankings.md).

**Usernames are chosen by the player; real names are private.** `player.username`
is the only name other players see: 3-20 letters, digits, `_` or `.`, unique
ignoring case. First and last names live in `player_private`, which only the
owner and admins can read. The sign-up trigger reads these keys from the sign-up
metadata (`options.data`):

| Key | Used for |
|---|---|
| `username` | The username, strictly: a taken or malformed one fails the sign-up. Check first with `supabase.rpc('is_username_available', { p_username })` |
| `display_name` | Legacy alias for `username`, held to the same rules |
| `first_name`, `last_name` | Names from the sign-up form |
| `given_name` / `family_name`, `full_name` / `name` | Names from Google sign-in |

An email sign-up without a username fails: none is made up, and the email
address is never used. A Google sign-up cannot send one, so the player starts
with `username` null and chooses it on the age-gate page (`register_player`'s
`p_username`). Unregistered players are invisible to everyone else, so the
missing name is never shown.

**Game posts are cancelled or deleted through functions, never edited into
those states** (BL-013):

| Function | Who | Rule |
|---|---|---|
| `cancel_game_post(p_post_id, p_reason)` | Organiser, group admin, admin | Refused within 4 hours of the start (admins excepted) and once the game has started. The post stays visible as `cancelled`; a `cancellation_record` keeps the reason; players are notified |
| `delete_game_post(p_post_id)` | Organiser, group admin | Only games nobody else has asked to join, been invited to or been accepted into, that have not happened, and not within 4 hours unless already cancelled. The post is hidden (`deleted_at`), not removed |
| `admin_game_post_deletion_impact(p_post_id)` | Admin | Warning data: matches, confirmed results that would stop counting, affected players. Rating changes come with BL-024 |
| `admin_delete_game_post(p_post_id, p_reason)` | Admin | Any game, reason required. Hides it and marks its results `excluded_from_ranking` |

A game **has happened** once its start time has passed or any match has been
recorded against it. Nobody can hard-delete a post through the API, and
`match.post_id` is `on delete restrict`, so matches and results always survive.
`venue_id` is currently readable by every signed-in player; hiding the exact
venue until a player is accepted is BL-017 (PHY-02).

**Joining a game goes through functions** (BL-017): `request_to_join`
(optional message), `accept_request`, `decline_request`, `withdraw_request`.
Requests only work while the game is open (not cancelled, deleted or started).
The message lives in `game_request_message`, readable by the requester and the
host only, so it stays private after the roster row becomes public. Every status
change is written to `game_participant_history`. Accepting a player no longer
creates a match: matches are being built with results and rankings.

**Screens read through functions that return the screen's own objects**
(BL-015, BL-019): `search_games`, `search_players`, `get_game_details`,
`get_join_requests`, `get_player_profile`. Their keys are camelCase to match the
frontend's mock data, unlike the tables. The free-text searches are backed by trigram
indexes (`pg_trgm`) on `player.username`, `player_profile.suburb`,
`game_post.title`, `game_post.suburb` and `venue.name`, so `ilike '%…%'` stays
fast as the tables grow. Postgres ignores them while tables are small. Tested on
60,000 players: 1.4 ms with the index against about 30 ms without. See
[features/M1-find-games.md](./features/M1-find-games.md).

**Blocking is one-sided** (BL-027). The blocker still sees the blocked player
in search, rosters, games and rankings, with `isBlocked: true` for a badge. The
blocked player loses sight of the blocker: their name, profile, rosters, and
any game the blocker organises or has joined (unless already in it). Profiles
are visible to the blocker with a badge, but hidden from the blocked player; rankings stay visible both ways. Neither can join a game
the other organises, and the blocked player cannot join a game the blocker is
playing in. Helpers: `private.blocked_by_me_ids()`, `private.blocked_me_ids()`,
`private.block_relation(other)`, `private.game_hidden_from_me(post)`. **Any new
function that lists players or games must apply the same rules** (for example
the leaderboard, BL-025).

**Reports are filed only through functions** (BL-028): `report_player`,
`report_post`, `report_league`, `report_group`. The server copies an evidence
snapshot of the reported item into `report.evidence`, enforces 5 reports an
hour and 20 a day, and allows one open report per reporter per item.

**Every notification goes through `private.dispatch_notification`** (BL-050).
Triggers on `game_participant` tell the host about requests and withdrawals and
the player about acceptance and decline; cancel and delete use it too.
`notification` has `post_id` and a second line, `detail`, and is published to
Supabase Realtime. Email (BL-087) attaches to the same insert.

**Reliability is computed, not counted** (BL-052). `private.reliability(player)`
works out attended games, no-shows, late withdrawals (accepted place given up
within 24 hours) and late cancellations (organiser, within 24 hours) from the
records, and turns them into a 0-100 score. The `player_profile` counters are
copies, refreshed on each change and hourly by the `refresh-reliability`
`pg_cron` job.

**Email rides on notifications** (BL-087). A trigger on `notification` posts
each new row to the `send-email-notification` Edge Function through `pg_net`.
The function URL and shared secret live in Supabase Vault (`email_webhook_url`,
`email_webhook_secret`), not in a migration, so they can differ per
environment; without them nothing is sent.

**Accounts must pass the 18+ age gate before they can use the app** (BL-007).
`player_private` records the date of birth, the 18+ declaration and the accepted
terms and privacy versions, each with a server timestamp. Until `registered_at`
is set, restrictive policies hide everything involving other players. See
[The age gate](./rls-policies.md#the-age-gate-bl-007).

**`player` / `player_profile`** are split so the hot path (name and rating band,
read on every listing) stays narrow, while optional profile text sits in its own
row. Both rows are created automatically by the `on_auth_user_created` trigger
when someone signs up; the client never inserts them.

**`mini_league.organiser_id`** uses `on delete restrict`, not `cascade`. Deleting
a player must not silently delete a league other people are playing in; reassign
the organiser first.

**`match.league_id` is nullable.** A casual match arranged through a game post
belongs to no league.

**A game post is organised by exactly one of a player or a group.** Rather than
one polymorphic column holding either kind of id, there are two nullable
columns with real foreign keys, and a check constraint
(`num_nonnulls(organiser_id, organiser_group_id) = 1`) guaranteeing exactly one
is filled in. This keeps referential integrity in the database and, just as
importantly, lets PostgREST embed the organiser in a single request:

```js
supabase.from('game_post').select('*, organiser:player!organiser_id(username), groups(name, logo_url)')
```

That nested syntax works only because a foreign key exists. The unused side
comes back `null`. With a polymorphic column, every listing would need a second
and third round trip to resolve organiser names.

**`groups` is not an account.** A group cannot log in. Real people act on its
behalf. Groups are what the v1.2 documents call groups (M6); they were called
clubs until 2026-10-08. `group_member` is the membership list: `role` is `admin` or `member`,
`status` is `pending` (a join request) or `approved`. Only approved admins can
rename the group, post games for it and manage members. Whoever registers a group
becomes its first admin automatically, via the `on_group_created` trigger, and
the `keep_one_group_admin` trigger stops the last admin leaving, so a group can
never exist with nobody able to run it.

**Groups are deactivated, never deleted.** A group admin sets `is_active = false`.
Its game posts, matches and results stay; it cannot post games or take members
until reactivated. `game_post.organiser_group_id` is `on delete restrict`, so a
group with posts cannot be deleted even by `service_role`.

**`match_result` has one row per match** in practice: `submit_result` creates
the match and its result together, and the same two sides cannot be recorded
twice in a game unless the earlier result expired. The table still allows
several rows, read from the diagram as "each side submits a score and one gets
confirmed", and a partial unique index keeps at most one `confirmed` result per
match as a backstop. `games` holds the structured score, side `a` first;
`score` is the same as display text.

**The organiser of a game joins it automatically.** When an individual posts a
game, the `on_game_post_created` trigger adds them to the roster as `accepted`,
taking one of the places. "A game of 4" therefore means four people on court
including the organiser. A group post has no such person, so all places are open.

**`report.target_id` is polymorphic**, interpreted according to `target_type`,
so Postgres cannot enforce a foreign key. Application code must check the target
exists.

**`ranking` and `league_standing` are derived.** The singles row of `ranking`
is a rounded copy of the rating, written by the nightly rating run (pg_cron
`rate-confirmed-results`, `0 15 * * *` in GMT: 2 am Melbourne during daylight saving, 1 am during standard time). The full-precision state is in the
`private` schema, out of reach of the API: `private.rating_state` (mean,
variance and placement counters per player), `private.rating_covariance` (one
row per pair of players with a non-zero covariance), `private.rating_clock` and
`private.rating_batch` (last run, and whether a replay is due).
`rating_history` keeps the before and after of every rated result. Doubles are
never rated. `league_standing` waits for Mini Leagues.

## Differences from the original ER diagram

| # | Change | Reason |
|---|---|---|
| 1 | `game_post.group_id` replaced by `organiser_group_id`, plus new `groups` and `group_member` tables | The diagram defined no `GROUP` entity. Groups and organisations need to post listings too |
| 2 | Added `match.created_by` | A casual match has no league organiser, so RLS had no way to say who may edit it |
| 3 | Added `match_result.submitted_by`, `dispute.raised_by` | Needed to show who claimed what, and to let a player see the dispute they raised |
| 4 | Added `notification.match_id` | Implied by `MATCH ||--o{ NOTIFICATION : reminds` |
| 5 | Added `game_participant`, `game_post.player_limit`, `match.post_id` | The diagram had no join flow and no link from a match back to the game it was played in |
| 6 | Added `match_participant.side` | A doubles match could not say who partnered whom |
| 7 | Replaced `match_result.winner_id` with `winning_side` | A single player id cannot express a doubles win |
| 8 | `reliability_score` is `numeric(5,2)`, not float | Exact decimals keep leaderboard ordering deterministic |
| 9 | `check_in.timestamp` renamed `checked_in_at` | `timestamp` is a SQL type name and reads ambiguously |
| 10 | Added `created_at` to most tables | Conventional, and needed for any "recent activity" view |
| 11 | Added `updated_at` / `updated_by` to all 19 changeable tables | Anything with a `status` needs to record who moved it and when |

The first three want a decision from the team. See the open questions in
[rls-policies.md](./rls-policies.md).

## Reference data and seeds

`state`, `suburb` and the venue list are **production reference data**. The
migration creates the tables; the rows live in `supabase/seeds/production/` so
that correcting a venue is a seed-file edit, not a new migration.

| Folder | Contents | Loaded by |
|---|---|---|
| `seeds/production/01_states.sql` | 8 states and territories | `db reset` locally; CI deploy job on the hosted project |
| `seeds/production/02_suburbs.sql` | 18,087 Australian suburbs with postcodes and approximate coordinates. Generated by `seeds/scripts/generate_suburbs.py` from GeoNames (CC BY 4.0); mail-only postcode ranges excluded | Same |
| `seeds/production/03_venues.sql` | 142 venues across Australia with coordinates, from BadmintonHub (permission pending); pins missing or wrong there come from OpenStreetMap Nominatim. Generated by `seeds/scripts/generate_venues.py`; checked by `tests/venue_maps_check.py` | Same |
| `seeds/dev/01_accounts.sql` … `06_deleted_account.sql` | Dummy data in every table (password `Passw0rd!`): accounts, groups, upcoming and past games, matches, results, a dispute, no-shows, a league, blocks, reports, admin posts, notifications, the geocoding queue, one deleted account | `db reset` locally only |
| `seeds/dev/07_rankings.sql` | 30 extra players (`rally_01` ... `rally_30`) and 450 confirmed singles matches over 70 days, then a full rating replay, so the leaderboards have established players | `db reset` locally only |

Production seed files are upserts, so the deploy job can run them on every
merge. They never delete: a suburb dropped from the source stays, because venues
and posts may point at it.

**State and suburb are readable by `anon`**, because the sign-up form asks for a
state before the player has an account. Nobody can write them through the API.

**Postcode is a column, not a table.** One suburb can have several postcodes and
one postcode covers several suburbs, so the unit is `(name, postcode, state)`.
It is text because NT and ACT postcodes start with 0.

**Suburb text columns are not linked yet.** `game_post.suburb`,
`player_profile.suburb` and `groups.suburb` are still free text. Pointing them at
`suburb` belongs with the stories that use them (BL-013, BL-015).

## Working with it locally

```bash
supabase start                  # bring up the local stack (needs Docker running)
supabase db reset --local       # drop and rebuild from migrations + seeds/
supabase db advisors --local    # security and performance lint
./supabase/tests/rls_test.sh    # historical BE-1 suite; see the baseline caveat below
python3 supabase/tests/api_test.py   # historical BE-1 API suite, writes an ignored report

supabase migration new <name>   # start a new change
supabase db push                # apply pending migrations to the linked project
```

Studio runs at http://127.0.0.1:54323 once the default stack is up. The old BE-1 test scripts still attempt direct result/dispute inserts that Player BE-2 removed; their historical 343/302 counts are not a passing result for this baseline. Use the Admin verification commands in [admin-api.md](admin-api.md) and the Player BE-2 checks described in [M2](features/M2-results-and-rankings.md).

Hosted deployment state has not been verified by this integration. A maintainer must compare the hosted migration history before deploying; GitHub files do not prove that the hosted schema is current.
