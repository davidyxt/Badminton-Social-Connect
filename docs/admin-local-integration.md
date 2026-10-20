# Admin console integration and testing

The local `admin-api/main-console-integration-20261020` branch combines latest `main` (`e42beb7`), our completed Admin integration (`6d8e8f2`) and latest `admin-console-frontend` (`5b204e7`). The Next.js console in `admin/` uses the Admin Edge Function and the existing 50 migrations. Mini Leagues remain hidden by default, following the latest frontend scope. This local integration has not been pushed or deployed.

## Data sources and boundaries

- API mode uses the existing Admin Edge Function, a signed-in administrator JWT and database RLS. All 50 imported migration files are unchanged.
- API mode starts with an empty read cache, ignores browser mock storage and loads database records. It never inserts frontend demo fixtures into Supabase.
- Local development seeds contain dummy database records. They are suitable for local testing and must not be loaded into the hosted project.
- Mock mode is a separate browser demonstration; mock actions do not change the database.
- Publishing this branch does not deploy Supabase or either frontend. Hosted deployment and external email/Google/geocoding remain separate verification work.

## Start a local stack and console

Use Node.js satisfying both frontend packages, npm and Docker Desktop. The setup helper uses `SUPABASE_CLI` when set, the existing Windows bundled CLI when present, or `npx supabase` otherwise. Run the following from the repository root in PowerShell:

```powershell
npx supabase start
# For local Google OAuth, follow SETUP.md before starting the default configuration.
# Create the ignored function env file, then add the allowed frontend origins.
if (-not (Test-Path -LiteralPath 'supabase/functions/.env')) {
    Copy-Item -LiteralPath 'supabase/functions/.env.example' -Destination 'supabase/functions/.env'
}
# Edit supabase/functions/.env so it contains:
# ADMIN_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
npx supabase functions serve admin-api --env-file supabase/functions/.env
```

Create the env file only if it does not already exist, and preserve existing secrets when editing it. If testing without Google credentials, use a private local configuration with the Google provider disabled; do not commit that environment-specific change. Do not reset a database containing data you want to retain. The function requires the full 0.4 migration history, not the old four-migration database.

In another terminal, from the repository root:

```powershell
Set-Location admin
npm ci
npm run setup:local
npm run dev
```

Open `http://localhost:3000`. Sign in with the account in `admin/.local/access.txt`; the header should say **Live API**. The helper refuses remote Supabase URLs and verifies an existing saved demo account on subsequent runs. It never silently replaces saved credentials. Public settings go to `admin/.env.local`; credentials stay in the ignored `.local/` directory. No service-role key is written to browser settings.

For manual or hosted configuration, use the variable table in [admin/README.md](../admin/README.md) and [Admin console hosting](DEPLOYMENT.md#admin-console-hosting). Only a trusted Auth admin process can assign `app_metadata.role = admin`.

### Existing isolated stacks

The verified local stack uses project `badminton-admin04`, API port 56321, database port 56322, Studio port 56323 and mail port 56324. These are local test choices; teammates can use the default ports or their own isolated configuration.

If using an isolated stack, it must contain the complete migrations, seed configuration and current function source. Point the setup helper and live tests at that directory:

```powershell
$env:SUPABASE_WORKDIR = '<directory containing the isolated supabase folder>'
npx supabase status --workdir $env:SUPABASE_WORKDIR
```

Use `--workdir` on CLI start/serve commands too. Keep the CLI process serving `admin-api` running while the console or live tests use it. The allowed origins are exact origins, including port; `localhost` and `127.0.0.1` are different origins.

## Connected functionality

| Area | Connected behavior |
|---|---|
| Auth and access | Real Supabase login; administrator role validation; cache reset on logout, account change or lost access |
| Overview and users | Server counts; registered, pending and deleted account states; real directory/profile data |
| Singles ratings | Shared rating card, 30-day trend and paginated before/after rating and RD history |
| Reports | Original stored evidence kept separate from current target, including group targets |
| Games and results | Read-only structured scores, opposing-side confirmation and paginated anomaly flags |
| Leaderboards | Established-player State/Nearby boards alongside the broader stored Admin ratings; Nearby uses the signed-in administrator's suburb |
| Deleted records | Retained game-post deletions shown separately and excluded from active moderation lists |
| Home carousel | Real create/edit/publish/unpublish/reorder/remove; HTTP(S) image URL validation, with upload disabled in API mode |
| Read failures | Visible error/retry states and refresh warnings; no substitution of mock data |

## Remaining limitations

Unsupported moderation, private report decisions, full activity/deletion audit and immutable leaderboard snapshots remain unavailable. No score, confirmation, ranking or game/league lifecycle write is enabled through the console. The shared SQL engine owns rating calculations. Refer to [admin-database-handoff.md](admin-database-handoff.md) for gaps in the currently visible screens and [admin-api.md](admin-api.md) for exact 501/405 responses.

Carousel edits send the editor's `expectedUpdatedAt` version and the backend rejects stale or concurrent saves with 409. Reordering still uses multiple requests and can partially succeed. Deletion reasons and successful announcement operations cannot be audited until action logs are stored. The latest frontend enforces a 30-minute browser idle sign-out; this is not proof of hosted server session configuration.

## Verification

From the repository root:

```powershell
node --test supabase/tests/admin-api.test.mjs supabase/tests/admin-api-contract.test.mjs supabase/tests/admin-api-console.test.mjs supabase/tests/admin-api-updated.test.mjs frontend/tests/idleTimeout.test.mjs
npm test --prefix admin
npm run lint --prefix admin
npm run build --prefix admin
npm run build --prefix frontend
```

In `supabase/functions/admin-api`, run `deno check --frozen index.ts` and `deno lint index.ts context.mjs contract.mjs handler.mjs console.mjs reads.mjs`. With local Supabase and the Edge Function running:

```powershell
# Set SUPABASE_WORKDIR first if using an isolated stack.
node supabase/tests/admin-api-live.test.mjs
```

The live test refuses hosted URLs, exercises real Auth/Postgres/RLS/Edge transport and removes only its own temporary fixtures. The demo account remains for manual testing. The nine console tests use controlled responses to verify client transport, pagination, registration/deletion mapping and cache isolation; they complement rather than replace the real-stack suite.

On 20 October 2026, 165 backend/inherited-session tests, 9 console tests and 124 real-stack checks passed, along with Admin lint/build and Deno check/lint. A supplemental 12-check run executed the actual frontend modules against local Supabase, covering real reads/writes, conflicts, directory failure, idle expiry and cache clearing. The latest main player app currently fails its separate build because `frontend/src/services/badmintonApi` is missing; its page imports were retained.

Validation is recorded in [admin-api.md](admin-api.md#validation-and-deployment). Browser checks verified real login, overview, report evidence, ratings, result monitoring and retained deletions. Local success does not establish hosted deployment, mathematical acceptance of every rating scenario or completion of unsupported Admin actions. The historical BE-1 `rls_test.sh` and `api_test.py` still need adaptation to the new result write restrictions; their old passing counts are not current 0.4 evidence.

After changing `NEXT_PUBLIC_` settings, restart development or rebuild production. For a production preview, run `npm run build` followed by `npm run start` in `admin/`.

## Stop

Stop frontend and function-serving terminals with Ctrl+C. Stop the appropriate local stack with `npx supabase stop --workdir <stack directory>`. The default stop retains local database data; do not use `--no-backup` when preserving the demo setup.
