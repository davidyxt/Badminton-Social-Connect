# Admin API: team contract adapter and existing-schema operations

The `admin-api` Supabase Edge Function implements the operations supported by
the repository's four existing migrations. No tables, columns, constraints or
database policies are changed. The team specification in
`badminton-social-connect-api_v1.2.yaml` defines the requested contract. The
function now includes an adapter for its table paths, camelCase fields, response
shapes and announcement operations. It does **not** implement the complete team
specification: all eight moderation RPC actions require missing database
capabilities and return 501 without making changes.

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
- `POST /rpc/admin_review_report`, `/rpc/resolve_dispute`
- `GET /activity_log`

All eight action definitions promise ActivityLog events, but no ActivityLog
table exists. Account/content suspension state is also absent. Dispute
resolution promises atomic result correction, ranking processing and
notifications; those processors do not exist. The adapter does not report
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
the Auth account summary on the user detail endpoint. That summary exposes only
email, last sign-in time and email confirmation time.

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
| `GET /users` | Players; `q` searches display name |
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
Reports accept `target_type=player|game_post|match|admin_post`. The current
report constraint does not support `mini_league`. Invalid filters return 400.
Name/title search treats `%` and `_` literally. Email search and account-state
filters are not implemented because those values are not in the player table.

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
| `PATCH /games/{post_id}` | `status` using the game lifecycle values above |
| `PATCH /leagues/{league_id}` | `status` using the league lifecycle values above |
| `PATCH /results/{result_id}` | `status`, `score` (non-empty text), `winning_side` (`a`, `b`, or null) |
| `PATCH /rankings/{player_id}/{format}` | `ranking_points` (non-negative integer) |
| `PATCH /announcements/{admin_post_id}` | `title`, `body`, `status`, `display_order` |
| `POST /announcements` | Required `title`, optional `body`; created as a draft by the caller |
| `POST /notifications` | Required `player_id`, `type`, `message`; optional `match_id` |

Result changes follow the existing admin policy. A confirmed result needs a
winning side; at most one result per match may be confirmed. Database integrity
violations return 400; a conflicting confirmed result returns 409. Participant
attendance is distinct from result confirmation in this schema.

Manual result changes do **not** automatically recalculate ranking points or
league standings: those processors do not exist in the current database.
Ranking corrections are separate explicit operations. This API also does not
claim that report review automatically suspends accounts or notifies reporters.
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
node --test supabase/tests/admin-api.test.mjs supabase/tests/admin-api-contract.test.mjs
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
requests. They do not replace real database/RLS tests. Run the existing
`supabase/tests/rls_test.sh` and exercise authenticated GET/PATCH calls against
the local stack before deploying. No hosted deployment or live database
validation has been performed as part of this implementation.

## Features requiring a later schema change

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
