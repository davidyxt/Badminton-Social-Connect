/**
 * What the real admin API can and can't do today (branch admin-api/database-handoff,
 * 11 Oct 2026). In mock mode everything is available. Update this list as the
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
  admin_delete_post: `${NEEDS_DB} (retained deletion, DB05).`,
  admin_suspend_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_resume_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_close_league_registration: `${NEEDS_DB} (league registration, DB04).`,
  admin_delete_league: `${NEEDS_DB} (retained deletion, DB05).`,
  admin_review_report: `${NEEDS_DB} (report review notes, DB06).`,
};

/** Why an action can't run against the current backend, or null if it can. */
export function unavailableReason(action: AdminAction): string | null {
  return IS_API ? UNAVAILABLE_IN_API[action] : null;
}

/** Read-side features the real API can't serve yet, for page notices. */
export const FEATURE_GAPS = {
  activityLog: "The activity log isn't available yet: the database has no append-only event log (DB01).",
  deletedRecords: "Deleted records aren't available yet: the database has no retained deletion (DB05).",
  rankingHistory: "Ranking history isn't available yet: the database keeps no ranking snapshots (DB07).",
  analytics: "Only new users and reports received are tracked so far. Other metrics need usage events (DB08).",
  suspension: "Account suspension isn't in the database yet, so every player shows as active (DB02).",
} as const;

export function featureGap(key: keyof typeof FEATURE_GAPS): string | null {
  return IS_API ? FEATURE_GAPS[key] : null;
}
