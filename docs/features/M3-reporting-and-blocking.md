# M3: Reporting and blocking

Players can block another player, so neither can see or contact the other, and
report a player, game post, Mini League or group to the administrator. Backend
stories: BL-027 (block) and BL-028 (report). The screens are BL-029 (Player FE);
the admin report queue is BL-038 / BL-039 (Admin BE / FE).

## Contents

- [Calls](#calls)
- [What blocking does](#what-blocking-does)
- [Reporting](#reporting)
- [Errors](#errors)
- [Not done yet](#not-done-yet)

## Calls

| Screen | File | Call |
|---|---|---|
| Block button on a profile | `PlayerProfilePage.jsx` | `supabase.rpc('block_player', { p_player_id })` |
| Blocked Users list | `ProfilePage.jsx` | `supabase.rpc('get_blocked_players')` returns `[{ id, name, initials, blockedAt }]` |
| Unblock | Blocked Users list | `supabase.rpc('unblock_player', { p_player_id })` |
| Report a player | `PlayerProfilePage.jsx` | `supabase.rpc('report_player', { p_player_id, p_category, p_reason })` |
| Report a game post | Game Details | `supabase.rpc('report_post', { p_post_id, p_category, p_reason })` |
| Report a group | Group page | `supabase.rpc('report_group', { p_group_id, p_category, p_reason })` |
| Report a Mini League | League page | `supabase.rpc('report_league', { p_league_id, p_category, p_reason })` |
| My reports | Profile → Report a Problem | `supabase.from('report').select('report_id, target_type, category, status, created_at')` |

Each `report_*` call returns the new report's id.

## What blocking does

A block works differently for each side. Say **Pat blocks Quinn**:

| | Pat (the blocker) | Quinn (blocked) |
|---|---|---|
| Find the other in Players search | Yes, with `isBlocked: true` | No |
| See the other on a game's "Players going" list | Yes, with `isBlocked: true` | No |
| See games the other organises | Yes (`organiser.isBlocked: true`), but can't join | No, and can't join |
| See games the other has joined | Yes | No, unless Quinn is already in that game |
| Open the other's profile | No (`get_player_profile` returns null) | No |
| See the other in the rankings | Yes, Blocked badge, no picture, not clickable | Yes, no picture, not clickable |

What this means for the screens:

- Show a **Blocked** badge wherever `isBlocked` is true: player search results, the Game Details host and players list, and the organiser on Find Games cards.
- Don't link a badged player to their profile: it won't load.
- Because Pat sees Quinn on a roster before joining, and Quinn loses sight of any game Pat joins, the two can only end up in the same game if Pat chooses it knowingly.
- At the moment of blocking, requests and places between them in **upcoming** games either of them organises are closed.
- Quinn is not told about the block. To Quinn, Pat simply can't be found.
- A blocked player can still be reported: block first, then report, is a normal flow.
- Unblocking restores everything. Requests closed by the block stay closed.

## Reporting

`p_category` is one of these (the list is waiting on team confirmation, so keep
the labels in one place in the frontend):

| Value | Suggested label |
|---|---|
| `harassment` | Harassment or abuse |
| `inappropriate_content` | Inappropriate content |
| `fake_account` | Fake or impersonation account |
| `spam` | Spam or misleading |
| `safety_concern` | I felt unsafe |
| `underage` | Appears to be under 18 |
| `other` | Something else (details required) |

`p_reason` is optional free text up to 1,000 characters, required for `other`.

The server stores a snapshot of what was reported (username and bio, or the
post's title, notes and venue, and so on). Moderators see it even if the
content is edited or deleted later. Reports can't be inserted into the table
directly, so the snapshot can't be faked.

Limits: 5 reports an hour and 20 a day per player, and one open report per
player per item.

## Errors

| Code | When |
|---|---|
| `23505` | Already reported this item, and the report is still open |
| `23514` | Rate limit reached; `other` without details; unknown category; reporting yourself or your own game; blocking yourself |
| `42501` | The item doesn't exist; not registered; asking to join a game that isn't available (includes blocks, without saying so) |

Every error carries a `message` that is safe to show.

## Not done yet

- The report categories and limits need team sign-off (team item 12).
- Admins are not alerted in real time; the queue is the `report` table, read by the admin console (BL-038 / BL-039).
- **Leaderboards (BL-025, Player BE-2)** show every entry, both ways. For each entry, `private.block_relation(player_id)` returns `blocked_by_me`, `blocked_me` or null: when not null, hide the profile picture and make the entry unclickable; for `blocked_by_me`, add the Blocked badge.
- If Quinn joined a third player's game *before* Pat did, Quinn keeps seeing that game (without Pat on its roster). Pat saw Quinn there, badged, before joining.

## Team decisions applied (2026-10-08)

- **Every report needs details** (item 12). Categories and rate limits are unchanged.
- **The blocker can open the blocked player's profile** (item 13). It comes back with `isBlocked: true`. The blocked player still cannot open the blocker's.
- **Blocks take an optional category and reason**:
  - Call `block_player(p_player_id, p_category, p_reason)`.
  - The categories are the same as for reports.
  - `get_blocked_players` returns them.
  - Only the blocker and admins can read them.
- **A game both players are in keeps both** (item 13). Keeping track is the blocker's responsibility; no change.
- Screen-by-screen wiring: [frontend-wiring-guide.md](../frontend-wiring-guide.md).
