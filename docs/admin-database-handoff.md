# Admin backend database handoff

Updated 13 October 2026. Audience: the database/Supabase maintainer, Admin BE, Player BE and Admin FE.

The Admin API now targets **Player BE-2 0.4.0**, imported at `e69ea7a`, with all **50 existing migration files**. This supersedes the earlier four-migration handoff. Query compatibility, evidence reads, rating history/trend, result confirmations and anomaly queries are implemented. Remaining moderation actions still need database state, trusted transactions and audit events. This integration imports the team's SQL without editing it or adding migrations.

The authoritative admin design remains **Badminton Connect Admin Web Final v6**. Backlog IDs are from the Admin BE rows of `Sprint Backlog v1.2.xlsx`. The source PDF/workbook are not committed. Current endpoints and test instructions are in [admin-api.md](admin-api.md), and upstream changes are in [api-changes-0.4.0.md](api-changes-0.4.0.md) and [M2 results and rankings](features/M2-results-and-rankings.md).

## What changed since the first handoff

| Requirement | Support now available | Remaining limitation |
|---|---|---|
| Naming and directory | Real `username`, `groups`, `group_member`, `organiser_group_id`; compatible old display/group aliases; registration/deletion reads and filters | Suspension status/enforcement still absent |
| Report evidence | Server-captured `report.evidence`, category and Mini League/group targets; API distinguishes original evidence from current target | No private review note, reviewer/outcome history or atomic audit workflow |
| Result monitoring | Structured `match_result.games`, `confirmed_by`, `confirmed_at`, `expired` status; disputes reference a result | Opposing confirmer/time is stored, not a separate decision event per player |
| Ratings | Shared SQL rating processor, state/covariance, `rating_history`, summary/trend and state/Nearby leaderboard functions; Admin API reads these | No immutable daily leaderboard snapshot or two-date comparison |
| Result anomalies | `result_flag` and administrator query with kind/result/match/date filters | Flags are informational; no review/resolve workflow is implemented |
| Post deletion | `deleted_at/by`, `deletion_reason`, retained game records and an upstream deletion function | Full audit is absent, and upstream deletion changes ranking eligibility, conflicting with Final v6 |
| Account deletion | Anonymized retained players and related match/rating history | No deletion-request failure monitor or retry queue |
| Analytics | Counts completed registrations using `registered_at`, excludes deleted players, and reports received; separates pending/deleted/current users | No reliable admin/test classification, deletion-proof events, foreground usage, first publication or resolution history |
| Notifications | Additional result/join/invitation/game notice types; explicit admin sending remains available | Admin restriction notices cannot be complete while restriction actions are unavailable |

The imported migrations are intact: four original September migrations, forty inherited Player BE-1/integration migrations and six results/rating/message migrations added on 12 October. Having these files in GitHub does not establish that the hosted database has applied them.

## Admin backlog coverage

“Partial” means the full acceptance criterion has not been met. Spreadsheet scheduling labels do not establish completion.

| Task | Priority | Current coverage | Next requirement |
|---|---|---|---|
| BL-030 Sign in/access | Must | Role validation and RLS preserved | Invitation/hook and hosted session configuration |
| BL-032 Activity log | Must | 501, no event table | DB01 |
| BL-034 User directory/profile | Must | Search, filters, pagination, safe account/registration state, real rating card/history and reports | Suspension state from DB02 |
| BL-036 Suspend/restore accounts | Must | 501 | DB02 plus Auth integration |
| BL-038 Report review | Must | Queue, original evidence and current context; separate status-only compatibility update | Private note/outcome/audit from DB05 |
| BL-040 Hide/restore posts | Must | 501 | DB03 |
| BL-082 Home carousel | Must | Existing admin_post CRUD/publication | Agree draft ownership and HomeContent naming; DB09 |
| BL-048 Permission/audit tests | Must | Current endpoint/RLS/role tests pass, including new reads | Audit and suspension tests once DB01/DB02 exist |
| BL-042 Suspend/resume leagues | Should | 501 | DB04 |
| BL-065 Overview | Should | Counts and attention queues; registered/pending/deleted distinctions | Recent activity and historical resolutions |
| BL-067 Retained deletion | Should | Reads retained game state; upstream operation intentionally blocked | Resolve Final v6 difference, add audit/league deletion; DB06 |
| BL-069 Games/results | Should | Read-only structured results and stored opposing confirmation | Agree whether this confirmation model meets the admin screen |
| BL-071 Singles history | Should | Live rating card/history/trend and shared leaderboard reads | Daily snapshots/date comparison; DB07 |
| BL-073 Log filters | Should | 501 | DB01 |
| BL-075 Save conflicts | Should | Current writes have atomic checks; report/dispute caller versions | Caller versions for new actions and announcement edits |
| BL-077 Restriction notices | Should | Current explicit notices and upstream player-flow notices | Atomic admin-restriction notices; DB08 |
| BL-078 Deletion monitoring | Should | Retained deleted user reads | Failure records/worker; DB10 |

