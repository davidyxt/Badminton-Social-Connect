# Admin backend database handoff

Updated 11 October 2026. Audience: the database and Supabase maintainer, Admin BE, Player BE and Admin FE.

The Admin API now implements the operations supported by the repository's current schema. This branch includes that API, its frontend client and tests. Completing account suspension, content moderation, report decisions and activity history requires new migrations and database permissions, followed by API integration. The database changes described below are proposed requirements; they have not been applied by this branch.

## Scope and current database

The authoritative admin design is **Badminton Connect Admin Web Final v6**. The original source file is `Badminton Connect — Admin Web · Final v6.pdf`. Task IDs below come from `Sprint Backlog v1.2.xlsx`, the `Sprint 1-2 Backlog` sheet, filtered to `Owner = Admin BE`. Neither source file is included in this branch. The API contract is [badminton-social-connect-api_v1.2.yaml](badminton-social-connect-api_v1.2.yaml); detailed current endpoint documentation is [admin-api.md](admin-api.md).

The database baseline is the four existing files in [supabase/migrations](../supabase/migrations):

- `20260924054959_initial_schema.sql`
- `20260924061726_clubs_as_organisers.sql`
- `20260924062939_game_participants_and_match_sides.sql`
- `20260924064025_audit_columns.sql`

These migrations are unchanged. They provide identity/profile, clubs, game posts and join requests, leagues/standings, matches/participants/results/disputes, rankings, notifications, reports and announcements. `updated_at` and `updated_by` record the latest row change; they do not retain an activity history. The published implementation has been verified against local Supabase, not the team's hosted database.

Final v6 makes scores, winning sides, player result confirmations and personal rankings **read-only for administrators**. Admins cannot confirm results for players or override ratings. Hiding, suspending or deleting a listing must preserve participants, matches, results and pending confirmations. Ranking calculation belongs to one shared trusted result-processing workflow, rather than separate Player API and Admin API implementations.

## Functions already implemented

| Area | Available now | Relevant limitation |
|---|---|---|
| Authorization | Validates the user through Supabase Auth and checks current `app_metadata.role = admin`; ordinary users are denied. Application queries retain the caller's JWT and RLS. | Admin provisioning is a trusted manual operation; invitation/hook requirements need configuration. |
| Overview | Current user/report/result/game/league counts and paginated needs-attention queues. | No recent event history, suspended-user count or historical resolved-report count. |
| Users | Name/email/UUID search, filters, pagination, profile, safe Auth summaries, accepted game joins, stored singles ranking and linked reports/participation. | No suspension status or rating-change history. League standings do not provide a full membership/join history. |
| Reports | Queue filters/search, detail, reporter and current target context; separate version-checked status updates. | Current context is not submission-time evidence. Status updates are not the complete review workflow. |
| Games and results | Read-only games, leagues, rosters, standings, matches, sides, result submissions and disputes; related context and pagination. | Result status exists, but individual players' confirmation decisions/times do not. |
| Rankings | Reads stored points/bands/counts and league standings; singles leaderboard search. | The API does not execute the ranking algorithm or compare historical snapshots. |
| Analytics | Daily new-profile and received-report counts and previous-period comparisons using complete `Australia/Melbourne` days. | Counts use retained records. No foreground-usage, first-publication, league-activity or resolution history. Admin/test-profile exclusion is not implemented. |
| Home carousel | `admin_post` creation, edit, publish/draft, ordering, image URL validation and deletion through the team adapter. | No image-file upload endpoint. Existing RLS lets admins see all drafts; the backlog describes their own drafts. |
| Notifications | Reads notifications and allows an admin to send an explicit inbox notification. | Moderation does not automatically create notifications. |
| Save conflicts | Existing report/dispute writes check `expected_updated_at`; announcement writes check the database version atomically. Conflicts return 409. | New moderation operations must adopt a client-visible version check too. The announcement adapter cannot detect an edit that became stale before its request started. |
| Frontend integration | Authenticated `adminApi` client helpers, both contract shapes and console reads. | The admin screens have not been connected to these helpers. |

