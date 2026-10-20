// Stand-in for services/badmintonApi.js while that file isn't in Git.
// vite.config.js loads this instead of the real file only when the real one
// is missing (or VITE_USE_MOCK_API=true). The data lives in mockData.json.
// Changes (accepting a request, confirming a result...) last until reload.
import seed from "./mockData.json";

console.info("[mock] services/badmintonApi is mocked: data comes from src/mocks/mockData.json");

const db = structuredClone(seed);
const me = db.currentUserId;
const out = (value) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 120));
const fail = (message) => Promise.reject(new Error(message));
const newId = () => crypto.randomUUID();

// The seed's upcoming games have fixed dates. Move each open one forward in
// whole weeks until it is in the future, so it still shows as upcoming.
const WEEK = 7 * 24 * 60 * 60 * 1000;
const shifts = {};
for (const game of Object.values(db.games)) {
  if (game.status !== "open" || !game.startsAt) continue;
  let shift = 0;
  while (new Date(game.startsAt).getTime() + shift < Date.now()) shift += WEEK;
  if (shift) shifts[game.id] = shift;
}
const moveDates = (game) => {
  const shift = shifts[game?.id];
  if (!shift) return;
  const move = (iso) => iso && new Date(new Date(iso).getTime() + shift).toISOString();
  game.startsAt = move(game.startsAt);
  game.endsAt = move(game.endsAt);
  game.date = new Date(game.startsAt).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Melbourne",
  });
};
Object.values(db.games).forEach(moveDates);
Object.values(db.joinRequests).flat().forEach((request) => moveDates(request.game));

const game = (id) => db.games[id];
const matchByResult = (resultId) => Object.values(db.matches).find((m) => m.result?.id === resultId);
// The BSC201 pages pass a match id where BSC-202 passes a result id.
const matchFor = (id) => db.matches[id] ?? matchByResult(id);
const person = (id) => (id === me ? db.profile : db.players[id]);

// The BSC201 pages read table-style rows (displayName, postId, rankingPoints...).
// These build them from the same data, so both versions of the pages work.
const playerRow = (p) => ({
  playerId: p.id, id: p.id, displayName: p.name, name: p.name, username: p.username ?? p.name,
  initials: p.initials, selfRatingBand: p.level, rank: p.level, location: p.area ?? p.location,
  isVerified: p.isVerified ?? false,
});
const profileRow = (p) => ({
  playerId: p.id, gamesPlayed: p.gamesPlayed ?? null, reliabilityScore: p.reliability == null ? null : p.reliability / 100,
  noShowCount: p.noShows ?? 0, suburb: p.suburb ?? p.area ?? null, state: p.state ?? "VIC", bio: p.bio ?? null,
  isDiscoverable: p.isDiscoverable ?? true,
});
const rankingRow = (id) => {
  const row = db.leaderboards.state.entries.find((e) => e.id === id);
  const summary = db.ratingSummaries[id];
  const points = summary?.rating ?? row?.rating;
  if (points == null) return null;
  return {
    playerId: id, format: "singles", rankingPoints: points,
    band: summary?.grade || row?.grade ? `Grade ${summary?.grade ?? row.grade}` : person(id)?.level ?? "Unrated",
    // Leaderboard players are established: at least 10 trusted matches.
    verifiedGamesCount: summary?.placement?.played ?? Math.max(10, person(id)?.matches ?? 0),
  };
};
const gameRow = (g) => ({
  ...g, postId: g.id, organiserId: g.host?.isGroup ? null : g.host?.id, proposedTime: g.startsAt,
});
const winnerId = (m) => m.result && m.sides[m.result.winningSide]?.[0]?.id;

// Session and profile
export const getCurrentUserId = () => out(me);
export const getMyHome = () =>
  out({ ...db.home, nextGames: db.home.nextGames.map(game).filter(Boolean) });