## Database work still required

The names below are proposed requirements for review, not migrations applied by this integration. Do not recreate capabilities already supplied by Player BE-2.

### DB01 Append-only activity log

Add `activity_log` with server-assigned `log_id`, `occurred_at`, actor identifier/type, action, target type/identifier, moderation reason, previous/new state and an operation ID for idempotency. Preserve identifiers/history when source accounts or listings are deleted; avoid cascading log deletion. `updated_at/by` only describes the last row edit and cannot supply prior events.

Provide trusted append functions/system triggers and administrator-only paginated reads filtered by action, actor, target, reason and time. Index time/ID, target/time and the actor/action filters actually used. Clients must not insert forged events or update/delete existing logs. Explicit grants and RLS are required. Every successful admin write, including announcements/notices, needs a log entry in the same database transaction as its domain change. Audit failure must prevent success, and retries must not duplicate events.

### DB02 Account suspension and Auth synchronization

Add protected current suspension state, reason, suspension/restoration actor/time and a version, preferably in `account_moderation` keyed to player rather than self-editable profile columns. Preserve transitions in DB01. Check live state through a private helper across all permitted player writes/RPCs, including group-representative actions, game joins/acceptances and results. Audit permissive policies so an alternate policy cannot bypass a restriction.

Provide a trusted Edge workflow for Auth ban/unban and session handling. SQL state and Auth cannot commit together: store operation status/retries and reconcile failures. Apply the database restriction before Auth ban; leave it in force until unban succeeds on restore. Existing JWTs must be denied by database checks. Both transitions require a reason and version check; define self/last-admin protection and allowed support/read access with the product owner.

The contract also restricts a suspended player's active content. Keep account-derived restrictions separate from manual post/league restrictions so restoring an account does not restore independently hidden/deleted content. Agree the effect on group-owned posts when one group administrator is suspended. Registration completion and account deletion are already stored and are different concepts from suspension.

### DB03 Post visibility

Add protected visibility restriction state such as visible/hidden, hidden actor/time/reason and restoration details/history. Keep it separate from open/full/cancelled/completed lifecycle and the existing deleted fields.

Discovery must exclude hidden listings; existing participants retain game history with a post-unavailable notice, and admins retain investigation access. Reject new requests and acceptance of pending requests while hidden. Organisers/group representatives must not clear an admin restriction through normal edits. Transactional hide/restore needs a mandatory reason, version guard, DB01 event and DB08 notice. Restoring a post must still respect account/deletion restrictions. No match, score, participant or rating change is allowed by visibility moderation.

### DB04 League restriction and registration

Add protected suspended/resumed state and registration closure state, each with actor/time/reason/version, independent of league lifecycle. Resuming must not reopen registration closed separately. The current standings table is not a full membership/application history: add a league membership/request model with player/league, requested/accepted/rejected/withdrawn state, request/response times and actor; index the roster, player and pending queue.

