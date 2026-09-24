# Setup

How to run Badminton Social Connect on your machine, against either a local Supabase stack or the hosted project, and how auth (email + Google) is configured.

## Prerequisites

- Node.js 20+
- Docker Desktop, running (the local Supabase stack runs in Docker)
- The Supabase CLI, used here through `npx supabase` (no global install needed)

## Environments at a glance

| Command (in `frontend/`) | Vite mode | Env file it reads | Talks to |
|---|---|---|---|
| `npm run dev` | `development` | `.env.development.local` | Local Supabase in Docker |
| `npm run dev:hosted` | `hosted` | `.env.hosted.local` | Hosted Supabase project |
| `npm run build` (deploy) | `production` | Environment variables set on the hosting platform | Hosted Supabase project |

All `.env*.local` files are gitignored. Only `frontend/.env.example`, which lists variable names without values, is committed.

`VITE_` values are copied into the JavaScript bundle when the app is built, so they are public. Only the Supabase URL and the anon (publishable) key belong in them. **Never** put the `service_role` / secret key or an OAuth client secret in a frontend env file.

## 1. Local development (recommended for day-to-day work)

### Start local Supabase

From the repo root:

```bash
npx supabase start
```

The first run downloads the Docker images and takes a few minutes. When it finishes it prints the local URLs and keys. Run `npx supabase status` to see them again.

| Tool | URL | What for |
|---|---|---|
| API | http://127.0.0.1:54321 | What the frontend talks to |
| Studio | http://127.0.0.1:54323 | Browse tables and users (Authentication tab) |
| Mailpit | http://127.0.0.1:54324 | Catches every email auth sends (confirmations, password resets); no real email leaves your machine |

Stop the stack with `npx supabase stop`. Restart it after editing `supabase/config.toml` or `supabase/.env`.

### Configure the frontend

Create `frontend/.env.development.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

The anon key is the standard local demo key. It is the same on every machine and only works against your local Docker stack. If `npx supabase status` shows a different `ANON_KEY` or `PUBLISHABLE_KEY`, use that value instead.

CAPTCHA is currently off (see [Security settings](#security-settings)), so no CAPTCHA key is needed.

### Run the app

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Use `localhost` rather than `127.0.0.1`: the browser treats them as different sites, and switching between them mid-sign-in breaks the login.

### Local Google sign-in (optional)

If you want to try using Google sign-in on your local, create `supabase/.env`, which is gitignored, containing SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID and 
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET.

Ask the team for the shared credentials, or create your own as in section 3. Then restart Supabase: `npx supabase stop && npx supabase start`.

### Email verification

Email sign-ups must verify their email before they can log in (`enable_confirmations = true` in `supabase/config.toml`). The flow:

1. Sign up in the app. It shows "Check your email and click the verification link".
2. Open Mailpit (http://127.0.0.1:54324) and click **Verify my email** in the "Verify your email to get on court 🏸" email.
3. You land on `/auth/confirmed`, which signs you out and sends you to `/login` with "Your email is verified".
4. Log in again to reach `/dashboard`.

Logging in before verifying shows "Please verify your email" with a **Resend verification email** button.

The email's design and wording live in `supabase/templates/confirmation.html`. After editing it, restart Supabase and sign up again to see the change in Mailpit.

Google sign-ins skip this: Google has already verified the address, so Supabase marks it verified automatically.

### Password reset

1. On `/login`, click **Forgot password?**, enter your email and click **Send Reset Link**.
2. Open Mailpit and click **Reset my password** in the "Reset your Badminton Social Connect password" email.
3. On `/reset-password`, choose a new password. You're signed out and sent to `/login` with "Your password has been updated".
4. Log in with the new password.

The link works once, expires after 1 hour, and works in any browser (not only the one that requested it). The email's design lives in `supabase/templates/recovery.html`.

### Security settings

All set in `supabase/config.toml` for local; section 3 covers the hosted project.

| Setting | Value | Where in `config.toml` |
|---|---|---|
| Password policy | At least 8 characters, with a lowercase letter, an uppercase letter and a number. The signup and reset forms check this too. | `minimum_password_length`, `password_requirements` |
| CAPTCHA | **Off for now.** When on: Cloudflare Turnstile on email sign-up, log-in, resend verification and password reset (not Google sign-in). See [Turning CAPTCHA on](#turning-captcha-on). | `[auth.captcha]` |
| Email frequency | At most one verification or reset email per address every 60 seconds | `[auth.email] max_frequency` |
| Rate limits (per IP) | 30 sign-ins/sign-ups and 30 link verifications per 5 minutes, 150 session refreshes per 5 minutes | `[auth.rate_limit]` |
| Session expiry | Access tokens last 1 hour and refresh automatically. Users are logged out after 7 days of inactivity, and after 30 days regardless. | `jwt_expiry`, `[auth.sessions]` |

When a session ends, the app notices and sends the user to `/login` the next time they open a protected page.

### Turning CAPTCHA on

CAPTCHA stops bots from mass-creating accounts, guessing passwords and triggering floods of emails. It's off during development and should be on before the app is public. The code already supports it; turning it on locally takes two settings:

1. In `supabase/config.toml`, set `[auth.captcha] enabled = true`, then restart Supabase.
2. In `frontend/.env.development.local`, add `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, then restart `npm run dev`.