export const getMyProfile = () => out(db.profile);
export const updateMyProfile = (changes) => {
  Object.assign(db.profile, changes);
  return out(db.profile);
};
export const registerPlayer = () => out({ registered: true });
export const getPlayer = (id) => out(person(id) ? playerRow(person(id)) : null);
export const getPlayerProfile = (id) => out(person(id) ? profileRow(person(id)) : null);
export const updatePlayer = (id, changes) => {
  if (id === me) {
    if (changes.displayName) db.profile.name = changes.displayName;
    if (changes.selfRatingBand) db.profile.level = changes.selfRatingBand;
  }
  return out(null);
};
export const updateProfile = (id, changes) => {
  if (id === me) Object.assign(db.profile, changes);
  return out(null);
};
export const getPublicPlayerProfile = (id) => out(db.players[id] ?? null);
export const listPlayers = () => out([db.profile, ...Object.values(db.players)].map(playerRow));
export const searchPlayers = (query = "") =>
  out(Object.values(db.players).filter((p) => !query || `${p.name} ${p.area}`.toLowerCase().includes(query.toLowerCase())));
export const mapPlayer = (p) => ({ ...p, rank: p.rank ?? p.level, location: p.location ?? p.area });
export const reportPlayer = () => out({ reported: true });

// Games and requests
export const searchGames = (query = "", format = "all") =>
  out(Object.values(db.games).filter((g) =>
    g.status === "open" &&
    (format === "all" || g.format.toLowerCase() === format) &&
    (!query || `${g.title} ${g.suburb} ${g.location}`.toLowerCase().includes(query.toLowerCase()))));
export const listGames = () => out(Object.values(db.games).map(gameRow));
export const mapGame = (g) => g;
export const getGame = (id) => out(game(id) ? gameRow(game(id)) : null);
export const createGame = (form) => {
  const id = newId();
  db.games[id] = {
    id, title: form.title || "Badminton game", format: form.format || "Singles", status: "open",
    date: form.date, time: form.startTime, location: form.venue, suburb: form.venue,
    host: { id: me, name: db.profile.username, initials: db.profile.initials, isGroup: false },
    players: [], myStatus: "accepted", canManage: true, canRecordResult: false,
  };
  return out({ id });
};
const setMyStatus = (id, status) => {
  if (!game(id)) return fail("Game not found.");
  game(id).myStatus = status;
  return out({ status });
};
export const requestToJoin = (id) => setMyStatus(id, "pending");
export const withdrawRequest = (id) => setMyStatus(id, null);
export const acceptInvite = (id) => setMyStatus(id, "accepted");
export const declineInvite = (id) => setMyStatus(id, "declined");
export const getJoinRequests = (postId) => out(db.joinRequests[postId] ?? []);
const answerRequest = (postId, playerId, status) => {
  const request = (db.joinRequests[postId] ?? []).find((r) => r.requester?.id === playerId);
  if (!request) return fail("Request not found.");
  request.status = status;
  return out({ status });
};
export const acceptRequest = (postId, playerId) => answerRequest(postId, playerId, "accepted");
export const declineRequest = (postId, playerId) => answerRequest(postId, playerId, "declined");

