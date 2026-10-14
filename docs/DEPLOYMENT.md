# Deployment guide

Everything needed to get the backend running on the hosted Supabase project
(`qvpccrsawnapjwcqjfop`), in order. Local development is in
[SETUP.md](SETUP.md).

Most of this is a one-off. Once the CI deploy job exists (BL-002), steps 3, 4
and 6 run automatically on every merge to `main`.

This branch publishes the connected Admin console and Admin API with Player BE-2 0.4 (50 migrations). A Git push does not run a deployment by itself; the existence and configuration of a CI job must be checked separately. Hosted deployment has not been verified by this local integration.

## Contents

- [0. Before you start](#0-before-you-start)
- [1. Merge the backend branches into main](#1-merge-the-backend-branches-into-main)
- [2. Connect the CLI to the hosted project](#2-connect-the-cli-to-the-hosted-project)
- [3. Push the database schema](#3-push-the-database-schema)
- [4. Load the production reference data](#4-load-the-production-reference-data)
- [5. Auth settings](#5-auth-settings)
- [6. Deploy the Edge Functions](#6-deploy-the-edge-functions)
- [7. Vault entries](#7-vault-entries)
- [8. Check the scheduled jobs](#8-check-the-scheduled-jobs)
- [9. Storage for profile pictures](#9-storage-for-profile-pictures)
- [10. Frontend hosting](#10-frontend-hosting)
- [11. Smoke test](#11-smoke-test)
- [Before real users](#before-real-users)
- [Day-to-day](#day-to-day)
- [Troubleshooting](#troubleshooting)

## 0. Before you start

- [ ] **Agree who approves the first push.** The hosted project is shared; pushing the schema changes it for everyone.
- [ ] **Docker Desktop running** (for `functions deploy`), or add `--use-api` to bundle in the cloud.
- [ ] **The database password** for the hosted project (Dashboard → Project Settings → Database). You need it for `link` and for loading seed data.

Do everything from the repo root, on `main`, after step 1.

## 1. Merge the backend branches into main

The historical backend merge order was as follows. This integration already contains those migrations plus Player BE-2 0.4; do not reapply or duplicate them merely because they are listed here. Review the final diff against the team's current `main` before merging.

1. `M6-groups`, `foundation`, `M4-registration-and-sign-in`
2. `M1-find-games`
3. `M3-reporting-and-blocking`
4. `M5-player-trust-and-reliability`

Known small conflicts, all resolved by keeping both sides:

| File | Why |
|---|---|
| `docs/database-schema.md`, `docs/rls-policies.md` | Each branch adds rows to the migration list and changes the check count |
| `supabase/config.toml` | M5 adds `[functions.send-email-notification]`, M1 adds `[functions.geocode-venues]`, both at the end |
| `supabase/functions/.env.example` | M5 creates it with the email settings, M1 with the geocoding setting |

Validate in a disposable local stack before deploying. The historical BE-1 scripts still perform direct result/dispute inserts removed in 0.4 and are not current acceptance evidence. Use the Admin unit/live tests in [admin-api.md](admin-api.md), both frontend builds and the shared Player BE-2 checks in [M2](features/M2-results-and-rankings.md). `db reset` removes local data, so it is only appropriate for a disposable stack.

**Migration order:** compare `npx supabase migration list --linked` and `npx supabase db push --dry-run` before deploying. Keep already-shared migration identities intact. If older pending files are missing from hosted history, a maintainer must review their order/dependencies and schema drift; `db push --include-all --dry-run` previews that case. Do not rename/replay an applied migration or repair history without confirming what SQL is actually present. See the [CLI migration reference](https://supabase.com/docs/reference/cli/supabase-db-push).

## 2. Connect the CLI to the hosted project

```bash
npx supabase login
npx supabase link --project-ref qvpccrsawnapjwcqjfop
```

## 3. Push the database schema

```bash
npx supabase db push --dry-run   # lists the migrations it would apply
npx supabase db push
```

This creates every table, policy and function, and turns on the `pg_cron`
and `pg_net` extensions. It does **not** load any data.

## 4. Load the production reference data

`db push` never runs seed files, and `--include-seed` would also load the
**dummy dev data**, so load the production files by hand. Get the connection
string from Dashboard → **Connect** → Session pooler, then:

```bash
DB="postgresql://postgres.qvpccrsawnapjwcqjfop:<password>@<pooler-host>:5432/postgres"
psql "$DB" -f supabase/seeds/production/01_states.sql
psql "$DB" -f supabase/seeds/production/02_suburbs.sql
psql "$DB" -f supabase/seeds/production/03_venues.sql
```

The files are safe to run again: they update rows rather than duplicate them.
**Never** load `supabase/seeds/dev/` into the hosted project.

- [ ] `select count(*) from state;` → 8
- [ ] `select count(*) from suburb;` → 18,087
- [ ] `select count(*) from venue;` → 142

## 5. Auth settings

Follow **Hosted project configuration** in
[features/M4-registration-and-sign-in.md](features/M4-registration-and-sign-in.md#hosted-project-configuration):
site URL and redirect URLs, email confirmation, password policy, email
templates, **custom SMTP** (the built-in sender is limited to a few emails an
hour; see [EMAIL-SETUP.md](EMAIL-SETUP.md#part-a-account-emails-custom-smtp)), rate limits and sessions. Google sign-in is in
[SETUP.md](SETUP.md#6-google-oauth).

Set these in the dashboard rather than with `npx supabase config push`:
`config.toml` holds local values (`site_url = http://localhost:5173`), which
would overwrite the hosted ones.

CAPTCHA stays **off** until the team decides to turn it on (same M4 section,
"Cloudflare Turnstile").

## 6. Deploy the Edge Functions

The integration has three functions. The two workers are called by the database; the Admin API is called by the signed-in Admin console:

| Function | Branch | What it does |
|---|---|---|
| `send-email-notification` | M5 (BL-087) | Emails every notification through Resend |
| `geocode-venues` | M1 | Finds pins for venues saved without coordinates (OpenStreetMap Nominatim, one request per second) |
| `admin-api` | Admin integration | Authenticated console reads and supported announcement/notice/status-only writes; requires the 0.4 schema |

**Secrets.** Make two long random secrets (`openssl rand -hex 32`, twice), and
put the real values in `supabase/functions/.env` (gitignored; template in
`.env.example`):

```bash
EMAIL_WEBHOOK_SECRET=<secret 1>
GEOCODE_WEBHOOK_SECRET=<secret 2>
RESEND_API_KEY=<from Resend; leave empty for a dry run>
EMAIL_FROM="Badminton Social Connect <noreply@your-verified-domain>"
APP_URL=https://<production-domain>
ADMIN_ALLOWED_ORIGINS=https://<admin-domain>,https://<player-domain>
```

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-email-notification
npx supabase functions deploy geocode-venues
npx supabase functions deploy admin-api
```

`config.toml` sets `verify_jwt = false` for the two workers, which each check their own secret. `admin-api` retains `verify_jwt = true` and validates the current Auth user and protected admin role in the handler. Its CORS allowlist must contain complete Admin frontend origins. The console uses only a public API key and its current user JWT; server secrets must never enter its frontend settings. See [Admin API authentication](admin-api.md#authentication-and-transport).

**Resend** (for real email): create an account, verify the sending domain,
create an API key. Without `RESEND_API_KEY` the email function does a dry run
and sends nothing. The full email walkthrough, account emails (SMTP) and
notification emails, with checks and troubleshooting, is in
[EMAIL-SETUP.md](EMAIL-SETUP.md).

## 7. Vault entries

The database finds the functions through four encrypted Vault secrets. In the
dashboard's **SQL Editor**, with the same secrets as step 6:

```sql
select vault.create_secret('https://qvpccrsawnapjwcqjfop.supabase.co/functions/v1/send-email-notification', 'email_webhook_url');
select vault.create_secret('<secret 1>', 'email_webhook_secret');
select vault.create_secret('https://qvpccrsawnapjwcqjfop.supabase.co/functions/v1/geocode-venues', 'geocode_function_url');
select vault.create_secret('<secret 2>', 'geocode_function_secret');
```

Until these exist, no emails are sent and no venues are geocoded. Nothing
breaks; it just stays off.

## 8. Check the scheduled jobs

The migrations schedule four `pg_cron` jobs. Inspect `cron.timezone` as well as each schedule:

```sql
select jobname, schedule, active from cron.job;
```

| Job | Schedule | What |
|---|---|---|
| `refresh-reliability` | `5 * * * *` (hourly) | Refreshes reliability copies on profiles (BL-052) |
| `geocode-venues` | `* * * * *` (every minute) | Calls the geocoding function if venues are waiting |
| `rate-confirmed-results` | `0 15 * * *` (daily, GMT in the tested stack) | Rates confirmed singles results; 2 am Melbourne in daylight saving, 1 am in standard time |
| `expire-pending-results` | `10 * * * *` (hourly) | Expires unconfirmed results after seven days |

The inherited rating schedule is not an exact year-round 2 am Melbourne schedule. A maintainer must review timezone/DST behavior if that is a production requirement. This integration does not change the SQL schedule.

Recent runs: `select * from cron.job_run_details order by start_time desc limit 10;`
Replies from the functions: `select * from net._http_response order by id desc limit 10;`

## 9. Storage for profile pictures

Profile pictures live in Supabase Storage, in a bucket called **`avatars`**.

**Created by the migrations.** `20261008101500_my_games_availability_profile_pictures.sql` creates the bucket and its access rules, so `db push` (step 3) sets it up. There's nothing to create by hand. Check it:

1. **Dashboard → Storage.** An `avatars` bucket is listed as **Public**.
2. **Bucket settings:**
   - **file size limit:** 2 MB;
   - **allowed types:** `image/jpeg`, `image/png`, `image/webp`.
3. **Dashboard → Storage → Policies → `avatars`.** Four policies:

   | Policy | What it allows |
   |---|---|
   | players upload into their own folder | insert |
   | players see their own files | select |
   | players replace their own files | update |
   | players delete their own files | delete |

   Each one allows a signed-in player only inside `avatars/<their player id>/`.

Or in the SQL Editor:

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'avatars:%';
```

**How the app uses it:**

1. Upload: `supabase.storage.from('avatars').upload(`${userId}/${crypto.randomUUID()}.jpg`, file, { contentType: file.type })`.
2. Get the address: `supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl`.
3. Save it: `supabase.rpc('set_my_profile_picture', { p_url: publicUrl })`. This checks the file is in the player's own folder and returns `previousPath`.
4. Delete the old file: `supabase.storage.from('avatars').remove([previousPath])`, when `previousPath` isn't null.
5. To remove the picture: `supabase.rpc('remove_my_profile_picture')`, then remove the returned `previousPath`.

Every screen function then returns the picture as `profileImageUrl`: profiles, Home, game hosts and rosters, join requests, player search and the Blocked Users list. It's only returned where the profile itself may be seen.

**Good to know:**

- **The bucket is public.** Anyone who has a picture's URL can load it, without signing in. File names are random and the API only hands the URL to players allowed to see the profile, but don't treat the pictures as secret. If the team wants them private later, make the bucket private and have the app use signed URLs (`createSignedUrl`); the database side stays the same.
- **Deleting an account** clears the picture from the profile, but the database can't delete storage files. The app should remove the player's files before calling `delete_my_account`. Leftover files can also be removed by hand: **Storage → avatars → the player's folder → Delete**.
- **Resizing and cropping** happen in the app before upload; keep pictures small (for example 512 × 512 px). Supabase's image transformations are a paid feature and aren't used.
- **Locally**, the same bucket comes from the same migration. Files are served at `http://127.0.0.1:54321/storage/v1/object/public/avatars/...` and appear in Studio → Storage.

## 10. Frontend hosting

On the hosting platform (e.g. Vercel → Project → Settings → Environment
Variables), never as a committed file:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://qvpccrsawnapjwcqjfop.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API → anon / publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Only when CAPTCHA is turned on |

Then add the production domain (and preview domains) to the auth redirect URLs
from step 5.

### Admin console hosting

Deploy the Next.js app with root directory `admin`, install with `npm ci`, build with `npm run build`, and start with `npm run start` when using a Node host. Set these before building:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_ADMIN_DATA_SOURCE` | `api` |
| `NEXT_PUBLIC_SUPABASE_URL` | The same hosted project as the deployed Admin function |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's public anon/publishable key |

Add the exact Admin origin to `ADMIN_ALLOWED_ORIGINS` on the Edge Function. Provision administrators through a trusted Auth admin process using `app_metadata.role = admin`; the console has no public admin signup flow. Do not copy local demo credentials, dev seeds or `.local/` into the hosted project. Public settings are bundled by Next.js: changing projects requires rebuilding the console. Mock mode must not be mistaken for a successful hosted API connection.

## 11. Smoke test

- [ ] Sign up with a real email: the confirmation email arrives; an under-18 date of birth is refused.
- [ ] Sign in with Google: you land on the app (and on the age-gate step, once the frontend has that screen).
- [ ] Post a game at a listed venue; it appears in Find Games for a second account.
- [ ] Request, accept: both accounts get a notification, and an email once Resend is set.
- [ ] Add a venue without coordinates (SQL or admin): within a couple of minutes it has a pin (`coordinates_source = 'openstreetmap'`).
- [ ] Block and report from a profile.
- [ ] Upload a profile picture: it shows on your profile and on a game you host; replace it, then remove it; the old files disappear from Storage → avatars.
- [ ] Set your availability: another account sees it on your profile.
- [ ] Sign into the Admin console: it shows Live API and real overview/directory data; a non-admin is refused.
- [ ] Compare a stored report's original evidence with its current target; inspect match confirmation and rating history without changing them.
- [ ] Create/edit/publish an approved test announcement and verify the stored record. Unsupported moderation is disabled and result/ranking writes remain refused.

## Before real users

| Item | Where |
|---|---|
| Permission from BadmintonHub to use its venue list, or an official list from Badminton Victoria | Team item 8 |
| Credit lines: "© GeoNames (CC BY 4.0)" for suburbs, "© OpenStreetMap contributors (ODbL)" on geocoded venues | Team item 10 |
| Terms of use and privacy notice pages, and their version labels | Team item 11 |
| Age-gate screens for Google sign-in | Team item 11 |
| Custom SMTP and Resend on a domain Badminton Victoria controls | Step 5, team item 15 |
| Admin console view for venues that failed to geocode | Team item 18 |
| A separate production project, so this one can become staging | Team decisions |

## Day-to-day

| Change | Do |
|---|---|
| New migration | Merge to `main`, then `npx supabase db push` (automatic once BL-002 exists) |
| Venue list refreshed | Commit the regenerated `03_venues.sql`, then rerun step 4 for that file |
| Edge Function changed | `npx supabase functions deploy <name>` |
| Rotate a function secret | `npx supabase secrets set NAME=<new>`, then update the matching Vault entry: `select vault.update_secret((select id from vault.secrets where name = '<name>'), '<new>');` |

## Troubleshooting

| Symptom | Check |
|---|---|
| No emails | Vault entries from step 7; `net._http_response` for errors; function logs (Dashboard → Edge Functions → Logs); `RESEND_API_KEY` set |
| Venues never get pins | Vault entries; `select status, attempts, last_error from venue_geocode_queue;`; function logs |
| `401` in `net._http_response` | The Vault secret and the function secret don't match |
| Picture upload fails with "new row violates row-level security policy" | The path must start with the player's own id: `avatars/<auth user id>/<file>` |
| Picture upload fails with 413 or "mime type not supported" | Over 2 MB, or not a JPEG, PNG or WebP |
| `set_my_profile_picture` says to upload first | The URL must be the public URL of a file in the player's own folder that exists, e.g. from `getPublicUrl` |
| `db push` refuses a migration | It is older than one already pushed: rename it to a fresh timestamp |
| Sign-up "Database error saving new user" | Username taken or under 18; check Dashboard → Logs → Postgres |
