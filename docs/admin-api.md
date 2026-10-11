# Admin API: team contract adapter and existing-schema operations

The `admin-api` Supabase Edge Function implements the operations supported by
the repository's four existing migrations. No tables, columns, constraints or
database policies are changed. The team specification in
`badminton-social-connect-api_v1.2.yaml` defines the requested contract. The
function now includes an adapter for its table paths, camelCase fields, response
shapes and announcement operations. It does **not** implement the complete team
specification: seven moderation RPC actions require missing database
capabilities and return 501 without making changes. The old dispute-resolution
RPC returns 405 because Final v6 prohibits admin score/rating corrections.

## Final v6 admin design

The authoritative prototype is `Badminton Connect — Admin Web · Final v6.pdf`
in the outer project folder. Rankings, scores, winning sides and result
confirmation are read-only. Admins cannot confirm for players. Content
moderation must preserve game participants and match history; cancellation or
completion is not hiding/suspension. Consequently the former plural-route
PATCH operations for games, leagues, results and rankings now return 405,
before reading their body or issuing a database write. Match writes also
return 405. Existing stored doubles rows remain readable for compatibility;
the Final v6 personal ranking screen should request `format=singles`.

This restriction applies to the Edge Function. The existing direct PostgREST
grants/RLS still permit some administrative writes. No migration or policy has
been changed, so this API is not a database-level revocation of those grants.
The admin frontend should use this function and disable unavailable actions.

| Final v6 area | Available with the current schema | Missing data/processing |
|---|---|---|
| Overview | Current counts, unresolved report and pending/disputed result queues | Historical resolution events |
| Usage & Analytics | New users and reports received by complete Melbourne day, comparison with previous equal period | Foreground view events, first publication and Mini League activity events |
| Users | Name/email/ID search, identity/profile, accepted joins, stored singles rank, participation lists, reports | Suspension enforcement/history, rating history |
| Rankings | Stored singles points/bands and league standings, participant search | Algorithm integration and rating history; admin editing is prohibited |
| Reports | Filters, reporter and current target context, separate status-only updates | Private decision notes, evidence snapshots, atomic review/log/notification workflow, league targets |
| Content moderation | Current game/league records, organisers, rosters and matches | Hidden/deleted state, league suspension, registration closure, retained deletion |
| Games & results | Read-only match context, sides, submissions and disputes | Per-player confirmation history |
| Activity log | Explicit 501 | Append-only events; updated_at/updated_by are only the latest row edit |
| Sign-in | Existing Supabase Auth login/session/reset facilities | No new admin registration or role-grant endpoint |

Announcements and explicit inbox notifications remain available for the team
contract. Sending a notification separately does not complete a moderation
workflow. Status-only report/dispute updates do not save a private decision or
apply a restriction and must not be presented as the Final v6 review action.

### Console read endpoints

These additional endpoints use the plural-route `{data: ...}` envelope:

| GET path | Response |
|---|---|
| `/capabilities` | Design name, supported operations, read-only rules and missing-schema reasons |
| `/overview/attention?page=1&limit=25` | Independently paginated oldest unresolved reports and pending/disputed results; results read-only |
| `/analytics?start=2026-10-01&end=2026-10-07` | Daily/total new users and reports, previous period, absolute and percentage changes |
| `/users/{id}/summary` | Stored singles ranking, tied competition position, accepted game joins, unresolved reports targeting player |
| `/users/{id}/games` | Game participation rows and embedded current game |
| `/users/{id}/matches` | Match participation rows and embedded current match |
| `/users/{id}/leagues` | Stored standings and embedded current league |
| `/reports/{id}/context` | Report, reporter identity and current player/game/match/announcement/club target |
| `/matches/{id}/context` | Match, named participants/sides, result submissions and disputes; read-only |

Participation lists support `page`, `limit`, exact game/match/league UUID `q`,
and stored participation `status` for games/matches. League standing entries
are not a complete accepted-join history. Match context includes the first 100
rows per related collection with `related_counts` and `related_limit`; use
`/matches/{id}/participants`, `/matches/{id}/results`, or
`/disputes?match_id={id}` to page further. Missing parents return 404. Report
targets may have disappeared; `target_missing=true` and `target=null` express
that explicitly. Related context is current data, not submission-time evidence.

