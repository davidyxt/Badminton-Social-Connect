# Badminton Social Connect: Admin console

Administrator web console (Next.js App Router, TypeScript, Tailwind CSS). It runs in one of two modes:

- **mock** (default): every screen and action works against an in-memory mock data layer. No backend needed.
- **api**: reads and writes the real `admin-api` Supabase Edge Function (branch `admin-api/player-be2-integration`, which needs the team's 50 database migrations). Only what the backend supports today works; the rest is disabled with an explanation.

This is a separate app from the player app in `../frontend` (Vite + React).

## Run it

```bash
cd admin
npm install
npm run dev        # http://localhost:3000
```

In mock mode, sign in with any email and password. An email starting with `player` signs in as a non-admin and shows the access-restricted screen.

For presentations, keep `NEXT_PUBLIC_ADMIN_DATA_SOURCE=mock` (the default). If this app was previously configured for API mode, change that value in `.env.local` and restart development or rebuild production. Do not run `setup:local` for a mock presentation because that helper switches to API mode. Demo changes persist in the browser and do not update Supabase.

Other scripts: `npm run build`, `npm run lint`, `npm test`, `npm run setup:local` (local Supabase only; credentials stay in ignored `.local/`).

Visual conventions (tokens, spacing, components to reuse) are in [DESIGN.md](DESIGN.md).

## Scope: Mini Leagues are hidden

Mini Leagues are out of scope, so the console hides them: the Mini Leagues screens, the moderation and rankings tabs, league analytics, reports about leagues, and league entries in the activity log and deleted records. The old league URLs redirect to the nearest screen (see `next.config.ts`). Only the UI is hidden: the types, mock data, data layer and database schema are unchanged. Set `NEXT_PUBLIC_ENABLE_MINI_LEAGUES=true` and restart the dev server to bring everything back. The switch lives in `lib/features.ts`.

## Running against the real admin API

1. From this integrated checkout (which includes the Admin function and the existing 50 migrations), start Supabase locally and serve the function, allowing the console's origin (the function only allows `http://localhost:5173` by default):

   ```bash
   npx supabase start
   echo "ADMIN_ALLOWED_ORIGINS=http://localhost:3000" > /tmp/admin-api.env
   npx supabase functions serve admin-api --env-file /tmp/admin-api.env
   ```

2. Give your account the admin role. There is no admin registration endpoint: set `app_metadata.role = "admin"` on the user in Supabase Studio (Authentication → Users) or through the Auth admin API, then sign in again. The team's dev seed already has one: `admin@example.com` / `Passw0rd!`.

3. Copy `.env.example` to `.env.local` and set:

   ```
   NEXT_PUBLIC_ADMIN_DATA_SOURCE=api
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
   ```

4. `npm run dev` and sign in with that account. The header shows "Live". For the verified isolated local stack and safe setup helper, see [the integration guide](../docs/admin-local-integration.md).

What works in API mode today:

| Area | API mode |
| --- | --- |
| Sign in / access restricted / session expired | Real Supabase Auth; `app_metadata.role = admin` required. Admins are signed out after 30 idle minutes |
| Overview, Users, Reports, Games & results, Rankings, Disputes (plus Mini Leagues when enabled) | Read-only, real data, refreshed every 20s. Includes registration/deleted state, report categories and evidence snapshots, per-game scores, confirmations and result flags |
| Ranking history | Shared singles rating card, placement/grade, 30-day trend, paginated before/after rating and RD history; State/Nearby leaderboard reads |
| Deleted records | Deleted game posts (kept for history); deleted Mini Leagues aren't stored yet |
| Home carousel (`/content`) | Create, edit, publish/unpublish, reorder, remove. Images must be absolute `http(s)://` URLs; image upload works only in mock mode (no upload endpoint yet). Saving a card that changed in another session since you opened it is refused as a conflict. Removing asks for a reason and a typed DELETE; `DELETE /admin_post` has no reason field, so the reason isn't sent yet (it belongs in the DB01 log) |
| Analytics | New registrations and reports received only; other metrics show "Not tracked yet" |
| Suspend/restore account, hide/restore post, suspend/resume/close/delete league, resolve/dismiss report | Disabled: the backend returns 501 until the database changes in its `docs/admin-database-handoff.md` (DB02–DB06) land |
| Delete game post | Disabled: the backend blocks it (405) because its deletion would remove the game's results from rankings, which Final v6 doesn't allow |
| Activity log | Empty with a notice (DB01) |
| Disputes | Read-only in both modes: Final v6 lets admins review disputes but not resolve them (the API returns 405) |

When the backend adds a capability, remove it from `lib/api/capabilities.ts` and the existing UI starts calling it.

## Mock controls

In mock mode, the **Mock controls** button (bottom left) is testing tooling for states a real backend would produce. The console never says it's showing mock data, so the button is hidden by default: open any page with `?devtools=1` to show it in that browser (`?devtools=0` hides it again), or set `NEXT_PUBLIC_SHOW_DEV_TOOLS=true`. It offers:

| Control | What it shows |
| --- | --- |
| Fail the next save | Save-failed toast with Retry; the dialog keeps your input |
| Next save hits a "record changed" conflict | Simulates another admin session changing the record first |
| Random failure rate | 10 / 25 / 50% of saves fail |
| Simulate latency | 300–800ms per call (on by default) |
| New player report every 20s | Live Reports queue (stands in for the `admin:reports` Realtime channel) |
| Expire session / Lose admin access | Session-expired and access-restricted screens |
| Reset mock data | Restores the original fixtures |

Mock data and the mock session persist in `localStorage`, so a reload keeps your changes. Changes made in one tab show up live in other open tabs.

## Where things live

```
app/(auth)/            sign-in, session-expired, access-restricted
app/(admin)/           every admin route; layout.tsx is the auth guard, data loader (API sync) and idle-timeout host around the shell
components/layout/     shell, sidebar, mock controls, providers
components/shared/     DataTable, ConfirmDialog, FeedbackToast, StatusBadge, EmptyState, PlayerProfileCard, charts…
components/modals/     one confirmation component per flow
lib/types/             entity types (snake_case, from the v1.2 API spec)
lib/mock-data/         fixtures
lib/mock-api/          RPCs (same names and arguments as the spec), selectors, store; each RPC delegates to lib/api in API mode
lib/api/               real admin-api client, table sync + field mapping, capabilities (what the backend supports today)
lib/config.ts          data source switch
lib/hooks/useAdminAction.ts   runs every mutation through the shared feedback states
lib/auth/              session: mock, or Supabase Auth in API mode (the real security boundary is always the backend)
```

## How the real API is wired

Pages only import from `@/lib/mock-api`, so they don't know which backend is active.

- `lib/api/sync.ts` loads the backend's camelCase table routes (`/player`, `/player_profile`, `/report`, `/dispute`, `/mini_league`, `/match`, `/match_result`, `/rating_history`, `/result_flag`, …, with fields like `username`, `organiserGroupId`, report category and evidence) plus the console routes `/games` (game posts, including deleted ones), `/users` (emails and registration state) and `/analytics`, into the same store the mock uses, mapping them to the console's snake_case types. It re-reads on sign-in, every 20 seconds and after each write (in place of Realtime channels).
- `lib/api/actions.ts` holds the write side: the spec RPCs plus PostgREST-style `/admin_post` CRUD for the carousel.
- `lib/api/capabilities.ts` lists the actions and screens the backend can't support yet; the UI disables or annotates them.

Fields the database doesn't have are left empty or labelled, never invented. Every player shows as active because the database has no suspension state yet. Players who haven't chosen a username show as "No username yet", and deleted accounts as "Deleted player".

## Known limitations

- API mode re-reads whole tables every 20 seconds, including one Auth lookup per player to get emails. That's fine at current data sizes, but should move to per-page, server-side queries (filtering, paging) before launch.
- Dialogs move focus in and close on Escape, but don't trap focus yet.
