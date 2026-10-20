const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const shortDateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso));

/** "registration_closed" -> "Registration closed" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const TARGET_TYPE_LABEL: Record<string, string> = {
  player: "Player",
  game_post: "Game post",
  mini_league: "Mini League",
  report: "Report",
  match: "Match",
  group: "Group",
  dispute: "Dispute",
  admin_post: "Carousel card",
};

/** Report categories as the player app offers them. */
export const CATEGORY_LABEL: Record<string, string> = {
  harassment: "Harassment",
  inappropriate_content: "Inappropriate content",
  fake_account: "Fake account",
  spam: "Spam",
  safety_concern: "Safety concern",
  underage: "Underage player",
  other: "Other",
};

export const RESULT_FLAG_LABEL: Record<string, string> = {
  repeat_pairing: "Repeat pairing",
  unusual_win_pattern: "Unusual win pattern",
  rating_swing: "Large rating swing",
};

export const ACTION_LABEL: Record<string, string> = {
  suspend_account: "Suspended account",
  restore_account: "Restored account",
  hide_post: "Hid game post",
  restore_post: "Restored game post",
  delete_post: "Deleted game post",
  suspend_league: "Suspended Mini League",
  resume_league: "Resumed Mini League",
  close_league_registration: "Closed league registration",
  delete_league: "Deleted Mini League",
  review_report: "Reviewed report",
  resolve_dispute: "Resolved dispute",
  create_admin_post: "Created carousel card",
  update_admin_post: "Edited carousel card",
  publish_admin_post: "Published carousel card",
  unpublish_admin_post: "Unpublished carousel card",
  reorder_admin_post: "Reordered carousel card",
  delete_admin_post: "Removed carousel card",
};

/** Which console area an action belongs to; the "feature" filter on the activity log. */
export const ACTION_FEATURE: Record<string, string> = {
  suspend_account: "Users",
  restore_account: "Users",
  hide_post: "Content moderation",
  restore_post: "Content moderation",
  delete_post: "Content moderation",
  suspend_league: "Mini Leagues",
  resume_league: "Mini Leagues",
  close_league_registration: "Mini Leagues",
  delete_league: "Mini Leagues",
  review_report: "Reports",
  resolve_dispute: "Disputes",
  create_admin_post: "Content",
  update_admin_post: "Content",
  publish_admin_post: "Content",
  unpublish_admin_post: "Content",
  reorder_admin_post: "Content",
  delete_admin_post: "Content",
};

/**
 * The target's status after each action (DB01's "new state"), used when a log entry
 * doesn't record one itself. Actions that don't change status (edits, reorders) are absent.
 * Report reviews and restores record their actual outcome instead.
 */
export const ACTION_RESULT_STATUS: Record<string, string> = {
  suspend_account: "suspended",
  restore_account: "active",
  hide_post: "hidden",
  restore_post: "open",
  delete_post: "deleted",
  suspend_league: "suspended",
  resume_league: "active",
  close_league_registration: "registration_closed",
  delete_league: "deleted",
  create_admin_post: "draft",
  publish_admin_post: "published",
  unpublish_admin_post: "draft",
  delete_admin_post: "deleted",
};

/** Status an action left its target in, for log entries that don't record one (seed data, older saved entries). */
export function resultStatusOf(action: string, details: string): string | null {
  return /^Outcome: (\w+)/.exec(details)?.[1] ?? ACTION_RESULT_STATUS[action] ?? null;
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function downloadFile(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