Analytics defaults to the last seven **complete** calendar days in
`Australia/Melbourne`. Start/end dates are inclusive, must be past dates and
span at most 90 days. The preceding equal-length interval is compared.
Boundaries follow daylight saving, including 23/25-hour days. Counts are exact
database counts, requested with bounded concurrency, not truncated row scans.
New users use `player.joined_at` from the signup trigger; reports use original
`report.created_at`. A zero previous total gives `percent_change=null`.
Deleted rows cannot be recovered from the current schema, so these are counts
of retained records. Unavailable usage/publication/activity/resolution metrics
return null plus a reason, never zero or sample chart values.

### Console list filters

Plural lists accept `page`, `limit`, `sort`, `direction=asc|desc`, plus their
existing status/format filters. Date bounds are `created_from` (inclusive) and
`created_to` (exclusive), both ISO timestamps with timezone. Users apply these
to `joined_at`; rankings have no creation-date filter. Sort columns are
whitelisted (defaults retain creation/join/points ordering); unknown and
duplicate parameters are rejected.

| List | Additional filters/search |
|---|---|
| `/users` | `q` name, email substring or UUID; `is_verified`, `self_rating_band`; `include=account` adds whitelisted Auth summaries |
| `/reports` | `q` report/target UUID, reporter/player name or reason; `target_type` including club, `target_id`, `reported_by_player_id` |
| `/disputes` | `q` dispute UUID, `match_id`, `raised_by` |
| `/games` | `q` post UUID, individual/club host name or suburb; `organiser_id`, `organiser_club_id`, `suburb` |
| `/leagues` | `q` league UUID/name or organiser name; `organiser_id` |
| `/matches` | `q` match UUID or participant name/ID; `league_id`, `post_id`, `created_by`, `suburb` |
| `/results` | `q` result UUID or participant name/ID; `match_id`, `submitted_by` |
| `/rankings` | `q` player name/ID; `player_id`, `band`, `format` |
| `/notifications` | `player_id`, `is_read`, `type`, notification UUID `q` |
| `/announcements` | `q` title or announcement UUID |

Name filters treat wildcard and PostgREST expression characters literally.
Cross-resource name searches reject more than 200 matching players/matches/
clubs rather than return a truncated subset. Auth email searches paginate
server-side Auth users (100/page, at most 100 pages); an excessive scan or more
than 200 email matches fails rather than silently omitting users. Name/ID
lookup and all application-table queries retain the caller's JWT. Table lists
include safe display-name embeds for organisers, players, reporters and match
participants. Related rosters/standings accept player name/ID `q` and applicable
stored `status` filters, retaining the parent ID boundary.

Frontend helpers include `capabilities`, `overview`, `attention`, `analytics`,
`userSummary`, `userParticipation`, `reportContext`, `matchContext`,
`updateReportStatus` and `sendNotification`. For example:

```js
const { data: users } = await adminApi.list("users", {
  q: "alex@example.com", include: "account", limit: 25,
});
const { data: summary } = await adminApi.userSummary(users.data[0].player_id);
const { data: capabilities } = await adminApi.capabilities();
const { data: chart } = await adminApi.analytics({ start: "2026-10-01", end: "2026-10-07" });
```

## Team contract interface

The adapter base URL is
`https://<project-ref>.supabase.co/functions/v1/admin-api`, or locally
`http://127.0.0.1:54321/functions/v1/admin-api`.

**This is different from the YAML's `/rest/v1` base.** An Edge Function cannot
replace Supabase's PostgREST gateway. No public Postgres RPCs or camelCase
database columns have been added. Calling `/rest/v1/rpc/admin_review_report`
directly will therefore not reach this adapter. Use the frontend `adminApi`
client below; it centralizes this temporary transport difference. The adapter
requires an authenticated administrator, including for table reads. Player
screens continue to use the existing Supabase client and RLS.

| Method/path after adapter base | Implementation |
|---|---|
| `GET /player`, `/player_profile`, `/report`, `/dispute` | Existing rows serialized with team field names |
| `GET /game_post`, `/mini_league`, `/match`, `/match_participant`, `/match_result` | Existing game, league and match data |
| `GET /ranking`, `/league_standing`, `/notification` | Existing rankings, standings and notifications |
| `GET /admin_post`, `/venue`, `/cancellation_record`, `/check_in` | Existing announcements and supporting data |
| `POST /admin_post` | Create announcement; server sets creator |
| `PATCH /admin_post?adminPostId=eq.<uuid>` | Edit one announcement; optimistic concurrency checked internally |
| `DELETE /admin_post?adminPostId=eq.<uuid>` | Delete one announcement; empty 204 |

