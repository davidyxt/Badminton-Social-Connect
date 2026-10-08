# M1: Find Games

Players post games, find games and other players, ask to join, and the host
accepts or declines. Backend stories: BL-011, BL-013, BL-015, BL-017, BL-019.

Every call below goes through the Supabase client. The "screen" functions
return objects with the **same keys as the mock data** in the current pages, so
each page can swap its mock for the call. Tables keep snake_case; only these
function results are camelCase.

An account must have passed the 18+ age gate (see
[M4](M4-registration-and-sign-in.md)) before any of this returns data.

## Contents

- [Screens and the calls behind them](#screens-and-the-calls-behind-them)
- [Posting, editing, cancelling and deleting a game](#posting-editing-cancelling-and-deleting-a-game)
- [Joining a game](#joining-a-game)
- [What the screen functions return](#what-the-screen-functions-return)
- [Errors](#errors)
- [Not done yet](#not-done-yet)

## Screens and the calls behind them

| Screen | File | Call |
|---|---|---|
| Find Games, Matches tab | `FindGamesPage.jsx` | `supabase.rpc('search_games', { p_query, p_level, p_format, p_suburb, p_from, p_to, p_limit, p_offset })` |
| Find Games, Players tab | `FindGamesPage.jsx` | `supabase.rpc('search_players', { p_query, p_level, p_limit, p_offset })` |
| Game Details | `GameDetailsPage.jsx` | `supabase.rpc('get_game_details', { p_post_id })` |
| Request to Play button | `GameDetailsPage.jsx` | `supabase.rpc('request_to_join', { p_post_id, p_message })` |
| Play Request (host) | `PlayRequestPage.jsx` | `supabase.rpc('get_join_requests', { p_post_id })`, then `accept_request` / `decline_request` |
| Player Profile | `PlayerProfilePage.jsx` | `supabase.rpc('get_player_profile', { p_player_id })` |
| Post a Game | `PostGamePage.jsx` | `supabase.from('game_post').insert({...})` |
| Venue dropdown | `PostGamePage.jsx` | `supabase.rpc('search_venues', { p_query, p_state, p_limit })` as the player types |

All `search_*` filters are optional. `p_level` is `beginner`, `intermediate`
or `advanced`; games open to any level always match. `p_format` is `singles` or
`doubles` (doubles includes mixed doubles). Pages hold up to 50 results.

## Posting, editing, cancelling and deleting a game

Insert into `game_post`:

| Form field | Column | Notes |
|---|---|---|
| (you) | `organiser_id` | The signed-in player's id. For a group post, send `organiser_group_id` instead |
| Venue | `venue_id` | From the venue list. The suburb is filled in automatically. For "Other venue", leave it out and send `suburb` |
| Format | `format` | `singles`, `doubles`, `mixed_doubles` |
| Style | `style` | `social`, `competitive` |
| Date + start time | `proposed_time` | One timestamp with the Melbourne offset, e.g. `2026-10-10T18:00:00+11:00`. Must be in the future |
| Duration | `duration_minutes` | 15 to 240 |
| Ability level | `ability_level` | `any`, `beginner`, `intermediate`, `advanced` (the other self-rating bands also work) |
| Notes | `notes` | Up to 300 characters |
| Title | `title` | Optional, up to 80 characters. Cards show "Badminton game" when empty |
| Players | `player_limit` | 2 to 64, organiser included |

Edit with `update` on the same columns. Cancelling and deleting are functions:

| Action | Call | Rule |
|---|---|---|
| Cancel | `supabase.rpc('cancel_game_post', { p_post_id, p_reason })` | Not within 4 hours of the start. The game stays visible as cancelled; players are notified |
| Delete | `supabase.rpc('delete_game_post', { p_post_id })` | Only games that haven't happened, and not within 4 hours unless already cancelled. The game is hidden, not removed |

Disable both buttons inside the 4-hour cutoff and explain why (BL-014).

## Joining a game

| Who | Call |
|---|---|
| Player | `request_to_join({ p_post_id, p_message })`. The message is optional, up to 300 characters, and only the host sees it |
| Host | `accept_request({ p_post_id, p_player_id })` or `decline_request({ p_post_id, p_player_id })` |
| Player | `withdraw_request({ p_post_id })` |

- A player can ask again after withdrawing, but not after being declined.
- A full game still accepts requests; accepting one more fails.
- The first acceptance creates the match. For a singles game the host and the player are already on opposite sides, so Match Details can show the opponent.
- `get_game_details` returns `myStatus` (`pending`, `accepted`, `declined`, `withdrawn` or null) for the Request button, and `canManage` for showing host actions.

## What the screen functions return

**`search_games`**: an array of cards.

```json
{
  "id": "…", "title": "Friday Night Doubles", "format": "Doubles", "style": "Social",
  "rank": "Beginner", "date": "Fri, 2 Oct", "time": "7:00 PM – 8:30 PM",
  "startsAt": "…", "endsAt": "…",
  "location": "Melbourne Sports and Aquatic Centre, Albert Park", "suburb": "Albert Park",
  "playerCount": 2, "maxPlayers": 4, "status": "open", "imageUrl": null,
  "organiser": { "id": "…", "name": "alice", "initials": "AL", "isGroup": false },
  "myStatus": null
}
```

**`get_game_details`**: a card plus `duration` ("90 mins"), `durationMinutes`,
`location` (venue name), `locationDetail` (suburb), `address`, `notes`,
`abilityLevel`, `host` (`name`, `initials`, `rating`, `verifiedMatches`,
`reliability`; for a group, its name, `isActive` and `isVerified`), `players`
(`name`, `initials`, `host`), `canManage` and `matchId`. Null if the game is
deleted.

**`get_join_requests`**: one object per request, shaped like the Play Request
screen's `request`: `id`, `status`, `game` (a card), `host`, and `requester`
(`name`, `initials`, `level`, `preferredFormat`, `rating`, `verifiedMatches`,
`reliability`, `message`).

**`get_player_profile`**: `name`, `initials`, `level`, `status` (Provisional
until 10 verified games, then Established), `rating`, `wins`, `losses`,
`matches`, `reliability`, `recentForm` (last five, e.g. `["W","L"]`),
`preferredFormat`, `area`, `bio`, `league`, `isVerified`. **Null** when the
profile is hidden from the caller: show "This profile is private". Hosts can
always see players who asked to join their game.

**`search_players`**: `id`, `name`, `initials`, `rank`, `location`,
`reliability`. Only discoverable players, never the caller.

`name` is always the username. Real names, email and date of birth are never
returned.

## Errors

Errors carry a `message` written to be shown to the player, for example "Games
cannot be cancelled within 4 hours of the start time…". Useful `code` values:

| Code | Meaning |
|---|---|
| `23514` | A rule was broken: 4-hour cutoff, game full, game no longer open, start time in the past |
| `23505` | Already done: already asked to join, already cancelled |
| `42501` | Not allowed: not the organiser, not registered, game not found |

## Not done yet

- **Exact venue before acceptance (PHY-02):** the venue is shown to everyone, as the current screens do. BL-017 and the risk register want it hidden until a player is accepted. Waiting on a team decision.
- **Blocked players** are not yet left out of search (BL-027).
- **Rating and grade** (e.g. "B1") are null until the rating calculation exists (BL-024, Player BE-2).
- **Notifications** for new requests and acceptances come with BL-050. Cancelling and deleting already notify.
- **Withdrawal time windows** and their effect on reliability come with BL-054.
- **Distance** ("2.4 km" on Play Request) is not calculated.

## Team decisions applied (2026-10-08)

- **Venue shown as it is** (item 1): no change.
- **Untitled games are called "Badminton game"** (item 2), not "Singles game".
- **`get_game_form_options()`** answers "is there an API for the form's options?". It returns:
  - formats, styles and ability levels;
  - limits;
  - the default title;
  - who the player can post as (themselves, or a group they admin).
- **Maps links:** game cards, Game Details and the Home page's next game carry `mapsUrl`.
- **Venue search:** `search_venues(p_query, p_state, p_limit)` backs the venue dropdown.
  - It matches name, suburb, address or postcode, tolerates typos, and returns the best matches first (up to 50).
  - Trigram indexes on venue and suburb names keep it fast as the list grows.
  - Each row has a ready-made `label` and the `mapsUrl`.
- **Deleted organisers** show as "Deleted User" with `isDeleted: true`.
- Screen-by-screen wiring: [frontend-wiring-guide.md](../frontend-wiring-guide.md).

## Request Game (invitations), 2026-10-08

**Request Game** (player profile) and **Request to Play** (Find Games, Players tab) invite one player to a singles game. It is Post a Game for two, aimed at one player, who accepts or declines.

| Step | Call | Notification |
|---|---|---|
| The organiser invites | `supabase.rpc('invite_player', { p_player_id, p_proposed_time, p_venue_id \| p_suburb, p_duration_minutes, p_style, p_ability_level, p_title, p_notes, p_message })`, which returns the game id | `match_invite` to the invited player, with the message |
| The invited player accepts | `supabase.rpc('accept_invite', { p_post_id })`, which creates the match | `invite_accepted` to the organiser |
| The invited player declines | `supabase.rpc('decline_invite', { p_post_id })` | `invite_declined` to the organiser |
| The organiser cancels | `cancel_game_post`, as for any game | `game_cancelled` to the invited player |

Rules:

- **Who can see it:** the organiser, the invited player and admins. It is not in Find Games, and nobody else can open it or join it.
- **Who answers:** only the invited player, and only through these functions. The organiser cannot accept on their behalf.
- **Who can be invited:** not yourself, not someone either of you has blocked, not someone whose profile you can't see, and not a deleted or unregistered account.
- **Limit:** at most 10 invitations waiting for an answer at a time.
- **Reliability:** declining doesn't affect it. After accepting, leaving within 24 hours is a late withdrawal, as for any game.
- **Deciding:** the invited player can open the organiser's profile.
- **Blocking or deleting an account** closes any open invitation between the two players.

Game Details has `isInvite` and `invite` (the invited player's name and status, and the message). `myStatus` is `invited` while waiting for an answer.

Built in `20261008101100_request_game_invitations.sql`. Tested in `supabase/tests/api_test.py` ("Request Game").

## Find Games search bar, 2026-10-08

`search_games`' `p_query` takes one thing at a time:

- **a location:** suburb, venue name, address or postcode;
- **a day:** today, tonight, tomorrow, weekend, weekday, a day name;
- **a time:** morning, afternoon or evening, or a start time like `6pm` or `18:30`;
- **a date or month:** `10/10`, `oct`;
- **a level, format or style;**
- **words from the title.**

Times are Melbourne time. Level words also match games open to any level, as the level filter does. The `p_level` and `p_format` filters combine with it. Matching is done by `private.game_matches_search_word` (`20261008101300_find_games_one_search_bar.sql`). The test data now uses Melbourne clock times (6 pm, 7 pm), so time searches behave as you'd expect.

## Games and matches, 2026-10-08

A **game** (`game_post`, the session) holds several **matches**. A **match** is one contest between two sides: 1 v 1 for singles, 2 v 2 for doubles.

- **The host sets up matches:** `supabase.rpc('create_match', { p_post_id, p_side_a, p_side_b })`.
  - Every player must have an accepted place in the game, the side sizes must fit the format, and nobody can be on both sides.
  - The same players can play several matches (rounds).
  - The players are notified (`match_scheduled`).
- **The host removes a match:** `remove_match(p_match_id)`, until it has a confirmed result.
- **Game Details** lists `matches`: `number`, `sideA`, `sideB`, `status` and `result` for each. This replaces the single `matchId`.
- **Automatic matches:** only a 2-player singles game gets its match automatically (host against player, including Request Game invitations). Other games start with none.

Built in `20261008101700_games_hold_matches.sql`.

