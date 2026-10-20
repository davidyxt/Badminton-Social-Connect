# Admin backend database handoff

Updated 20 October 2026. This document describes the features actually exposed by the integrated Admin console. It replaces the broader earlier proposal: invitations, deletion retry workers and extra leaderboard snapshots are not requirements of the current screens.

The integration assembled on `admin-api/main-console-integration-20261020` combines main `e42beb7`, our completed integration `6d8e8f2` and the latest frontend `5b204e7`. The existing 50 database migrations and shared singles rating engine are unchanged. Mini Leagues are hidden by default in the latest frontend and are outside the current delivery scope. Local integration does not establish hosted deployment.

## Connected functionality

| Screen | Current implementation |
|---|---|
| Sign in/access/session expiry | Real Supabase Auth and protected administrator role; logout/cache isolation and 30-minute browser idle sign-out |
| Overview/users | Real directory and profiles, registration-pending/registered/deleted states, server counts, targeted reports and participation reads |
| Rankings/player history | Stored singles rankings, shared rating card/placement/grade, 30-day trend, paginated before/after ratings and RD, State/Nearby leaderboard reads |
| Games/results/disputes | Read-only match context, structured scores, opposing confirmation and anomaly flags; disputes are read-only by design |
| Reports | Queue, categories, original stored evidence and separate current target |
| Content | Real carousel create/edit/publish/unpublish/reorder/remove using `admin_post`; HTTP(S) image URLs |
| Deleted records | Retained deleted game-post reads, excluded from active lists |
| Analytics | New completed registrations and received reports over Melbourne calendar days |

Announcement edits now send the version originally read by the editor (`expectedUpdatedAt`). The backend rejects stale and concurrent saves with 409 without requiring a schema change. Reordering is still multiple requests and can partially succeed. API mode never imports frontend fixtures into the database; the local database has development seed records.

## Visible features still unavailable: current state and required change

The DB labels are retained because the frontend's disabled-action explanations refer to them. They identify gaps, not migrations already applied or a mandatory choice of table names.

### DB01 Activity log and recent activity

**Current:** Rows have last-update metadata, but no complete administrator action history. The Activity log and record timelines cannot display real action events. The reason entered when removing a carousel card cannot be retained by the current announcement DELETE contract.

**Required change:** Store administrator action, actor, time, target and entered reason, and expose administrator-only filtered reads. A successful action and its log must be recorded together. Extend the announcement deletion API to accept/store the entered reason. Do not interpret an unavailable log as evidence that no action happened.

### DB02 Suspend/restore account

**Current:** There is no persistent suspension state; registration and account deletion are separate existing states. The buttons are disabled and restriction operations return 501.

**Required change:** Add protected suspension state and the reason/actor/time needed by the screen. Provide authorized suspend/restore operations with stale-save checks and action logging. Enforce the restriction on actual player operations and coordinate Auth/session behavior; changing only an Admin badge would not suspend the account. Restoration must respect independently hidden or deleted content.

### DB03 Hide/restore game post

**Current:** Game lifecycle and retained deletion fields exist, but independent administrator visibility state does not. Hide/restore is disabled.

**Required change:** Store protected hidden/visible state and reason/actor/time independently of lifecycle/deletion. Add authorized hide/restore operations and apply visibility rules to discovery and joining. Keep existing match/results/history intact and record the action. An organiser edit must not clear an administrator restriction.

### DB04 Mini Leagues

The latest frontend hides league management, league ranking/moderation/analytics tabs and related entries by default. No additional league schema is required for this integration. Older league routes/types remain for compatibility; re-enabling the feature would require a separate review of its disabled restriction/registration/deletion actions.

### DB05 Resolve/dismiss report and private review note

**Current:** `report` stores status/category/evidence. Reading original evidence works. The database cannot store the screen's private review note and decision history, so Resolve/Dismiss remains disabled. The legacy status-only PATCH is not the complete screen action.

**Required change:** Store private note, outcome, reviewer and review time with administrator-only access. Existing reporter access must not reveal private notes. Commit the status change, decision and action log together with a stale-save check. Preserve original evidence and keep account/post restriction actions separate.

### DB06 Delete game listing while retaining results

**Current:** Retained deletion fields/read support exist. The upstream deletion function also excludes the game's results from rankings and causes recalculation; that conflicts with Final v6. The console therefore blocks deletion. This is not simply a missing deletion column.

**Required change:** Provide an authorized listing-only deletion operation that stores reason/actor/time, retains match/results/confirmations/rating history and preserves ratings as required by the page. Add action logging and the required notifications. Keep deleted listings out of active lists; the screen does not offer restoration of deleted listings.

### DB07 Ranking history

The currently shown singles history, rating card and trend already use the shared SQL engine and existing history. No second algorithm or extra daily-snapshot table is needed for these screens. Admin scores, confirmations and ranking calculations remain read-only. Missing historical records must stay unavailable rather than be fabricated.

### DB08 Notices associated with moderation

**Current:** The shared notification table and player-flow notice types exist. Moderation notices cannot run while their underlying actions are unavailable.

**Required change:** Connect the existing notification system to successful account/post restriction and deletion operations, using the recipients/text required by those dialogs. Record delivery intent with the operation so failures/retries do not produce inconsistent or duplicate notices. Do not expose private report review notes.

### DB09 Sign-in and carousel

The current sign-in and image-URL carousel functions already work without a new content table. Browser idle expiry and caller-version protection are implemented. Image upload is disabled in API mode: if that existing upload control is to be enabled, add an upload endpoint plus storage access rules and wire the UI to it. Invitation management is not an added requirement of this console integration.

### DB10 Deleted accounts

Reading retained/anonymized deleted accounts works. There is no deletion-failure/retry management screen in the current console, so a deletion-request queue or retry worker is not a requirement here.

### DB11 Remaining visible analytics

**Current:** New registrations and reports received work from retained records. Games published/filled metrics are marked unavailable; current lifecycle values do not reliably reconstruct those historical events. Deleting a user also removes private registration metadata, so registration counts are not deletion-proof event totals.

**Required change:** If enabling the currently shown unavailable metrics, persist the publication/filled dates or corresponding event facts needed for the selected date ranges, then add the API aggregation and frontend mapping. Keep unrecorded history unavailable. League analytics and additional foreground-usage tracking are not added requirements of the default visible console.

## Integration and validation

Use new reviewed migrations for any agreed schema changes, preserving existing data and shared rating behavior. Apply authorization/RLS to new state and private records. Admin BE then connects the operation and updates the frontend capability gate; do not enable a button after implementing only its display state.

On 20 October 2026, 158 Admin HTTP/SDK tests, 7 inherited player-session tests and 9 console tests passed (174 total), with 124 real local Auth/Postgres/RLS/Edge checks. A supplemental 12-check run executed actual frontend modules against local Supabase, including real announcement writes, stale/concurrent saves, directory failure, idle expiry and cache clearing. Admin lint/build and Deno check/lint passed. The separate player frontend currently cannot build because latest main lacks `services/badmintonApi`; this does not prevent the Admin console build.

The local demo uses the existing 50 migrations and development/reference seed. Tests remove only their own temporary fixtures. The console defaults to browser mock data for presentations; publishing the integration to main does not deploy Supabase or enable unavailable backend features. A teammate with Supabase access must check hosted migration state before deploying the function; development seed data must stay local.

See [Admin API](admin-api.md), [integration/setup/testing](admin-local-integration.md) and [deployment](DEPLOYMENT.md) for contracts and commands.