Enforce suspension/closure on new requests and acceptance, retain members/history, and send logged in-app notices. Closing registration alone keeps the league visible and lets existing members continue. The backlog describes suspended leagues as read-only; Final v6 preserves pending confirmations. Agree precisely which member actions remain possible while suspended and test that decision consistently. Do not assign winners or finish/re-rate a league as moderation.

### DB05 Private report decisions

Evidence, categories and group/league targets already exist. Read them from `report.evidence`; keep old empty evidence unavailable instead of inventing a historical snapshot. Do not add a duplicate evidence system unless it replaces the current one through an agreed migration.

Add administrator-private review records such as `report_review(review_id, report_id, outcome, note, reviewed_by, reviewed_at, operation_id)`. A final resolved/dismissed outcome needs a required bounded note, reviewer/time and version guard. Store notes separately from reporter-readable report rows, or explicitly restrict column access; existing own-report SELECT would otherwise reveal the note.

Implement one transaction updating status, recording the private decision and appending DB01. Review must not automatically suspend an account or hide content. Public notification text must not contain private notes. Extend the agreed API arguments: current `admin_review_report` lacks a note/version/operation ID, and restore/resume definitions omit required reasons. Status-only legacy PATCH is not the complete review action and does not resolve a disputed result.

### DB06 Retained deletion and the Final v6 conflict

Game deletion fields and upstream `admin_delete_game_post` already exist. That function excludes results from ranking and causes a later rating rebuild. Final v6 requires listing deletion to retain results/confirmations and preserve ratings. Agree the intended product rule before enabling an admin operation; this branch returns 405 for that upstream operation and for `admin_rebuild_ratings`/`resolve_dispute`.

For the Final v6 behavior, implement a listing-only transactional action using protected deletion state, mandatory reason, typed identifier confirmation, client version, DB01 and DB08. Keep parent rows and relationships rather than running cascade deletes. Provide administrator deleted-record reads and retain participant/member access to underlying history. The console offers no restore action for deleted listings. Add equivalent retained league deletion; post deletion state alone does not cover leagues. Prototype IDs are sample labels, so agree UUID confirmation or a real unique display ID.

### DB07 Rating history and confirmation agreement

The shared rating state/algorithm/history/read functions are implemented upstream. Admin BE must reuse them, not introduce a second rating calculation. `rating_history` is rebuilt by the shared processor and is not an immutable snapshot. Add daily `ranking_snapshot` rows keyed by local date/player/format with actual points/band/count/position if BL-071 requires two-date comparison. Schedule idempotent capture using complete Melbourne days and define retention/missing-date behavior. Backfill only where real history exists.

Player BE-2 stores structured scores and opposing `confirmed_by/confirmed_at`; the submitter is implicitly agreeing through submission. Confirm whether this is sufficient for the admin read-only screen. If an independent per-player/revision confirmation history is required, add it with participant checks and server timestamps. Admins must not gain confirmation or score-edit permissions. Score/rebuild/exclusion permissions currently remain in upstream direct SQL/PostgREST; enforcing Final v6 at that boundary needs a reviewed permissions change, including admin accounts that also own/participate in matches.

### DB08 Automatic restriction notices

Reuse `notification` and its current types; result/join/invitation notifications are already supported. Create notices with each completed restriction and audit in one database transaction, or persist a transactional outbox for external delivery. Ensure unique operation/recipient delivery so retries do not duplicate notices.

Final v6 recipients: hide post tells the host and exposes post-unavailable history to participants; restore tells host/accepted participants; delete tells host/accepted/pending applicants; suspend/resume league tells organiser/members; close registration/delete league also tells pending applicants. Agree group-host recipients using real group membership. Keep public reasons separate from private report notes. In-app notices are required; push delivery is outside this scope.

### DB09 Admin provisioning and home content

Current Auth metadata/RLS helper are retained. BL-030 still requires an invitation-only admin provisioning flow, a role-hook agreement and hosted session validation. Keep authority in protected app_metadata or a protected role source, never user_metadata. Ordinary player signup may stay enabled. The local configuration has session settings; the new frontend also supplies an idle-timeout workaround. Confirm the actual hosted admin policy rather than treating local settings as proof.

