# M5: Player trust and reliability

Notifications, cancellations and no-shows, reliability, playing history and
email. Backend stories: BL-050, BL-054, BL-052, BL-060, BL-087. This file grows
as each lands.

## Contents

- [Notifications (BL-050)](#notifications-bl-050)
- [Withdrawals and no-shows (BL-054)](#withdrawals-and-no-shows-bl-054)
- [Reliability (BL-052)](#reliability-bl-052)
- [Playing history (BL-060)](#playing-history-bl-060)
- [Email (BL-087)](#email-bl-087)

## Notifications (BL-050)

### What creates a notification

| Event | Who is told | `type` | Opens |
|---|---|---|---|
| A player asks to join | The organiser, or every admin of the club that posted it | `join_request` | The game (`postId`) |
| The host accepts | The player | `request_accepted` | The match (`matchId`) or game |
| The host declines | The player | `request_declined` | The game |
| A player withdraws | The host | `request_withdrawn` | The game |
| The organiser cancels | Everyone who asked or was accepted | `game_cancelled` | The game |
| The organiser or an admin deletes | Everyone who asked or was accepted | `game_removed` | – |

Changes caused by blocking someone never create a notification, so a block is
not announced.

### Calls

| Screen | Call |
|---|---|
| Notifications list | `supabase.rpc('get_notifications', { p_limit, p_offset })`, newest first |
| Unread badge | `supabase.from('notification').select('notification_id', { count: 'exact', head: true }).eq('is_read', false)` |
| Tap one | `supabase.from('notification').update({ is_read: true }).eq('notification_id', id)` |
| Mark all read | `supabase.rpc('mark_all_notifications_read')` |

`get_notifications` returns the screen's keys:

```json
{ "id": "…", "type": "request_accepted",
  "title": "Your request to join Singles game on Sat 10 Oct, 6:00 PM in Carlton was accepted.",
  "message": "Tap to view match details",
  "createdAt": "…", "unread": true, "postId": "…", "matchId": "…" }
```

The screen's `time` ("2 min ago") is worked out from `createdAt`, and its
`target` from `matchId` or `postId`. Map `type` to the screen's icons:
`join_request` / `request_*` → request, `game_cancelled` / `game_removed` →
cancelled, `result_submitted` → result, `match_reminder` → reminder.

### Live updates

The `notification` table is published to Supabase Realtime. Subscribe once
after sign-in:

```js
supabase
  .channel('notifications')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notification', filter: `player_id=eq.${user.id}` },
      (payload) => { /* add payload.new to the list, bump the badge, show a toast */ })
  .subscribe()
```

Row level security applies to Realtime too, so a player only ever receives
their own notifications.

A no-show creates a `no_show` notification for the player (see below).

### Not done yet

- Match reminders and result notifications (BL-021 / BL-022, Player BE-2) should call `private.dispatch_notification` so they reach email too.
- League notifications come with Mini Leagues (Should Have).

## Withdrawals and no-shows (BL-054)

| Who | Rule | Call |
|---|---|---|
| Player | May withdraw any time before the start. Giving up an **accepted** place within **24 hours** of the start is a *late withdrawal* and costs reliability | `withdraw_request({ p_post_id })` |
| Organiser | May cancel up to **4 hours** before the start (BL-013). Cancelling within **24 hours** is a *late cancellation* and costs reliability | `cancel_game_post({ p_post_id, p_reason })` |
| Host | Marks an accepted player absent, from the start until **48 hours** after the game ends | `mark_no_show({ p_post_id, p_player_id })` |
| Host | Undoes a mistaken no-show, same window | `clear_no_show({ p_post_id, p_player_id })` |

Show the 24-hour warning before a player withdraws ("Withdrawing now counts as a
late withdrawal"). The no-show button belongs on the host's view of a game that
has started. A player who disagrees with a no-show reports it from the game, and
an admin reviews it; there is no separate dispute flow.

These windows are waiting on team confirmation (team item 14).

## Reliability (BL-052)

`get_player_profile` and `get_game_details` (host) return:

| Key | Meaning |
|---|---|
| `reliability` | 0 to 100 |
| `gamesPlayed` | Games attended: accepted, finished, not cancelled, not a no-show |
| `noShows` | Times marked absent |
| `lateWithdrawals` | Accepted places given up within 24 hours |

Score = 100 × (attended + 2) ÷ (attended + 2 + no-shows + ½ × (late
withdrawals + late cancellations)), rounded. New players start at 100%; one
late withdrawal on a first game gives 80%; one no-show gives 67%. The formula is
waiting on team confirmation (team item 14).

The figure on screen is always live. Copies on `player_profile`
(`reliability_score`, `games_played`, `no_show_count`, `late_withdrawal_count`,
`late_cancellation_count`) are refreshed on every change and by an hourly
`pg_cron` job, for anything that reads the table directly.

## Playing history (BL-060)

`supabase.rpc('get_player_history', { p_player_id, p_limit, p_offset })`
returns verified matches, newest first:

```json
{ "matchId": "…", "gameId": "…", "playedAt": "…", "date": "Sat 10 Oct 2026",
  "format": "Singles", "location": "Carlton", "result": "W", "score": "21-15 21-17",
  "opponents": [{ "id": "…", "name": "alice", "initials": "AL", "isBlocked": false }],
  "partner": null }
```

Null when the profile is private to the caller. Someone who has blocked the
viewer appears as `"Player"` with no id. Rating trend over time comes with
BL-024 (Player BE-2).

## Email (BL-087)

Every notification is also emailed. After each insert into `notification`, the
database calls the `send-email-notification` Edge Function (through `pg_net`, so
it never slows the app), which looks up the player's email and sends through
[Resend](https://resend.com). Players can turn emails off: `player_profile.email_notifications = false`
(add a toggle in profile settings). In-app notifications continue either way.

Email is **off until configured**, so local development and tests need nothing.

### Turn it on locally

```bash
cp supabase/functions/.env.example supabase/functions/.env   # set EMAIL_WEBHOOK_SECRET
npx supabase functions serve --env-file supabase/functions/.env
```

Then, in the SQL editor of Studio (http://127.0.0.1:54323), using the same secret:

```sql
select vault.create_secret('http://host.docker.internal:54321/functions/v1/send-email-notification', 'email_webhook_url');
select vault.create_secret('<EMAIL_WEBHOOK_SECRET>', 'email_webhook_secret');
```

With `RESEND_API_KEY` empty, the function does a **dry run**: it logs the
subject and sends nothing. `db reset` clears the vault, so repeat the SQL after
a reset. Results of each call are in `net._http_response`.

### Turn it on in the hosted project

1. Create a Resend account, verify the sending domain, and create an API key.
2. Set the function's secrets: `npx supabase secrets set --env-file supabase/functions/.env` (with the real `RESEND_API_KEY`, `EMAIL_FROM` on the verified domain, and `APP_URL`).
3. Deploy it: `npx supabase functions deploy send-email-notification`.
4. In the hosted SQL editor, create the two vault secrets with the function's hosted URL, `https://<project-ref>.supabase.co/functions/v1/send-email-notification`, and the same secret.

The function refuses any call without the shared secret, and never logs email
addresses.

## Team decisions applied (2026-10-08)

- **No-shows weigh more than late changes** (item 14). The formula already does this: a no-show counts 1, a late withdrawal or cancellation counts ½.
- **Every figure on the API, no band.** The screens show reliability as a percentage ("96% reliable"), so the API sends `reliability` (0–100) and, on profiles, the counts behind it: `gamesPlayed`, `noShows`, `lateWithdrawals` and `lateCancellations`. A band ("Very reliable") was added and then dropped the same day (`20261008100900`).
- **Email opt-out:** `update_my_profile({ p_email_notifications })`.
- Screen-by-screen wiring: [frontend-wiring-guide.md](../frontend-wiring-guide.md).
