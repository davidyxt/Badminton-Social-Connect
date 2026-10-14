/**
 * Read-side selectors. Each mirrors a PostgREST read the real console would do
 * (e.g. `from('report').select().eq('status','pending')`), expressed as a pure
 * function over the store so pages can use them through `useQuery`.
 */
import type { MockDatabase, Player, Report, ReportTargetType } from "@/lib/types";

export const selectPlayer = (db: MockDatabase, playerId: string | null) =>
  playerId ? (db.players.find((p) => p.player_id === playerId) ?? null) : null;

export const selectPlayerProfile = (db: MockDatabase, playerId: string) =>
  db.player_profiles.find((p) => p.player_id === playerId) ?? null;

export const selectPlayerMap = (db: MockDatabase): Map<string, Player> => new Map(db.players.map((p) => [p.player_id, p]));

export const selectRanking = (db: MockDatabase, playerId: string, format: "singles" | "doubles") =>
  db.rankings.find((r) => r.player_id === playerId && r.format === format) ?? null;

export const selectRankingHistory = (db: MockDatabase, playerId: string, format: "singles" | "doubles") =>
  db.ranking_history.filter((h) => h.player_id === playerId && h.format === format);

/** Reports filed against a player, or against content they own. */
export function selectReportsAboutPlayer(db: MockDatabase, playerId: string): Report[] {
  const postIds = new Set(db.game_posts.filter((p) => p.organiser_id === playerId).map((p) => p.post_id));
  const leagueIds = new Set(db.mini_leagues.filter((l) => l.organiser_id === playerId).map((l) => l.league_id));
  return db.reports.filter(
    (r) =>
      (r.target_type === "player" && r.target_id === playerId) ||
      (r.target_type === "game_post" && postIds.has(r.target_id)) ||
      (r.target_type === "mini_league" && leagueIds.has(r.target_id)),
  );
}

export const selectReportsForTarget = (db: MockDatabase, targetType: ReportTargetType, targetId: string) =>
  db.reports.filter((r) => r.target_type === targetType && r.target_id === targetId);

export const selectPendingReportCount = (db: MockDatabase) => db.reports.filter((r) => r.status === "pending").length;

export const selectOpenDisputeCount = (db: MockDatabase) => db.disputes.filter((d) => d.status === "open").length;

export const selectGamePost = (db: MockDatabase, postId: string) => db.game_posts.find((p) => p.post_id === postId) ?? null;

export const selectMiniLeague = (db: MockDatabase, leagueId: string) =>
  db.mini_leagues.find((l) => l.league_id === leagueId) ?? null;

export const selectMatch = (db: MockDatabase, matchId: string) => db.matches.find((m) => m.match_id === matchId) ?? null;

export const selectResultForMatch = (db: MockDatabase, matchId: string) =>
  [...db.match_results].filter((r) => r.match_id === matchId).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || b.result_id.localeCompare(a.result_id))[0] ?? null;

export const selectDisputesForMatch = (db: MockDatabase, matchId: string) => db.disputes.filter((d) => d.match_id === matchId);

export const selectDeletedRecord = (db: MockDatabase, targetId: string) =>
  db.deleted_records.find((d) => d.target_id === targetId) ?? null;

export const selectActivityFor = (db: MockDatabase, targetType: string, targetId: string) =>
  db.activity_log.filter((l) => l.target_type === targetType && l.target_id === targetId);