### Current unavailable and prohibited operations

These recognized team-contract routes validate their current arguments and then return **501**, without a partial write:

- `POST /rpc/admin_suspend_account` and `/rpc/admin_restore_account`
- `POST /rpc/admin_hide_post` and `/rpc/admin_restore_post`
- `POST /rpc/admin_suspend_league` and `/rpc/admin_resume_league`
- `POST /rpc/admin_review_report`
- `GET /activity_log`

Closing registration, retained listing deletion, ranking snapshots/history and deletion-request monitoring also have no implemented admin workflow. They need both database support and API work.

`POST /rpc/resolve_dispute` and legacy game/league/match/result/ranking writes return **405** under Final v6. These are deliberately prohibited admin actions, not features waiting to be enabled by a migration. Legacy report/dispute status-only PATCH endpoints remain separate compatibility operations; they do not correct scores, record a private review note, or complete moderation.

## Admin backlog coverage

“Partial” means some functionality exists but the entire acceptance criterion is not met. Spreadsheet scheduling labels do not establish implementation completion.

| Task | Priority | Current status | Remaining work |
|---|---|---|---|
| BL-030 Sign in and access control | Must | Partial | Invitation-only admin provisioning, Auth hook agreement and hosted session configuration; see DB10. |
| BL-032 Activity log | Must | Not implemented | Append-only events, trusted writes, system events and paginated reads; DB01. |
| BL-034 User directory and profile | Must | Partial | Add reliable account restriction status/history; DB02. |
| BL-036 Suspend and restore accounts | Must | Not implemented | State, enforcement, Auth ban/unban, mandatory reasons, logging and safe restoration; DB02. |
| BL-038 Report review | Must | Partial | Evidence, private outcome note, reviewer/time and atomic audit; DB06. |
| BL-040 Hide and restore game posts | Must | Not implemented | Visibility restriction, reason, enforcement, restoration, audit and notices; DB03/DB09. |
| BL-082 Home carousel | Must | Functionality implemented with contract differences | Agree `HomeContent` versus existing `admin_post`, draft ownership and storage/upload scope; DB10. |
| BL-048 Permission and audit tests | Must | Partial | Existing API access tests pass; log completeness and suspension tests depend on the missing workflows. |
| BL-042 Suspend and resume leagues | Should | Not implemented | Separate restriction state, membership enforcement, audit and notices; DB04/DB09. |
| BL-065 Overview | Should | Partial | Recent activity and restriction/resolution totals; DB01/DB02/DB06. |
| BL-067 Soft delete posts and leagues | Should | Not implemented | Retained records, typed confirmation, reason, permission rules and audit; DB05. |
| BL-069 Games and results monitoring | Should | Partial | Per-player result-confirmation history; DB07. |
| BL-071 Singles leaderboard history | Should | Not implemented | Daily snapshots, scheduling and date comparisons; DB07. Current leaderboard reads already work. |
| BL-073 Activity log filters | Should | Not implemented | Action, actor, target/record, reason and time filters; DB01. |
| BL-075 Save-state feedback | Should | Implemented for current writes within the limits above | Carry version guards into future RPCs and align the frontend request contract. |
| BL-077 In-app moderation notices | Should | Not implemented | Create notices as part of restrictions; DB09. Manual sending is already available. |
| BL-078 Account deletion monitoring | Should | Not implemented | Requests, failure state and worker integration; DB11. |

## Database changes required

The following names are proposed snake_case database names. Agree the final migration and API contract before implementation; the existing adapter does not automatically discover new fields or functions. Each database change below also needs corresponding API wiring, error handling and tests.

### DB01 Append-only activity log

Supports BL-032, BL-073 and the recent-activity part of BL-065. Create `activity_log` with at least:

- `log_id uuid` primary key, `occurred_at timestamptz` assigned by the server.
- `actor_id uuid` nullable for system actions, plus `actor_type` constrained to admin/system. Preserve the actor identifier after account deletion; do not cascade-delete logs with a player.
- `action text`, `target_type text`, `target_id uuid` and a required reason for moderation actions.
- `previous_state jsonb`, `new_state jsonb`, and bounded details suitable for investigation. Keep sensitive report-review notes separate from notices sent to players.
- An operation/idempotency identifier so a retried action does not create duplicate events.

