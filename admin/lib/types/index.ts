/**
 * Entity types for the admin console.
 *
 * Derived from docs/badminton-social-connect-api_v1.2.yaml and scoped to what
 * the admin screens read or write. Field names are snake_case per the PRD /
 * Technical Design Document convention. Fields marked "extension" are not in
 * the PRD's base interfaces; they were added because a screen needs them.
 */

export type PlayerStatus = "active" | "suspended";

export interface Player {
  player_id: string;
  display_name: string;
  self_rating_band: string;
  is_verified: boolean;
  joined_at: string;
  status: PlayerStatus;
  /** extension: shown in the directory and profile header */
  email: string;
}

export interface PlayerProfile {
  player_id: string;
  bio: string;
  suburb: string;
  state: string;
  reliability_score: number;
  games_played: number;
  no_show_count: number;
  is_discoverable: boolean;
}

/** mini_league is in the PRD but not yet allowed by the database; match, admin_post and club are. */
export type ReportTargetType = "player" | "game_post" | "mini_league" | "match" | "admin_post" | "club";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface Report {
  report_id: string;
  reported_by_player_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  /** extension: longer free-text from the reporter */
  details: string;
  /** extension: admin's note recorded with the outcome (screens 22/23) */
  resolution_note: string | null;
  /** extension */
  reviewed_at: string | null;
}

/** "closed" is how the admin API serializes the database's completed. "hidden" has no database support yet. */
export type GamePostStatus = "open" | "full" | "cancelled" | "closed" | "hidden";

export interface GamePost {
  post_id: string;
  /** Player organiser; empty when a club organises the post. */
  organiser_id: string;
  /** extension: set instead of organiser_id for club-organised posts */
  organiser_club_id: string | null;
  group_id: string | null;
  format: "singles" | "doubles";
  suburb: string;
  proposed_time: string;
  status: GamePostStatus;
  /** extension: post content shown in moderation */
  title: string;
  /** extension */
  notes: string;
  /** extension */
  venue: string;
  /** extension */
  skill_band: string;
  /** extension: playerLimit in the database */
  spots_total: number | null;
  /** extension: not available from the admin API yet */
  spots_filled: number | null;
  /** extension */
  created_at: string;
  /** extension: status before it was hidden, so restore returns it there */
  status_before_hidden: Exclude<GamePostStatus, "hidden"> | null;
  /** extension: hidden as a side effect of admin_suspend_account, so restore_account reverses it */
  hidden_by_account_suspension: boolean;
}

/** draft / completed / cancelled come from the database; suspended and registration_closed have no database support yet. */
export type MiniLeagueStatus = "draft" | "active" | "completed" | "cancelled" | "suspended" | "registration_closed";

export interface MiniLeague {
  league_id: string;
  organiser_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: MiniLeagueStatus;
  /** extension */
  description: string;
  /** extension */
  format: string;
  /** extension */
  suburb: string;
  /** extension: from league standings when using the real API */
  member_ids: string[];
  /** extension */
  max_members: number | null;
  /** extension */
  created_at: string;
  /** extension: status before suspension, so resume returns it there */
  status_before_suspended: Exclude<MiniLeagueStatus, "suspended"> | null;
  /** extension: suspended as a side effect of admin_suspend_account */
  suspended_by_account_suspension: boolean;
}

/** in_progress / cancelled come from the database; awaiting_result / disputed are mock-only display states. */
export type MatchStatus = "scheduled" | "in_progress" | "awaiting_result" | "completed" | "cancelled" | "disputed";

export interface Match {
  match_id: string;
  format: string;
  proposed_time: string;
  suburb: string;
  status: MatchStatus;
  /** extension: participants per side (from game_participants_and_match_sides migration) */
  side_a: string[];
  /** extension */
  side_b: string[];
  /** extension */
  league_id: string | null;
  /** extension */
  post_id: string | null;
  /** extension */
  venue: string;
}

export type MatchResultStatus = "pending" | "confirmed" | "disputed" | "rejected";

export interface MatchResult {
  result_id: string;
  match_id: string;
  score: string;
  status: MatchResultStatus;
  /** extension: which side won according to the submitted score */
  winning_side: "A" | "B" | null;
  /** extension */
  submitted_by: string | null;
  /** extension */
  submitted_at: string;
}

/**
 * Database values. Disputes are read-only for administrators (Final v6; the
 * admin API returns 405 for resolve_dispute), so there is no upheld state.
 */
export type DisputeStatus = "open" | "under_review" | "resolved" | "dismissed";

export interface Dispute {
  dispute_id: string;
  match_id: string;
  reason: string;
  status: DisputeStatus;
  /** extension */
  raised_by: string | null;
  /** extension */
  created_at: string;
}

export interface ActivityLog {
  log_id: string;
  /** API spec calls this actorId; PRD calls it admin_id */
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export type AdminPostStatus = "draft" | "published" | "archived";

export interface AdminPost {
  admin_post_id: string;
  title: string;
  body: string;
  image_url: string;
  display_order: number;
  status: AdminPostStatus;
  created_by: string;
  published_at: string | null;
}

export interface Ranking {
  player_id: string;
  format: "singles" | "doubles";
  ranking_points: number;
  band: string;
  verified_games_count: number;
}

/** extension: rating over time for the profile Ranking history tab (screen 11) */
export interface RankingHistoryPoint {
  player_id: string;
  format: "singles" | "doubles";
  recorded_at: string;
  ranking_points: number;
}

/** extension: per-league standings for the Mini League leaderboard (screen 16) */
export interface LeagueStanding {
  league_id: string;
  player_id: string;
  played: number;
  won: number;
  lost: number;
  points: number;
}

/** extension: records removed via the (irreversible) delete flows, screen 26 */
export interface DeletedRecord {
  deleted_id: string;
  target_type: "game_post" | "mini_league";
  target_id: string;
  label: string;
  owner_id: string;
  reason: string;
  deleted_by: string;
  deleted_at: string;
}

export interface Admin {
  admin_id: string;
  display_name: string;
  email: string;
}

/** Everything the mock store holds. */
export interface MockDatabase {
  players: Player[];
  player_profiles: PlayerProfile[];
  reports: Report[];
  game_posts: GamePost[];
  mini_leagues: MiniLeague[];
  matches: Match[];
  match_results: MatchResult[];
  disputes: Dispute[];
  activity_log: ActivityLog[];
  admin_posts: AdminPost[];
  rankings: Ranking[];
  ranking_history: RankingHistoryPoint[];
  league_standings: LeagueStanding[];
  deleted_records: DeletedRecord[];
  /** Daily counts per analytics metric; a metric missing here isn't tracked by the backend yet. */
  usage_analytics: Record<string, { date: string; value: number }[]>;
}
