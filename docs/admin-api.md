# Admin API integration with Player BE-2

This local branch integrates latest main (`e42beb7`), the completed Admin API integration and frontend `5b204e7`, using the Player BE-2 0.4 schema and its 50 existing database migrations. It retains the Admin Web Final v6 restrictions: scores, confirmations, rankings and game/league lifecycle data are read-only through the Admin API. The integration changes API/client/test code and imports the team's existing migrations; it adds or edits no migration SQL.

The team specifications in this branch describe the Player BE-2/PostgREST API. The Admin API provides the console-specific endpoints below plus a compatibility adapter for earlier admin callers. It is not a replacement implementation of every operation in the generated YAML. Database work and remaining design decisions are in [admin-database-handoff.md](admin-database-handoff.md).

## Authentication and transport

Base URL: `https://<project-ref>.supabase.co/functions/v1/admin-api`. Locally, use the API URL returned by the local CLI followed by `/functions/v1/admin-api`.

Send the project's public API key in `apikey` and a signed-in user's access token in `Authorization: Bearer <token>`. The function validates the current user through Auth and requires `app_metadata.role = admin`. User-editable `user_metadata` never grants access. Refresh the session after changing a role so JWT-based RLS receives the change too.

All application-table reads, writes and permitted read RPCs use the caller's JWT and existing RLS. The server-only service-role client is used only for whitelisted Auth account summaries and paginated email search after administrator authorization. Deleted players have no Auth summary and return `account: null`; retained history remains inspectable. Registration reads select only the completion timestamp, not dates of birth, names or consent records from `player_private`.

`ADMIN_ALLOWED_ORIGINS` is a comma-separated list of complete frontend origins, defaulting to `http://localhost:5173`. Responses disable caching. The Edge gateway may answer preflight itself, but the function rejects authenticated requests from an unapproved Origin.

## Console read endpoints

These endpoints return `{ data: ... }`; paginated responses also include `{ pagination: { page, limit, total } }`. Query names and table fields use snake_case, except JSON returned unchanged by the shared Player BE-2 RPCs.

| GET path | What it returns |
|---|---|
| `/me` | Current admin identity |
| `/capabilities` | Supported reads, Final v6 restrictions, 0.4 database baseline and remaining limitations |
| `/overview` | Completed registrations, pending registrations, deleted players, unresolved reports, pending results, upcoming non-deleted games and active leagues |
| `/overview/attention` | Independently paginated unresolved report and pending/disputed result queues |
| `/analytics?start=2026-10-01&end=2026-10-07` | Daily completed registrations and received reports, plus previous-period comparison |
| `/users`, `/users/{id}` | Directory and account detail, including username/deleted state and safe Auth data |
| `/users/{id}/profile`, `/users/{id}/rankings`, `/users/{id}/reports` | Profile, stored rankings and targeted reports |
| `/users/{id}/summary` | Stored singles points/global competition position, accepted joins, reports, shared rating card and registration state |
| `/users/{id}/registration` | `state = registered|registration_pending|deleted`, registration/deletion timestamps |
| `/users/{id}/rating` | Existing `get_rating_summary(p_player_id)` response |
| `/users/{id}/rating_trend?days=30` | Existing `get_rating_trend(p_player_id, p_days)` response; 1–365 days |
| `/users/{id}/rating_history` | Paginated actual before/after ratings and RD values |
| `/users/{id}/games`, `/users/{id}/matches`, `/users/{id}/leagues` | Paginated participation or stored league standings |
| `/rankings/leaderboard?scope=state&state=VIC&limit=25&offset=0` | Existing `get_leaderboard` response |
| `/result_flags` | Paginated anomaly flags and associated result context |
| `/reports`, `/reports/{id}`, `/reports/{id}/context` | Queue, detail, original evidence snapshot and separate current target |
| `/matches/{id}/context` | Match, named sides, submissions, disputes and actual opposing confirmation records |
| `/games`, `/leagues`, `/matches`, `/results`, `/rankings` | Paginated current records and read-only detail |
| `/notifications`, `/announcements` | Inbox records and carousel content |

