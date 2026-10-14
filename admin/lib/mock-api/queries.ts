/**
 * Read-side selectors. Each mirrors a PostgREST read the real console would do
 * (e.g. `from('report').select().eq('status','pending')`), expressed as a pure
 * function over the store so pages can use them through `useQuery`.
 */
import { isVisibleTargetType } from "@/lib/features";
import type { Dispute, MockDatabase, Player, Report, ReportTargetType } from "@/lib/types";

/** Reports the console shows: those about out-of-scope features (Mini Leagues) are kept but hidden. */
export const selectVisibleReports = (db: MockDatabase) => db.reports.filter((r) => isVisibleTargetType(r.target_type));

/** Activity log entries the console shows: hides entries about out-of-scope features, including reviews of hidden reports. */
export const selectVisibleActivity = (db: MockDatabase) =>
  db.activity_log.filter((entry) => {
    if (entry.target_type === "report") {
      const report = db.reports.find((r) => r.report_id === entry.target_id);
      return !report || isVisibleTargetType(report.target_type);
    }
    return isVisibleTargetType(entry.target_type);
  });

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
  return selectVisibleReports(db).filter(
    (r) =>
      (r.target_type === "player" && r.target_id === playerId) ||
      (r.target_type === "game_post" && postIds.has(r.target_id)) ||
      (r.target_type === "mini_league" && leagueIds.has(r.target_id)),
  );
}

export const selectReportsForTarget = (db: MockDatabase, targetType: ReportTargetType, targetId: string) =>
  db.reports.filter((r) => r.target_type === targetType && r.target_id === targetId);

export const selectPendingReportCount = (db: MockDatabase) => selectVisibleReports(db).filter((r) => r.status === "pending").length;

/** Open and under-review disputes both still need an admin's attention. */
export const isDisputeUnresolved = (d: Pick<Dispute, "status">) => d.status === "open" || d.status === "under_review";

export const selectOpenDisputeCount = (db: MockDatabase) => db.disputes.filter(isDisputeUnresolved).length;

export const selectGamePost = (db: MockDatabase, postId: string) => db.game_posts.find((p) => p.post_id === postId) ?? null;

export const selectMiniLeague = (db: MockDatabase, leagueId: string) =>
  db.mini_leagues.find((l) => l.league_id === leagueId) ?? null;

export const selectMatch = (db: MockDatabase, matchId: string) => db.matches.find((m) => m.match_id === matchId) ?? null;

/** A match can have several submissions; prefer the confirmed one, then the most recent. */
export function selectResultForMatch(db: MockDatabase, matchId: string) {
  const results = db.match_results.filter((r) => r.match_id === matchId);
  return results.find((r) => r.status === "confirmed") ?? [...results].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0] ?? null;
}

export const selectResult = (db: MockDatabase, resultId: string | null) =>
  resultId ? (db.match_results.find((r) => r.result_id === resultId) ?? null) : null;

export const selectFlagsForMatch = (db: MockDatabase, matchId: string) => db.result_flags.filter((f) => f.match_id === matchId);

export const selectDisputesForMatch = (db: MockDatabase, matchId: string) => db.disputes.filter((d) => d.match_id === matchId);

export const selectDeletedRecord = (db: MockDatabase, targetId: string) =>
  db.deleted_records.find((d) => d.target_id === targetId) ?? null;

export const selectActivityFor = (db: MockDatabase, targetType: string, targetId: string) =>
  db.activity_log.filter((l) => l.target_type === targetType && l.target_id === targetId);