Provide a trusted append function and paginated administrator-only read, with filters for action, actor, target, reason and time. Index `(occurred_at desc, log_id)`, `(target_type, target_id, occurred_at desc)`, and actor/action combinations used by the UI. Client roles must not INSERT arbitrary logs or UPDATE/DELETE existing logs. Use narrowly authorized functions/triggers for writes; RLS and grants must protect the table even through direct PostgREST.

Every successful admin action, including announcement operations and manual notices, needs an attributable event. Define automatic events for confirmed-result/rating processing and other relevant system workflows. A domain change and its log must commit in the same database transaction; an audit failure must prevent the domain change. Avoid duplicate logging if both a trigger and action function are used. Only trusted code may identify an event as a system event.

Acceptance: two edits create two retained events; a failed/retried action does not create a false/duplicate success event; ordinary users cannot read or forge logs; administrators cannot modify/delete log rows.

### DB02 Account suspension and restoration

Supports BL-034 and BL-036. Add protected account restriction state, preferably in `account_moderation` keyed by `player_id`, rather than writable columns on the player's own profile. Store current active/suspended state, restriction reason, `suspended_at/by`, `restored_at/by`, and a version stamp. Retain every transition in DB01. If fields instead go on `player`, explicitly restrict their column privileges and updates so self-profile edits cannot alter them.

Add a private helper that reads **current database state** and enforce the restriction across player writes, existing RPCs and related policies. Check game creation/join/acceptance, club-representative actions, league membership, matches/results, reports and other reachable entry points against the agreed suspension rules. Inventory each grant/policy/RPC; adding a single restrictive check is ineffective if another permissive policy still allows the write. Define the account's permitted support/read paths and keep administrator investigation access.

The team contract also hides a suspended player's active content. Apply an account-derived restriction to their game listings and applicable leagues, retaining histories. Define which club-owned listings are affected: a representative's suspension must not silently remove a whole club's independent content.

Auth integration is **Edge Function work in addition to a migration**. A trusted server must ban/unban the Auth user and handle sessions; a PostgreSQL row update alone does not do this. Existing access tokens must not bypass suspension, which is why RLS checks live state. Auth and PostgreSQL cannot share one transaction: persist operation state and provide retries/reconciliation. Apply the database restriction before attempting the Auth ban; on restoration, keep the database restriction until Auth unban succeeds. Do not report a fully completed operation if synchronization fails.

Both suspension and restoration require a recorded reason. Restore only restrictions caused by this suspension: independently hidden/deleted posts and manually suspended leagues must remain restricted. Reject missing targets, self-suspension/last-admin hazards according to the agreed admin policy, stale versions and invalid transitions.

Acceptance: a suspended user with an already-issued JWT cannot perform prohibited operations through either API; Auth ban failure remains visible and safely retryable; restore does not clear unrelated restrictions; every transition is logged.

### DB03 Game post visibility

Supports BL-040. Add a protected visibility/restriction record for `game_post`, or fields such as `visibility = visible|hidden`, `hidden_at`, `hidden_by` and `hidden_reason`. Keep this separate from lifecycle `status = open|full|cancelled|completed`. Store the reason and actor for restoration in the log too.

Player discovery must exclude restricted posts at the database/query entry point. Administrators retain investigation access; existing participants retain game history with a post-unavailable notice. Hidden/deleted posts must reject new join requests and acceptance of pending requests, as Final v6 specifies. Organisers and club representatives must not clear administrator restrictions through ordinary post edits.

Provide transactional hide/restore actions with a mandatory reason, version check, DB01 event and DB09 notices. Restoring a manually hidden post must not expose it while its organiser remains suspended or it is deleted. These actions must not change match scores, confirmations, participants or lifecycle status.

### DB04 League restrictions and registration

