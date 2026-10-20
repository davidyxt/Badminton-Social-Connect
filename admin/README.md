# Badminton Social Connect: Admin console

Administrator web console (Next.js App Router, TypeScript, Tailwind CSS). It runs in one of two modes:

- **mock** (default): every screen and action works against an in-memory mock data layer. No backend needed.
- **api**: reads and writes the integrated `admin-api` Supabase Edge Function (Player BE-2 0.4, all 50 team migrations). Only supported actions work; the rest is disabled with an explanation.

This is a separate app from the player app in `../frontend` (Vite + React).

## Run it

```bash
cd admin
npm ci
npm run dev        # http://localhost:3000
```

In **mock mode**, sign in with any email and password. An email starting with `player` signs in as a non-admin and shows the access-restricted screen. In **API mode**, use an actual Supabase account with `app_metadata.role = admin`.

Other scripts: `npm run build`, `npm run lint`, `npm test`. Run `npm run setup:local` after starting local Supabase to configure API mode and create a local administrator demo account. This helper refuses hosted projects, writes only public client settings to `.env.local`, and stores demo credentials in Git-ignored `.local/access.txt`. If using an isolated stack, set `SUPABASE_WORKDIR` to its configuration directory first. See [local integration notes](../docs/admin-local-integration.md).

## Running against the real admin API

1. From the repository root (not `admin/`), start Supabase with all 50 migrations and serve the function, allowing the console's origin (the function only allows `http://localhost:5173` by default):

   ```bash
   npx supabase start
   # Create supabase/functions/.env from its example and add:
   # ADMIN_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
   npx supabase functions serve admin-api --env-file supabase/functions/.env
   ```

2. In another terminal, run `npm run setup:local` from `admin/`. It creates or verifies a local admin account and writes `.env.local`; credentials are in `.local/access.txt`. Alternatively, use an existing account with `app_metadata.role = "admin"`, assigned through a trusted Auth admin tool. Ordinary signup metadata cannot grant this role.

3. For manual setup instead of the helper, copy `.env.example` to `.env.local` and set:

   ```
   NEXT_PUBLIC_ADMIN_DATA_SOURCE=api
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
   ```

4. `npm run dev` and sign in with that account. A "Live API" badge shows in the header.

The URL and public key must belong to the project hosting the Admin function. API mode starts with an empty cache and reads database records; it never imports mock fixtures or browser mock storage into Supabase. Local development seeds are dummy database records. Keep `.env.local` and `.local/` out of Git. Restart after changing settings, and rebuild before `npm run start`: `NEXT_PUBLIC_` settings are bundled at build time.

For isolated stacks, Windows commands and hosted configuration, see the [integration guide](../docs/admin-local-integration.md).

What works in API mode today:

| Area | API mode |
| --- | --- |
| Sign in / access restricted / session expired | Real Supabase Auth; `app_metadata.role = admin` required |
| Overview, Users, Reports, Games & results, Rankings, Mini Leagues, Disputes | Read-only, real data, refreshed every 20s. Overview uses server registration and non-deleted game counts. User directory distinguishes registered, pending and deleted accounts. |
| User rating | Shared rating card, 30-day singles trend and paginated actual rating changes. Not weekly leaderboard snapshots; doubles history is unavailable. |
| Report evidence | Original stored submission snapshot, kept separate from the current reported content. Group targets are supported. Missing legacy evidence is labelled. |
| Match monitoring | Structured game scores, stored opposing confirmation and paginated informational anomaly flags. Full per-player decision history is unavailable. |
| Shared leaderboard | State/Nearby established-player board alongside the broader stored admin ratings. Nearby uses the signed-in administrator's suburb. |
| Home carousel (`/content`) | Create, edit, publish/unpublish, reorder, remove. Images must be absolute HTTP(S) URLs; uploading is unavailable. Edits guard changes during the server request, but do not yet send the version originally opened by the editor. Reordering uses multiple requests and can partially succeed. |
| Analytics | New users and reports received only; other metrics show "Not tracked yet" |
| Suspend/restore account, hide/restore post, suspend/resume league, resolve/dismiss report | Disabled: seven moderation actions return 501 until DB02–DB05 and transactional audit support exist. |
| Close league registration, delete league/game listing | Disabled. Close/delete league actions have no supported endpoint; upstream game deletion is 405 because it changes ranking eligibility. Listing-only deletion needs DB06. |
| Activity log | Unavailable with a notice (DB01) |
| Deleted records | Retained game-post deletions are shown separately; full league/deletion audit is unavailable. No deletion writes enabled. |
| Disputes | Read-only in both modes: Final v6 lets admins review disputes but not resolve them (the API returns 405) |

When the backend adds a capability, verify its input/output contract and Final v6 restrictions before enabling it in `lib/api/capabilities.ts`. Status-only report/dispute compatibility writes are not a complete moderation decision, so Resolve/Dismiss actions remain disabled.

## Mock controls

In mock mode, the **Mock controls** button (bottom left) is demo tooling for states a real backend would produce:

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
app/(admin)/           every admin route; layout.tsx is the auth guard + shell
components/layout/     shell, sidebar, mock controls, providers
components/shared/     DataTable, ConfirmDialog, FeedbackToast, StatusBadge, EmptyState, PlayerProfileCard, charts…
components/modals/     one confirmation component per flow
lib/types/             console display types, mapped from supported API contracts
lib/mock-data/         fixtures
lib/mock-api/          RPCs (same names and arguments as the spec), selectors, store; each RPC delegates to lib/api in API mode
lib/api/               real admin-api client, table sync + field mapping, capabilities (what the backend supports today)
lib/config.ts          data source switch
lib/hooks/useAdminAction.ts   runs every mutation through the shared feedback states
lib/auth/              session: mock, or Supabase Auth in API mode (the real security boundary is always the backend)
```

## How the real API is wired

Existing list pages use `@/lib/mock-api` selectors over the active store. Native monitoring components additionally call console read endpoints in API mode. API mode does not fall back to mock data after a backend error.

- `lib/api/sync.ts` loads compatibility table routes plus native user registration/account and overview endpoints into the read cache. It re-reads on sign-in, every 20 seconds and after each write. Signing out, switching accounts or losing administrator access clears the cache and invalidates old in-flight loads. Refresh failures are shown explicitly.
- `lib/hooks/useConsoleRead.ts` and `components/monitoring/` load native rating/history, report evidence, result context/flags and leaderboard endpoints on demand, with error/retry states and pagination.
- `lib/api/actions.ts` holds the write side: the spec RPCs plus PostgREST-style `/admin_post` CRUD for the carousel.
- `lib/api/capabilities.ts` lists the actions and screens the backend can't support yet; the UI disables or annotates them.

Fields the database doesn't have are left empty or labelled. Suspension remains unavailable, while deleted accounts and registration states come from real data. Game posts use the actual title where present and a format/suburb label otherwise. Deleted game posts are excluded from active moderation lists. Private report decisions and administrator activity history still require database support.