That key and the secret already in `config.toml` are Cloudflare's public test keys: they always pass, so no Cloudflare account is needed locally. The widget shows "For testing only", which is expected. For the hosted project, see section 3.

## 2. Running against the hosted project

Create `frontend/.env.hosted.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

Where to find the values in the Supabase dashboard:

- **URL:** Project Settings → Data API → Project URL.
- **Key:** Project Settings → API Keys. Use the **publishable** key (`sb_publishable_...`) or, under Legacy API keys, the **`anon` `public`** key (`eyJ...`). Never use `service_role` / `secret`.
- **Turnstile site key** (only once CAPTCHA is on): add `VITE_TURNSTILE_SITE_KEY=<site key>` from Cloudflare dashboard → Turnstile → your widget.

Then run `npm run dev:hosted`. Emails go to real inboxes, not Mailpit.

## 3. One-time configuration (only 1 team member needs to do this)

One team member sets this up for everyone. The rest of the team only needs to:

- Create `supabase/.env` with the team's shared Google OAuth client ID and secret (see [Local Google sign-in](#local-google-sign-in-optional)). Get these privately from whoever did this setup, never through the repo or a group chat.
- Ask that person to add their Google account as a test user (see step 1 below), or Google will block their sign-in.

### Google Cloud Console

1. Create or select a project and configure the **OAuth consent screen**:
   - User type: External. Add an app name and a support email.
   - Scopes: `email`, `profile`, `openid`.
   - While the app is in Testing mode, add each teammate as a test user.
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins:** `http://localhost:5173` and the production URL.
   - **Authorized redirect URIs:**
     - `http://127.0.0.1:54321/auth/v1/callback` (local Supabase)
     - `https://<project-ref>.supabase.co/auth/v1/callback` (hosted Supabase)

The redirect URI points at **Supabase**, not the app. Supabase then forwards the user to the app's `/auth/callback`.

### Cloudflare Turnstile (CAPTCHA, later)

Skip this while CAPTCHA is off. When turning it on, do these steps and add the site key to the frontend env **before** enabling CAPTCHA in Supabase (step 5 below), or logins will fail.

1. Create a free Cloudflare account and open **Turnstile → Add widget**.
2. Add the hostnames the app runs on: `localhost` and the production domain.
3. Choose the **Managed** widget mode.
4. Copy the **site key** (public, goes in `VITE_TURNSTILE_SITE_KEY`) and the **secret key** (goes only in the Supabase dashboard, step 5 below).

### Supabase dashboard