Existing related paths include `/games/{id}/participants`, `/leagues/{id}/standings`, `/leagues/{id}/matches`, `/matches/{id}/participants`, `/matches/{id}/results` and `/matches/{id}/disputes`.

### Filters and pagination

Console lists accept `page` (default 1), `limit` (default 25, maximum 100), whitelisted `sort`, `direction=asc|desc` and applicable `q`, status, format and date filters. Dates use timezone-qualified ISO timestamps; `created_from` is inclusive and `created_to` exclusive. Unknown/duplicate parameters are rejected. Name search escapes literal wildcard/expression characters and rejects broad cross-resource matches instead of silently truncating them.

- Users: username/email/UUID `q`, `is_verified`, `self_rating_band`, `registered=true|false`, `is_deleted=true|false`, and `include=account`. The registration embed contains only `registered_at`.
- Games: title/suburb/host/group `q`, `organiser_id`, `organiser_group_id`, `suburb`, `is_deleted` and lifecycle status. Deletion is distinct from cancellation.
- Reports: report/target/reporter/reason `q`, `target_id`, `reported_by_player_id`, `category` and `target_type=player|game_post|match|admin_post|group|mini_league`.
- Results: result/participant `q`, `match_id`, `submitted_by` and `status=pending|confirmed|disputed|rejected|expired`.
- Notifications: recipient, read state and all 17 current type values, including `result_confirmed`, `result_expired`, join/invitation and game-removal notices.
- Rating history: `page`, `limit`, exact `result_id`/`match_id`, inclusive `played_from` and exclusive `played_to`. Every request remains scoped to the path's player.
- Flags: `page`, `limit`, exact `result_id`/`match_id`, `kind=repeat_pairing|unusual_win_pattern|rating_swing`, `created_from`/`created_to`. A flag does not reject a result.
- Shared leaderboard: `scope=state|nearby`, optional Australian state code, `limit=1..100`, `offset=0..1000000`. Nearby uses the caller's suburb. The shared function lists only established, registered, discoverable players; it does not replace the broader admin stored-ranking list.

Player/group aliases preserve older UI calls: `display_name` is supplied alongside username in directory/identity embeds; `sort=display_name` maps to username; `organiser_club_id` filters map to `organiser_group_id`; `target_type=club` maps to group. Two organiser aliases or duplicated filters are rejected. Current native names should be used for new UI code.

### Evidence and result monitoring

`evidence_snapshot` is the stored `report.evidence`, with its original server capture time. Current target data remains separate and may be absent. Empty legacy evidence becomes null; the API never invents a past snapshot. Private decision notes remain unavailable.

Match context returns structured `games` and stored `confirmed_by`/`confirmed_at` through `confirmations`. Player BE-2 treats the submitter's action plus the opposing confirmation as agreement; it does not store an independent event history for every player's decision. `player_confirmation_history` remains null to express that limit. Context contains at most 100 rows per related collection, with counts and paging paths for additional rows.

### Ratings and analytics

The API calls the existing rating read functions and reads `rating_history`; it never runs a second algorithm, rebuilds ratings, or recalculates them on an admin request. Personal rating changes come from the shared nightly processor. History/trend can be rebuilt by that processor and are not immutable daily leaderboard snapshots. Deleted/unregistered profiles may receive a null rating card from the shared function; their retained history can still be read by admins.

The legacy `rank_position` is a global competition rank over stored singles points, including provisional players. State/Nearby ranks in the shared rating card/leaderboard use the shared eligibility rules and should be labelled accordingly.

Analytics uses complete `Australia/Melbourne` days, inclusive start/end dates, at most 90 days, and the immediately preceding equal-length period. Counts are exact database HEAD counts with bounded concurrency, including 23/25-hour days. New users use `player_private.registered_at` and exclude deleted players, so accounts that have not completed registration do not count. Deleted accounts lose registration metadata; these are retained-record counts, not a durable registration event log. Consistent exclusion of admins/test users needs a protected classification that the current schema lacks.

Foreground usage, first publication, full league activity and historical report resolutions remain null with explicit reasons. Daily rating snapshots and recent activity still require new storage.

## Compatibility table adapter

