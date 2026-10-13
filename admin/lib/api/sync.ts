"use client";

/**
 * Loads the admin API into the console's store, so every page keeps reading
 * through `useQuery(db => ...)` whichever backend is active.
 *
 * Targets the Player BE-2 0.4 schema (branch admin-api/player-be2-integration).
 * Game posts and the user directory come from the console routes (snake_case,
 * real database names); the other tables come from the camelCase table routes,
 * reading their current field names (`username`, `organiserGroupId`, …) rather
 * than the older aliases. Values the database doesn't have yet are left empty
 * and flagged in lib/api/capabilities.ts, never invented: e.g. every player is
 * "active" because no suspension state exists yet.
 */
import { useSyncExternalStore } from "react";
import { CATEGORY_LABEL, humanize } from "@/lib/format";
import { commit } from "@/lib/mock-api/store";
import { isApiError } from "@/lib/mock-api/errors";
import type {
  AdminPost,
  DeletedRecord,
  Dispute,
  GamePost,
  Group,
  LeagueStanding,
  Match,
  MatchResult,
  MiniLeague,
  MockDatabase,
  Player,
  PlayerProfile,
  Ranking,
  RankingHistoryPoint,
  Report,
  ReportCategory,
  ReportTargetType,
  ResultFlag,
} from "@/lib/types";
import { consoleGet, readTable } from "./client";

// ---------------------------------------------------------------------------
// Row shapes (docs/admin-api.md; supabase/functions/admin-api/contract.mjs and console.mjs)
// ---------------------------------------------------------------------------

interface Versioned {
  updatedAt?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
}
type ApiPlayer = Versioned & {
  playerId: string;
  username: string | null;
  selfRatingBand: string;
  isVerified: boolean;
  joinedAt: string;
  deletedAt: string | null;
};
type ApiProfile = Versioned & {
  playerId: string;
  bio: string | null;
  suburb: string | null;
  state: string | null;
  reliabilityScore: number;
  gamesPlayed: number;
  noShowCount: number;
  isDiscoverable: boolean;
};
type ApiReport = Versioned & {
  reportId: string;
  reportedByPlayerId: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  status: string;
  category: string | null;
  evidence: Record<string, unknown> | null;
};
type ApiDispute = Versioned & { disputeId: string; matchId: string; reason: string; status: string; raisedBy: string | null; resultId: string | null };
type ApiLeague = Versioned & { leagueId: string; organiserId: string; name: string; startDate: string; endDate: string; status: string };
type ApiMatch = Versioned & {
  matchId: string;
  leagueId: string | null;
  venueId: string | null;
  format: string;
  playedAt: string | null;
  suburb: string | null;
  status: string;
  postId: string | null;
};
type ApiParticipant = { matchId: string; playerId: string; status: string; side: "a" | "b" };
type ApiResult = Versioned & {
  resultId: string;
  matchId: string;
  score: string;
  status: string;
  winningSide: "a" | "b" | null;
  submittedBy: string | null;
  games: [number, number][] | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  excludedFromRanking: boolean | null;
};
type ApiStanding = { leagueId: string; playerId: string; wins: number; losses: number; points: number; position: number | null };
type ApiRanking = { playerId: string; format: string; rankingPoints: number; band: string; verifiedGamesCount: number };
type ApiAdminPost = Versioned & {
  adminPostId: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  displayOrder: number;
  status: string;
  createdBy: string;
  publishedAt: string | null;
};
type ApiVenue = { venueId: string; name: string; address: string | null };
type ApiGroup = { groupId: string; name: string };
type ApiRatingHistory = {
  playerId: string;
  matchId: string;
  playedAt: string;
  ratingBefore: number;
  ratingAfter: number;
};
type ApiFlag = { flagId: string; resultId: string; matchId: string; kind: ResultFlag["kind"]; detail: Record<string, unknown> | null; createdAt: string };
/** Console /games row (snake_case, actual database states). */
type ConsoleGame = {
  post_id: string;
  organiser_id: string | null;
  organiser_group_id: string | null;
  format: string;
  suburb: string | null;
  proposed_time: string;
  status: string;
  created_at: string;
  player_limit: number | null;
  venue_id: string | null;
  duration_minutes: number | null;
  ability_level: string | null;
  notes: string | null;
  title: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  club: { group_id: string; name: string } | null;
};
type ConsoleUser = { player_id: string; registration?: { registered_at: string | null } | null; account?: { email: string | null } | null };
type DayCount = { date: string; count: number };
type ConsoleAnalytics = { metrics: Record<string, { by_day: DayCount[]; previous_by_day: DayCount[] }> };

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Report `under_review` is serialized as `reviewing`; the console queue treats both open states as pending. */
const reportStatus = (s: string): Report["status"] => (s === "resolved" || s === "dismissed" ? s : "pending");
const side = (s: "a" | "b" | null): "A" | "B" | null => (s ? (s.toUpperCase() as "A" | "B") : null);
const isEmpty = (o: Record<string, unknown> | null | undefined) => !o || Object.keys(o).length === 0;