Reads return arrays directly, including when a primary-key filter finds one
row. Announcement POST returns one object; PATCH returns an array. Errors use
`{ "code": "validation_failed", "message": "..." }`; invalid fields,
arguments and database constraints return 422. Authentication failures return
401/403, missing write targets 404, concurrent changes 409, and unavailable
database operations 503. Legacy routes described later retain their previous
response envelopes and 400 validation errors.

Queries support the primary-key filters declared in the YAML, using
`playerId=eq.<uuid>` and analogous keys. Composite keys can be filtered
independently for reads. `select=playerId,displayName`,
`order=joinedAt.desc`, `limit` (0-1000, default 100), and `offset` (default 0)
use the team field names. Alternatively send `Range: 10-19` and optional
`Range-Unit: items`; do not combine Range with limit/offset. Responses include
`Content-Range` and `Range-Unit`, exposed through CORS. Embeds, arbitrary
PostgREST expressions, aliases, non-equality key filters and undeclared query
parameters are rejected rather than passed through unchecked.

Announcement fields are `title`, `body`, `imageUrl`, `displayOrder` and
`status=draft|published`. POST additionally accepts an optional `adminPostId`.
`createdBy` and `publishedAt` are server-owned: the adapter rejects supplied
values (the YAML currently lists `publishedAt` as writable). A published item
must have a valid absolute HTTP(S) `imageUrl`. Updates cannot remove its image
while retaining published status. Transitioning to published sets the current
publication time; ordinary edits retain it; reverting to draft clears it.
PATCH does not require the legacy `expected_updated_at` field. It reads the
current database version and includes that version in the atomic update so a
change during validation returns 409. PATCH/DELETE require an equality UUID
filter and reject pagination and other query parameters to prevent bulk writes.
`Prefer: return=representation` is the default; `return=minimal` gives an empty
body (201 for POST, 204 for PATCH). Hard deletion is exposed only for
announcements; it does not cascade match history.

### Remaining team contract gaps

The following paths validate their documented arguments and then return
`501 { "code": "schema_extension_required", "message": "..." }` before any
database mutation:

- `POST /rpc/admin_suspend_account`, `/rpc/admin_restore_account`
- `POST /rpc/admin_hide_post`, `/rpc/admin_restore_post`
- `POST /rpc/admin_suspend_league`, `/rpc/admin_resume_league`
- `POST /rpc/admin_review_report`
- `GET /activity_log`

All eight team action definitions promise ActivityLog events, but no ActivityLog
table exists. Account/content suspension state is also absent. Dispute
resolution promises atomic result correction, ranking processing and
notifications; Final v6 prohibits that admin operation, so
`POST /rpc/resolve_dispute` returns 405 even for a valid request. The adapter does not report
success for only one piece of a promised action. Legacy status updates remain
available as explicitly separate operations, not as replacements for these
business actions.

Other differences inherited from the current database are documented rather
than hidden:

- Report `under_review` is serialized as `reviewing`; game `completed` as
  `closed`. Mini League reports remain unsupported by the database constraint.
- Profile `reliabilityScore` is converted from the database's 0-100 scale to
  the specification's 0-1 scale.
- `MatchResult.winnerId` is obsolete: doubles have a winning side. Default
  result reads expose `winningSide` instead; explicitly selecting/ordering
  `winnerId` returns 501. No single winning player is invented.
- `GamePost.groupId` was replaced by `organiserClubId`; explicitly selecting
  or ordering groupId returns 501. Existing read extensions include
  `playerLimit`, match `postId`/`createdBy`, participant `side`, result
  `submittedBy`, dispute `raisedBy` and notification `matchId`.
- Team reads expose real `updatedAt`/`updatedBy` and `createdAt` where the
  table has it. These are current version fields, not ActivityLog records.
- League, match, match-participant and dispute status values otherwise remain
  the actual database values. In particular `resolved` cannot safely be
  interpreted as the specification's `upheld`. Suspended states cannot be
  synthesized from cancellation.
