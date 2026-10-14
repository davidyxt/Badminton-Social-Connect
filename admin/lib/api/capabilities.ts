/**
 * Capabilities of admin-api/player-be2-integration (Player BE-2 0.4).
 * In mock mode the existing demo actions remain available. Update this list as the
 * backend lands each database change from docs/admin-database-handoff.md.
 */
import { IS_API } from "@/lib/config";

export type AdminAction =
  | "admin_suspend_account"
  | "admin_restore_account"
  | "admin_hide_post"
  | "admin_restore_post"
  | "admin_delete_post"
  | "admin_suspend_league"
  | "admin_resume_league"
  | "admin_close_league_registration"
  | "admin_delete_league"
  | "admin_review_report";

const NEEDS_DB = "Not available yet: needs a database change on the backend";

const UNAVAILABLE_IN_API: Record<AdminAction, string> = {
  admin_suspend_account: `${NEEDS_DB} (account suspension, DB02).`,
  admin_restore_account: `${NEEDS_DB} (account suspension, DB02).`,
  admin_hide_post: `${NEEDS_DB} (game post visibility, DB03).`,
  admin_restore_post: `${NEEDS_DB} (game post visibility, DB03).`,
  admin_delete_post: `${NEEDS_DB} (retained deletion, DB06).`,
  admin_suspend_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_resume_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_close_league_registration: `${NEEDS_DB} (league registration, DB04).`,
  admin_delete_league: `${NEEDS_DB} (retained deletion, DB06).`,
  admin_review_report: `${NEEDS_DB} (report review notes, DB05).`,
};

/** Why an action can't run against the current backend, or null if it can. */
export function unavailableReason(action: AdminAction): string | null {
  return IS_API ? UNAVAILABLE_IN_API[action] : null;
}

/** Read-side features the real API can't serve yet, for page notices. */
export const FEATURE_GAPS = {
  activityLog: "The activity log isn't available yet: the database has no append-only event log (DB01).",
  deletedRecords: "Retained game-post deletions are available. League deletion records and a complete deletion audit still need database support.",
  rankingHistory: "Singles rating changes are available. Weekly leaderboard snapshots and doubles rating history are not available yet.",
  analytics: "Only new users and reports received are tracked so far. Other metrics need usage events (DB11).",
  suspension: "Account suspension is not supported yet. Deleted accounts are labelled separately; suspension state is unavailable (DB02).",
} as const;

export function featureGap(key: keyof typeof FEATURE_GAPS): string | null {
  return IS_API ? FEATURE_GAPS[key] : null;
}