Supports BL-042 and the additional Final v6 **close registration** action. Add moderation state independently of the league's draft/active/completed/cancelled lifecycle. Store suspension/resumption actor/time/reason and registration state such as `registration_state = open|closed` with closure actor/time/reason. Effective registration must also consider suspension and deletion; resuming a league must not reopen registration that was independently closed.

The current schema has standings but no full league membership/application table. Add a `league_membership` or equivalent with `league_id`, `player_id`, requested/accepted/rejected/withdrawn state, `requested_at`, `responded_at` and the responding actor. Enforce a unique league/player entry or document a request-history model. Index player lookups and pending requests per league. Do not treat `league_standing` as the membership source: a player can join before having standings.

Enforce restrictions in policies and action functions for new applications and acceptance of pending requests. Preserve member access to history. Backlog BL-042 says suspended leagues are read-only for members; Final v6 explicitly pauses joins/acceptance and preserves existing pending confirmations. Agree whether members may finish these confirmations while suspended, then test the allowed/denied operations consistently. Closing registration alone keeps the league visible and lets existing members continue scheduled games.

Suspend/resume/close-registration operations require reasons, optimistic concurrency, DB01 logging and DB09 notices. They must not finish the league, assign winners, recalculate standings or alter personal ratings.

### DB05 Retained listing deletion

Supports BL-067. Add `deleted_at`, `deleted_by`, `deletion_reason`, or a dedicated moderation record for both `game_post` and `mini_league`. Keep the primary rows and relationships so existing `ON DELETE CASCADE` chains are never executed by the moderation action. Do not implement admin listing deletion as SQL DELETE.

Add an admin-only deleted-record view/read path; remove deleted listings from discovery and prevent new registrations/acceptances. Preserve existing members/participants and their match/result/confirmation history. The Final v6 console offers no restore action for deleted listings.

Validate typed confirmation against the actual record identifier in the server action, not just the frontend. Prototype IDs such as `ML-004` are illustrative: the current database uses UUIDs, so agree either the UUID confirmation or a durable unique display ID. Require a reason, version check, DB01 event and DB09 notices. Protect deletion fields from player/organiser edits. Typed confirmation and endpoint wiring are API work, not solved by columns alone.

### DB06 Report evidence and private review outcomes

Supports BL-038. Extend `report.target_type` to support `mini_league`; retain the already supported `player`, `game_post`, `match`, `admin_post` and `club`. Validate polymorphic targets in trusted submission code because `target_id` has no cross-table foreign key.

Create protected submission-time evidence, for example `report_evidence(report_id, captured_at, target_snapshot jsonb, snapshot_version)`. Capture relevant server data when a report is submitted, not when an administrator first opens it. Preserve that evidence if the target is edited/deleted. Mark old reports without a snapshot as unavailable; current target data cannot be backfilled as authentic past evidence.

Store private review records separately, for example `report_review(review_id, report_id, outcome, note, reviewed_by, reviewed_at, operation_id)`. Notes must be mandatory for the final decision, bounded and visible only to administrators. Existing report RLS lets reporters SELECT their own reports, including fields returned by `select=*`; putting private notes on that row without changing permissions would expose them. Keep evidence access and attachments under explicit policies too.

Implement one transactional `admin_review_report` operation that validates the administrator, current version and transition; records resolved/dismissed with reviewer/time/note; updates report status; and appends DB01. Reviewing a report must **not** automatically suspend an account or hide/suspend content. If a reporter receives a notification, use the agreed public message rather than the private note and create it through DB09.

The current YAML/adapter takes only `reportId` and `outcome`. Extend the agreed contract for the required note, reason/version/idempotency fields; the present adapter rejects unknown arguments. Likewise, restore-account/post/resume-league arguments currently omit the reasons required by the backlog/design.

### DB07 Result confirmations and ranking history

Supports BL-069 and BL-071. `match_participant.status = confirmed` represents participation, not acceptance of a submitted score. `match_result.status = confirmed` alone cannot show which players agreed and when.

