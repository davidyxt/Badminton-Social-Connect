/**
 * What the real admin API can and can't do today (branch
 * admin-api/player-be2-integration, 13 Oct 2026). In mock mode everything is
 * available. DB numbers refer to that branch's docs/admin-database-handoff.md;
 * update this list as the backend lands each change.
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

/**
 * admin_delete_post, admin_close_league_registration and admin_delete_league
 * aren't in the backend's RPC list at all (contract.mjs rpcArguments), so
 * calling them would 404; the client reports that as "no endpoint yet".
 */
const UNAVAILABLE_IN_API: Record<AdminAction, string> = {
  admin_suspend_account: `${NEEDS_DB} (account suspension, DB02).`,
  admin_restore_account: `${NEEDS_DB} (account suspension, DB02).`,
  admin_hide_post: `${NEEDS_DB} (game post visibility, DB03).`,
  admin_restore_post: `${NEEDS_DB} (game post visibility, DB03).`,
  // The backend has no admin_delete_post. Its own admin_delete_game_post returns 405, because that deletion would remove
  // the game's results from rankings, which Final v6 forbids.
  admin_delete_post:
    "Blocked for now: the backend's deletion would remove this game's results from rankings, which the Final v6 design doesn't allow. Waiting on a product decision (DB06).",
  admin_suspend_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_resume_league: `${NEEDS_DB} (league restrictions, DB04).`,
  admin_close_league_registration: `${NEEDS_DB} (league registration, DB04).`,
  admin_delete_league: `${NEEDS_DB} (retained league deletion, DB06).`,
  admin_review_report: `${NEEDS_DB} (private review notes, DB05).`,
};

/** Why an action can't run against the current backend, or null if it can. */
export function unavailableReason(action: AdminAction): string | null {
  return IS_API ? UNAVAILABLE_IN_API[action] : null;
}

/** Read-side features the real API can't serve yet, for page notices. */
export const FEATURE_GAPS = {
  activityLog: "The activity log isn't available yet: the database has no append-only event log (DB01).",
  deletedRecords: "Deleted game posts are listed. Deleted Mini Leagues need retained league deletion on the backend (DB06).",
  rankingHistory:
    "This is the rating after each rated result, from the shared rating engine. The engine can replay it, so it isn't a fixed daily snapshot (DB07).",
  analytics: "Only new registrations and reports received are tracked so far. Other metrics need usage events (DB11).",
  suspension: "Account suspension isn't in the database yet, so every player shows as active (DB02).",
} as const;

export function featureGap(key: keyof typeof FEATURE_GAPS): string | null {
  return IS_API ? FEATURE_GAPS[key] : null;
}