The earlier camelCase adapter remains under the same Edge base, distinct from the YAML's `/rest/v1` transport. Reads return arrays directly, and errors use flat `{ code, message }` objects. Supported paths include `player`, `player_profile`, `report`, `dispute`, `game_post`, `mini_league`, `match`, `match_participant`, `match_result`, `ranking`, `league_standing`, `notification`, `admin_post`, `venue`, `cancellation_record`, `check_in`, plus `groups`, `rating_history` and `result_flag`.

Use key filters such as `playerId=eq.<uuid>`, a declared camelCase `select`, whitelisted `order`, and `limit`/`offset`, or HTTP Range (not both). Default limit is 100 and maximum 1000. Responses expose `Content-Range`/`Range-Unit`. Embeds, aliases and arbitrary PostgREST expressions in client input are rejected.

`displayName` reads the real username. `username` is also available. `organiserClubId` and `organiserGroupId` both read the real `organiser_group_id`. New result fields include `games`, `confirmedBy`, `confirmedAt` and `excludedFromRanking`; report fields include `category` and `evidence`. `winningSide` replaces obsolete single-player `winnerId`. Requesting obsolete `winnerId` or game `groupId` explicitly returns 501. These are compatibility names, not extra database columns.

Original profile reliability values are normalized from 0–100 to the adapter's 0–1 scale. The adapter retains `reviewing` for stored report `under_review`, and `closed` for stored game `completed`; new console routes return actual database states. Existing audit columns are latest-row metadata, not activity events.

## Available and blocked writes

Available writes:

- `POST /admin_post`: draft/create or publish a carousel card. Publishing requires an absolute HTTP(S) image URL; creator/publication time are server-owned.
- `PATCH /admin_post?adminPostId=eq.<uuid>`: edit/publish/unpublish one card. An optional JSON `expectedUpdatedAt` must be an ISO timestamp matching the currently stored version; malformed values return 422 and stale values return 409. The console sends this version on edits, and the update also guards against changes during processing. The version token is never written as a database column. DELETE removes only an announcement and returns 204.
- Legacy `POST /announcements`, `PATCH /announcements/{id}`: earlier announcement interface.
- `PATCH /reports/{id}`, `PATCH /disputes/{id}`: **status-only compatibility** updates using exact `expected_updated_at`, with 409 on a stale version. These do not save private notes, resolve a disputed result, or apply a restriction.
- `POST /notifications`: explicit notice to a player using a supported type and bounded message. This does not complete an automatic moderation workflow.

The adapter supports `Prefer: return=representation|return=minimal`. JSON bodies are limited to 16 KiB. Unknown or server-owned fields are rejected. Legacy errors use `{ error: { code, message } }`; invalid table-adapter input returns 422, legacy invalid input 400, authentication failures 401/403, missing targets 404, concurrent writes 409 and service failures 503. SQL/Auth details are not returned.

Seven moderation actions remain 501: account suspend/restore, post hide/restore, league suspend/resume and complete report review. `GET /activity_log` also returns 501. No partial state change is reported as success.

`resolve_dispute`, `admin_rebuild_ratings` and `admin_delete_game_post` are explicitly 405 in the admin adapter. Legacy writes to games, leagues, matches, results and rankings are also 405. The upstream SQL deletion/rebuild functions can alter ranking eligibility/history and conflict with Final v6; they are not enabled by this API. Direct PostgREST/SQL admin grants remain upstream behavior, so an Edge refusal does not revoke them at the database boundary.

## Frontend client

`frontend/src/services/adminService.js` exports the player app's authenticated Admin client helpers: `userRegistration`, `userRating`, `userRatingTrend`, `userRatingHistory`, `resultFlags` and `leaderboard`, alongside existing overview/context/list/announcement helpers. The separate Next.js console in `admin/` connects to the same Edge Function using its TypeScript transport and these read endpoints. See [admin/README.md](../admin/README.md) and [local integration notes](admin-local-integration.md) for the current local setup, connected screens and unsupported actions.

```js
const { data: response } = await adminApi.userRating(playerId);
const card = response.data; // shared RPC rating card
const { data: history } = await adminApi.userRatingHistory(playerId, { page: 1, limit: 25 });
console.log(history.data, history.pagination);
const { data: flags } = await adminApi.resultFlags({ kind: "rating_swing", limit: 25 });
const { data: ranking } = await adminApi.leaderboard({ scope: "state", state: "VIC" });
```

