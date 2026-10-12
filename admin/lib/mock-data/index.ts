import type { MockDatabase } from "@/lib/types";
import { activityLog, adminPosts } from "./admin";
import { deletedRecords, gamePosts, miniLeagues } from "./content";
import { disputes, leagueStandings, matchResults, matches, rankingHistory, rankings } from "./games";
import { playerProfiles, players } from "./players";
import { analyticsSeries } from "./analytics";
import { reports } from "./reports";

export { MOCK_ADMIN, MOCK_NOW } from "./admin";
export { liveReportTemplates } from "./reports";
export { analyticsSeries, ANALYTICS_END_DATE, ANALYTICS_START_DATE } from "./analytics";
export type { AnalyticsMetric, DailyPoint } from "./analytics";

/** A fresh deep copy of every fixture, so mutations never touch the seed modules. */
export function createInitialDb(): MockDatabase {
  return structuredClone({
    players,
    player_profiles: playerProfiles,
    reports,
    game_posts: gamePosts,
    mini_leagues: miniLeagues,
    matches,
    match_results: matchResults,
    disputes,
    activity_log: activityLog,
    admin_posts: adminPosts,
    rankings,
    ranking_history: rankingHistory,
    league_standings: leagueStandings,
    deleted_records: deletedRecords,
    usage_analytics: analyticsSeries,
  });
}

/** Starting point for the real API: nothing until the first sync completes. */
export function createEmptyDb(): MockDatabase {
  return {
    players: [],
    player_profiles: [],
    reports: [],
    game_posts: [],
    mini_leagues: [],
    matches: [],
    match_results: [],
    disputes: [],
    activity_log: [],
    admin_posts: [],
    rankings: [],
    ranking_history: [],
    league_standings: [],
    deleted_records: [],
    usage_analytics: {},
  };
}