Add per-player result decisions, for example `result_confirmation(result_id, player_id, decision, decided_at)`, with a unique result/player pair, participant eligibility checks and server timestamps. Tie confirmations to a specific immutable score/result revision so a changed score invalidates old approvals. Singles processing requires both eligible players' agreement; admins receive SELECT access only. Existing doubles results should remain readable without being mistaken for singles rating inputs.

Add an append-only rating history containing result/match/player, format, points or rating before/after, delta, applied time and algorithm version. Decide any extra algorithm state and precision with the ranking owner: current `ranking_points` is a nonnegative integer, which may be insufficient for the agreed formula. Add only the state actually required by that formula.

Implement a **single shared trusted processor** that applies an eligible confirmed singles result once, updates both players and relevant derived standings atomically, and writes history/DB01. Use result-level idempotency and deterministic locking; a retry or algorithm-version change must not silently award the same result again. A deliberate recalculation needs an explicit rebuild/version policy. Confirmation storage and algorithm integration require Player BE coordination; Admin BE only reads them.

Create `ranking_snapshot` keyed by snapshot date/player/format with stored points, band, verified count and position. Schedule an idempotent daily snapshot using Supabase Cron/`pg_cron`, with boundaries in `Australia/Melbourne`; snapshots must be retained independently of future current-ranking edits. Define historical player-label retention and the behavior for missing snapshot dates, and provide an admin read/compare operation. Backfill only where actual historical data exists.

### DB08 Analytics events and historical counts

Completes Final v6 metrics that currently return unavailable/null:

| Metric | Required data | Processing rule |
|---|---|---|
| Foreground active users | Authenticated foreground-screen events with player, timestamp and bounded screen/event type. | Deduplicate users per day and across the selected range independently; background refresh is excluded. Requires frontend event emission and trusted ingestion too. |
| Games published | Immutable first-publication time/event for a game listing. | Creation, reposting or editing is not automatically first publication. Agree the actual publish transition with Player BE. |
| Mini League activity | Accepted-join and result-submission events tied to the league. | Count qualifying leagues per day and deduplicate across the whole range. Membership data is part of DB04. |
| Reports resolved | Decision events/timestamps from DB06/DB01. | Count according to the agreed resolution/reopening rule, not current status plus last edit time. |
| New end-user profiles | Current profile creation timestamp plus a reliable administrator/test-account classification. | Exclude admin/test profiles consistently; retain an event if historical counts must survive profile deletion. Current counts include every retained player row. |

For concrete storage, an `app_event` can carry `event_id uuid`, `event_type`, `player_id`, optional `post_id`/`league_id`/`result_id`, `occurred_at timestamptz` and a deduplication key. Separate event tables are also valid if they implement the same facts. Keep an immutable profile-created event with a trusted end-user/admin/test classification, or provide a protected classification table for existing profiles; player self-edits must not change exclusions. Historical event identifiers must not cascade away with deleted source records if those metrics are to remain reproducible.

Use server-owned timestamps, indexed event time/entity keys, validation and explicit read/write permissions. Aggregate only complete Melbourne calendar days, including daylight-saving boundaries, and compare the immediately preceding equal-length period. Missing historical events must remain unavailable, rather than fabricated as zeros. Define event retention and ingestion limits before enabling usage tracking.

### DB09 Automatic in-app notifications

Supports BL-077. Reuse the existing `notification` table; it already supports `system` and `league_update` types. Create inbox rows in the **same database transaction** as each completed restriction and audit event, or use a durable transactional outbox if delivery moves outside PostgreSQL. Add an operation/event recipient uniqueness key so retries do not send duplicates.

Define recipients from actual membership/rosters:

| Action | Final v6 inbox recipients |
|---|---|
| Hide game post | Host; existing participants also see the post-unavailable state in their history. |
| Restore game post | Host and existing accepted participants. |
| Delete game post | Host, accepted participants and pending applicants. |
| Suspend or resume league | Organiser and registered members. |
| Close registration or delete league | Organiser, registered members and pending applicants. |

Club-owned posts require an agreed host/representative recipient rule. Keep player SELECT access restricted to their own notices and retain required moderation notices even if a listing is removed.