The helper returns `{ data, contentRange }`; `data` is the HTTP payload, including its own console `{ data, pagination }` envelope where applicable. Tokens are obtained from the current session for every call.

## Validation and deployment

Install frontend dependencies, then run from the repository root:

```powershell
node --test supabase/tests/admin-api.test.mjs supabase/tests/admin-api-contract.test.mjs supabase/tests/admin-api-console.test.mjs supabase/tests/admin-api-updated.test.mjs
```

From `supabase/functions/admin-api`, run `deno check --frozen index.ts` and `deno lint index.ts context.mjs contract.mjs handler.mjs console.mjs reads.mjs`. Use `npm run build` in `frontend` for the frontend/client build.

For the connected Next.js console, run `npm test`, `npm run lint` and `npm run build` in `admin/`. The nine console tests use controlled API responses to verify transport, pagination, registration/deletion mapping and cache isolation; the real-stack suite below verifies the actual database and function. See [admin-local-integration.md](admin-local-integration.md) for the supported screens, setup and known UI acceptance gaps.

For real integration, start Docker and local Supabase with all 50 migrations, serve `admin-api`, then run `node supabase/tests/admin-api-live.test.mjs`. It refuses remote URLs, creates registered fixture accounts, exercises Auth/RLS/Edge transport, verifies evidence preservation and new reads, and removes only its own records. Auth deletion retains anonymized players in 0.4, so fixture cleanup explicitly removes those fixture rows after deleting their local Auth identities. Google OAuth and external email/geocoding are not part of this test.

On Windows, `SUPABASE_WORKDIR` can point at an isolated CLI configuration with available ports. This integration used ports 56321–56324 and project `badminton-admin04`, leaving the repository configuration unchanged. Credentials stay local and are never committed.

Deploy the team's migrations before this version of the function. It targets the new schema and should not be deployed against the four-migration main database. Hosted deployment requires a teammate with Supabase access; local verification does not establish cloud deployment. See [SETUP.md](SETUP.md) and [DEPLOYMENT.md](DEPLOYMENT.md). GitHub branch publication does not itself confirm Supabase deployment.

Validation on 13 October 2026: 156 Admin HTTP/SDK tests plus 7 inherited session-timeout tests (163 total), 124 real local Auth/database/RLS/Edge checks, Deno check/lint and frontend production build passed. The build emitted dependency-level `use client` directive warnings. All 50 imported migrations remain byte-equivalent after line-ending normalization. Hosted validation remains separate.

Revalidated on 14 October 2026 for the published console integration: 156 Admin HTTP/SDK tests, 7 inherited player-session tests and 8 console transport/cache tests passed (171 total); 124 real local Auth/database/RLS/Edge checks passed and removed their temporary fixtures. Admin lint/TypeScript/production build, the player frontend production build and Deno check/lint passed. The player build still emitted dependency-level `use client` directive warnings. Documentation review checked 18 Markdown files, the three Player BE-2 reference scripts and both generated YAML specs, including all 1,203 internal schema references; Markdown links/fences and YAML syntax/duplicate keys/references passed. No database migration SQL or rating algorithm was changed. The known carousel caller-version/audit and moderation gaps remain; these passing tests do not assert that those missing capabilities work. No hosted deployment was performed.


Current local verification, 20 October 2026: 158 Admin HTTP/SDK tests, 7 inherited player-session tests and 9 console tests passed (174 total), with 124 real-stack checks and Deno check/lint. Admin lint and production build passed. A supplemental run of the actual frontend modules passed 12 local integration checks, including announcement create/publish/unpublish, stale/concurrent edit refusal and account-directory failure handling. Mini Leagues remain hidden by default. All 50 migration files are unchanged relative to latest main. The separate player frontend build fails on main's missing `services/badmintonApi` import; this is not an Admin build failure. Nothing was pushed or deployed by this local integration. This supersedes the older frontend-version and idle/conflict limitations above; audit and moderation gaps remain.
