# M3: Reporting and blocking

Players can block another player, so neither can see or contact the other, and
report a player, game post, Mini League or club to the administrator. Backend
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
| Report a club | Club page | `supabase.rpc('report_club', { p_club_id, p_category, p_reason })` |
| Report a Mini League | League page | `supabase.rpc('report_league', { p_league_id, p_category, p_reason })` |
| My reports | Profile → Report a Problem | `supabase.from('report').select('report_id, target_type, category, status, created_at')` |

Each `report_*` call returns the new report's id.

## What blocking does

Blocking works both ways and is enforced in the database:

- The two players disappear from each other's search results, profiles, game rosters and (once built) leaderboards.
- Neither sees games the other organises, and neither can ask to join the other's games.
- At the moment of blocking, requests and places between them in **upcoming** games are closed: the blocked player's place in the blocker's game, and the blocker's place in the blocked player's game.
- The blocked player is not told. To them, the blocker looks like any private profile ("This profile is private").
- A blocked player can still be reported: block first, then report, is a normal flow.
- Unblocking makes them visible to each other again. Requests closed by the block stay closed.

After a successful `block_player`, navigate away from the blocked player's
profile: it will no longer load.

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
- Leaderboards (BL-025, Player BE-2) must leave out blocked players. The `ranking` table already does for direct reads; any leaderboard function must check `private.blocked_ids()` too.
- If a blocked player is already on the roster of a third person's game, both can still join it. Only games either of them organises are closed.