- The current admin policy permits reading all announcement drafts, following
  the requested admin access, rather than only the caller's drafts.
- This is an admin adapter, not an implementation of all player-facing CRUD,
  result-submission, sign-up, league and realtime operations in the team YAML.

### Frontend usage

`frontend/src/services/adminService.js` exports an authenticated `adminApi`
client. It fetches the current session token on every call and keeps the public
project key separate from server credentials. This service is ready to be used
by the admin UI; the existing screens have not been rewired in this change.

```js
import { adminApi } from "./services/adminService";

const { data: users, contentRange } = await adminApi.list("player", {
  select: "playerId,displayName,joinedAt",
  order: "joinedAt.desc",
  limit: 25,
  offset: 0,
});
const { data: announcement } = await adminApi.createAnnouncement({
  title: "New season",
  imageUrl: "https://example.com/carousel.png",
  displayOrder: 0,
  status: "published",
});
await adminApi.updateAnnouncement(announcement.adminPostId, { title: "Updated" });
await adminApi.deleteAnnouncement(announcement.adminPostId);

// Recognized but currently fails with error.status=501 and
// error.code="schema_extension_required"; it makes no partial change.
await adminApi.rpc("admin_review_report", {
  reportId: "<uuid>",
  outcome: "resolved",
});
```

The client returns `{ data, contentRange }` locally as a convenience; the HTTP
body itself is the raw object or array required by the team contract.

## Legacy existing-schema interface

The original plural routes remain available for existing callers, with the
previous snake_case fields and response envelopes. New admin code should use
the team-named adapter wherever available. Legacy announcement writes retain
their old semantics and do not provide the new interface's image requirement;
call `/admin_post` for the team publication behavior.

## Authentication and permissions

Use the existing email/password login to obtain a Supabase **user access token**.
The project owner must provision the account and set `app_metadata.role` to
`admin` using a trusted server or the Supabase dashboard. There is no public
administrator registration or role-grant endpoint.

Each API call requires `Authorization: Bearer <user access token>` and the
project's public API key in `apikey`. The function verifies the user with
Supabase Auth and checks their current `app_metadata.role`. It does not use
user-editable `user_metadata` for permission decisions. After an admin role is
granted, refresh the session or sign in again so the database's JWT-based RLS
policies also receive the updated role.

Database reads and writes use the caller's JWT, preserving existing RLS checks
and `updated_by` triggers. A server-only service-role client is used solely for
Auth email search and account summaries, after administrator authorization.
Summaries expose only email, last sign-in time and email confirmation time.

All responses use `Cache-Control: no-store`. Browser origins must match
`ADMIN_ALLOWED_ORIGINS`, a comma-separated allowlist of complete origins. Its
default is `http://localhost:5173`; configure it for the actual admin UI.
Requests without an Origin header still require valid administrator access.

## Base URL and responses

Base: `https://<project-ref>.supabase.co/functions/v1/admin-api`

Locally: `http://127.0.0.1:54321/functions/v1/admin-api`

Success: `{ "data": ... }`. Lists also return
`"pagination": { "page": 1, "limit": 25, "total": 100 }`.
Errors: `{ "error": { "code": "record_changed", "message": "..." } }`.
SQL details and Auth metadata are not returned in errors.

## Read endpoints

| Method/path | Data |
|---|---|
| `GET /me` | Current administrator ID, email and role |
| `GET /overview` | Registered players, unresolved reports, pending results, upcoming open/full game posts, active leagues |
| `GET /users` | Players; `q` searches name/email/ID; optional account summaries |
| `GET /users/{player_id}` | Player and whitelisted Auth account summary |
| `GET /users/{player_id}/profile` | Extended player profile |
| `GET /users/{player_id}/rankings` | Current ranking rows |
| `GET /users/{player_id}/reports` | Reports targeting this player |
| `GET /reports`, `GET /reports/{report_id}` | Reports |
| `GET /disputes`, `GET /disputes/{dispute_id}` | Match disputes |
| `GET /games`, `GET /games/{post_id}` | Game posts |
| `GET /games/{post_id}/participants` | Join requests and accepted roster |
| `GET /games/{post_id}/matches` | Matches associated with the game post |
| `GET /leagues`, `GET /leagues/{league_id}` | Mini Leagues; `q` searches name |
| `GET /leagues/{league_id}/standings` | Stored league standings |
| `GET /leagues/{league_id}/matches` | League matches |
| `GET /matches`, `GET /matches/{match_id}` | Matches |
| `GET /matches/{match_id}/participants` | Match participants and sides |
| `GET /matches/{match_id}/results` | Submitted results |
| `GET /results`, `GET /results/{result_id}` | Match results |
| `GET /rankings` | Current rankings, sorted by points descending |
| `GET /rankings/{player_id}/{format}` | One player's current ranking for the format |
| `GET /announcements`, `GET /announcements/{admin_post_id}` | Admin announcement posts; `q` searches title |
| `GET /notifications`, `GET /notifications/{notification_id}` | In-app notifications; optional `player_id` UUID filter |

