# M4: Registration and sign-in

Players can create an account with email and password or with Google, verify their email, log in and out, and reset a forgotten password. Authentication is handled by Supabase Auth; the app has no auth server of its own.

To run it locally, see [SETUP.md](../SETUP.md).

## Contents

- [User flows](#user-flows)
- [Pages and routes](#pages-and-routes)
- [Code map](#code-map)
- [Where user data lives](#where-user-data-lives)
- [Security settings](#security-settings)
  - [Idle sign-out](#idle-sign-out)
- [Email templates](#email-templates)
- [Hosted project configuration](#hosted-project-configuration)
- [Troubleshooting](#troubleshooting)
- [Not done yet](#not-done-yet)

## User flows

### Sign up with email

1. On `/signup`, the player enters first name, last name, username, email, date of birth, state, password, and ticks "I am 18 or over" and the terms and privacy box. The password must meet the [password policy](#security-settings). The form checks the age and that the username is free before sending; the database checks both again, so an under-18 sign-up fails outright.
2. The page shows "Check your email and click the verification link, then log in to continue." The player is **not** logged in yet.
3. The player clicks **Verify my email** in the email. Locally, the email is in [Mailpit](http://127.0.0.1:54324).
4. They land on `/auth/confirmed`, which signs them out and sends them to `/login` with "Your email is verified."
5. They log in and reach `/dashboard`.

Logging in before verifying shows "Please verify your email before logging in." with a **Resend verification email** button.

### Sign in with Google

Click **Continue with Google** on `/login` or `/signup`. The first sign-in creates the account; after that the same button logs in. Google has already verified the email, so there is no verification email. The flow goes Google → Supabase → `/auth/callback` → `/dashboard`. Google can't send a date of birth, so a new Google player is sent to `/complete-registration` first (see [Complete registration](#complete-registration-18-age-gate)).

### Complete registration (18+ age gate)

Any signed-in player whose account hasn't passed the age gate is sent to `/complete-registration`, whichever page they try to open. In practice that's every new Google player. The page asks for username (empty for Google players, who have none yet), date of birth, state, the 18+ box and the terms box, then calls `register_player`, which saves the username in the same step. Once that succeeds they continue to the page they were going to, or `/dashboard`. Until then the database hides every other player and game from them (BL-007).

If a player signs up with email and later uses Google with the same address (or the other way round), Supabase links both to one account.

### Log in and out

- **Log in:** `/login` with email and password, then `/dashboard`.
- **Log out:** visit `/signout`. It ends the session and returns to the home page (`/`). There's no sign-out button in the UI yet.
- **Protected pages:** `/dashboard` sends logged-out users to `/login`.
- **Idle sign-out:** after 7 days with no activity in the app, the player is signed out and sent to `/login?expired=1`. See [Idle sign-out](#idle-sign-out).

### Reset a forgotten password

1. On `/login`, click **Forgot password?**. The email field carries over if already typed.
2. On `/forgot-password`, enter the email and click **Send Reset Link**. The page always says "If an account exists for …, we've sent a link", so it can't be used to find out who has an account.
3. Click **Reset my password** in the email.
4. On `/reset-password`, choose a new password. The player is signed out and sent to `/login` with "Your password has been updated."
5. Log in with the new password.

The link works once, expires after 1 hour, and works in any browser, not only the one that requested it.

## Pages and routes

| Route | Page | Access | Purpose |
|---|---|---|---|
| `/login` | `LoginPage` | Public | Email login, Google button, resend verification, link to forgot password |
| `/signup` | `SignupPage` | Public | Email sign-up, Google button |
| `/auth/callback` | `AuthCallbackPage` | Public | Where Google sign-in returns; goes to `/dashboard` or shows the error |
| `/auth/confirmed` | `EmailConfirmedPage` | Public | Where the verification link lands; signs out, then `/login?verified=1` |
| `/forgot-password` | `ForgotPasswordPage` | Public | Request a reset email |
| `/reset-password` | `ResetPasswordPage` | Public | Verify the reset link and set a new password |
| `/signout` | `SignOutPage` | Public | Sign out, then `/` |
| `/complete-registration` | `CompleteRegistrationPage` | **Logged in** | 18+ age gate for accounts that haven't passed it (Google sign-ups) |
| `/dashboard` and all other app pages | | **Logged in and registered** | Behind `ProtectedRoute`, which sends unregistered players to `/complete-registration` |

`/auth/callback`, `/auth/confirmed` and `/reset-password` must be in Supabase's allowed redirect URLs (see [Hosted project configuration](#hosted-project-configuration); local ones are already in `supabase/config.toml`).

## Code map

All paths are under `frontend/src/` unless noted.

| File | What it does |
|---|---|
| `services/supabase.js` | Creates the Supabase client from the `VITE_SUPABASE_*` env vars (PKCE flow) |
| `services/authService.js` | All auth calls: sign up, sign in, Google, resend verification, request/verify password reset, update password, sign out |
| `context/AuthContext.jsx` | Tracks the current session for the whole app. Use `useAuth()` to get `{ session, user, player, loading, refreshPlayer }`. `player.registered` says whether the age gate is done. Also runs the idle sign-out. |
| `config/session.js` | Idle sign-out timings: the 7-day timeout and how often activity is saved and checked |
| `utils/idleTimeout.js` | Idle sign-out rules, kept free of React. Tested by `frontend/tests/idleTimeout.test.mjs`. |
| `components/auth/ProtectedRoute.jsx` | Redirects to `/login` when there's no session, and to `/complete-registration` when the player hasn't passed the age gate (`requireRegistration={false}` turns that off) |
| `services/playerService.js` | The player's own status (`getMyPlayer`), username check, `register_player`, and the list of states |
| `services/api.js` | `rpc()` and `unwrap()`: database calls that throw an `ApiError` with a message safe to show |
| `config/legal.js` | Terms and privacy version labels, and the 18+ check the forms run before submitting |
| `components/auth/Captcha.jsx` | Cloudflare Turnstile widget and `useCaptcha()` hook. Renders nothing while CAPTCHA is off. |
| `utils/passwordPolicy.js` | Password rules and hint text shown on the forms. Keep in sync with `config.toml`. |
| `utils/authErrors.js` | Turns Supabase error codes into friendly messages |
| `supabase/config.toml` (repo root) | Local auth settings: redirect URLs, Google provider, password policy, rate limits, sessions, CAPTCHA, email templates |
| `supabase/templates/*.html` (repo root) | Verification and password reset emails |

## Where user data lives

Supabase stores accounts in its built-in `auth` schema (`auth.users`, `auth.identities`, `auth.sessions`), which exists in every project without any migrations. Sign-up stores first and last name in `auth.users.raw_user_meta_data` (`first_name`, `last_name`).

To view users: Studio (http://127.0.0.1:54323) → **Authentication → Users**, or **Table Editor** with the schema set to `auth`. The browser can only read the logged-in user (`useAuth().user`), not the full list.

When an account is created, a database trigger also creates the player's rows in the app's own tables:

| Table | What | Who can see it |
|---|---|---|
| `player` | `username` (the public name), rating band | Every signed-in player |
| `player_private` | `first_name`, `last_name` | The player and admins only |
| `player_profile` | Suburb, state, bio, reliability | Other players, unless the profile is hidden |

The username is chosen by the player and unique (ignoring case). The sign-up form asks for one, checks it with `supabase.rpc('is_username_available', { p_username })`, and sends it as `username` in `options.data`. No username is ever made up: an email sign-up without one fails, and Google sign-ups start without one and choose it on `/complete-registration`. See [database-schema.md](../database-schema.md#notes-on-the-tables) for every metadata key the trigger reads.

`player_private` also holds the date of birth and the terms and privacy acceptances from the 18+ age gate (BL-007). An account cannot see or do anything involving other players until it has passed the gate; see [Complete registration](#complete-registration-18-age-gate).

## The signed-in player's own data (Home and Profile)

| Screen | Call | Returns |
|---|---|---|
| Home page, top-bar avatar and bell | `supabase.rpc('get_my_home')` | `firstName`, `lastName`, `greetingName` ("John Doe"), `initials` ("JD"), `level`, `ratingCard`, `nextGames` (the next 3 confirmed games, from `get_my_games`; `[]` = "No game planned"), `unreadNotifications` |
| Profile page | `supabase.rpc('get_my_profile')` | `name`, `username`, `initials`, `level`, `reliability`, `location` ("Albert Park area · VIC"), `ratingCard`, plus every editable field |
| Your Profile / Privacy Settings | `supabase.rpc('update_my_profile', { p_username, p_first_name, p_last_name, p_self_rating_band, p_bio, p_suburb, p_state, p_is_discoverable, p_preferred_format, p_email_notifications })` | The updated profile. Send only what changed |

`ratingCard` has `rating`, `band`, `grade`, `ratingChangeThisMonth`, `matches`,
`wins`, `winRate`, `rankState` and `stateRank` (the "#184 VIC Rank"), and
`status` (Provisional or Established). Rating, grade, monthly change and rank
come from the shared singles engine in this 0.4 baseline; grade/rank remain null during placement. See [M2](M2-results-and-rankings.md).

These return the player's **own** real name. Other players only ever see the
username. Full request and response shapes are in the API spec
(`docs/badminton-social-connect-api_v1.2.yaml`, tag **Profile**).

This integrated baseline includes preferred format (M1), blocking (M3), live reliability and email opt-out (M5). This feature document describes the player app. The separate Admin console uses the role checks in [admin-api.md](../admin-api.md); this frontend baseline has no additional 30-minute browser idle enforcement.

## Security settings

Set in `supabase/config.toml` for local; see [Hosted project configuration](#hosted-project-configuration) for the dashboard.

| Setting | Value | `config.toml` |
|---|---|---|
| Email verification | Required for email sign-ups before they can log in | `[auth.email] enable_confirmations` |
| Password policy | At least 8 characters, with a lowercase letter, an uppercase letter and a number. The signup and reset forms check this too. | `minimum_password_length`, `password_requirements` |
| Email frequency | At most one verification or reset email per address every 60 seconds | `[auth.email] max_frequency` |
| Rate limits (per IP) | 30 sign-ins/sign-ups and 30 link verifications per 5 minutes; 150 session refreshes per 5 minutes | `[auth.rate_limit]` |
| Session expiry | Access tokens last 1 hour and refresh automatically. Logged out after 7 days of inactivity, and after 30 days regardless (server-side, paid plan only). On the free plan the app does the 7-day idle sign-out itself; the 30-day limit is not enforced. | `jwt_expiry`, `[auth.sessions]`, `frontend/src/config/session.js` |
| CAPTCHA | **Off for now.** When on: Cloudflare Turnstile on email sign-up, log-in, resend verification and password reset (not Google). | `[auth.captcha]` |

When a session ends, the app notices and sends the user to `/login` from any protected page.

### Idle sign-out

The free Supabase plan ignores the `[auth.sessions]` inactivity timeout, so the app signs idle players out itself.

- **What counts as activity:** tapping, clicking, typing or scrolling anywhere in the app, and coming back to the tab. Activity is saved at most once a minute.
- **Where it's stored:** `localStorage` key `bsc:lastActivity`, so all open tabs share it and it survives closing the browser.
- **When it's checked:** on opening the app, on coming back to the tab, and once a minute while the app is open.
- **What happens:** the session is ended and the player lands on `/login?expired=1`, which says "You were signed out after 7 days of inactivity."
- **Fresh sign-ins restart the clock:** logging in with a password, and landing on `/auth/callback` (Google), `/auth/confirmed` or `/reset-password`. Signing out clears the record.
- **Limits:** this runs in the browser, so it only protects a device left signed in. A stolen refresh token keeps working until the 30-day server limit, which needs the paid plan. If `localStorage` is blocked (some private windows), idle sign-out is skipped.
- **Change the timeout:** edit `IDLE_TIMEOUT_MS` in `frontend/src/config/session.js`, and the message in `pages/LoginPage.jsx`.
- **Test it:** `node --test frontend/tests/idleTimeout.test.mjs`. To try it by hand, sign in, then in the browser console run `localStorage.setItem("bsc:lastActivity", Date.now() - 8 * 864e5)` and switch tabs away and back.

### Turning CAPTCHA on

CAPTCHA stops bots from mass-creating accounts, guessing passwords and triggering floods of emails. It's off during development and should be on before the app is public. The code already supports it.

**Locally:**

1. In `supabase/config.toml`, set `[auth.captcha] enabled = true`, then restart Supabase.
2. In `frontend/.env.development.local`, add `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, then restart `npm run dev`.

That key and the secret already in `config.toml` are Cloudflare's public test keys. They always pass, so no Cloudflare account is needed. The widget shows "For testing only", which is expected.

**Hosted:** see [Cloudflare Turnstile](#cloudflare-turnstile-when-turning-captcha-on). Add the site key to the frontend env **before** enabling CAPTCHA in Supabase, or logins will fail.

## Email templates

| Email | Subject | File |
|---|---|---|
| Sign-up verification | Verify your email to get on court 🏸 | `supabase/templates/confirmation.html` |
| Password reset | Reset your Badminton Social Connect password | `supabase/templates/recovery.html` |

Both use the brand colours (blue `#2e4d84` header, orange `#f27a0b` stripe and button) and greet the player by first name ("Hi there" if none). They use inline styles and tables only, because email apps like Gmail and Outlook strip most CSS.

- **Local:** applied automatically from `config.toml`. After editing a template, restart Supabase and trigger the email again to see it in Mailpit.
- **Hosted:** must be pasted into the dashboard (see below), and again whenever the file changes.

## Hosted project configuration

One team member does this in the [Supabase dashboard](https://supabase.com/dashboard/project/qvpccrsawnapjwcqjfop). Google OAuth setup is in [SETUP.md](../SETUP.md#6-google-oauth).

1. **Authentication → URL Configuration**
   - **Site URL:** the production URL (`http://localhost:5173` until the app is deployed).
   - **Redirect URLs:** for each of `http://localhost:5173` and `https://<production-domain>`, add `/auth/callback`, `/auth/confirmed` and `/reset-password`. Preview deploys can use a wildcard, for example `https://*.vercel.app/**`.
2. **Authentication → Sign In / Providers → Email:**
   - **Confirm email:** on (the default).
   - **Minimum password length:** 8. **Password requirements:** lowercase, uppercase letters and digits.
3. **Authentication → Emails → Templates:** paste in both [email templates](#email-templates), with their subjects:
   - **Confirm signup:** `confirmation.html`
   - **Reset password:** `recovery.html`
4. **Authentication → Emails → SMTP Settings:** add a real SMTP provider (for example Resend, or Brevo if you don't own a domain) before real users sign up. The built-in sender only allows a few emails per hour and only delivers to members of your Supabase organization.
5. **Authentication → Rate Limits:** the defaults are sensible. Review them once custom SMTP is set up.
6. **Authentication → Sessions:** time-box **720 hours** (30 days), inactivity timeout **168 hours** (7 days). These need a paid Supabase plan. On the free plan the app's own [idle sign-out](#idle-sign-out) covers the 7 days of inactivity; the 30-day limit is not enforced.

### Cloudflare Turnstile (when turning CAPTCHA on)

1. Create a free Cloudflare account and open **Turnstile → Add widget**.
2. Add the hostnames the app runs on: `localhost` and the production domain. Choose **Managed** or **Invisible** mode.
3. Add the **site key** as `VITE_TURNSTILE_SITE_KEY` in `frontend/.env.hosted.local` and the hosting platform's env vars.
4. Then, in Supabase: **Authentication → Attack Protection** → enable CAPTCHA, choose **Cloudflare Turnstile**, and paste the **secret key**.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Please verify your email before logging in." | The email isn't verified yet. Click the link in the email (Mailpit locally), or use **Resend verification email**. |
| "We've just sent you an email. Please wait a minute..." | Only one verification or reset email per address every 60 seconds. |
| Verification email never arrives (hosted) | The built-in sender only delivers to your Supabase organization's members and is rate-limited. Set up custom SMTP. |
| After Google, redirected to the Site URL instead of `/auth/callback` | `/auth/callback` is not in the allowed redirect URLs (`config.toml` locally, dashboard for hosted). |
| Verification link lands on the Site URL instead of `/auth/confirmed` | `/auth/confirmed` is not in the allowed redirect URLs. |
| Reset link lands on the Site URL instead of `/reset-password` | `/reset-password` is not in the allowed redirect URLs. |
| "This link is invalid or has expired" on `/reset-password` | The link was already used or is over an hour old. Request a new one. |
| "The security check failed" | CAPTCHA is on but `VITE_TURNSTILE_SITE_KEY` is missing or doesn't match the secret. Restart `npm run dev` after fixing. |
| CAPTCHA widget shows an error on the deployed site | The domain isn't in the Turnstile widget's hostnames. |

## Not done yet

- **Sign-out button:** `/signout` works but nothing links to it. Planned: a menu on the profile avatar in the top bar.
- **Redirect logged-in users** away from `/login` and `/signup` to `/dashboard`.
- **Terms and privacy pages:** the age-gate forms link to `/terms` and `/privacy`, which don't exist yet. The version labels in `config/legal.js` (`2026-10`) are placeholders until the team chooses them.
- **State list:** `listStates()` still returns a fixed list in the player frontend; the shared `state` table already exists, so switching the helper to a database read is frontend work.
- **CAPTCHA:** off until the app is public (see [Turning CAPTCHA on](#turning-captcha-on)).
- **Hosted configuration:** the dashboard steps above, custom SMTP, and production URLs once deployed.

## Team decisions applied (2026-10-08)

- **Usernames are never generated** (item 9). `register_player` takes `p_username`, required when the account has none.
- **Deleting an account** (item 5): `supabase.rpc('delete_my_account')`, then sign out.
  - The player stays as "Deleted User", so other players' results and rankings are kept.
  - Their names, date of birth, consent records, bio, suburb, blocks, group memberships and notifications are removed.
  - Their upcoming games are cancelled, and the players in them are told.
  - The same happens when an admin deletes the user in the Supabase dashboard.
- **Profile settings** also set preferred format and the email opt-out.
- **`get_my_profile`** returns reliability (%) and every count behind it.
- Screen-by-screen wiring: [frontend-wiring-guide.md](../frontend-wiring-guide.md).

## My games, availability and profile pictures (2026-10-08)

- **My games:** `supabase.rpc('get_my_games', { p_filter: 'all' | 'organised', p_when: 'upcoming' | 'past', p_include_pending, p_limit, p_offset })`. It lists every game the player hosts (also as a group admin) or plays in, with `myRole`. Home's `nextGames` is its first 3 upcoming confirmed games.
- **Availability:** `update_my_profile({ p_availability: ['mon_evening', 'sat_morning'], p_availability_note })`. The slots are a day (`mon`–`sun`) and `morning`, `afternoon` or `evening`. It's shown as `availability` and `availabilityNote` on `get_my_profile` and `get_player_profile`.
- **Profile picture:** upload to the `avatars` Storage bucket, in the player's own folder, then `set_my_profile_picture({ p_url })`; `remove_my_profile_picture()` clears it. Both return `previousPath`, the old file for the app to delete. The picture appears as `profileImageUrl` on every screen. Setup: [DEPLOYMENT.md](../DEPLOYMENT.md#9-storage-for-profile-pictures).

Built in `20261008101500_my_games_availability_profile_pictures.sql`.