1. **Authentication → URL Configuration**
   - **Site URL:** the production URL (`http://localhost:5173` until the app is deployed).
   - **Redirect URLs:** for each of `http://localhost:5173` and `https://<production-domain>`, add `/auth/callback` (Google), `/auth/confirmed` (email verification links) and `/reset-password` (password reset links). Preview deploys can use a wildcard, for example `https://*.vercel.app/**`.
2. **Authentication → Sign In / Providers → Email:**
   - Make sure **Confirm email** is on (it is by default on hosted projects).
   - Set the minimum password length to **8** and the password requirements to **lowercase, uppercase letters and digits**.
3. **Authentication → Sign In / Providers → Google:** enable it and paste the client ID and secret.
4. **Authentication → Emails → Templates:** for each template below, set the subject and paste the file's contents into the message body. Locally the templates are applied automatically from `config.toml`; the hosted project needs them pasted in, and again whenever the files change.
   - **Confirm signup:** subject `Verify your email to get on court 🏸`, body `supabase/templates/confirmation.html`.
   - **Reset password:** subject `Reset your Badminton Social Connect password`, body `supabase/templates/recovery.html`.
5. **Authentication → Attack Protection** (later, when turning CAPTCHA on): enable CAPTCHA protection, choose **Cloudflare Turnstile**, and paste the Turnstile **secret key**.
6. **Authentication → Rate Limits:** the defaults are sensible. Review them once custom SMTP is set up, since the email limit is fixed at a few per hour until then.
7. **Authentication → Sessions:** set the time-box to **720 hours** (30 days) and the inactivity timeout to **168 hours** (7 days). These two settings need a paid Supabase plan. On the free plan, sessions last until the user logs out.
8. **Authentication → Emails → SMTP Settings:** add a real SMTP provider (for example Resend or Brevo) before real users sign up. The built-in sender only allows a few emails per hour and only delivers to members of your Supabase organization, so verification and reset emails to anyone else won't arrive.

## 4. Deployment

Don't deploy an env file. In the hosting platform's settings (for example Vercel → Project → Settings → Environment Variables), set:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

Add `VITE_TURNSTILE_SITE_KEY=<Turnstile site key>` too once CAPTCHA is on.

The platform runs `npm run build`, which bakes these values into the bundle. Local values can't leak into a deploy: they only exist in the gitignored `.env.development.local`, which production builds never read.

After the first deploy, add the production URL to the Supabase redirect URLs, the Google JavaScript origins and the Turnstile widget's hostnames (section 3).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Blank page, console says `Missing VITE_SUPABASE_URL...` | The env file for that mode is missing or empty. Check the file name matches the table at the top. |
| Changed an env file but nothing happened | Vite reads env files only at startup. Restart `npm run dev`. |
| Google: `redirect_uri_mismatch` | The Supabase callback URL (not the app URL) is missing from the Google OAuth client's redirect URIs. |
| After Google, redirected to the Site URL instead of `/auth/callback` | `/auth/callback` is not in Supabase's allowed redirect URLs (`config.toml` locally, dashboard for hosted). |
| Verification link lands on the Site URL instead of `/auth/confirmed` | `/auth/confirmed` is not in Supabase's allowed redirect URLs. |
| Verification email never arrives (hosted) | The built-in sender only delivers to your Supabase organization's members and is rate-limited. Set up custom SMTP. |
| "The security check failed" on log-in or sign-up | `VITE_TURNSTILE_SITE_KEY` is missing, or doesn't match the CAPTCHA secret in Supabase (the test site key only works with the test secret). Restart `npm run dev` after fixing the env file. |
| CAPTCHA widget shows an error on the deployed site | The site's domain isn't in the Turnstile widget's hostnames in Cloudflare. |
| "We've just sent you an email. Please wait a minute..." | Only one verification or reset email per address every 60 seconds. Wait and try again. |
| Reset link lands on the Site URL instead of `/reset-password` | `/reset-password` is not in Supabase's allowed redirect URLs. |
| `supabase start` fails on an unhealthy analytics/vector container | `[analytics] enabled = false` in `supabase/config.toml`. Auth doesn't need it. |