List pagination accepts `page` (1-10000) and `limit` (1-100). Related lists
also use pagination. A missing parent returns 404.

Status filters match the exact existing schema:

| Resource | `status` filter values |
|---|---|
| Reports, disputes | `open`, `under_review`, `resolved`, `dismissed` |
| Games | `open`, `full`, `cancelled`, `completed` |
| Leagues | `draft`, `active`, `completed`, `cancelled` |
| Matches | `scheduled`, `in_progress`, `completed`, `cancelled` |
| Results | `pending`, `confirmed`, `disputed`, `rejected` |
| Announcements | `draft`, `published`, `archived` |

Games, matches and rankings also accept `format=singles|doubles|mixed_doubles`.
Reports accept `target_type=player|game_post|match|admin_post|club`. The current
report constraint does not support `mini_league`. Invalid filters return 400.
Name/title search treats `%` and `_` literally. Account suspension-state
filters remain unsupported because the database has no such state.

## Write endpoints

Every PATCH requires `expected_updated_at` **exactly as returned by GET**.
The database update checks it atomically. A stale value returns 409, and the
caller must reload before trying again. Unknown fields are rejected, including
client-supplied `updated_by` and notes that the schema cannot store. JSON request
bodies are limited to 16 KiB.

| Method/path | Editable fields |
|---|---|
| `PATCH /reports/{report_id}` | `status` |
| `PATCH /disputes/{dispute_id}` | `status` |
| `PATCH /announcements/{admin_post_id}` | `title`, `body`, `status`, `display_order` |
| `POST /announcements` | Required `title`, optional `body`; created as a draft by the caller |
| `POST /notifications` | Required `player_id`, `type`, `message`; optional `match_id` |

The Final v6 API exposes results and rankings read-only. Existing points are
displayed without running a new ranking algorithm. This API does not claim
that report status updates automatically suspend accounts or notify reporters.
Administrators can create an in-app notification as a separate operation with
type `system`, `match_reminder`, `match_invite`, `result_submitted`,
`dispute_update`, or `league_update`. A combined atomic report/notification
operation would require an additional database function.

Publishing an announcement fills its first publication timestamp if missing;
subsequent edits retain that timestamp. No DELETE endpoints are exposed because
the current game/league foreign keys cascade into historical match data.

## Calling the API

After signing in with the existing frontend Supabase client:

```js
const { data: { session } } = await supabase.auth.getSession();
if (!session) throw new Error("Sign in first");
const headers = {
  Authorization: `Bearer ${session.access_token}`,
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
};
const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;
const response = await fetch(`${base}/reports?status=open`, { headers });
const payload = await response.json();
if (!response.ok) throw new Error(payload.error.message);
const report = payload.data[0];
if (report) {
  const saved = await fetch(`${base}/reports/${report.report_id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: "under_review",
      expected_updated_at: report.updated_at,
    }),
  });
  const result = await saved.json();
  if (!saved.ok) throw new Error(result.error.message);
}
```

## Local development and validation

Use the existing [setup instructions](SETUP.md) to start local Supabase. Docker
must be installed and running. From the repository root:

```powershell
npx supabase start
npx supabase functions serve admin-api
```

The Supabase runtime supplies the three server-side `SUPABASE_*` variables used
by the function. An optional ignored env file can set `ADMIN_ALLOWED_ORIGINS`
when serving with the CLI's `--env-file` option. No server credential belongs in
the frontend or in a committed file. Platform JWT verification remains enabled.

With the frontend dependencies installed, run the HTTP/SDK contract tests:

```powershell
node --test supabase/tests/admin-api.test.mjs supabase/tests/admin-api-contract.test.mjs supabase/tests/admin-api-console.test.mjs
```

From `supabase/functions/admin-api`, type-check and lock the function dependency:

```powershell
npx --yes deno check index.ts
```

The tests use the real Supabase JavaScript SDK with a fake HTTP transport. The
contract tests additionally use a fixture extracted from the team's YAML,
exercise camelCase mapping, Range/offset pagination, flat errors, announcement
publication/deletion, blocked partial moderation, and the frontend client. They
cover authorization, CORS, query serialization, pagination, constraints,
concurrency, schema field compatibility, server-key isolation, and malformed
requests. They do not replace real database/RLS tests.

For real Auth, database/RLS and Edge Function integration checks, keep Docker,
`supabase start` and `supabase functions serve admin-api` running, then run from
the repository root:

```powershell
node supabase/tests/admin-api-live.test.mjs
```

The script obtains local keys from `supabase status`, refuses remote API URLs,
creates temporary confirmed accounts, and signs in with real user JWTs. It
checks both API contracts, profile privacy, privilege escalation, announcement
creation/publication/deletion, audit identity, stale-write rejection, report
status mapping, private notifications and explicit unsupported moderation.
It cleans up only its own fixtures and never prints passwords or API keys.
Email confirmation remains enabled; test accounts are confirmed through the
local Auth admin API. Google OAuth is outside this test's scope.

The live checks exercise blocked game/league lifecycle writes, result
confirmation and ranking correction, and verify that persisted values remain
unchanged. Database uniqueness is checked using privileged fixture setup,
separately from the read-only API. Additional checks cover real Auth email
search, name/ID filters, participation embeds, context, attention queues,
version extensions and exact daily statistics. Ranking processing and the
blocked moderation RPCs remain unimplemented, as documented above.

If Windows reserves the default ports, a temporary local CLI working directory
can use available ports while leaving the repository configuration unchanged.
Set `SUPABASE_WORKDIR` to that directory when running the integration script;
it obtains the correct local endpoint/keys from that CLI configuration and
still refuses remote projects. No credentials are printed or committed.

Final v6 validation on 2026-10-11 passed 127 HTTP/SDK tests, 99 real local
Auth/database/RLS/Edge Function checks, Deno check/lint, and the frontend
production build. Windows had reserved ports 54321–54324, so the live checks
used a temporary configuration with ports 55321–55324. Test accounts/fixtures
were removed. Hash comparisons confirmed all four migrations, the repository
configuration, and 57 pre-existing user files stayed unchanged. The temporary
stack was stopped after verification, preserving the local database backup.

Local Supabase Studio is at `http://127.0.0.1:54323`; the API is at
`http://127.0.0.1:54321`. Run `supabase stop` from the repository root to stop
the local stack while preserving its data. Stop the function-serving process
with Ctrl+C if running it in your own terminal.

On this Windows machine, Supabase CLI 2.120.0 and Deno 2.9.6 are installed under
`%LOCALAPPDATA%\BadmintonDevTools\node_modules\.bin`. Open a new terminal to
pick up the added user PATH. `SUPABASE_CLI` can override the CLI path used by
the test script. Docker Desktop 4.94.0 uses the existing WSL 2 backend.

The older `supabase/tests/rls_test.sh` assumes immediate sessions after signup;
that assumption does not match the current email-confirmation configuration.
Use the Node integration script above for the current configuration. Hosted
deployment still requires separate validation in the team's Supabase project.

## Features requiring a later schema change

See [the database handoff](admin-database-handoff.md) for task coverage, proposed
tables/fields, permissions, processing requirements and acceptance criteria.

- Account suspension state/history and enforcement across all database entry points.
- Hidden/deleted game listings, league suspension and registration restrictions.
- Retained deletion records that preserve match history.
- Full activity history (latest-row audit columns are not an event log).
- Private report decisions, evidence snapshots and Mini League report targets.
- Per-player result confirmation timestamps and rating-change history.
- Usage tracking and reliable historical analytics.
- Atomic moderation actions, audit events and notification scheduling.

These features are intentionally absent rather than simulated through unrelated
status fields. They can be added when schema extensions are authorized.