Store a safe in-app reason separately from administrator-private review notes. The prototype specifies in-app notices; push delivery is not part of this requirement. Any external Auth synchronization needs durable operation/retry state as described in DB02; a success flag alone is insufficient.

### DB10 Admin provisioning and home content agreement

BL-030 requires invitation-only admin accounts and role claims from an Auth hook. The current implementation trusts `app_metadata.role`; the private `is_admin()` helper already exists. Agree whether trusted Auth metadata stays authoritative or a protected role/invitation table feeds the hook. Never source authority from player-editable `user_metadata`, and never expose the service key to the frontend. Provision invited users through a trusted server/dashboard workflow; ordinary player signup may remain enabled.

Local `supabase/config.toml` already sets a 30-day session timebox and 7-day inactivity timeout. The hook sections are commented out. Confirm the admin session requirements and configure/test them on the hosted project; a checked-in local setting does not verify hosted behavior. Handle role removal and existing tokens consistently in both the Edge Function and direct database access.

BL-082 calls the content entity `HomeContent`, while the team YAML and current database use `admin_post`. Reuse that existing table or agree a compatibility mapping; creating a duplicate content table is not inherently necessary. Decide whether admins can see all drafts or only their own. If the latter is required, update SELECT policies/API behavior while retaining published-only player access. Keep creator/publication timestamps server-owned, and consider a database constraint for the published-image requirement so alternate write paths enforce it too. Storage upload policies and an upload flow are separate work if images are to be uploaded rather than supplied as URLs.

### DB11 Account deletion monitoring

Supports BL-078. Create `account_deletion_request` with request/user identifiers, requested/started/completed timestamps, pending/processing/completed/failed state, safe failure code/message, attempt count and retry timing. Administrators may inspect failures; a player may request/inspect only their own request through the agreed flow. Preserve the request/error record after Auth/player deletion instead of using cascading foreign keys.

Integrate a worker/Edge Function that records failures and retries. Review existing cascades and organiser `ON DELETE RESTRICT` dependencies before account deletion, including club handover and retained match/report/ranking evidence. Define what is removed, anonymized and retained with the product owner. Monitoring tables alone do not implement the deletion job.

## Cross-cutting permissions and API contract

The Edge Function has closed admin score/ranking writes, but the existing direct PostgREST grants and RLS still allow some administrative writes. Removing an admin screen/button is insufficient. Update protected-column permissions, policies and authorized write functions so Final v6 restrictions apply at the database boundary too. An administrator who is also a match owner/participant must not gain score-edit access through another permissive policy; preserve the intended ordinary-player workflow while enforcing the admin rule.

