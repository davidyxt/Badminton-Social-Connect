# Frontend wiring guide

How each screen connects to the backend, what the frontend has to change, and what is still missing on either side. Written for whoever wires the React app to Supabase.

This guide describes the player frontend and shared Player BE-2 0.4 backend, including M1–M6 work. Its screen adjustments refer to the inherited player app, not the separate Admin console. For the connected Admin app use [admin/README.md](../admin/README.md), [admin-api.md](admin-api.md) and [admin-local-integration.md](admin-local-integration.md).

- **Exact calls, parameters, responses and errors:** [the implemented API spec](badminton-social-connect-api_implemented-playerBE1.yaml) (open it in https://editor.swagger.io). It has only what's built, and every response has a real example. [The full spec](badminton-social-connect-api_v1.2.yaml) also lists the design's endpoints that are still Planned.
- **Historical Player BE-1 checks:** `python3 supabase/tests/api_test.py` writes an ignored report. It still attempts direct result/dispute inserts removed by 0.4, so it does not prove that every current call passes. See [API changes](api-changes-0.4.0.md) and [M2 checks](features/M2-results-and-rankings.md).

## Contents

- [Start here](#start-here)
- [Getting started](#getting-started)
- [How to call the backend](#how-to-call-the-backend)
- [Screen by screen](#screen-by-screen)
- [Changes the frontend must make](#changes-the-frontend-must-make)
- [Backend ready, no screen implementation yet](#backend-ready-no-screen-implementation-yet)
- [Screens with no backend yet](#screens-with-no-backend-yet)

## Start here

A short version for whoever, or whatever AI assistant, picks this up.

**Scope.** Wire the existing React pages to the Supabase backend, and build the few new screens listed below.

- **In scope:** sign-in and registration are already wired. Everything else in [Screen by screen](#screen-by-screen) is to do.
- **Out of scope:** mini leagues are not built yet; leave those pages on their sample data. Results and rankings now have a backend: see [features/M2-results-and-rankings.md](./features/M2-results-and-rankings.md).

**Sources of truth.**

- **This guide:** what each screen calls and what to change on it.
- **[The implemented API spec](badminton-social-connect-api_implemented-playerBE1.yaml):** the exact parameters, response fields and errors, with a real example for every call. When the guide and the spec disagree, the spec is right: it's generated from the running backend.
- **The test accounts** in [Getting started](#getting-started): every screen should work when signed in as them.

**Conventions.**

- **Clients and helpers:**
  - always use the shared client in [`services/supabase.js`](../frontend/src/services/supabase.js). Never create a second client or call the API with `fetch`; the shared client adds the signed-in player's token to every call;
  - call functions through `rpc()` in [`services/api.js`](../frontend/src/services/api.js), and tables through `unwrap(supabase.from(...))`. Both throw an `ApiError` whose `message` can be shown to the player.
- **Service files:** keep calls in `frontend/src/services/`, not in pages:
  - `playerService.js`: profiles, players, blocking, reports;
  - `gameService.js`: games, requests, invitations, venues;
  - new files where it helps, e.g. `groupService.js`, `notificationService.js`.

  Replace `gameService.js`'s fake `createGame`.
- **Loading the session:** load data only after `useAuth().loading` is false. App pages stay behind `ProtectedRoute`.
- **Names:**
  - API fields are camelCase (`startsAt`, `profileImageUrl`);
  - table columns are snake_case (`proposed_time`);
  - function parameters start with `p_`.

**Order of work.** Each step should work against the test accounts before the next:

1. **Setup:** local stack and frontend env file. See [SETUP.md](SETUP.md#5-frontend-env) (`frontend/.env.development.local`, values from `npx supabase status`).
2. **Read-only screens:** Home (next games), Find Games (both tabs, search bar and filters), Game Details, another player's profile, your own Profile, Notifications.
3. **Actions:**
   - request to join, withdraw;
   - the host's accept, decline, cancel, delete and no-shows;
   - Post a Game, with the venue search and title;
   - Request Game invitations;
   - block, report.
4. **New screens:**
   - My games;
   - profile editing (availability, picture);
   - Blocked Users;
   - groups;
   - Delete account.
5. **Live notification badge** (Realtime).

**Done means:** each screen shows real data for the test accounts, every button calls the backend and shows its error `message` when refused, and nothing on the page is sample data any more.

## Getting started

```bash
# Use the integrated checkout containing all 50 migrations.
npx supabase start
npx supabase db reset        # every migration + the dev seed
cd frontend && npm install && npm run dev
```

Sign in as any of these test accounts. Each one's password is `Passw0rd!`.

| Account | Use it to see |
|---|---|
| `alice@example.com` | An organiser with requests to answer, upcoming games for the Home card and My games, a group she admins (Smash Group), a league and availability set. Alice blocked Frank. |
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

The age gate now saves the username together with the date of birth: `registerPlayer({ dateOfBirth, stateCode, username })` in `services/playerService.js`, which calls `rpc('register_player', { p_date_of_birth, p_age_declared, p_terms_version, p_privacy_version, p_state, p_username })`.

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
| `upcomingMatch` | `nextGames`: the next 3 confirmed games (hosting or playing), as game cards with `myRole`; `[]` means "No game planned" |
| (avatar) | `profileImageUrl` (null: show the initials) |
| `league`, `recentActivity` | Nothing yet |

`registered: false` means the player has to go to `/complete-registration`.

Admin announcements for the home page come from `from('admin_post').select('title,body,image_url').order('display_order')`. Players get the published ones only.

#### Next games and My games

The Home page shows the player's **next 3 games**, and links to a full **My games** list. Both come from the same list, so they always agree.

| | Call | What it returns |
|---|---|---|
| **Next games** (Home card) | `get_my_home().nextGames` | The next 3 **confirmed** upcoming games: ones the player hosts (themselves or as a group admin) or is accepted into. `[]` means "No game planned" |
| **My games** (full list) | `rpc('get_my_games', { p_filter, p_when, p_include_pending, p_limit, p_offset })` | Every game the player hosts or plays in |

`get_my_games` parameters:

| Parameter | Values |
|---|---|
| `p_filter` | `all` (default) or `organised` (games I host, including my groups' games) |
| `p_when` | `upcoming` (default, soonest first) or `past` (latest first; cancelled games left out) |
| `p_include_pending` | `true` (default) also lists games I asked to join or was invited to (`myStatus` pending or invited); `false` shows confirmed games only, which is what `nextGames` uses |
| `p_limit` / `p_offset` | Pages, up to 50 |

Each game in both is a game card (the same fields as Find Games), plus:

- `myRole`: `host` or `player`;
- `myStatus`: `accepted`, `pending` or `invited` (on My games), or null for a game hosted by a group I admin.

For example, one entry of `nextGames`:

```json
{
  "id": "00000000-0000-0000-0000-00000000b001",
  "title": "Friday Night Doubles",
  "date": "Sat, 10 Oct",
  "time": "6:00 PM – 7:30 PM",
  "location": "Melbourne Sports and Aquatic Centre@ MSAC, Albert Park",
  "venue": "Melbourne Sports and Aquatic Centre@ MSAC",
  "mapsUrl": "https://www.google.com/maps/search/?api=1&query=…",
  "format": "Doubles",
  "playerCount": 3,
  "maxPlayers": 4,
  "host": { "id": "…", "name": "alice", "initials": "AL", "profileImageUrl": null, "isGroup": false },
  "myRole": "host",
  "myStatus": "accepted"
}
```

**Frontend adjustments**

- Replace the `dashboardData` sample with `get_my_home`.
- Show the player's picture from `profileImageUrl`, or the initials when it's null.
- **Next games card:** it's only a placeholder comment today (`upcomingMatch` in `DashboardPage`). Build it:
  - show up to 3 games from `nextGames`, each with title, date, time, location, a "Hosting" tag when `myRole` is `host`, and an "Open in Maps" link from `mapsUrl`;
  - tapping a game opens Game Details by its `id`;
  - when `nextGames` is `[]`, keep today's "No game planned" card with its Find a Match / Post a Game buttons.
- **See all** on that card opens a new **My games** screen:
  - tabs **All games** / **Organised by me** (`p_filter`), and **Upcoming** / **Past** (`p_when`);
  - label pending requests and invitations from `myStatus`;
  - also reachable from the Profile menu.

### Find Games, Matches tab (`FindGamesPage`) ✅

Call `rpc('search_games', { p_query, p_level, p_format, p_suburb, p_from, p_to, p_limit, p_offset })`.

Each card has the same keys as the sample `games` array: `id`, `title`, `format`, `style`, `rank`, `date`, `time`, `location`, `playerCount`, `maxPlayers` and `imageUrl`. It also has:

- `mapsUrl`
- `host` (who runs the game, a player or a group), with `isGroup`, `isBlocked` and `isDeleted`. The pages already read `game.host`
- `venue` (the venue's name) and `duration` ("90 mins") / `durationMinutes`
- `myStatus`

**The search bar** (`p_query`) takes one thing at a time. Times are Melbourne time, as on the cards.

| Search for | Examples |
|---|---|
| A location: suburb, venue, address or postcode | `carlton`, `albert park`, `msac`, `3206` |
| A day | `today`, `tonight`, `tomorrow`, `weekend`, `weekday`, `saturday`, `sat` |
| A time of day or start time | `morning`, `afternoon`, `evening`, `6pm`, `6:30 pm`, `18:30` |
| A date or month | `10/10`, `10/10/2026`, `10` (day of the month), `oct` |
| A level | `beginner`, `intermediate`, `advanced`; games open to any level match too |
| A format or style | `doubles`, `singles`, `competitive`, `social` (or `friendly`) |
| The title | any part of it |

Combinations such as "msac saturday 6pm" aren't supported; the input is matched as one search.

**The filters** combine with the search bar:

- **Level dropdown:** `rankFilter` values `beginner | intermediate | advanced` go in `p_level`. Games open to any level always match.
- **Format dropdown:** `formatFilter` `singles | doubles` goes in `p_format`. Doubles includes mixed doubles.
- Send `null` for "All".

Changes from the sample data:

- **Style:** the backend says "Social", the sample says "Friendly". Use "Social".

**Frontend adjustments**

- Replace the sample `games` array with `search_games`. Pass the search box as `p_query` and the dropdowns as `p_level` / `p_format`, rather than filtering in the browser. Debounce typing (about 250 ms).
- Update the search placeholder to say what works, e.g. "Search suburb, venue, day, time or level".
- Change the "Friendly" label and filter value to **"Social"** (2).
- **Request to Play** on a game card must call `rpc('request_to_join', { p_post_id: game.id })` and only go to the request-confirmation page if it succeeds. Today it navigates without sending anything ([FindGamesPage.jsx:439](../frontend/src/pages/FindGamesPage.jsx#L439)). Show the error `message` if it's refused.
- Show a **Blocked** badge on the host when `host.isBlocked` is true (6).
- When `host.isDeleted` is true, show "Deleted User" with no link (4).
- When `host.isGroup` is true, the host is a group. If `host.isActive` is false, mark it inactive (3).
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
- **Matches:** `matches[]` contains the caller's recorded matches, created by `submit_result`; `canRecordResult` drives the result button. See M2.

`null` means the game is gone or hidden from this player; show "This game is not available".

Buttons:

| Button | Call |
|---|---|
| Request to join | `rpc('request_to_join', { p_post_id, p_message })` |
| Withdraw | `rpc('withdraw_request', { p_post_id })` |
| Invited player: accept / decline | `rpc('accept_invite' \| 'decline_invite', { p_post_id })` |
| Host: cancel game | `rpc('cancel_game_post', { p_post_id, p_reason })` |
| Host: delete game | `rpc('delete_game_post', { p_post_id })` |
| Host: mark a player as a no-show / undo | `rpc('mark_no_show' \| 'clear_no_show', { p_post_id, p_player_id })` |

**The host's actions live on this page:** cancelling, deleting and marking no-shows all work on the game.

`hostActions` says what the host can do right now. It's `null` for everyone else.

| Field | Meaning |
|---|---|
| `canCancel` | Show **Cancel game**: true until 4 hours before the start |
| `cancelClosesAt` | When cancelling stops (start − 4 hours) |
| `cancelIsLateFrom` | From this time (start − 24 hours), cancelling counts against the host's reliability: warn before confirming |
| `canDelete` | Show **Delete game**: nobody else has asked to join, been invited or been accepted; the game hasn't happened; and either it's cancelled or the start is more than 4 hours away. Once anyone has asked to join, the host cancels instead |
| `canMarkNoShows` | Show **No-show** next to each player: from the start until 48 hours after the end |
| `noShowsOpenAt` / `noShowsCloseAt` | When that window opens and closes, e.g. "You can mark no-shows until Mon 6:00 PM" |

For the host, `players` also lists players already marked absent, with `noShow: true`, so the mark can be undone. Other players don't see them. If a call is refused anyway (the times passed while the page was open), show the error `message`.

**Frontend adjustments**

- Load the game with `get_game_details(gameId)`, not from `location.state`, so links and refreshes work. If it returns `null`, show "This game is not available".
- Add an **"Open in Maps"** link on the venue from `mapsUrl`.
- The **Request to Play** button must call `rpc('request_to_join', { p_post_id })` before going to the request-confirmation page. Today it only navigates ([GameDetailsPage.jsx:518](../frontend/src/pages/GameDetailsPage.jsx#L518)).
- Drive the main button from `myStatus`:

  | `myStatus` | Button |
  |---|---|
  | null | Request to join |
  | pending | Withdraw request |
  | accepted | Leave game, with the late-withdrawal warning within 24 hours |
  | invited | **Accept** and **Decline**, with the organiser's `invite.message` (10) |
  | declined | Nothing; the player can't ask again |

- When `canManage` is true, show the host's actions instead of the player's button. Drive them from `hostActions`:
  - **View requests** (opens `PlayRequestPage`). For an invitation (`isInvite`), show "Invited: {invite.name} ({invite.status})" instead (10);
  - **Cancel game**, with an optional reason, while `canCancel` is true. After `cancelIsLateFrom`, warn that a late cancellation lowers their reliability;
  - **Delete game** while `canDelete` is true. Once players have asked to join it's false: offer **Cancel game** instead. If deleting is refused anyway, show the error `message` ("Players have asked to join this game, so it can't be deleted. Cancel it instead.");
  - while `canMarkNoShows` is true, a **No-show** toggle on each player except the host. It calls `mark_no_show`, or `clear_no_show` when `noShow` is true; show absent players greyed with "No-show". Outside the window, hide the toggles and show when it opens or closed (`noShowsOpenAt` / `noShowsCloseAt`).
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

The confirmation page shows the form's own fields (`date`, `startTime`, `durationMinutes`, `venue`, lowercase `format`/`style`), not the database row. `PostGamePage` already passes `{ ...formData, id }` to it. Once the venue is a `search_venues` dropdown, keep the chosen venue's **name** (or `label`) in the form data as `venue`, and its id separately for `venue_id`.

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
- The card in each request has what the page shows: `game.venue` (venue name), `game.duration` ("90 mins"), `game.date`, `game.time` and `game.location`. The sample's `venueDetail` distance ("2.4 km") has no backend; drop it, or show `game.suburb`.
- After accepting or declining, reload the list. Show the error `message` when the game is full.

### Another player's profile (`PlayerProfilePage`) ✅

Call `rpc('get_player_profile', { p_player_id })`. It has the same keys as `fallbackPlayer`, plus:

- `isBlocked`
- `gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations`
- `profileImageUrl` (null: show the initials)
- `availability` (e.g. `["mon_evening", "sat_morning"]`) and `availabilityNote`

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
- Show the picture from `profileImageUrl` in place of the "JK" initials circle (13).
- Add an **Availability** row ("Usually plays: Mon evening, Sat morning", plus the note) under "Usually plays near" (12).

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
| Your Profile, Playing Preferences | `rpc('update_my_profile', {...})`: username, first and last name, level, bio, suburb, state, preferred format, **availability** (`p_availability`, e.g. `['mon_evening','sat_morning']`; days `mon`–`sun` × `morning`, `afternoon`, `evening`) and an availability note (`p_availability_note`) |
| Profile picture (in Your Profile) | Upload to Storage, then `rpc('set_my_profile_picture', { p_url })`; remove with `rpc('remove_my_profile_picture')`. See [Profile picture](#profile-picture) |
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
  - **Your Profile** and **Playing Preferences**: an edit form calling `update_my_profile` with only the changed fields. Availability is a grid of the 7 days × morning, afternoon and evening, plus an optional note;
  - **profile picture** on Your Profile: choose, upload, change, remove (see below);
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

#### Profile picture

Pictures are stored in the public `avatars` bucket in Supabase Storage. Setup and checks are in [DEPLOYMENT.md](DEPLOYMENT.md#9-storage-for-profile-pictures).

```js
// Upload into the player's own folder (any other folder is refused).
const path = `${user.id}/${crypto.randomUUID()}.jpg`;
await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

// Save it, then delete the picture it replaces.
const { data } = await supabase.rpc('set_my_profile_picture', { p_url: publicUrl });
if (data.previousPath) await supabase.storage.from('avatars').remove([data.previousPath]);

// Remove the picture.
const { data: removed } = await supabase.rpc('remove_my_profile_picture');
if (removed.previousPath) await supabase.storage.from('avatars').remove([removed.previousPath]);
```

- **Limits:** JPEG, PNG or WebP, up to 2 MB. Resize to about 512 × 512 before uploading.
- **Where it shows:** every screen gets it as `profileImageUrl`, with initials when it's null: profiles, Home, game hosts and players, join requests, player search, Blocked Users.
- **Before `delete_my_account`:** remove the player's files (`list` their folder, then `remove`). The database can't delete storage files.

### Notifications (`NotificationsPage`) ✅

Call `rpc('get_notifications', { p_limit, p_offset })`. It returns `id`, `type`, `title`, `message`, `unread`, `createdAt`, `postId` and `matchId`.

- **Tap target:** result notices open Match Details using `matchId`; game/join/invitation notices use `/games/:postId`. The sample's `target` field does not exist.
- **Time:** format "2 min ago" from `createdAt`.
- **Mark all read:** `rpc('mark_all_notifications_read')`.
- **Mark one read:** `from('notification').update({ is_read: true }).eq('notification_id', id)`.

| Sample `type` | Backend `type` |
|---|---|
| request | `join_request`, `request_accepted`, `request_declined`, `request_withdrawn` |
| invitation (new) | `match_invite` (to the invited player; open the game to accept or decline), `invite_accepted`, `invite_declined` (to the organiser) |
| cancelled | `game_cancelled`, `game_removed` |
| result | `result_submitted`, `result_confirmed`, `dispute_update`, `result_expired` |
| league | `league_update` |
| other | `no_show`, `system` |
| reminder, game, rating | Not sent yet |

**Frontend adjustments**

- Replace `initialNotifications` with `get_notifications`.
- Map the backend `type` values to the existing icons using the table above.
- Build result links from `matchId` and game links from `postId`; there is no `target` field.
- Wire **Mark all as read**.
- Update the unread badge in the top bar from `unreadNotifications` (in `get_my_home` and `get_my_profile`), or live over Realtime.

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

### Rankings, Match Details and results: backend ready (M2)

The backend for results and rankings is ready; Mini Leagues are not. The calls, shapes and rules are in [features/M2-results-and-rankings.md](./features/M2-results-and-rankings.md).

| Screen | Call |
|---|---|
| Record Result (`RecordResultPage`) | `submit_result({ p_post_id, p_opponent_ids, p_partner_id, p_games })`. Show the button when `get_game_details().canRecordResult` |
| Result Submitted (`ResultSubmittedPage`) | `get_match({ p_match_id })` with the `matchId` from `submit_result` |
| Match Details (`MatchDetailsPage`) | `get_match`; Confirm and Dispute buttons from `result.canConfirm` / `result.canDispute`, calling `confirm_result` / `raise_dispute`. Quick messages: `match_message_template`, `match_message`, `get_match_messages` |
| Result Confirmed (`ResultConfirmedPage`) | The match returned by `confirm_result`. While `result.ratingPending` is true, say "Your rating updates overnight" instead of a rating change |
| Rankings (`RankingsPage`) | `get_rating_summary`, `get_rating_trend`, `get_leaderboard({ p_scope: 'state' \| 'nearby' })`. Show "Updated <date>" from `ratingsUpdatedAt`. No League tab yet |
| Pending results (Home or Notifications) | `get_my_pending_results` |

## Changes the frontend must make

1. **Username on sign-up.** Done on this branch. Usernames are never made up any more:
   - an email sign-up without one fails;
   - Google players choose theirs on `/complete-registration`.
2. **Post a Game:**
   - add a **title** field;
   - use "Social", not "Friendly";
   - make the venue a searchable dropdown backed by `search_venues`, and send its `venue_id`;
   - "Other" needs a suburb;
   - add "post as me / as a group" (`postAs`).
3. **Groups (requested by Nick):**
   - players **ask** to join, and a group admin approves;

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

   An inactive group shows as inactive on its old games (`host.isActive`).
4. **Deleted accounts:** deleted players appear as **"Deleted User"**, with `isDeleted: true` on hosts and rosters.
   - Don't link to their profile; `get_player_profile` returns null.
   - Add a "Delete account" option with a clear warning.
5. **Reports:** a reason is required for **every** report. Use the category picker from the table below.
6. **Blocking :**
   - Ask for an optional category (same list as reports) and reason: `rpc('block_player', { p_player_id, p_category, p_reason })`.
   - Show a **Blocked** badge wherever `isBlocked` is true: player search, profile, Game Details host and players, Find Games host.
   - The blocker can still open the blocked player's profile, so show the badge and an **Unblock** button there.
   - Add a **Blocked Users** page from `get_blocked_players` (shows category and reason).
   - Rankings will stay visible both ways, without a picture or click-through, when the leaderboard is built.
7. **Reliability:** keep the screens as they are: reliability is a percentage ("96% reliable"). There is no band. The counts behind the score (`gamesPlayed`, `noShows`, `lateWithdrawals`, `lateCancellations`) are on the profile.
8. **Email opt-out:** add a toggle in Notifications settings: `update_my_profile({ p_email_notifications })`.
9. **Admin :**
   - the admin console needs a report queue filtered by category;
10. **Request Game / Request to Play.** These buttons invite one player to a singles game. The invited player accepts or declines, and both sides are notified.
    - Post a Game gets an [invite mode](#request-game-invite-mode) that calls `invite_player`.
    - Game Details shows **Accept / Decline** when `myStatus` is `invited`.
    - Notifications get an invitation icon for `match_invite`, `invite_accepted` and `invite_declined`.
11. **Next games and My games.** Home shows the next 3 games from `get_my_home().nextGames`, with **See all** opening a new My games screen (`get_my_games`, tabs All / Organised by me, Upcoming / Past). See [Next games and My games](#next-games-and-my-games).
12. **Availability.** The player can say when they usually play: a grid of the 7 days × morning, afternoon and evening, plus a note (`update_my_profile`'s `p_availability`, `p_availability_note`). It's shown on both profiles.
13. **Profile pictures.** Upload, change and remove on Your Profile, through Supabase Storage. Show `profileImageUrl` wherever a player's initials circle appears today. See [Profile picture](#profile-picture).
14. **Find Games search bar** takes a location, a day, a time or a level ("msac", "saturday", "6pm", "intermediate"); the level and format dropdowns combine with it.
15. **Deleting a game** is only possible while nobody else has asked to join, been invited or been accepted. After that, the host cancels it.

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
| Next games on Home, My games list | `get_my_home().nextGames`, `get_my_games` |
| Availability | `update_my_profile` (`p_availability`, `p_availability_note`); read on both profiles |
| Profile pictures | Storage bucket `avatars`, `set_my_profile_picture`, `remove_my_profile_picture` |
| Venue search for the Post a Game dropdown | `search_venues` |
| Withdraw from a game | `withdraw_request` |
| Organiser cancels or deletes a game | `cancel_game_post`, `delete_game_post` |
| Mark and undo no-shows | `mark_no_show`, `clear_no_show` |
| Block with a reason, Blocked Users list, unblock | `block_player`, `get_blocked_players`, `unblock_player` |
| Report a player, post, group or league | `report_*` |
| Edit profile, preferred format, availability, privacy, email opt-out | `update_my_profile` |
| Playing history | `get_player_history` |
| Delete account | `delete_my_account` |
| Live notifications | Realtime on `notification` |
| Venue Maps links | `mapsUrl` on cards, details and venues |
| Upstream admin SQL: delete a played game | `admin_game_post_deletion_impact`, `admin_delete_game_post`; intentionally blocked by the Final v6 Admin Edge API |
| Results waiting on me (a Home card or a list) | `get_my_pending_results` |
| Verification badge on results (BL-057) | `verificationStatus` on `get_match` and `get_player_history` |
| Quick messages on Match Details | `match_message_template`, `match_message`, `get_match_messages`, Realtime `match:{matchId}:messages` |
| Upstream admin SQL: replay ratings | `admin_rebuild_ratings`; intentionally blocked by the Final v6 Admin Edge API |

## Screens with no backend yet

These are outside the BE-1 stories, or need a team decision first.

| Screen or button | What's missing |
|---|---|
| Rankings League tab | Waits for Mini Leagues |
| Mini Leagues, Create League, League Details | League screens and functions. The `mini_league` table lacks format, style, rounds, skill level, venue, max players and description. |
| Dashboard league and recent activity | No functions yet |
| Notification types reminder, new game nearby, rating change | Not sent yet. Result notifications (`result_submitted`, `result_confirmed`, `dispute_update`, `result_expired`) are sent |
| Resolving disputes, reviewing result flags | No complete decision workflow. The Final v6 Admin console reads disputes/flags; it does not resolve disputed results. |
| Terms and privacy pages | The documents and their version labels |
