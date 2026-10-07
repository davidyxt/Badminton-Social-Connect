# M5: Player trust and reliability

Notifications, cancellations and no-shows, reliability, playing history and
email. Backend stories: BL-050, BL-054, BL-052, BL-060, BL-087. This file grows
as each lands.

## Contents

- [Notifications (BL-050)](#notifications-bl-050)

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

### Not done yet

- Match reminders and result notifications (BL-021 / BL-022, Player BE-2) should call `private.dispatch_notification` so they reach email too.
- League notifications come with Mini Leagues (Should Have).
