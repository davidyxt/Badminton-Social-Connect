# M2: Results and rankings

Recording a result, confirming or disputing it, ratings, leaderboards and match
quick messages. Backend stories: BL-003 (schema gaps), BL-021, BL-023, BL-024,
BL-025, BL-056, BL-058, BL-062, BL-085.

## Contents

- [How a result moves](#how-a-result-moves)
- [Recording a result (BL-021, BL-023)](#recording-a-result-bl-021-bl-023)
- [Confirming, disputing, expiry (BL-021, BL-058, BL-056)](#confirming-disputing-expiry-bl-021-bl-058-bl-056)
- [Reading matches](#reading-matches)
- [Ratings (BL-024, BL-062)](#ratings-bl-024-bl-062)
- [Rankings screen (BL-025)](#rankings-screen-bl-025)
- [Quick messages (BL-085)](#quick-messages-bl-085)
- [Checks for admins (BL-023, BL-056)](#checks-for-admins-bl-023-bl-056)
- [Not done yet](#not-done-yet)

## How a result moves

```
submit_result ----> pending --confirm_result--> confirmed --nightly run--> rated
                       |                            |
                       |--raise_dispute--> disputed (held until an admin decides)
                       |
                       '--7 days, nobody acts--> expired (never counts)
```

Players never write `match`, `match_participant`, `match_result` or `dispute`
directly. Every change goes through the functions below.

| Event | Who is told | `type` |
|---|---|---|
| A result is submitted | The other side | `result_submitted` |
| The other side confirms | The submitter | `result_confirmed` |
| The other side disputes | The submitter | `dispute_update` |
| Nobody confirms within 7 days | The submitter | `result_expired` |

All four carry `postId` and `matchId`, so a tap opens Match Details.

## Recording a result (BL-021, BL-023)

Record Result screen:

```js
const { data, error } = await supabase.rpc('submit_result', {
  p_post_id: gameId,
  p_opponent_ids: [opponentId],          // doubles: both opponents
  p_partner_id: null,                    // doubles: your partner
  p_games: [[21, 15], [19, 21], [21, 16]] // your points first, every game
})
// data: { matchId, resultId, status: 'pending' }
```

The match is created in the same call, with the game's format and start time.
The server works out the winner, so the client never sends one. The rules,
all checked on the server:

| Rule | Error `message` (code `23514` unless noted) |
|---|---|
| The game went ahead and has started | "Results can only be recorded for a game that went ahead." / "This game has not started yet." |
| Everyone, including you, is accepted in the game | "Everyone in the match must be an accepted player in this game, including you." |
| Singles is 1 v 1; doubles needs a partner and 2 opponents | A message naming what is missing |
| Nobody appears twice | "A player cannot appear twice in a match." |
| 2 or 3 games, to 21, win by 2, capped at 30, a third game only at one all | "Game 2 (21 to 20) is not a legal score: ..." and similar |
| The same two sides are recorded once per game (an expired result frees the pairing) | "A result for these players has already been recorded in this game." |

Show the `message` as it comes. `get_game_details` returns `canRecordResult`
to decide whether to show the Record Result button.

## Confirming, disputing, expiry (BL-021, BL-058, BL-056)

Only a player on the **other** side can act on a pending result. The
submitter and their partner cannot.

| Action | Call | Returns |
|---|---|---|
| Confirm | `supabase.rpc('confirm_result', { p_result_id })` | The match, shaped as `get_match` |
| Dispute | `supabase.rpc('raise_dispute', { p_result_id, p_reason })` | The match. A reason is required (up to 1000 characters) |

The match's `result.canConfirm` and `result.canDispute` say whether to show the
buttons. A pending result shows `result.expiresAt`: after 7 days an hourly job
marks it `expired`, it never counts, and the same players can record the match
again.

A disputed result is held: it never changes a rating. Resolving a dispute is
left to the admin lane. Until then the result stays `disputed` and both sides
see the reason in `result.dispute`.

## Reading matches

| Screen | Call |
|---|---|
| Match Details, Result Submitted, Result Confirmed | `supabase.rpc('get_match', { p_match_id })` |
| Results waiting on me, and mine waiting on others | `supabase.rpc('get_my_pending_results')` returns `{ toConfirm: [match], waiting: [match] }` |
| Matches within a game | `get_game_details(...).matches`, each shaped as `get_match` |
| Playing history | `get_player_history` now has `ratingChange` and `verificationStatus` on each match |

`get_match` returns null unless you played in the match (or are an admin):

```json
{
  "matchId": "...", "gameId": "...", "format": "Singles", "formatValue": "singles",
  "playedAt": "2026-09-28T08:00:00+00:00", "location": "Melbourne Sports and Aquatic Centre",
  "mySide": "a",
  "sides": {
    "a": [{ "id": "...", "name": "alice", "initials": "AL", "profileImageUrl": null,
            "isMe": true, "isBlocked": false, "isDeleted": false, "noShow": false }],
    "b": [{ "id": "...", "name": "carol", "initials": "CA", "...": "..." }]
  },
  "result": {
    "id": "...", "status": "confirmed", "verificationStatus": "verified",
    "score": "21-15 21-17", "games": [[21, 15], [21, 17]],
    "winningSide": "a", "iWon": true,
    "submittedBy": { "id": "...", "name": "alice", "initials": "AL" },
    "submittedAt": "...", "confirmedAt": "...", "expiresAt": null,
    "canConfirm": false, "canDispute": false, "dispute": null,
    "ratingChange": { "before": 1635, "after": 1647, "change": 12 },
    "ratingPending": false
  }
}
```

- `games` and `score` are always side `a` first. Use `mySide` to show "your"
  score first.
- `verificationStatus` (BL-056, for the BL-057 badge): `pending`, `verified`,
  `under_review` (confirmed, but flagged for an admin), `disputed`, `expired`
  or `rejected`.
- `ratingChange` is null for doubles, and for singles until the nightly run.
  While `ratingPending` is true, the Result Confirmed screen should say
  "Your rating updates overnight".

## Ratings (BL-024, BL-062)

The rating is the Bayesian score rating in the Ranking Algorithm reports
(7 October 2026). In short:

- **Singles only.** Doubles and mixed doubles results are recorded and
  confirmed but never rated.
- **Overnight.** A pg_cron job (`rate-confirmed-results`, 2 am Melbourne) rates
  every confirmed singles result not rated yet, in the order they were
  confirmed. Nothing changes at the moment of confirming. Every rating screen
  returns `ratingsUpdatedAt`, the time of the last run, for "Updated 12 Oct".
- **The score matters**, not just the win: 21-5 21-6 moves ratings more than
  22-20 21-19. Players linked through past matches shift a little too.
- **Starting rating (BL-062)** comes from the self-rating band asked at sign-up:

  | Band | Start |
  |---|---|
  | Beginner | 1100 |
  | Lower intermediate | 1300 |
  | Intermediate | 1500 |
  | Upper intermediate | 1700 |
  | Advanced | 1900 |

  Every player starts with RD 350 (very uncertain). The RD falls as they play.
- **Provisional, then Established.** A player is established after 10 rated
  singles matches against at least 5 different opponents, with RD 160 or less.
  Until then they have no grade and no leaderboard place, and their card shows
  placement progress. Once established, they stay established.
- **Grades** (A1 best to C5) come from the rating: C5 below 980, then 80-point
  steps, A1 from 2020.
- **Taking a result away** (an admin rejects it, or deletes its game) replays
  every rating the next night, as if that result had never counted.

The Home and Profile rating card (`ratingCard` in `get_my_home` and
`get_my_profile`) now fills `grade`, `ratingChangeThisMonth`, `stateRank`,
`status`, `placement` and `ratingsUpdatedAt`.

Locally, run the nightly step straight away with
`select private.rate_new_results();` in Studio's SQL editor. Admins can replay
everything with `supabase.rpc('admin_rebuild_ratings')`.

## Rankings screen (BL-025)

| Part | Call |
|---|---|
| Rating card | `supabase.rpc('get_rating_summary')`, or `{ p_player_id }` for someone else |
| 30-day trend chart | `supabase.rpc('get_rating_trend', { p_days: 30 })` |
| State tab | `supabase.rpc('get_leaderboard', { p_scope: 'state', p_limit: 50, p_offset: 0 })` |
| Nearby tab | `supabase.rpc('get_leaderboard', { p_scope: 'nearby' })` (your suburb) |

`get_rating_summary`:

```json
{
  "playerId": "...", "rating": 1618, "isStartingRating": false, "rd": 115,
  "grade": "B2", "status": "Established",
  "placement": { "played": 22, "required": 10, "opponents": 16, "opponentsRequired": 5 },
  "state": "VIC", "suburb": "Carlton",
  "stateRank": 11, "stateTotal": 34, "nearbyRank": 1, "nearbyTotal": 7,
  "change30Days": 22,
  "ratingsUpdatedAt": "2026-10-12T15:00:00+00:00"
}
```

Before a player's first rated match, `rating` is their starting rating and
`isStartingRating` is true. `grade` and the ranks are null while provisional:
show "Placement in progress, 4 of 10" from `placement`.

`get_rating_trend` returns `{ days, points: [{ date, rating }] }`: one point per
day (Melbourne time) from the player's first rated match.

`get_leaderboard`:

```json
{
  "scope": "state", "state": "VIC", "suburb": null, "total": 34,
  "entries": [
    { "rank": 1, "id": "...", "name": "rally_04", "initials": "RA", "rating": 1874,
      "grade": "A3", "suburb": "Richmond", "isMe": false, "isBlocked": false,
      "blockRelation": null, "profileImageUrl": null }
  ],
  "me": { "rank": 11, "name": "alice", "...": "..." },
  "ratingsUpdatedAt": "..."
}
```

- Established players only, highest first. Exact ties share a rank.
- `me` is your own row even when it is off the page; null while provisional.
- Hidden profiles (`is_discoverable` false) are left off, except for their
  owner.
- When `blockRelation` is set, hide the picture and make the row unclickable
  (BL-027).
- There is no League tab yet (Mini Leagues).

## Quick messages (BL-085)

Preset messages between the players of a match, such as "On my way" and
"Good game!". There is no free text.

| Action | Call |
|---|---|
| The buttons to offer | `supabase.from('match_message_template').select('template_code, label').order('sort_order')` |
| Send | `supabase.from('match_message').insert({ match_id, sender_id: user.id, template_code })` |
| History | `supabase.rpc('get_match_messages', { p_match_id })`, oldest first |
| Live | Private Realtime channel `match:{matchId}:messages`, event `message` |

Templates: `on_my_way`, `running_late_5`, `running_late_15`, `arrived`,
`court_booked`, `cant_make_it`, `good_game`. A player may send 20 messages per
10 minutes.

```js
const channel = supabase
  .channel(`match:${matchId}:messages`, { config: { private: true } })
  .on('broadcast', { event: 'message' }, ({ payload }) => { /* add to the list */ })
  .subscribe()
```

Each message has `id`, `senderId`, `senderName`, `templateCode`, `label` and
`createdAt`. `get_match_messages` adds `isMe`; a message on the channel has
`matchId` instead, so compare `senderId` with your own id.

A match only exists once a result is recorded, so quick messages can only be
sent after that (see Not done yet).

## Checks for admins (BL-023, BL-056)

Unusual results are logged in `result_flag` for an admin to review. A flag
never blocks anything, and a flagged result still counts.

| `kind` | When |
|---|---|
| `repeat_pairing` | The same players have 3 or more results within 7 days |
| `unusual_win_pattern` | One player won 8 or more of the last 10 between the same two, or 5 or more games where the loser scored 0 or 1 within 30 days |
| `rating_swing` | One match moved a player's rating by more than 150 (logged by the nightly run) |

The thresholds are placeholders for the product owner to confirm.

## Not done yet

- Resolving disputes, and an admin screen for flags: the admin lane.
- A League leaderboard tab: waits for Mini Leagues.
- Pre-game quick messages ("Running late"): a match only exists once its result
  is recorded. Sending them before the game needs matches set up earlier, which
  the 2026-10-08 decision removed.
- Disputes after a result is confirmed: only pending results can be disputed.
- The rating tests (BL-046).
