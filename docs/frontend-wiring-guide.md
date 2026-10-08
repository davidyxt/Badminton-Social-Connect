# Frontend wiring guide

How each screen connects to the backend, what the frontend has to change, and what is still missing on either side. Written for whoever wires the React app to Supabase.

Everything here is on the branch `M4-M6-M1-M3-M5`, which combines the backend work from M1, M3, M4, M5 and M6.

- **Exact calls, parameters, responses and errors:** [the implemented API spec](badminton-social-connect-api_implemented.yaml) (open it in https://editor.swagger.io). It has only what's built, and every response has a real example. [The full spec](badminton-social-connect-api_v1.2.yaml) also lists the design's endpoints that are still Planned.
- **Proof that the calls work:** [API test report](api-test-report.md).

## Contents

- [Getting started](#getting-started)
- [How to call the backend](#how-to-call-the-backend)
- [Screen by screen](#screen-by-screen)
- [Changes the frontend must make](#changes-the-frontend-must-make)
- [Backend ready, no screen yet](#backend-ready-no-screen-yet)
- [Screens with no backend yet](#screens-with-no-backend-yet)

## Getting started

```bash
git checkout M4-M6-M1-M3-M5
npx supabase start
npx supabase db reset        # every migration + the dev seed
cd frontend && npm install && npm run dev
```

Sign in as any of these test accounts. Each one's password is `Passw0rd!`.

| Account | Use it to see |
|---|---|
| `alice@example.com` | An organiser with requests to answer, a group she admins (Smash Group) and a league. Alice blocked Frank. |
| `bob@example.com` | A pending group join request and a late cancellation (89% reliable). |
| `carol@example.com` | A disputed result, and a notification that a deleted player's game was cancelled. |
| `dan@example.com` | A hidden profile, a no-show (80%), and an invitation from Bob he declined. |
| `frank@example.com` | Being blocked: Alice and her games are invisible to him. |
| `grace@example.com` | A Google-style account with no username that has not passed the age gate, so she lands on `/complete-registration`. |
| `ivy@example.com` | A brand-new player with no games (100% reliable), and an invitation from Carol to accept or decline. |
| `admin@example.com` | The platform admin. |

The seed is described at the top of [`supabase/seeds/dev/01_accounts.sql`](../supabase/seeds/dev/01_accounts.sql).

## How to call the backend

- **Tables:** `supabase.from('game_post').select('...')`. Column names are snake_case. If a player may not change a row, PATCH and DELETE return an empty list instead of an error, so check that the returned array isn't empty.
- **Functions:** `supabase.rpc('search_games', { p_query: 'doubles' })`. Parameters start with `p_`. Screen functions return camelCase objects shaped like the screen's existing sample data.
- **Errors:** `error.message` is written for players and can be shown as it is. `error.code` tells you the kind:

  | Code | Meaning |
  |---|---|
  | `42501` | Not allowed |
  | `23514` | A rule was broken |
  | `23505` | Already done, or taken |
  | `22023` | Invalid value |

  [`frontend/src/services/api.js`](../frontend/src/services/api.js) has an `rpc()` helper that throws them.
- **Signed out:** only `is_username_available` works before sign-in.
- **Not registered yet:** until a player passes the 18+ age gate, lists come back empty and details come back `null`. `ProtectedRoute` already sends them to `/complete-registration`.
- **Realtime:** for a live notification badge, subscribe to `postgres_changes` on `public.notification`. Row Level Security sends each player only their own rows.

## Screen by screen

✅ The backend covers the screen. 🟡 Partly covered. ❌ No backend yet.

Each screen ends with **Frontend adjustments**: what has to change in the existing page. The number in brackets points to the item in [Changes the frontend must make](#changes-the-frontend-must-make).

### Sign up, log in, age gate (M4) ✅ wired

The sign-up form, `/complete-registration`, idle sign-out and the auth routes are already wired on this branch.

The age gate now saves the username together with the date of birth: `registerPlayer({ dateOfBirth, stateCode, username })`.

**Frontend adjustments**

- None needed: the username field and the age gate are already in place (1).
- If the sign-up form changes, keep sending `username` in `options.data`. A sign-up without it fails.

### Home (`DashboardPage`) ✅

Call `rpc('get_my_home')`.

| Sample data | API field |
|---|---|
| `user.firstName`, `user.lastName` | `firstName`, `lastName` (either can be null; `greetingName` is the full name, or the username when there's none) |
| `user.initials` | `initials` |
| `rating.value` | `ratingCard.rating` |
| `rating.level` | `ratingCard.band`, `ratingCard.grade` |
| `rating.matches` | `ratingCard.matches` |
| `rating.winRate` | `ratingCard.winRate` |
| `rating.victoriaRank` | `ratingCard.stateRank`, `ratingCard.rankState` |
| `rating.monthlyChange` | `ratingCard.ratingChangeThisMonth` |
| `upcomingMatch` | `nextGame` (`null` means "No game planned"), with title, date, time, location and `mapsUrl` |
| `league`, `recentActivity` | Nothing yet |

`registered: false` means the player has to go to `/complete-registration`.

Admin announcements for the home page come from `from('admin_post').select('title,body,image_url').order('display_order')`. Players get the published ones only.

**Frontend adjustments**

- Replace the `dashboardData` sample with `get_my_home`.
- Show `nextGame` in the "upcoming match" card: title, date, time, location, and an "Open in Maps" link from `mapsUrl`.

### Find Games, Matches tab (`FindGamesPage`) ✅

Call `rpc('search_games', { p_query, p_level, p_format, p_suburb, p_from, p_to, p_limit, p_offset })`.

Each card has the same keys as the sample `games` array: `id`, `title`, `format`, `style`, `rank`, `date`, `time`, `location`, `playerCount`, `maxPlayers` and `imageUrl`. It also has:

- `mapsUrl`
- `organiser`, with `isGroup`, `isBlocked` and `isDeleted`
- `myStatus`

Changes from the sample data:

- **Style:** the backend says "Social", the sample says "Friendly". Use "Social".
- **Levels:** `rankFilter` values `beginner | intermediate | advanced` go in `p_level`.
- **Formats:** `formatFilter` `singles | doubles` goes in `p_format`.

**Frontend adjustments**

- Replace the sample `games` array with `search_games`. Pass the search box and filters as parameters rather than filtering in the browser.
- Change the "Friendly" label and filter value to **"Social"** (2).
- Show a **Blocked** badge on the organiser when `organiser.isBlocked` is true (6).
- When `organiser.isDeleted` is true, show "Deleted User" with no link (4).
- When `organiser.isGroup` is true, show the group as the host. If `organiser.isActive` is false, mark it inactive (3).
- Optional: an "Open in Maps" link from `mapsUrl`.

### Find Games, Players tab ✅

Call `rpc('search_players', { p_query, p_level })`. It returns `id`, `name`, `initials`, `rank`, `location`, `reliability` (a %) and `isBlocked`.

- Show a **Blocked** badge when `isBlocked` is true.
- **Request to Play** opens Post a Game in [invite mode](#request-game-invite-mode) for that player.

**Frontend adjustments**

- Replace the sample `players` array with `search_players`.
- Show the **Blocked** badge from `isBlocked` (6).
- Show reliability as it is now: `{reliability}% reliable` (7).
- Wire **Request to Play** to open Post a Game in invite mode: `navigate('/post-game', { state: { opponent: player } })` (10).

### Game Details (`GameDetailsPage`) ✅

Call `rpc('get_game_details', { p_post_id })`. Keep reading by id rather than relying on `location.state`. The result has the same keys as `fallbackGame`, plus:

- **Venue:** `mapsUrl` (link "Open in Maps" to it), `address`, `notes`.
- **Host:** `reliability` (%), `isBlocked` and `isDeleted`.
- **Players:** each has `isBlocked` and `isDeleted`.
- **The caller:** `myStatus` (pending, invited, accepted, declined, withdrawn or null) and `canManage`.
- **Invitations:** `isInvite` is true for a Request Game; `invite` has the invited player's `name`, `status` and the organiser's `message` (null for ordinary games).
- **Match:** `matchId`.

`null` means the game is gone or hidden from this player; show "This game is not available".

Buttons:

| Button | Call |
|---|---|
| Request to join | `rpc('request_to_join', { p_post_id, p_message })` |
| Withdraw | `rpc('withdraw_request', { p_post_id })` |
| Invited player: accept / decline | `rpc('accept_invite' \| 'decline_invite', { p_post_id })` |
| Organiser: cancel | `rpc('cancel_game_post', { p_post_id, p_reason })` |
| Organiser: delete | `rpc('delete_game_post', { p_post_id })` |

Cancelling and deleting are refused within 4 hours of the start, with a message to show.

**Frontend adjustments**

- Load the game with `get_game_details(gameId)`, not from `location.state`, so links and refreshes work. If it returns `null`, show "This game is not available".
- Add an **"Open in Maps"** link on the venue from `mapsUrl`.
- Drive the main button from `myStatus`:

  | `myStatus` | Button |
  |---|---|
  | null | Request to join |
  | pending | Withdraw request |
  | accepted | Leave game, with the late-withdrawal warning within 24 hours |
  | invited | **Accept** and **Decline**, with the organiser's `invite.message` (10) |
  | declined | Nothing; the player can't ask again |

- When `canManage` is true, show the organiser actions instead: **View requests** (opens `PlayRequestPage`), **Cancel game** with an optional reason, and **Delete game**. For an invitation (`isInvite`), show "Invited: {invite.name} ({invite.status})" instead of View requests (10).
- Badges on the host and the player list:
  - **Blocked** where `isBlocked` is true (6);
  - **"Deleted User"**, with no profile link, where `isDeleted` is true (4).
- Show the host's reliability as `{reliability}%` (7); the bar already does this.
- Show the error `message` when a call is refused, for example the 4-hour rule.

### Post a Game (`PostGamePage`) 🟡 form changes needed

Fill the form from `rpc('get_game_form_options')`:

- **Choices:** `formats`, `styles` and `abilityLevels`, each as value + label.
- **`limits`:** the allowed ranges.
- **`defaultTitle`:** "Badminton game".
- **`postAs`:** the player, plus any group they're an admin of.

For the **venue dropdown**, search as the player types: `rpc('search_venues', { p_query, p_state, p_limit })`.

- It matches venue name, suburb, address or postcode, and tolerates typos ("msac", "aquatc", "3130").
- Best matches come first, up to 50 (default 20).
- With no query it lists venues A to Z, which `p_state` can narrow, e.g. `'VIC'`.
- Each row has `id`, `name`, `address`, `suburb`, `postcode`, `state`, `mapsUrl` and `label`. `label` is ready to show, e.g. "Melbourne Badminton Centre — Blackburn North VIC".
- Debounce the calls (about 250 ms), and keep an "Other venue" option at the end of the list.

Save with `from('game_post').insert({...}).select()`:

| Form | Column |
|---|---|
| post as me | `organiser_id` = your id |
| post as a group | `organiser_group_id` = the group id (and no `organiser_id`) |
| **title** (new field) | `title` (optional; cards show "Badminton game" without it) |
| format, style, abilityLevel, notes | `format`, `style`, `ability_level`, `notes` |
| durationMinutes | `duration_minutes` (15–240) |
| venue | `venue_id` = the chosen `search_venues` row's `id` (the suburb is filled in from the venue) |
| "Other" venue | `suburb` (required when there's no venue) |
| date + startTime | `proposed_time`, with the Melbourne offset: `2026-10-10T18:00:00+11:00` |
| players | `player_limit` (2–64) |

Replace `services/gameService.js`'s fake `createGame`. On success, go to `/post-game/confirmation/:gameId` with the returned `post_id`.

**Frontend adjustments**

- Add a **Title** field, optional and up to 80 characters, with "Badminton game" as the placeholder (2).
- Change the style option "Friendly" to **"Social"** (2).
- Replace the hard-coded venue `<select>` (three venues and "Other") with a **searchable dropdown** backed by `search_venues`. Keep an **"Other venue"** option that reveals a **Suburb** field (2).
- Add **Post as** (me, or a group I admin) from `postAs`, shown only when the player admins a group (2, 3).
- Fill the format, style, level and duration options from `get_game_form_options` instead of hard-coding them. The duration options can stay as they are, within 15–240 minutes.
- Add a **Players** number when needed. It defaults to 2 for singles and 4 for doubles (`defaultPlayers`).
- Send `ability_level` values in snake_case, e.g. `lower_intermediate`, not labels.
- Combine the date and start time into one `proposed_time` with the Melbourne offset.
- Show the error `message` if the insert is refused, e.g. a start time in the past.

#### Request Game (invite mode)

**Request Game** (player profile) and **Request to Play** (Find Games, Players tab) open this same form to invite one player. `PlayerProfilePage` already navigates here with `state: { opponent: player }`.

In invite mode:

- Show "Invite {opponent.name}" at the top.
- Fix the format to **Singles** and the players to **2**, and hide those fields and **Post as**.
- Keep everything else: date, time, duration, venue (`search_venues`), style, level, title and notes.
- Add an optional **Message** to the invited player (up to 300 characters).

Save with `rpc('invite_player', {...})` instead of the table insert:

| Form | Parameter |
|---|---|
| the opponent | `p_player_id` = `opponent.id` |
| date + startTime | `p_proposed_time` (Melbourne offset) |
| venue / "Other" suburb | `p_venue_id` / `p_suburb` |
| duration, style, level, title, notes | `p_duration_minutes`, `p_style`, `p_ability_level`, `p_title`, `p_notes` |
| message | `p_message` |

It returns the new game's id; go to its confirmation page.

The invited player is notified (`match_invite`) and answers on Game Details. The organiser is notified of the answer (`invite_accepted` / `invite_declined`).

Errors to show as they are:

- the player can't be invited (blocked, private, deleted or not registered);
- 10 invitations are already waiting for an answer;
- the usual Post a Game rules, such as a start time in the past.

Only the two players (and admins) can see the game, so it never appears in Find Games for anyone else.

### Play Request, the organiser's view (`PlayRequestPage`) ✅

Call `rpc('get_join_requests', { p_post_id })`. Each item has `status`, `game` (the card), `host` and `requester`. The requester has:

- `name`, `level`, `preferredFormat`
- `rating`, `verifiedMatches`
- `reliability` (%), `noShows`, `lateWithdrawals`
- `message`

That's the same shape as `fallbackRequest`, plus the reliability details.

To respond, call `rpc('accept_request' | 'decline_request', { p_post_id, p_player_id })`. Accepting a full game is refused, with a message to show.

**Frontend adjustments**

- Replace `fallbackRequest` with the `get_join_requests` list. The page currently shows one request; show every pending one, or open one by id.
- Show reliability as `{reliability}%` (7). Optionally add the no-shows and late withdrawals under it.
- Use `game.location`, `game.date` and `game.time` from the card. The sample's `venueDetail` distance ("2.4 km") has no backend; drop it.
- After accepting or declining, reload the list. Show the error `message` when the game is full.

### Another player's profile (`PlayerProfilePage`) ✅

Call `rpc('get_player_profile', { p_player_id })`. It has the same keys as `fallbackPlayer`, plus:

- `isBlocked`
- `gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations`

`null` means the profile is private or not available; show that rather than an error.

For the match history list, call `rpc('get_player_history', { p_player_id, p_limit, p_offset })`.

Buttons:

- **Block:** see [Block](#changes-the-frontend-must-make).
- **Report (flag icon):** `rpc('report_player', { p_player_id, p_category, p_reason })`. The reason is required.
- **Request Game:** opens Post a Game in [invite mode](#request-game-invite-mode).

**Frontend adjustments**

- Load the profile with `get_player_profile(playerId)`. If it returns `null`, show "This profile is private or not available".
- Wire **Block** to a small form with an optional category and reason (6). When `isBlocked` is true:
  - show a **Blocked** badge;
  - swap the button for **Unblock** (`unblock_player`).
- Wire the **Report** flag to a form with a category picker and a **required** reason (5).
- Show reliability as `{reliability}%` (7). The counts behind it are optional.
- Keep **Request Game**: it already navigates to `/post-game` with the player; the form switches to invite mode (10).
- Add a match history list from `get_player_history`, if the design has room for it.

### Profile (`ProfilePage`) 🟡 menu screens needed

Call `rpc('get_my_profile')`.

| Sample data | API field |
|---|---|
| `name`, `initials`, `level` | `name`, `initials`, `level` |
| `reliability` | `reliability` (a %, shown as "94% reliable") |
| `location` | `location` |
| `rating`, `winRate`, `vicRank`, `verifiedMatches` | `ratingCard.rating`, `.winRate`, `.stateRank`, `.matches` |

Menu items:

| Menu item | Backend |
|---|---|
| Your Profile, Playing Preferences | `rpc('update_my_profile', {...})`: username, first and last name, level, bio, suburb, state, preferred format |
| Match History | `rpc('get_player_history', { p_player_id: myId })` |
| Reliability | `get_my_profile`: `reliability` (%), `gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations` |
| Privacy Settings | `update_my_profile({ p_is_discoverable })` |
| Notifications | `update_my_profile({ p_email_notifications })`: email opt-out |
| Blocked Users | `rpc('get_blocked_players')` lists them; `rpc('unblock_player', { p_player_id })` |
| Report a Problem | `report_player` / `report_post` / `report_group` / `report_league` |
| Sign Out | `/signout` |
| Delete account (new) | `rpc('delete_my_account')`, then sign out |
| Terms & Privacy Policy | Pages don't exist yet |

**Frontend adjustments**

- Replace the `profile` sample with `get_my_profile`.
- Build the menu screens that don't exist yet:
  - **Your Profile** and **Playing Preferences**: an edit form calling `update_my_profile` with only the changed fields;
  - **Match History**;
  - **Reliability**: the % and the counts (7);
  - **Privacy Settings**: the discoverable toggle;
  - **Notifications**: an **email notifications** toggle (8);
  - **Blocked Users**: name, category, reason and an Unblock button (6);
  - **Report a Problem**: category plus a required reason (5).
- Update the "0 users blocked" subtitle from the length of `get_blocked_players`.
- Add **My groups** with a Leave button (3).
- Add **Delete account**, behind a clear warning that it can't be undone. Call `delete_my_account`, then sign out (4).
- Make **Sign Out** go to `/signout`.

### Notifications (`NotificationsPage`) ✅

Call `rpc('get_notifications', { p_limit, p_offset })`. It returns `id`, `type`, `title`, `message`, `unread`, `createdAt`, `postId` and `matchId`.

- **Tap target:** build it from `postId` → `/games/:postId` and `matchId` → `/matches/:matchId`. The sample's `target` field doesn't exist.
- **Time:** format "2 min ago" from `createdAt`.
- **Mark all read:** `rpc('mark_all_notifications_read')`.
- **Mark one read:** `from('notification').update({ is_read: true }).eq('notification_id', id)`.

| Sample `type` | Backend `type` |
|---|---|
| request | `join_request`, `request_accepted`, `request_declined`, `request_withdrawn` |
| invitation (new) | `match_invite` (to the invited player; open the game to accept or decline), `invite_accepted`, `invite_declined` (to the organiser) |
| cancelled | `game_cancelled`, `game_removed` |
| result | `result_submitted`, `dispute_update` |
| league | `league_update` |
| other | `no_show`, `system` |
| reminder, game, rating | Not sent yet |

**Frontend adjustments**

- Replace `initialNotifications` with `get_notifications`.
- Map the backend `type` values to the existing icons using the table above.
- Build each notification's link from `postId` / `matchId`, since there's no `target` field.
- Wire **Mark all as read**.
- Update the unread badge in the top bar from `unreadNotifications` (in `get_my_home` and `get_my_profile`), or live over Realtime.

### Match Details (`MatchDetailsPage`) 🟡

There's no screen function yet. Read the tables directly:

- `from('match').select('*, match_participant(player_id, side, status), match_result(score, status, winning_side)').eq('match_id', id)`
- Or start from the game with `get_game_details`, which includes `matchId`.

Buttons:

- **Cancel Match:** that's the game's `cancel_game_post`. The page says 24 hours, but the rule is: refused within **4 hours**, and within 24 hours it counts as a late cancellation.
- **Host marks a no-show:** `rpc('mark_no_show' | 'clear_no_show', { p_post_id, p_player_id })`. Allowed from the start until 48 hours after the game.
- **Message:** no backend.

**Frontend adjustments**

- Replace `fallbackMatch` with the match tables (or `get_game_details` plus `matchId`).
- Change the cancellation text from "24 hours" to the real rule:
  - cancelling isn't possible within **4 hours** of the start;
  - cancelling within 24 hours counts against reliability.
- Add **Mark as no-show** and **Undo** for the host after the start, using `mark_no_show` / `clear_no_show`.
- Hide **Message** until messaging has a backend.

### Groups (new screens) ✅ backend, ❌ no screens yet

Groups use the `groups` and `group_member` tables (see item 3 in [Changes the frontend must make](#changes-the-frontend-must-make)).

**Frontend adjustments**

- Build these screens:
  - **create a group**;
  - **group page**: members, and pending requests for its admins;
  - **ask to join** / **leave**;
  - **approve or decline** a request;
  - **promote** a member to admin;
  - **deactivate** the group (3).
- Don't build an "add member" button. Players must ask, and admins approve (3).
- Show inactive groups as inactive. A group with upcoming games can't be deactivated; show the error `message`.

### Rankings, Mini Leagues, Record Result, Result Submitted and Confirmed ❌

See [Screens with no backend yet](#screens-with-no-backend-yet).

## Changes the frontend must make

From the team's decisions in items-to-confirm:

1. **Username on sign-up (item 9).** Done on this branch. Usernames are never made up any more:
   - an email sign-up without one fails;
   - Google players choose theirs on `/complete-registration`.
2. **Post a Game (item 2):**
   - add a **title** field;
   - use "Social", not "Friendly";
   - make the venue a searchable dropdown backed by `search_venues`, and send its `venue_id`;
   - "Other" needs a suburb;
   - add "post as me / as a group" (`postAs`).
3. **Groups (item 4, Nick's request):**
   - players **ask** to join, and a group admin approves;
   - there's no "add member" button for admins.

   Screens to build:
   - create a group;
   - group page with members, and pending requests for admins;
   - ask to join, leave;
   - promote a member to admin;
   - post a game as the group;
   - on the Profile page, "my groups" with leave.

   All of it is table calls on `groups` and `group_member`:

   | Action | Call |
   |---|---|
   | Ask to join | `insert({ group_id, player_id: me })` (starts pending) |
   | Approve | `update({ status: 'approved' })` |
   | Promote | `update({ role: 'admin' })` |
   | Leave or decline | `delete()` |
   | Deactivate the group | `from('groups').update({ is_active: false })` |

   An inactive group shows as inactive on its old games (`organiser.isActive`).
4. **Deleted accounts (item 5):** deleted players appear as **"Deleted User"**, with `isDeleted: true` on hosts and rosters.
   - Don't link to their profile; `get_player_profile` returns null.
   - Add a "Delete account" option with a clear warning.
5. **Reports (item 12):** a reason is required for **every** report. Use the category picker from the table below.
6. **Blocking (item 13, notes 4 and 6):**
   - Ask for an optional category (same list as reports) and reason: `rpc('block_player', { p_player_id, p_category, p_reason })`.
   - Show a **Blocked** badge wherever `isBlocked` is true: player search, profile, Game Details host and players, Find Games organiser.
   - The blocker can still open the blocked player's profile, so show the badge and an **Unblock** button there.
   - Add a **Blocked Users** page from `get_blocked_players` (shows category and reason).
   - Rankings will stay visible both ways, without a picture or click-through, when the leaderboard is built.
7. **Reliability (item 14):** keep the screens as they are: reliability is a percentage ("96% reliable"). There is no band. The counts behind the score (`gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations`) are on the profile.
8. **Email opt-out (item 15):** add a toggle in Notifications settings: `update_my_profile({ p_email_notifications })`.
9. **Admin (item 18, report filter):**
   - the admin console needs a report queue filtered by category;
10. **Request Game / Request to Play (item 17).** These buttons invite one player to a singles game. The invited player accepts or declines, and both sides are notified.
    - Post a Game gets an [invite mode](#request-game-invite-mode) that calls `invite_player`.
    - Game Details shows **Accept / Decline** when `myStatus` is `invited`.
    - Notifications get an invitation icon for `match_invite`, `invite_accepted` and `invite_declined`.

Report and block categories:

| Value | Show as |
|---|---|
| `harassment` | Harassment or threats |
| `inappropriate_content` | Inappropriate content |
| `fake_account` | Fake account or impersonation |
| `spam` | Spam or misleading post |
| `safety_concern` | Felt unsafe at a game |
| `underage` | Appears to be under 18 |
| `other` | Something else |

## Backend ready, no screen implementation yet

| Feature | Backend |
|---|---|
| Groups (create, join, approve, promote, leave, deactivate) | Tables `groups`, `group_member` |
| Post a game as a group | `game_post.organiser_group_id`, `get_game_form_options().postAs` |
| Request Game: invite a player, accept or decline | `invite_player`, `accept_invite`, `decline_invite` |
| Withdraw from a game | `withdraw_request` |
| Organiser cancels or deletes a game | `cancel_game_post`, `delete_game_post` |
| Mark and undo no-shows | `mark_no_show`, `clear_no_show` |
| Block with a reason, Blocked Users list, unblock | `block_player`, `get_blocked_players`, `unblock_player` |
| Report a player, post, group or league | `report_*` |
| Edit profile, preferred format, privacy, email opt-out | `update_my_profile` |
| Playing history | `get_player_history` |
| Delete account | `delete_my_account` |
| Live notifications | Realtime on `notification` |
| Venue Maps links | `mapsUrl` on cards, details and venues |
| Admin: delete a played game, with a warning | `admin_game_post_deletion_impact`, `admin_delete_game_post` |

## Screens with no backend yet

These are outside the BE-1 stories, or need a team decision first.

| Screen or button | What's missing |
|---|---|
| Rankings (`RankingsPage`) | Leaderboards by state, nearby and league; rating history; weekly change. The `ranking` table is readable, but nothing calculates ratings yet (BL-024/025). |
| Mini Leagues, Create League, League Details | League screens and functions. The `mini_league` table lacks format, style, rounds, skill level, venue, max players and description. |
| Record Result, Result Submitted, Result Confirmed | Submitting and confirming results. Only admins can confirm today. |
| Match Details "Message" | Messaging (planned `match_message`) |
| Dashboard league and recent activity | No functions yet |
| Notification types reminder, new game nearby, rating change | Not sent yet |
| Profile pictures | `profileImageUrl` is always null; no storage yet |
| Terms and privacy pages | The documents and their version labels (item 11) |
