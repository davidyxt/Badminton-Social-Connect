# Email setup on the hosted Supabase project

How to make the hosted project (`qvpccrsawnapjwcqjfop`) send real email.

The app sends two kinds of email, set up in two different places:

| Kind | Examples | Sent by | Set up in |
|---|---|---|---|
| **Account emails** | Verify your email, reset your password | Supabase Auth | [Part A](#part-a-account-emails-custom-smtp): Dashboard → Authentication → SMTP |
| **Notification emails** | "alice accepted your request", "carol invited you to a game", "A game you joined was cancelled" | The `send-email-notification` Edge Function, through [Resend](https://resend.com) | [Part B](#part-b-notification-emails-edge-function) |

Both can use the same Resend account and the same sending domain. Do [Part 0](#part-0-resend-account-and-sending-domain) first, once.

Locally nothing here is needed:
- account emails go to Mailpit (http://127.0.0.1:54324);
- notification emails are a dry run that only logs the subject.

See [features/M5-trust-and-reliability.md](features/M5-trust-and-reliability.md#email-bl-087) for turning the local dry run on.

## Contents

- [Before you start](#before-you-start)
- [Part 0: Resend account and sending domain](#part-0-resend-account-and-sending-domain)
- [Part A: Account emails (custom SMTP)](#part-a-account-emails-custom-smtp)
- [Part B: Notification emails (Edge Function)](#part-b-notification-emails-edge-function)
- [Check it works](#check-it-works)
- [Turning email off again](#turning-email-off-again)
- [Troubleshooting](#troubleshooting)

## Before you start

- **Decide with the team** (items-to-confirm 15):
  - who owns the Resend account;
  - which domain the email comes from (ideally one Badminton Victoria controls);
  - the from address, e.g. `Badminton Social Connect <noreply@yourdomain.org.au>`.
- **Access you need:**
  - the Supabase dashboard for the project;
  - the CLI linked to it (`npx supabase link --project-ref qvpccrsawnapjwcqjfop`);
  - the DNS settings of the sending domain.
- **Prerequisites:**
  - the project already has every migration (`npx supabase db push`, [DEPLOYMENT.md](DEPLOYMENT.md) step 3);
  - the migrations enable `pg_net` and create the `notification_send_email` trigger.

**Without your own domain**, Resend's test sender `onboarding@resend.dev` only delivers to the email address of the Resend account itself. That's enough to test, not for real players. Supabase's built-in sender is similar: a handful of emails an hour, and only to members of your Supabase organisation.

## Part 0: Resend account and sending domain

1. Sign up at https://resend.com with the team's shared account (not a personal one).
2. **Domains → Add Domain.** Use a subdomain such as `mail.yourdomain.org.au`, so the main domain's email isn't affected.
3. Add the DNS records Resend shows (SPF and DKIM; optionally DMARC) at your DNS provider. Wait until Resend shows the domain as **Verified**. This usually takes minutes, but can take up to a day.
4. **API Keys → Create API Key**, with permission **Sending access**, limited to that domain. Copy it now: it's shown once. Keep it in the team's password manager, never in Git.

Check Resend's pricing page for the current free allowance. The free plan has a daily and a monthly limit, which is plenty for a pilot. Every notification is an email, so watch the dashboard once real players arrive.

## Part A: Account emails (custom SMTP)

Supabase's own sender is for testing only. Point Auth at Resend's SMTP server:

1. **Dashboard → Authentication → Emails → SMTP Settings → Enable custom SMTP.**

   | Field | Value |
   |---|---|
   | Sender email | `noreply@mail.yourdomain.org.au` (on the verified domain) |
   | Sender name | `Badminton Social Connect` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the Resend API key from Part 0 |

2. **Authentication → Emails → Templates.** Paste our templates so the hosted emails match the local ones:

   | Template | File | Subject |
   |---|---|---|
   | Confirm signup | [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html) | "Verify your email to get on court 🏸" |
   | Reset password | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) | as in `supabase/config.toml`, `[auth.email.template.recovery]` |

3. **Authentication → URL Configuration.** The links in these emails must come back to the app:
   - **Site URL:** the production address, e.g. `https://bsc.example.org`.
   - **Redirect URLs:** add `https://<app>/auth/callback`, `https://<app>/auth/confirmed` and `https://<app>/reset-password`.

   The full list is in [M4-registration-and-sign-in.md](features/M4-registration-and-sign-in.md#hosted-project-configuration).
4. **Authentication → Rate Limits.** With custom SMTP the email limit can be raised. Start around 30 an hour and adjust. The per-address limit (one email per address every 60 seconds) stays.

Set these in the dashboard. Don't run `npx supabase config push`: `config.toml` has the local values (localhost URLs, no SMTP) and would overwrite them.

## Part B: Notification emails (Edge Function)

How it works:

- every new row in `notification` fires a database trigger;
- the trigger posts it, with a shared secret, to the `send-email-notification` Edge Function (through `pg_net`);
- the function looks up the player's email and sends it through Resend's API.

It skips players who turned emails off (`player_profile.email_notifications = false`), and never logs email addresses.

### 1. Make a shared secret

```bash
openssl rand -hex 32
```

This is `EMAIL_WEBHOOK_SECRET`. The database and the function must both have the same value.

### 2. Set the function's secrets

In `supabase/functions/.env`, which is gitignored (the template is `.env.example`):

```bash
EMAIL_WEBHOOK_SECRET=<the secret from step 1>
RESEND_API_KEY=<the Resend API key from Part 0>
EMAIL_FROM="Badminton Social Connect <noreply@mail.yourdomain.org.au>"
APP_URL=https://<production app address>
```

| Variable | What it does |
|---|---|
| `EMAIL_WEBHOOK_SECRET` | The function refuses any call without it |
| `RESEND_API_KEY` | Leave it empty for a dry run: the function logs the subject and sends nothing |
| `EMAIL_FROM` | Must be on the verified domain, or Resend refuses the email |
| `APP_URL` | Base of the "Open the app" links and the opt-out link in each email |

Push them to the hosted project. If `.env` also holds the geocoder's `GEOCODE_WEBHOOK_SECRET`, that's fine: it goes up too.

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase secrets list            # shows the names, never the values
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.

### 3. Deploy the function

```bash
npx supabase functions deploy send-email-notification
```

`config.toml` sets `verify_jwt = false` for it, because the database calls it rather than a signed-in player. It checks `EMAIL_WEBHOOK_SECRET` instead. The deployed function shows in **Dashboard → Edge Functions**.

### 4. Tell the database where the function is

In **Dashboard → SQL Editor**, with the same secret as step 1:

```sql
select vault.create_secret(
  'https://qvpccrsawnapjwcqjfop.supabase.co/functions/v1/send-email-notification',
  'email_webhook_url');
select vault.create_secret('<the secret from step 1>', 'email_webhook_secret');
```

Emails start with the next notification. Until both entries exist, the trigger does nothing, so emails are simply off.

To change a value later, use `vault.update_secret`:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'email_webhook_secret'),
  '<new secret>');
```

If you change the secret, change it in the function's secrets too (step 2).

## Check it works

1. **Account email:** sign up on the hosted app with an address you can read.
   - [ ] The "Verify your email" email arrives from your domain, styled like the template.
   - [ ] Its link opens the app at `/auth/confirmed`.
2. **Password reset:**
   - [ ] "Forgot password" sends the reset email.
   - [ ] Its link opens `/reset-password`.
3. **Notification email:** with two test accounts, ask to join one's game from the other. Each step should send the matching email to the other account, with an **Open Badminton Social Connect** link to the game:
   - [ ] the request ("New request to join your game");
   - [ ] the acceptance ("You're in");
   - [ ] an invitation from Request Game ("You've been invited to a game").
4. **Opt-out:** turn email notifications off in profile settings (`update_my_profile({ p_email_notifications: false })`).
   - [ ] The in-app notification still appears.
   - [ ] No email arrives.
5. **Logs:**
   - [ ] **Dashboard → Edge Functions → send-email-notification → Logs** shows the calls.
   - [ ] **Resend → Emails** shows them delivered.

## Turning email off again

| To stop | Do this |
|---|---|
| Notification emails, keeping the function | `select vault.delete_secret((select id from vault.secrets where name = 'email_webhook_url'));` The trigger then does nothing |
| Real sending, keeping the calls (dry run) | `npx supabase secrets unset RESEND_API_KEY` |
| Account emails through Resend | Turn off custom SMTP in the dashboard. Supabase's limited built-in sender takes over |
| Everything, at once | Revoke the API key in Resend. Both kinds stop |

## Troubleshooting

| Symptom | Check |
|---|---|
| No notification emails at all | Do both vault entries exist? `select name from vault.secrets;` |
| The function never runs | Look at `select status_code, content, error_msg from net._http_response order by created desc limit 10;` A `401` means the vault secret and `EMAIL_WEBHOOK_SECRET` differ |
| The function runs but nothing is sent | In the function logs, `dry run` means `RESEND_API_KEY` isn't set. `resend failed (403)` means `EMAIL_FROM` isn't on the verified domain, or the key lacks access to it |
| `skipped: no email address` | The player's account was deleted, or has no email (shouldn't happen with email or Google sign-in) |
| One player gets no emails | They turned them off: `select email_notifications from player_profile where player_id = '<id>';` |
| Account emails don't arrive | Check the SMTP settings (port `465`, user `resend`, password = API key), the sender on the verified domain, and **Authentication → Logs**. Also check the player's spam folder. Until DMARC is set, some providers file new domains as spam |
| Links in emails go to localhost | `APP_URL` (notification emails), or the Site URL and redirect URLs (account emails), still have local values |
| "Email rate limit exceeded" on sign-up | Raise the email limit in **Authentication → Rate Limits** (Part A, step 4) |
