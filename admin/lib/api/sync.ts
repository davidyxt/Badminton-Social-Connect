"use client";

/**
 * Loads the admin API into the console's store, so every page keeps reading
 * through `useQuery(db => ...)` whichever backend is active.
 *
 * Reads use the team-contract table routes (camelCase, same names as the
 * v1.2 spec). Values the database doesn't have yet are filled with neutral
 * defaults and flagged in lib/api/capabilities.ts, never invented: e.g. every
 * player is "active" because no suspension state exists yet.
 */
import { useSyncExternalStore } from "react";
import { humanize } from "@/lib/format";
import { commit } from "@/lib/mock-api/store";
import { createEmptyDb } from "@/lib/mock-data";
import { isApiError } from "@/lib/mock-api/errors";
import type {
  AdminPost,
  Dispute,
  GamePost,
  LeagueStanding,
  Match,
  MatchResult,
  MiniLeague,
  MockDatabase,
  Player,
  PlayerProfile,
  Ranking,
  Report,
  ReportTargetType,
} from "@/lib/types";
import { consoleGet, readTable } from "./client";

// ---------------------------------------------------------------------------
// Team-contract row shapes (docs/admin-api.md, supabase/functions/admin-api/contract.mjs)
// ---------------------------------------------------------------------------

interface Versioned {
  updatedAt?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
}
type ApiPlayer = Versioned & { playerId: string; displayName: string; selfRatingBand: string; isVerified: boolean; joinedAt: string };
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
type ApiReport = Versioned & { reportId: string; reportedByPlayerId: string; targetType: string; targetId: string; reason: string; status: string };
type ApiDispute = Versioned & { disputeId: string; matchId: string; reason: string; status: string; raisedBy: string | null };
type ApiGamePost = Versioned & {
  postId: string;
  organiserId: string | null;
  organiserClubId: string | null;
  format: string;
  suburb: string | null;
  proposedTime: string;
  status: string;
  playerLimit: number | null;
  title?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
};
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
type ApiResult = Versioned & { resultId: string; matchId: string; score: string; status: string; winningSide: "a" | "b" | null; submittedBy: string | null };
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
type ConsoleUser = { player_id: string; deleted_at: string | null; registration: { registered_at: string | null } | null; account?: { email: string | null } | null };
type DayCount = { date: string; count: number };
type ConsoleAnalytics = { metrics: Record<string, { by_day: DayCount[]; previous_by_day: DayCount[] }> };

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Report `under_review` is serialized as `reviewing`; the console queue treats both open states as pending. */
const reportStatus = (s: string): Report["status"] => (s === "resolved" || s === "dismissed" ? s : "pending");
/** The adapter serializes game `completed` as `closed`. */
const gameStatus = (s: string): GamePost["status"] => (s === "completed" ? "closed" : (s as GamePost["status"]));
const side = (s: "a" | "b" | null): "A" | "B" | null => (s ? (s.toUpperCase() as "A" | "B") : null);