The carousel already uses `admin_post`; a new HomeContent table is not inherently necessary. Agree whether admins see all drafts or only their own. Keep creator/publication metadata server-owned, and add a database-level published-image rule if alternate write paths must enforce it too. Image upload/storage permissions are separate from accepting an image URL. Announcement editing currently guards concurrent changes during processing; add a caller-read version for edits already stale before the request begins.

### DB10 Account deletion monitoring

Account deletion/anonymization is implemented upstream and preserves players/history. Add a separate durable `account_deletion_request` with identifiers, pending/processing/completed/failed state, timestamps, safe failure details, attempts and retry timing. It must survive deletion of the Auth identity. Admins inspect failures; players can access only their own request through an agreed flow. Wire the deletion worker/Edge workflow to persist failures and retries. Do not replace the existing anonymization behavior with a cascading hard delete.

### DB11 Analytics events

Completed registrations and received-report counts work against retained rows. A protected end-user/admin/test classification is still required for consistent exclusions. Registration metadata is cleared on deletion, so a durable profile-created event is needed for deletion-proof historical totals.

Add validated foreground-screen events for active-user metrics; background refresh is excluded and users are deduplicated both per day and across the full range. Add immutable first-publication facts for games, qualifying league activity/membership events and report-resolution events. Events need server time, bounded type/entity identifiers, indexing, deduplication and explicit retention/read/write rules. Frontend event emission and trusted ingestion are additional application work. Missing old events must stay unavailable, not become fabricated zeros.

## Integration boundaries and acceptance

All 0.4 migrations are imported unchanged. Further schema work should use new migrations with compatible defaults/backfills, reviewed grants/RLS/functions and database tests. Admin BE then wires real actions, updates capabilities/client/docs and tests the entire workflow before replacing 501 with success. Do not report success for only a state update without its required audit/notices.

The adapter remains `/functions/v1/admin-api`; generated Player BE specs describe `/rest/v1`. Preserve caller JWTs for application reads and existing shared read RPCs. A trusted service client is not a shortcut around RLS. New exposed tables need explicit grants and RLS; privileged helpers need authorization, qualified names, safe search_path and narrow execution grants. An API's refusal does not revoke independent database permissions.

Acceptance for the next database iteration:

- Existing-JWT and alternate-RPC suspension denial, with safe Auth synchronization/retries.
- Append-only, attributable, complete audit records committed with their domain action.
- Restriction/deletion preserves participants, history, scores, confirmations and agreed rating behavior.
- Private notes cannot be read by reporters; evidence remains unchanged when a target changes.
- Concurrent/retried saves have version guards and one notice/event set per successful operation.
- Daily snapshot comparison, member registration rules and missing-history behavior follow the agreed product rules.
- Current admin reads stay available for deleted/unregistered profiles with explicit null/absent data where appropriate.

## Current validation and teammate rollout

On 13 October 2026, 156 Admin HTTP/SDK tests, 7 inherited session-timeout tests, 124 real local integration checks, Deno check/lint and frontend production build passed. The integration is tested against an isolated local Supabase stack containing all 50 migrations and the upstream development/reference seed data. The real suite checks Auth/RLS, both response contracts, new rating/evidence/flag reads, preserved evidence, deleted-account handling, exact counts and Final v6 refusals. Fixture deletion is scoped to temporary local accounts/records and also removes their retained anonymized test players.

Run the four Node HTTP/SDK suites, Deno check/lint and frontend build as described in [admin-api.md](admin-api.md); run `admin-api-live.test.mjs` only against a local stack. Hosted deployment, external email/geocoding and Google OAuth are not established by these tests.

A Supabase maintainer must apply the branch's migration history to the team's actual project before deploying this Admin API version. Confirm hosted drift and follow [DEPLOYMENT.md](DEPLOYMENT.md); keep development seed data local. GitHub publication alone is not proof of a deployed database or function. The new function expects the 0.4 schema and is not compatible with the old four-migration main database.