For new tables, explicitly configure grants and enable RLS in exposed schemas; ordinary users should not be able to set moderation state, forge evidence/actors, read private notes or write derived rankings. New functions default to publicly executable unless privileges are revoked. Prefer invoker functions; any necessary elevated helper needs explicit authorization, a fixed safe `search_path`, qualified names and narrow grants. Use private helpers for privileged internals and expose only reviewed entry points. These requirements follow the [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database-function guide](https://supabase.com/docs/guides/database/functions).

The current transport is `/functions/v1/admin-api`, not the YAML's `/rest/v1`. No public SQL moderation RPCs are installed by this branch. Choose whether future functions remain behind the adapter or are exposed as PostgREST RPCs, and update both contract and client together. Account ban/unban still needs a trusted Edge Function; it cannot be implemented entirely as a plain SQL RPC. Any elevated worker must receive an authenticated actor through a trusted boundary, rather than accepting a client-supplied administrator ID as authority.

All new writes need a version supplied from the client's last read, mandatory reasons where required, bounded input, valid state transitions, and operation IDs. Serialize concurrent target changes in one transaction. A failed operation must not leave a misleading success log or duplicate notifications. Existing `updated_at` can be the version if compared exactly; a dedicated incrementing version is also an option. Announcements currently guard a concurrent change during request processing, but need a caller-provided version to detect edits made before the request began.

The current contract has other known legacy names/values: `organiserClubId` replaces obsolete `groupId`, and `winningSide` replaces obsolete single-player `winnerId`. Preserve the real sides and lifecycle values; do not model hidden/suspended content as cancelled/completed. A stale saved record should map to 409, invalid input to the agreed validation error, and unavailable operations should retain 501 until the **whole** workflow is implemented and tested.

## Delivery order and acceptance

1. Agree API changes, state transitions and the open product decisions above. Implement DB01 and the database boundary for Final v6 read-only rules.
2. Implement DB02/DB03/DB06 to complete the remaining Must account, visibility and report workflows. Add DB09 notices as those actions become available.
3. Add DB04/DB05 for league restrictions, registration and retained deletion. Coordinate shared membership/result processing with Player BE.
4. Add DB07/DB08/DB11 for confirmations, ranking history/snapshots, analytics and deletion monitoring. Complete DB10 provisioning/content agreements alongside the relevant features.

The database maintainer should deliver **new** migrations, indexes/grants/RLS, reviewed function signatures, compatible defaults/backfills and database tests. Keep existing migrations intact and confirm deployed schema drift against them before applying new ones. Admin BE then wires the real functions/state into the adapter, updates `/capabilities`, adds API tests and integrates with Admin FE. Returning success from a stub or adding columns without wiring does not complete a backlog task.

Required acceptance checks include:

- Ordinary/unsigned users cannot call admin actions, forge role/actor/restriction fields, read private review notes, or write rating/log/snapshot records.
- Suspension is enforced for an existing player JWT through direct PostgREST and every relevant RPC, and failed Auth synchronization is retained/retried safely.
- Hide/suspend/delete actions preserve participant, match, score, standings and pending-confirmation records. Existing member reads and registration restrictions follow the agreed design.
- Stale saves, concurrent actions and retries have deterministic outcomes, with one committed log/notice set per successful action.
- Reviewing a report retains original evidence/private notes and never automatically changes the target's account/content.
- Both singles players must confirm the correct result revision before one rating update; administrators cannot confirm or modify results through alternate database paths.
- Snapshots survive later edits, and analytics handle complete Melbourne days, range deduplication, administrator/test exclusions and missing history correctly.
- Announcement operations, deleted records and failed account-deletion requests obey their agreed read/write scope.

## Verification and teammate testing

On 11 October 2026 the current API passed **127 HTTP/SDK tests**, **99 real local Auth/database/RLS/Edge Function checks**, Deno type/lint checks and a frontend production build. The 127-test suite, Deno checks and frontend build were rerun against the exact files selected for this branch while preparing this handoff. The build succeeded with dependency-level `use client` warnings. These results validate current functionality and explicit refusals, not the missing workflows above. Hosted deployment and UI wiring remain to be tested by the team.

From the repository root, with frontend dependencies installed:

```powershell
node --test supabase/tests/admin-api.test.mjs supabase/tests/admin-api-contract.test.mjs supabase/tests/admin-api-console.test.mjs
```

For local integration, start Docker and local Supabase and serve `admin-api`, following [SETUP.md](SETUP.md) and [admin-api.md](admin-api.md). Then run:

```powershell
node supabase/tests/admin-api-live.test.mjs
```

The live script deliberately refuses remote URLs, creates temporary local fixtures and cleans up its own records. The prior Windows run used temporary ports 55321–55324 because the normal ports were reserved; this did not change repository migrations/configuration. Use the documented `SUPABASE_WORKDIR` option if testing through such a temporary configuration.

A teammate with hosted Supabase access can deploy this branch's `admin-api`, configure the allowed frontend origins, provision an administrator and run a separate hosted smoke check against the existing schema. Follow the [Edge Function deployment guide](https://supabase.com/docs/guides/functions/deploy). GitHub push alone does not deploy or verify a Supabase function unless the team has configured a deployment workflow. Do not point the local fixture-creating script at the hosted project. The hosted check should verify admin/non-admin access, announcement behavior, read endpoints, version conflicts and the documented 501/405 responses; it should not claim that the proposed migrations have already been applied.

Useful implementation references: [Auth custom access-token hooks](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), [Auth administrator updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), and [Supabase Cron](https://supabase.com/docs/guides/cron).