function mapDatabase(raw: {
  players: ApiPlayer[];
  profiles: ApiProfile[];
  reports: ApiReport[];
  disputes: ApiDispute[];
  posts: ApiGamePost[];
  leagues: ApiLeague[];
  matches: ApiMatch[];
  participants: ApiParticipant[];
  results: ApiResult[];
  standings: ApiStanding[];
  rankings: ApiRanking[];
  adminPosts: ApiAdminPost[];
  venues: ApiVenue[];
  groups: ApiGroup[];
  accounts: Map<string, ConsoleUser>;
  overview: MockDatabase["overview"];
  analytics: Record<string, { date: string; value: number }[]>;
}): MockDatabase {
  const venues = new Map(raw.venues.map((v) => [v.venueId, v.name]));
  const groups = new Map(raw.groups.map((g) => [g.groupId, g.name]));

  const players: Player[] = raw.players.map((p) => ({
    player_id: p.playerId,
    display_name: p.displayName,
    self_rating_band: humanize(p.selfRatingBand),
    is_verified: p.isVerified,
    joined_at: p.joinedAt,
    // No suspension state exists in the database yet (handoff DB02).
    status: "active",
    email: raw.accounts.get(p.playerId)?.account?.email ?? "",
    account_state: raw.accounts.get(p.playerId)?.deleted_at ? "deleted" : raw.accounts.get(p.playerId)?.registration?.registered_at ? "registered" : "registration_pending",
    registered_at: raw.accounts.get(p.playerId)?.registration?.registered_at ?? null,
    deleted_at: raw.accounts.get(p.playerId)?.deleted_at ?? null,
  }));

  const player_profiles: PlayerProfile[] = raw.profiles.map((p) => ({
    player_id: p.playerId,
    bio: p.bio ?? "",
    suburb: p.suburb ?? "",
    state: p.state ?? "",
    // The adapter converts the database's 0-100 score to the spec's 0-1 scale.
    reliability_score: Math.round(p.reliabilityScore * 100),
    games_played: p.gamesPlayed,
    no_show_count: p.noShowCount,
    is_discoverable: p.isDiscoverable,
  }));

  const reports: Report[] = raw.reports.map((r) => ({
    report_id: r.reportId,
    reported_by_player_id: r.reportedByPlayerId,
    target_type: r.targetType as ReportTargetType,
    target_id: r.targetId,
    reason: r.reason,
    status: reportStatus(r.status),
    created_at: r.createdAt ?? "",
    details: "",
    resolution_note: null,
    reviewed_at: r.status === "resolved" || r.status === "dismissed" ? (r.updatedAt ?? null) : null,
  }));

  const game_posts: GamePost[] = raw.posts.map((p) => ({
    post_id: p.postId,
    organiser_id: p.organiserId ?? "",
    organiser_club_id: p.organiserClubId,
    organiser_group_name: p.organiserClubId ? groups.get(p.organiserClubId) ?? null : null,
    group_id: null,
    format: p.format === "singles" ? "singles" : "doubles",
    suburb: p.suburb ?? "",
    proposed_time: p.proposedTime,
    status: gameStatus(p.status),
    title: p.title || `${humanize(p.format)} game${p.suburb ? ` in ${p.suburb}` : ""}`,
    notes: "",
    venue: "",
    skill_band: "",
    spots_total: p.playerLimit,
    spots_filled: null,
    created_at: p.createdAt ?? "",
    status_before_hidden: null,
    hidden_by_account_suspension: false,
    deleted_at: p.deletedAt ?? null,
  }));

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
  }));

  const disputes: Dispute[] = raw.disputes.map((d) => ({
    dispute_id: d.disputeId,
    match_id: d.matchId,
    reason: d.reason,
    status: d.status as Dispute["status"],
    raised_by: d.raisedBy,
    created_at: d.createdAt ?? "",
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
    overview: raw.overview,
    players,
    player_profiles,
    reports,
    game_posts: game_posts.filter((p) => !p.deleted_at),
    mini_leagues,
    matches,
    match_results,
    disputes,
    // Unavailable until the database has these (handoff DB01, DB05, DB07).
    activity_log: [],
    deleted_records: raw.posts.filter((p) => p.deletedAt).map((p) => ({
      deleted_id: p.postId, target_type: "game_post", target_id: p.postId,
      label: p.title || `${humanize(p.format)} game${p.suburb ? ` in ${p.suburb}` : ""}`,
      owner_id: p.organiserId ?? "", reason: p.deletionReason ?? "Not recorded",
      deleted_by: p.deletedBy ?? "", deleted_at: p.deletedAt!,
    })),
    ranking_history: [],
    admin_posts,
    rankings,
    league_standings,
    usage_analytics: raw.analytics,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadAccounts(): Promise<Map<string, ConsoleUser>> {
  const accounts = new Map<string, ConsoleUser>();
  for (let page = 1; ; page++) {
    const res = await consoleGet<ConsoleUser[]>("/users", { include: "account", limit: 100, page });
    for (const u of res.data) accounts.set(u.player_id, u);
    if (!res.pagination || page * res.pagination.limit >= res.pagination.total) break;
  }
  return accounts;
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
  const [players, profiles, reports, disputes, posts, leagues, matches, participants, results, standings, rankings, adminPosts, venues, groups] =
    await Promise.all([
      readTable<ApiPlayer>("player"),
      readTable<ApiProfile>("player_profile"),
      readTable<ApiReport>("report"),
      readTable<ApiDispute>("dispute"),
      readTable<ApiGamePost>("game_post"),
      readTable<ApiLeague>("mini_league"),
      readTable<ApiMatch>("match"),
      readTable<ApiParticipant>("match_participant"),
      readTable<ApiResult>("match_result"),
      readTable<ApiStanding>("league_standing"),
      readTable<ApiRanking>("ranking"),
      readTable<ApiAdminPost>("admin_post"),
      readTable<ApiVenue>("venue"),
      readTable<ApiGroup>("groups"),
    ]);
  const [accounts, analytics, overview] = await Promise.all([loadAccounts(), optional(loadAnalytics, {}), consoleGet<NonNullable<MockDatabase["overview"]>>("/overview")]);
  return mapDatabase({ players, profiles, reports, disputes, posts, leagues, matches, participants, results, standings, rankings, adminPosts, venues, groups, accounts, analytics, overview: overview.data });
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
let generation = 0;
let cacheOwner: string | null = null;

export function setApiCacheOwner(owner: string | null): void {
  if (cacheOwner !== owner || owner === null) resetApiCache();
  cacheOwner = owner;
}

/** Clear sensitive cached data on sign-out, access loss or account switch. */
export function resetApiCache(): void {
  cacheOwner = null;
  generation++;
  inFlight = null;
  commit(() => createEmptyDb());
  setStatus({ state: "idle", error: null, lastSyncedAt: null });
}

/** Re-read everything. Called on sign-in, on a timer, and after each successful write. */
export function syncNow(): Promise<void> {
  const currentGeneration = generation;
  inFlight ??= (async () => {
    if (status.state !== "ready") setStatus({ state: "loading", error: null });
    try {
      const next = await loadFromApi();
      if (currentGeneration !== generation) return;
      commit(() => next);
      setStatus({ state: "ready", error: null, lastSyncedAt: Date.now() });
    } catch (err) {
      // Keep showing the last good data if a background refresh fails.
      if (currentGeneration !== generation) return;
      setStatus({ state: status.state === "ready" ? "ready" : "error", error: err instanceof Error ? err.message : "Couldn't load data." });
    } finally {
      if (currentGeneration === generation) inFlight = null;
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
