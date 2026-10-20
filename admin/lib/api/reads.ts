/** Console endpoints return an envelope; shared rating RPC JSON is kept unchanged inside data. */
export interface ConsoleResponse<T> {
  data: T;
  pagination?: { page: number; limit: number; total: number };
  source_note?: string;
}
export interface RatingCard {
  playerId: string; rating: number; rd: number; grade: string | null;
  status: "Provisional" | "Established"; isStartingRating: boolean;
  placement: { played: number; required: number; opponents: number; opponentsRequired: number };
  state: string | null; suburb: string | null; stateRank: number | null; nearbyRank: number | null;
  change30Days: number | null; ratingsUpdatedAt: string | null;
}
export interface RatingTrend { days: number; points: { date: string; rating: number }[] }
export interface RatingHistoryRow {
  history_id: string; player_id: string; result_id: string; match_id: string; played_at: string;
  rating_before: number; rating_after: number; rd_before: number; rd_after: number; is_established: boolean;
}
export interface Registration {
  state: "registered" | "registration_pending" | "deleted";
  registered_at: string | null; deleted_at: string | null;
}
export interface ReportContext {
  evidence_snapshot: Record<string, unknown> | null;
  target: Record<string, unknown> | null; target_missing: boolean; private_decision: null;
}
export interface StoredResult {
  result_id: string; status: string; submitted_by: string | null; created_at: string;
  games: [number, number][]; confirmed_by: string | null; confirmed_at: string | null;
}
export interface MatchContext {
  results: StoredResult[];
  related_counts: { results: number }; related_limit: number;
  player_confirmation_history: null;
}
export interface ResultFlag {
  flag_id: string; result_id: string; match_id: string;
  kind: "repeat_pairing" | "unusual_win_pattern" | "rating_swing";
  detail: Record<string, unknown>; created_at: string;
}
export interface Leaderboard {
  scope: string; state: string | null; suburb: string | null; total: number; ratingsUpdatedAt: string | null;
  entries: { id: string; name: string; rank: number; rating: number; grade: string; suburb: string | null }[];
}