interface RawData {
  players: ApiPlayer[];
  users: ConsoleUser[];
  profiles: ApiProfile[];
  reports: ApiReport[];
  disputes: ApiDispute[];
  games: ConsoleGame[];
  leagues: ApiLeague[];
  matches: ApiMatch[];
  participants: ApiParticipant[];
  results: ApiResult[];
  standings: ApiStanding[];
  rankings: ApiRanking[];
  adminPosts: ApiAdminPost[];
  venues: ApiVenue[];
  groups: ApiGroup[];
  ratingHistory: ApiRatingHistory[];
  flags: ApiFlag[];
  analytics: Record<string, { date: string; value: number }[]>;
}

function mapDatabase(raw: RawData): MockDatabase {
  const venues = new Map(raw.venues.map((v) => [v.venueId, v.name]));
  const users = new Map(raw.users.map((u) => [u.player_id, u]));

  const players: Player[] = raw.players.map((p) => {
    const user = users.get(p.playerId);
    return {
      player_id: p.playerId,
      // Deleted accounts are anonymised; players who haven't finished registering may not have picked a username yet.
      display_name: p.username ?? (p.deletedAt ? "Deleted player" : "No username yet"),
      self_rating_band: humanize(p.selfRatingBand),
      is_verified: p.isVerified,
      joined_at: p.joinedAt,
      // No suspension state exists in the database yet (handoff DB02).
      status: "active",
      email: user?.account?.email ?? "",
      registration_state: p.deletedAt ? "deleted" : user?.registration?.registered_at ? "registered" : "registration_pending",
      deleted_at: p.deletedAt,
    };
  });

  const player_profiles: PlayerProfile[] = raw.profiles.map((p) => ({
    player_id: p.playerId,
    bio: p.bio ?? "",
    suburb: p.suburb ?? "",
    state: p.state ?? "",
    // The table route converts the database's 0-100 score to the spec's 0-1 scale.
    reliability_score: Math.round(p.reliabilityScore * 100),
    games_played: p.gamesPlayed,
    no_show_count: p.noShowCount,
    is_discoverable: p.isDiscoverable,
  }));

  const reports: Report[] = raw.reports.map((r) => {
    const category = (r.category ?? "other") as ReportCategory;
    return {
      report_id: r.reportId,
      reported_by_player_id: r.reportedByPlayerId,
      target_type: r.targetType as ReportTargetType,
      target_id: r.targetId,
      // The category is the report's headline; the reporter's optional text is the details.
      reason: CATEGORY_LABEL[category] ?? humanize(category),
      category,
      details: r.reason ?? "",
      evidence: isEmpty(r.evidence) ? null : r.evidence,
      status: reportStatus(r.status),
      created_at: r.createdAt ?? "",
      resolution_note: null,
      reviewed_at: r.status === "resolved" || r.status === "dismissed" ? (r.updatedAt ?? null) : null,
    };
  });

  const toPost = (g: ConsoleGame): GamePost => ({
    post_id: g.post_id,
    organiser_id: g.organiser_id ?? "",
    organiser_group_id: g.organiser_group_id,
    organiser_group_name: g.club?.name ?? null,
    group_id: null,
    format: g.format === "singles" ? "singles" : "doubles",
    suburb: g.suburb ?? "",
    proposed_time: g.proposed_time,
    status: g.status as GamePost["status"],
    title: g.title?.trim() || `${humanize(g.format)} game${g.suburb ? ` in ${g.suburb}` : ""}`,
    notes: g.notes ?? "",
    venue: (g.venue_id && venues.get(g.venue_id)) || "",
    skill_band: g.ability_level ? humanize(g.ability_level) : "",
    spots_total: g.player_limit,
    spots_filled: null,
    duration_minutes: g.duration_minutes,
    created_at: g.created_at,
    deleted_at: g.deleted_at,
    deletion_reason: g.deletion_reason,
    status_before_hidden: null,
    hidden_by_account_suspension: false,
  });
  // Deleted posts are retained for history; the console lists them under Deleted records only.
  const game_posts = raw.games.filter((g) => !g.deleted_at).map(toPost);
  const deleted_records: DeletedRecord[] = raw.games
    .filter((g) => g.deleted_at)
    .map((g) => {
      const post = toPost(g);
      return {
        deleted_id: `del-${g.post_id}`,
        target_type: "game_post" as const,
        target_id: g.post_id,
        label: post.title,
        owner_id: g.organiser_id ?? g.organiser_group_id ?? "",
        reason: g.deletion_reason ?? "",
        deleted_by: g.deleted_by ?? "",
        deleted_at: g.deleted_at as string,
      };
    })
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));

  const league_standings: LeagueStanding[] = raw.standings.map((s) => ({
    league_id: s.leagueId,
    player_id: s.playerId,
    played: s.wins + s.losses,
    won: s.wins,
    lost: s.losses,
    points: s.points,
  }));

  const mini_leagues: MiniLeague[] = raw.leagues.map((l) => ({
    league_id: l.leagueId,
    organiser_id: l.organiserId,
    name: l.name,
    start_date: l.startDate,
    end_date: l.endDate,
    status: l.status as MiniLeague["status"],
    description: "",
    format: "",
    suburb: "",
    // No membership table yet (handoff DB04); standings are the closest record.
    member_ids: league_standings.filter((s) => s.league_id === l.leagueId).map((s) => s.player_id),
    max_members: null,
    created_at: l.createdAt ?? "",
    status_before_suspended: null,
    suspended_by_account_suspension: false,
  }));

  const matches: Match[] = raw.matches.map((m) => {
    const parts = raw.participants.filter((p) => p.matchId === m.matchId);
    return {
      match_id: m.matchId,
      format: m.format,
      proposed_time: m.playedAt ?? m.createdAt ?? "",
      suburb: m.suburb ?? "",
      status: m.status as Match["status"],
      side_a: parts.filter((p) => p.side === "a").map((p) => p.playerId),
      side_b: parts.filter((p) => p.side === "b").map((p) => p.playerId),
      league_id: m.leagueId,
      post_id: m.postId,
      venue: (m.venueId && venues.get(m.venueId)) || "Venue not set",
    };
  });

  const match_results: MatchResult[] = raw.results.map((r) => ({
    result_id: r.resultId,
    match_id: r.matchId,
    score: r.score,
    status: r.status as MatchResult["status"],
    winning_side: side(r.winningSide),
    submitted_by: r.submittedBy,
    submitted_at: r.createdAt ?? "",
    games: r.games ?? [],
    confirmed_by: r.confirmedBy,
    confirmed_at: r.confirmedAt,
    excluded_from_ranking: r.excludedFromRanking ?? false,
  }));

  const disputes: Dispute[] = raw.disputes.map((d) => ({
    dispute_id: d.disputeId,
    match_id: d.matchId,
    reason: d.reason,
    status: d.status as Dispute["status"],
    raised_by: d.raisedBy,
    created_at: d.createdAt ?? "",
    result_id: d.resultId,
  }));

  const rankings: Ranking[] = raw.rankings
    .filter((r) => r.format === "singles" || r.format === "doubles")
    .map((r) => ({
      player_id: r.playerId,
      format: r.format as Ranking["format"],
      ranking_points: r.rankingPoints,
      band: humanize(r.band),
      verified_games_count: r.verifiedGamesCount,
    }));

  // The shared rating engine rates singles; one row per rated result, oldest first.
  const ranking_history: RankingHistoryPoint[] = raw.ratingHistory
    .map((h) => ({
      player_id: h.playerId,
      format: "singles" as const,
      recorded_at: h.playedAt,
      ranking_points: Math.round(h.ratingAfter),
      ranking_points_before: Math.round(h.ratingBefore),
      match_id: h.matchId,
    }))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  const result_flags: ResultFlag[] = raw.flags.map((f) => ({
    flag_id: f.flagId,
    result_id: f.resultId,
    match_id: f.matchId,
    kind: f.kind,
    detail: f.detail ?? {},
    created_at: f.createdAt,
  }));

  const groups: Group[] = raw.groups.map((g) => ({ group_id: g.groupId, name: g.name }));

  const admin_posts: AdminPost[] = raw.adminPosts.map((a) => ({
    admin_post_id: a.adminPostId,
    title: a.title,
    body: a.body ?? "",
    image_url: a.imageUrl ?? "",
    display_order: a.displayOrder,
    status: a.status as AdminPost["status"],
    created_by: a.createdBy,
    published_at: a.publishedAt,
  }));

  return {
    players,
    player_profiles,
    reports,
    game_posts,
    mini_leagues,
    matches,
    match_results,
    disputes,
    // Unavailable until the database has an event log (handoff DB01).
    activity_log: [],
    deleted_records,
    ranking_history,
    result_flags,
    groups,
    admin_posts,
    rankings,
    league_standings,
    usage_analytics: raw.analytics,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Read every page of a console list route (max 100 rows per page). */
async function readConsoleList<T>(path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const res = await consoleGet<T[]>(path, { ...query, limit: 100, page });
    rows.push(...res.data);
    if (!res.pagination || page * res.pagination.limit >= res.pagination.total) break;
  }
  return rows;
}

