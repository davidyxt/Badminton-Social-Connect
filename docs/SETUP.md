# Setup

How to get Badminton Social Connect running on your machine.

For how registration and sign-in work (flows, security settings, email templates, hosted dashboard configuration), see [M4: Registration and sign-in](features/M4-registration-and-sign-in.md).

To deploy to the hosted Supabase project, see [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Install

- **Node.js 20+**
- **Docker Desktop**, running. The local Supabase stack runs in Docker.
- **Supabase CLI:** nothing to install. It runs through `npx supabase`.

## 2. Environments

| Environment | Command (in `frontend/`) | App URL | Supabase | Frontend env file |
|---|---|---|---|---|
| **Local** (day-to-day work) | `npm run dev` | http://localhost:5173 | Local Docker stack, http://127.0.0.1:54321 | `.env.development.local` |
| **Hosted** (test against the cloud project) | `npm run dev:hosted` | http://localhost:5173 | https://qvpccrsawnapjwcqjfop.supabase.co | `.env.hosted.local` |
| **Production** (deployed) | `npm run build`, run by the hosting platform | Production URL | https://qvpccrsawnapjwcqjfop.supabase.co | Environment variables on the hosting platform |

Always open the app at `localhost`, not `127.0.0.1`. The browser treats them as different sites, and switching between them mid-sign-in breaks the login.

### Local tools

Available while local Supabase is running:

| Tool | URL | What for |
|---|---|---|
| App | http://localhost:5173 | The frontend |
| Supabase API | http://127.0.0.1:54321 | What the frontend talks to |
| Supabase Studio | http://127.0.0.1:54323 | Browse tables and users (Authentication → Users) |
| Mailpit | http://127.0.0.1:54324 | Catches every email the app sends (verification, password reset). Nothing reaches real inboxes. |

Hosted equivalents: the [Supabase dashboard](https://supabase.com/dashboard/project/qvpccrsawnapjwcqjfop) for tables and users. Hosted emails go to real inboxes.

## 3. Quick start

```bash
# 1. Start local Supabase (from the repo root). The first run takes a few minutes.
npx supabase start

# 2. Create the frontend env file (section 5), then:
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Email sign-up works straight away. Google sign-in needs section 4.

Useful commands (from the repo root):

| Command | What it does |
|---|---|
| `npx supabase status` | Show local URLs and keys |
| `npx supabase stop` | Stop the local stack (your data is kept) |
| `npx supabase stop && npx supabase start` | Restart. Needed after editing `supabase/config.toml`, `supabase/.env` or an email template. |
| `npx supabase db reset` | Wipe the local database, re-run every migration and load both seed folders (below) |

### Seed data

`db reset` loads two folders, in this order:

| Folder | What | Reaches the hosted project? |
|---|---|---|
| `supabase/seeds/production/` | Real reference data: states, all Australian suburbs and postcodes, 142 badminton venues with coordinates | Yes, through the CI deploy job. Files must be safe to run again (upserts) |
| `supabase/seeds/dev/` | Dummy data in every table: accounts, groups, upcoming and past games, results, blocks, reports, notifications | **Never** |

Dev accounts, all with the password `Passw0rd!`:

| Email | Notes |
|---|---|
| `admin@example.com` | Platform admin |
| `alice@example.com` | Organiser, Smash Group admin, runs the Spring Singles Ladder, blocked Frank |
| `bob@example.com` | Pending request to join Smash Group, one late cancellation |
| `carol@example.com` | Northside Shuttlers admin, a disputed result |
| `dan@example.com` | Profile hidden from other players, one no-show |
| `erin@example.com` | Smash Group member, one late withdrawal |
| `frank@example.com` | Blocked by Alice, reported by Carol |
| `grace@example.com` | Google-style sign-up, no username, not past the age gate |
| `ivy@example.com` | New player, no games |

`henry@example.com` is deleted by the seed, so he appears as "Deleted User".
The full story is at the top of `supabase/seeds/dev/01_accounts.sql`.

### Tests

```bash
npx supabase db reset
./supabase/tests/rls_test.sh > /tmp/rls.log       # 340 access-control checks
python3 supabase/tests/api_test.py --rls-log /tmp/rls.log   # 218 API cases, writes docs/api-test-report.md
python3 supabase/scripts/build_openapi.py         # rebuilds the API spec from the running stack
```

Suburbs come from [GeoNames](https://www.geonames.org) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which requires
crediting GeoNames wherever the data is shown (for example an About or credits
page). To refresh them, run `python3 supabase/seeds/scripts/generate_suburbs.py`
and commit the regenerated `02_suburbs.sql`.

Venues come from [BadmintonHub](https://www.badmintonhub.com.au)'s published
venue pages (name, address and coordinates), collected respecting its
`robots.txt`. **Use in production needs BadmintonHub's permission** (team item
8). Pins that are missing or wrong there are looked up with OpenStreetMap's free
Nominatim geocoder (one request per second, kept only if within 10 km of the
venue's suburb); those need the credit "© OpenStreetMap contributors"
(`venue.coordinates_source = 'openstreetmap'`). To refresh them, run `python3 supabase/seeds/scripts/generate_venues.py`
(about 3 minutes, one page per second) and commit the regenerated
`03_venues.sql`. Then check every venue's Google Maps link and pin:

```bash
npx supabase db reset
python3 supabase/tests/venue_maps_check.py   # about 2.5 minutes; --offline skips Google
```

### New venues get their pin automatically

A venue saved without coordinates is queued (`venue_geocode_queue`). Every
minute, `pg_cron` calls the `geocode-venues` Edge Function, which looks pins up
with Nominatim at one request per second, writes them back
(`coordinates_source = 'openstreetmap'`) and releases its lease. A venue it
can't place after 3 tries is marked `failed` for an admin. Only one worker ever
runs at a time.

Off until configured, like email. To turn it on locally:

```bash
# supabase/functions/.env needs GEOCODE_WEBHOOK_SECRET (see .env.example)
npx supabase functions serve --env-file supabase/functions/.env
```

and in Studio's SQL editor, with the same secret:

```sql
select vault.create_secret('http://host.docker.internal:54321/functions/v1/geocode-venues', 'geocode_function_url');
select vault.create_secret('<GEOCODE_WEBHOOK_SECRET>', 'geocode_function_secret');
```

Hosted: set the secret with `npx supabase secrets set`, deploy with
`npx supabase functions deploy geocode-venues`, and create the two vault
secrets with the hosted URL
(`https://<project-ref>.supabase.co/functions/v1/geocode-venues`). Tests:

```bash
npx deno test --no-check supabase/functions/geocode-venues/nominatim_test.ts
```

The generator's Nominatim look-ups have offline tests (no requests are sent;
they use fake replies and a fake clock, including a burst of 20 requests that
must go out one second apart):

```bash
python3 -m unittest supabase/seeds/scripts/test_generate_venues.py -v
```

## 4. Supabase env (`supabase/.env`)

Only needed for Google sign-in locally. The file is gitignored and holds the team's shared Google OAuth credentials:

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<client secret>
```

Get the values privately from the teammate who set up Google OAuth (section 6), never through the repo or a group chat. Restart Supabase after creating the file.

## 5. Frontend env

All `.env*.local` files are gitignored. `frontend/.env.example` lists the variable names.

`VITE_` values are bundled into the JavaScript the browser downloads, so they are public. Only the Supabase URL and the anon (publishable) key belong in them. **Never** put the `service_role` / secret key or the Google client secret in a frontend env file.

### Local: `frontend/.env.development.local`

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

This is Supabase's standard local demo key: the same on every machine, and it only works against your local Docker stack. If `npx supabase status` shows a different `ANON_KEY`, use that instead.

### Hosted: `frontend/.env.hosted.local`

```env
VITE_SUPABASE_URL=https://qvpccrsawnapjwcqjfop.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

Get the key from the Supabase dashboard → **Project Settings → API Keys**: the **publishable** key (`sb_publishable_...`) or, under Legacy API keys, the **`anon` `public`** key. Never the `service_role` / `secret` key.

### Production (hosting platform)

Don't deploy an env file. Set the same two variables as the hosted file in the hosting platform's settings (for example Vercel → Project → Settings → Environment Variables).

Vite reads env files only at startup, so restart `npm run dev` after changing one.

## 6. Google OAuth

### Every teammate

1. Get the shared client ID and secret, and put them in `supabase/.env` (section 4).
2. Ask whoever manages the Google project to add your Google account as a **test user**. While the app is in Testing mode, Google blocks everyone else.
3. Restart Supabase.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page, console says `Missing VITE_SUPABASE_URL...` | The env file for that mode is missing or empty. Check its name matches the table in section 2. |
| Changed an env file but nothing happened | Restart `npm run dev`. |
| Changed `config.toml`, `supabase/.env` or a template but nothing happened | Restart Supabase. |
| `supabase start` fails on an unhealthy analytics/vector container | Check `[analytics] enabled = false` in `supabase/config.toml`. |
| App starts on port 5174 instead of 5173 | Something else is using 5173. Stop it and restart `npm run dev`. Sign-in redirects only allow 5173. |
| Google: "The OAuth client was not found" | `supabase/.env` is missing or Supabase wasn't restarted after creating it. |
| Google: "Access blocked … has not completed the Google verification process" | Your Google account isn't a test user (section 6). |
| Google: `redirect_uri_mismatch` | The Supabase callback URL is missing from the Google OAuth client's redirect URIs. |

Sign-in and email issues: see the [M4 feature doc's troubleshooting](features/M4-registration-and-sign-in.md#troubleshooting).