// Matches and results
export const getMatch = (id) => {
  const m = db.matches[id];
  return out(m ? { ...m, status: m.result?.status ?? "scheduled", suburb: game(m.gameId)?.suburb ?? m.location } : null);
};
export const getMatchParticipants = (matchId) => {
  const m = db.matches[matchId];
  return out(m ? Object.entries(m.sides).flatMap(([side, list]) => list.map((p) => ({ matchId, playerId: p.id, side }))) : []);
};
export const getMatchResults = (matchId) => {
  const m = db.matches[matchId];
  return out(m?.result ? [{ ...m.result, matchId, winnerId: winnerId(m) }] : []);
};
export const submitResult = (postId, opponents, partner, games) => {
  // BSC201 calls submitResult(matchId, "21-18, 19-21") on an existing match.
  if (typeof opponents === "string") {
    const m = db.matches[postId];
    if (!m) return fail("Match not found.");
    m.result = { ...(m.result ?? {}), id: m.result?.id ?? newId(), status: "pending", verificationStatus: "pending", score: opponents, ratingPending: true };
    return out({ matchId: postId, score: opponents, status: "pending" });
  }
  const g = game(postId);
  const person = (id) => (g.players ?? []).find((p) => p.id === id) ?? { id, name: "Player" };
  const matchId = newId();
  const won = games.filter(([mine, theirs]) => mine > theirs).length > games.length / 2;
  db.matches[matchId] = {
    matchId, gameId: postId, format: g.format, location: g.location, playedAt: g.startsAt, mySide: "a",
    sides: { a: [person(me), ...(partner ? [person(partner)] : [])], b: opponents.map(person) },
    result: {
      id: newId(), status: "pending", verificationStatus: "pending", score: games.map((x) => x.join("-")).join(" "),
      winningSide: won ? "a" : "b", iWon: won, canConfirm: false, canDispute: false, ratingPending: true,
    },
  };
  return out({ matchId, status: "pending" });
};
export const confirmResult = (resultId) => {
  const m = matchFor(resultId);
  if (!m?.result) return fail("Result not found.");
  Object.assign(m.result, { status: "confirmed", verificationStatus: "verified", canConfirm: false, canDispute: false });
  return out({ ...m.result, result: m.result });
};
export const raiseDispute = (resultId, reason) => {
  const m = matchFor(resultId);
  if (!m) return fail("Result not found.");
  Object.assign(m.result, { status: "disputed", verificationStatus: "disputed", canConfirm: false, canDispute: false, dispute: { reason } });
  return out({ status: "disputed" });
};

// Ratings and rankings
export const getRatingSummary = (playerId) => out(db.ratingSummaries[playerId ?? me] ?? null);
export const getRatingTrend = () => out(db.ratingTrend);
export const getLeaderboard = (scope = "state") => out(db.leaderboards[scope] ?? db.leaderboards.state);
export const getRanking = (playerId = me) => out([rankingRow(playerId)].filter(Boolean));
export const listRankings = (format = "singles") =>
  out(format === "singles" ? db.leaderboards.state.entries.map((e) => rankingRow(e.id)).filter(Boolean) : []);

// Notifications. The BSC201 page shows `message` as the headline, so it
// carries the full sentence; the menu bar counts the ones not isRead.
export const getNotifications = () =>
  out(db.notifications.map((n) => ({ ...n, notificationId: n.id, isRead: !n.unread, message: n.title })));
export const getMyActivity = () =>
  out(db.notifications.map((n) => ({ logId: n.id, action: n.title, targetType: n.type.replaceAll("_", " "), createdAt: n.createdAt })));
export const markNotificationRead = (id) => {
  const n = db.notifications.find((x) => x.id === id);
  if (n) n.unread = false;
  return out(null);
};
export const markNotificationsRead = () => {
  db.notifications.forEach((n) => { n.unread = false; });
  return out(null);
};

// Mini leagues (no backend exists for these yet)
export const listLeagues = () => out(db.leagues);
export const getLeague = (id) => out(db.leagues.find((l) => l.leagueId === id) ?? null);
export const mapLeague = (l) => ({ ...l, id: l.leagueId, availability: l.status });
export const createMiniLeague = (name, startDate, endDate) => {
  const league = { leagueId: newId(), organiserId: me, name, startDate, endDate, status: "active" };
  db.leagues.push(league);
  return out(league);
};
export const joinMiniLeague = (leagueId) => {
  if (!db.standings.some((s) => s.leagueId === leagueId && s.playerId === me)) {
    db.standings.push({ leagueId, playerId: me, wins: 0, losses: 0, points: 0, position: null });
  }
  return out(null);
};
export const getMyStandings = (playerId = me) => out(db.standings.filter((s) => s.playerId === playerId));
export const getStandings = (leagueId) => out(db.standings.filter((s) => s.leagueId === leagueId));
export const getLeagueMatches = (leagueId) => out(db.leagueMatches[leagueId] ?? []);
