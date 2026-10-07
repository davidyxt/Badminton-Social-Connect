# Frontend wiring guide

How each screen connects to the backend, what the frontend has to change, and what is still missing on either side. Written for whoever wires the React app to Supabase.

Everything here is on the branch `M4-M6-M1-M3-M5`, which combines the backend work from M1, M3, M4, M5 and M6.

- **Exact calls, parameters, responses and errors:** [the API spec](badminton-social-connect-api_v1.2.yaml) (open it in https://editor.swagger.io). Every response there has a real example.
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
| `alice@example.com` | An organiser with requests to answer, a club she admins (Smash Club) and a league. Alice blocked Frank. |
| `bob@example.com` | A pending club join request and a late cancellation (reliability 89%, "Reliable"). |
| `carol@example.com` | A disputed result, and a notification that a deleted player's game was cancelled. |
| `dan@example.com` | A hidden profile and a no-show (80%). |
| `frank@example.com` | Being blocked: Alice and her games are invisible to him. |
| `grace@example.com` | A Google-style account with no username that has not passed the age gate, so she lands on `/complete-registration`. |
| `ivy@example.com` | A brand-new player with no games ("New player"). |
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

### Sign up, log in, age gate (M4) ✅ wired

The sign-up form, `/complete-registration`, idle sign-out and the auth routes are already wired on this branch.

The age gate now saves the username together with the date of birth: `registerPlayer({ dateOfBirth, stateCode, username })`.

### Home (`DashboardPage`) ✅

Call `rpc('get_my_home')`.

| Sample data | API field |
|---|---|
| `user.firstName`, `user.lastName` | `greetingName` (the real name, or the username), `firstName` |
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

### Find Games, Matches tab (`FindGamesPage`) ✅

Call `rpc('search_games', { p_query, p_level, p_format, p_suburb, p_from, p_to, p_limit, p_offset })`.

Each card has the same keys as the sample `games` array: `id`, `title`, `format`, `style`, `rank`, `date`, `time`, `location`, `playerCount`, `maxPlayers` and `imageUrl`. It also has:

- `mapsUrl`
- `organiser`, with `isClub`, `isBlocked` and `isDeleted`
- `myStatus`

Changes from the sample data:

- **Style:** the backend says "Social", the sample says "Friendly". Use "Social".
- **Levels:** `rankFilter` values `beginner | intermediate | advanced` go in `p_level`.
- **Formats:** `formatFilter` `singles | doubles` goes in `p_format`.

### Find Games, Players tab ✅

Call `rpc('search_players', { p_query, p_level })`. It returns `id`, `name`, `initials`, `rank`, `location`, `reliability`, `reliabilityBand` and `isBlocked`.

- Show a **Blocked** badge when `isBlocked` is true.
- **Request to Play** has no backend; see [screens with no backend](#screens-with-no-backend-yet).

### Game Details (`GameDetailsPage`) ✅

Call `rpc('get_game_details', { p_post_id })`. Keep reading by id rather than relying on `location.state`. The result has the same keys as `fallbackGame`, plus:

- **Venue:** `mapsUrl` (link "Open in Maps" to it), `address`, `notes`.
- **Host:** `reliabilityBand`, `isBlocked` and `isDeleted`.
- **Players:** each has `isBlocked` and `isDeleted`.
- **The caller:** `myStatus` (pending, accepted, declined, withdrawn or null) and `canManage`.
- **Match:** `matchId`.

`null` means the game is gone or hidden from this player; show "This game is not available".

Buttons:

| Button | Call |
|---|---|
| Request to join | `rpc('request_to_join', { p_post_id, p_message })` |
| Withdraw | `rpc('withdraw_request', { p_post_id })` |
| Organiser: cancel | `rpc('cancel_game_post', { p_post_id, p_reason })` |
| Organiser: delete | `rpc('delete_game_post', { p_post_id })` |

Cancelling and deleting are refused within 4 hours of the start, with a message to show.

### Post a Game (`PostGamePage`) 🟡 form changes needed

Fill the form from `rpc('get_game_form_options')`:

- **`venues`:** id, name, suburb, mapsUrl.
- **Choices:** `formats`, `styles` and `abilityLevels`, each as value + label.
- **`limits`:** the allowed ranges.
- **`defaultTitle`:** "Badminton game".
- **`postAs`:** the player, plus any club they're an admin of.

Save with `from('game_post').insert({...}).select()`:

| Form | Column |
|---|---|
| post as me | `organiser_id` = your id |
| post as a club | `organiser_club_id` = the club id (and no `organiser_id`) |
| **title** (new field) | `title` (optional; cards show "Badminton game" without it) |
| format, style, abilityLevel, notes | `format`, `style`, `ability_level`, `notes` |
| durationMinutes | `duration_minutes` (15–240) |
| venue | `venue_id` (the suburb is filled in from the venue) |
| "Other" venue | `suburb` (required when there's no venue) |
| date + startTime | `proposed_time`, with the Melbourne offset: `2026-10-10T18:00:00+11:00` |
| players | `player_limit` (2–64) |

Replace `services/gameService.js`'s fake `createGame`. On success, go to `/post-game/confirmation/:gameId` with the returned `post_id`.

### Play Request, the organiser's view (`PlayRequestPage`) ✅

Call `rpc('get_join_requests', { p_post_id })`. Each item has `status`, `game` (the card), `host` and `requester`. The requester has:

- `name`, `level`, `preferredFormat`
- `rating`, `verifiedMatches`
- `reliability`, `reliabilityBand`, `noShows`, `lateWithdrawals`
- `message`

That's the same shape as `fallbackRequest`, plus the reliability details.

To respond, call `rpc('accept_request' | 'decline_request', { p_post_id, p_player_id })`. Accepting a full game is refused, with a message to show.

### Another player's profile (`PlayerProfilePage`) ✅

Call `rpc('get_player_profile', { p_player_id })`. It has the same keys as `fallbackPlayer`, plus:

- `isBlocked`
- `reliabilityBand`
- `gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations`

`null` means the profile is private or not available; show that rather than an error.

For the match history list, call `rpc('get_player_history', { p_player_id, p_limit, p_offset })`.

Buttons:

- **Block:** see [Block](#changes-the-frontend-must-make).
- **Report (flag icon):** `rpc('report_player', { p_player_id, p_category, p_reason })`. The reason is required.
- **Request Game:** no backend.

### Profile (`ProfilePage`) 🟡 menu screens needed

Call `rpc('get_my_profile')`.

| Sample data | API field |
|---|---|
| `name`, `initials`, `level` | `name`, `initials`, `level` |
| `reliability` | `reliability` (also send `reliabilityBand`) |
| `location` | `location` |
| `rating`, `winRate`, `vicRank`, `verifiedMatches` | `ratingCard.rating`, `.winRate`, `.stateRank`, `.matches` |

Menu items:

| Menu item | Backend |
|---|---|
| Your Profile, Playing Preferences | `rpc('update_my_profile', {...})`: username, first and last name, level, bio, suburb, state, preferred format |
| Match History | `rpc('get_player_history', { p_player_id: myId })` |
| Reliability | `get_my_profile`: `reliability`, `reliabilityBand`, `gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations` |
| Privacy Settings | `update_my_profile({ p_is_discoverable })` |
| Notifications | `update_my_profile({ p_email_notifications })`: email opt-out |
| Blocked Users | `rpc('get_blocked_players')` lists them; `rpc('unblock_player', { p_player_id })` |
| Report a Problem | `report_player` / `report_post` / `report_club` / `report_league` |
| Sign Out | `/signout` |
| Delete account (new) | `rpc('delete_my_account')`, then sign out |
| Terms & Privacy Policy | Pages don't exist yet |

### Notifications (`NotificationsPage`) ✅

Call `rpc('get_notifications', { p_limit, p_offset })`. It returns `id`, `type`, `title`, `message`, `unread`, `createdAt`, `postId` and `matchId`.

- **Tap target:** build it from `postId` → `/games/:postId` and `matchId` → `/matches/:matchId`. The sample's `target` field doesn't exist.
- **Time:** format "2 min ago" from `createdAt`.
- **Mark all read:** `rpc('mark_all_notifications_read')`.
- **Mark one read:** `from('notification').update({ is_read: true }).eq('notification_id', id)`.

| Sample `type` | Backend `type` |
|---|---|
| request | `join_request`, `request_accepted`, `request_declined`, `request_withdrawn` |
| cancelled | `game_cancelled`, `game_removed` |
| result | `result_submitted`, `dispute_update` |
| league | `league_update` |
| other | `no_show`, `system` |
| reminder, game, rating | Not sent yet |

### Match Details (`MatchDetailsPage`) 🟡

There's no screen function yet. Read the tables directly:

- `from('match').select('*, match_participant(player_id, side, status), match_result(score, status, winning_side)').eq('match_id', id)`
- Or start from the game with `get_game_details`, which includes `matchId`.

Buttons:

- **Cancel Match:** that's the game's `cancel_game_post`. The page says 24 hours, but the rule is: refused within **4 hours**, and within 24 hours it counts as a late cancellation.
- **Host marks a no-show:** `rpc('mark_no_show' | 'clear_no_show', { p_post_id, p_player_id })`. Allowed from the start until 48 hours after the game.
- **Message:** no backend.

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
   - send `venue_id` from `get_game_form_options`;
   - "Other" needs a suburb;
   - add "post as me / as a club" (`postAs`).
3. **Clubs (item 4, Nick's request):**
   - players **ask** to join, and a club admin approves;
   - there's no "add member" button for admins.

   Screens to build:
   - create a club;
   - club page with members, and pending requests for admins;
   - ask to join, leave;
   - promote a member to admin;
   - post a game as the club;
   - on the Profile page, "my clubs" with leave.

   All of it is table calls on `club` and `club_representative`:

   | Action | Call |
   |---|---|
   | Ask to join | `insert({ club_id, player_id: me })` (starts pending) |
   | Approve | `update({ status: 'approved' })` |
   | Promote | `update({ role: 'admin' })` |
   | Leave or decline | `delete()` |
   | Deactivate the club | `from('club').update({ is_active: false })` |

   An inactive club shows as inactive on its old games (`organiser.isActive`).
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
7. **Reliability (item 14):** show the band ("Very reliable", "Reliable", "Sometimes unreliable", "Unreliable", "New player") next to every score. The counts behind it are on the profile.
8. **Email opt-out (item 15):** add a toggle in Notifications settings: `update_my_profile({ p_email_notifications })`.
9. **Admin (item 18, report filter):**
   - the admin console needs a report queue filtered by category;
   - and a list of venues the geocoder could not place (`venue_geocode_queue` with `status = failed`), so an admin can set the pin by hand.

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

## Backend ready, no screen yet

| Feature | Backend |
|---|---|
| Clubs (create, join, approve, promote, leave, deactivate) | Tables `club`, `club_representative` |
| Post a game as a club | `game_post.organiser_club_id`, `get_game_form_options().postAs` |
| Withdraw from a game | `withdraw_request` |
| Organiser cancels or deletes a game | `cancel_game_post`, `delete_game_post` |
| Mark and undo no-shows | `mark_no_show`, `clear_no_show` |
| Block with a reason, Blocked Users list, unblock | `block_player`, `get_blocked_players`, `unblock_player` |
| Report a player, post, club or league | `report_*` |
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
| "Request to Play" / "Request Game" (inviting a player directly) | No invitations story. Remove the buttons, or agree a story. |
| Dashboard league and recent activity | No functions yet |
| Notification types reminder, new game nearby, rating change | Not sent yet |
| Profile pictures | `profileImageUrl` is always null; no storage yet |
| Terms and privacy pages | The documents and their version labels (item 11) |