/** The API serves at most 90 days per request plus the preceding 90, so one call covers 180 days. */
export function analyticsWindow(): { start: string; end: string; firstDay: string } {
  const melbourne = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(d);
  const yesterday = new Date(Date.parse(melbourne(new Date())) - 86_400_000);
  const end = yesterday.toISOString().slice(0, 10);
  const start = new Date(yesterday.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
  const firstDay = new Date(yesterday.getTime() - 179 * 86_400_000).toISOString().slice(0, 10);
  return { start, end, firstDay };
}

async function loadAnalytics(): Promise<Record<string, { date: string; value: number }[]>> {
  const { start, end } = analyticsWindow();
  const res = await consoleGet<ConsoleAnalytics>("/analytics", { start, end });
  const out: Record<string, { date: string; value: number }[]> = {};
  for (const [name, m] of Object.entries(res.data.metrics)) {
    out[name] = [...m.previous_by_day, ...m.by_day].map((d) => ({ date: d.date, value: d.count }));
  }
  return out;
}

/** Optional reads degrade to empty rather than failing the whole console. */
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isApiError(err) && err.code === "unauthorized") throw err;
    return fallback;
  }
}

export async function loadFromApi(): Promise<MockDatabase> {
  const [players, profiles, reports, disputes, games, leagues, matches, participants, results, standings, rankings, adminPosts, venues] =
    await Promise.all([
      readTable<ApiPlayer>("player"),
      readTable<ApiProfile>("player_profile"),
      readTable<ApiReport>("report"),
      readTable<ApiDispute>("dispute"),
      readConsoleList<ConsoleGame>("/games"),
      readTable<ApiLeague>("mini_league"),
      readTable<ApiMatch>("match"),
      readTable<ApiParticipant>("match_participant"),
      readTable<ApiResult>("match_result"),
      readTable<ApiStanding>("league_standing"),
      readTable<ApiRanking>("ranking"),
      readTable<ApiAdminPost>("admin_post"),
      readTable<ApiVenue>("venue"),
    ]);
  const [users, groups, ratingHistory, flags, analytics] = await Promise.all([
    // Emails and registration state: one Auth lookup per player, so this is the slowest read.
    optional(() => readConsoleList<ConsoleUser>("/users", { include: "account" }), []),
    optional(() => readTable<ApiGroup>("groups"), []),
    optional(() => readTable<ApiRatingHistory>("rating_history"), []),
    optional(() => readTable<ApiFlag>("result_flag"), []),
    optional(loadAnalytics, {}),
  ]);
  return mapDatabase({
    players,
    users,
    profiles,
    reports,
    disputes,
    games,
    leagues,
    matches,
    participants,
    results,
    standings,
    rankings,
    adminPosts,
    venues,
    groups,
    ratingHistory,
    flags,
    analytics,
  });
}

// ---------------------------------------------------------------------------
// Sync status, exposed to the admin layout
// ---------------------------------------------------------------------------

export interface SyncStatus {
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
  lastSyncedAt: number | null;
}

let status: SyncStatus = { state: "idle", error: null, lastSyncedAt: null };
const listeners = new Set<() => void>();
const setStatus = (next: Partial<SyncStatus>) => {
  status = { ...status, ...next };
  for (const l of listeners) l();
};

let inFlight: Promise<void> | null = null;

/** Re-read everything. Called on sign-in, on a timer, and after each successful write. */
export function syncNow(): Promise<void> {
  inFlight ??= (async () => {
    if (status.state !== "ready") setStatus({ state: "loading", error: null });
    try {
      const next = await loadFromApi();
      commit(() => next);
      setStatus({ state: "ready", error: null, lastSyncedAt: Date.now() });
    } catch (err) {
      // Keep showing the last good data if a background refresh fails.
      if (status.state !== "ready") setStatus({ state: "error", error: err instanceof Error ? err.message : "Couldn't load data." });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}
