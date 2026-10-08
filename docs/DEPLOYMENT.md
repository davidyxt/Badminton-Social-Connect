# Deployment guide

Everything needed to get the backend running on the hosted Supabase project
(`qvpccrsawnapjwcqjfop`), in order. Local development is in
[SETUP.md](SETUP.md).

Most of this is a one-off. Once the CI deploy job exists (BL-002), steps 3, 4
and 6 run automatically on every merge to `main`.

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
- [9. Frontend hosting](#9-frontend-hosting)
- [10. Smoke test](#10-smoke-test)
- [Before real users](#before-real-users)
- [Day-to-day](#day-to-day)
- [Troubleshooting](#troubleshooting)

## 0. Before you start

- [ ] **Agree who approves the first push.** The hosted project is shared; pushing the schema changes it for everyone.
- [ ] **Docker Desktop running** (for `functions deploy`), or add `--use-api` to bundle in the cloud.
- [ ] **The database password** for the hosted project (Dashboard → Project Settings → Database). You need it for `link` and for loading seed data.

Do everything from the repo root, on `main`, after step 1.

## 1. Merge the backend branches into main

Merge in this order. Each branch already contains the ones before it, so the
later pull requests shrink as you go.

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

After merging, run the full test suite locally (`npx supabase db reset`, then
`./supabase/tests/rls_test.sh`) before pushing anything to the hosted project.

**Migration order:** Supabase applies migrations by timestamp. If a migration
older than one already pushed to the hosted project arrives later, `db push`
refuses it. Rename it to a fresh timestamp (`npx supabase migration new`, move
the SQL across) before merging.

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

Two functions, both called by the database rather than by players:

| Function | Branch | What it does |
|---|---|---|
| `send-email-notification` | M5 (BL-087) | Emails every notification through Resend |
| `geocode-venues` | M1 | Finds pins for venues saved without coordinates (OpenStreetMap Nominatim, one request per second) |

**Secrets.** Make two long random secrets (`openssl rand -hex 32`, twice), and
put the real values in `supabase/functions/.env` (gitignored; template in
`.env.example`):

```bash
EMAIL_WEBHOOK_SECRET=<secret 1>
GEOCODE_WEBHOOK_SECRET=<secret 2>
RESEND_API_KEY=<from Resend; leave empty for a dry run>
EMAIL_FROM="Badminton Social Connect <noreply@your-verified-domain>"
APP_URL=https://<production-domain>
```

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-email-notification
npx supabase functions deploy geocode-venues
```

`config.toml` sets `verify_jwt = false` for both, so the database can call
them; each checks its own secret instead.

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

The migrations schedule two `pg_cron` jobs:

```sql
select jobname, schedule, active from cron.job;
```

| Job | Schedule | What |
|---|---|---|
| `refresh-reliability` | `5 * * * *` (hourly) | Refreshes reliability copies on profiles (BL-052) |
| `geocode-venues` | `* * * * *` (every minute) | Calls the geocoding function if venues are waiting |

Recent runs: `select * from cron.job_run_details order by start_time desc limit 10;`
Replies from the functions: `select * from net._http_response order by id desc limit 10;`

## 9. Frontend hosting

On the hosting platform (e.g. Vercel → Project → Settings → Environment
Variables), never as a committed file:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://qvpccrsawnapjwcqjfop.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API → anon / publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Only when CAPTCHA is turned on |

Then add the production domain (and preview domains) to the auth redirect URLs
from step 5.

## 10. Smoke test

- [ ] Sign up with a real email: the confirmation email arrives; an under-18 date of birth is refused.
- [ ] Sign in with Google: you land on the app (and on the age-gate step, once the frontend has that screen).
- [ ] Post a game at a listed venue; it appears in Find Games for a second account.
- [ ] Request, accept: both accounts get a notification, and an email once Resend is set.
- [ ] Add a venue without coordinates (SQL or admin): within a couple of minutes it has a pin (`coordinates_source = 'openstreetmap'`).
- [ ] Block and report from a profile.

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
| `db push` refuses a migration | It is older than one already pushed: rename it to a fresh timestamp |
| Sign-up "Database error saving new user" | Username taken or under 18; check Dashboard → Logs → Postgres |
