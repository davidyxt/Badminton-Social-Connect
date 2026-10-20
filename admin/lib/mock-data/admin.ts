import { resultStatusOf } from "@/lib/format";
import type { ActivityLog, Admin, AdminPost } from "@/lib/types";

/** The single designated administrator (multi-admin roles are a non-goal). */
export const MOCK_ADMIN: Admin = {
  admin_id: "adm-0001",
  display_name: "Site Administrator",
  email: "admin@badmintonsocialconnect.com.au",
};

/** Fixed "now" for the mock world, so fixtures and relative labels stay consistent. */
export const MOCK_NOW = "2026-10-10T00:00:00Z";

type LogSeed = [created_at: string, action: string, target_type: string, target_id: string, details: string];

const logSeeds: LogSeed[] = [
  ["2026-10-09T21:02:00Z", "publish_admin_post", "admin_post", "ap-8003", "Published carousel card \"Spring singles season now open\""],
  ["2026-10-09T05:44:00Z", "update_admin_post", "admin_post", "ap-8003", "Edited carousel card body copy"],
  ["2026-10-08T23:15:00Z", "restore_account", "player", "plr-1012", "Restored account access after identity check"],
  ["2026-10-08T03:30:00Z", "suspend_account", "player", "plr-1012", "Reason: Suspected duplicate account, pending ID check"],
  ["2026-10-07T07:10:00Z", "close_league_registration", "mini_league", "ml-4002", "Closed registration: league is at capacity for this season"],
  ["2026-10-06T22:48:00Z", "restore_post", "game_post", "gp-3002", "Restored after organiser edited the post title"],
  ["2026-10-06T09:05:00Z", "hide_post", "game_post", "gp-3002", "Reason: Title contained a phone number"],
  ["2026-10-05T22:31:00Z", "review_report", "report", "rpt-2037", "Outcome: resolved. Post hidden for promoting gambling. Organiser account suspended separately."],
  ["2026-10-05T22:29:00Z", "suspend_account", "player", "plr-1008", "Reason: Promoting gambling, second offence"],
  ["2026-10-05T22:27:00Z", "hide_post", "game_post", "gp-3003", "Reason: Promoting gambling for cash prizes"],
  ["2026-10-04T01:00:00Z", "create_admin_post", "admin_post", "ap-8004", "Created draft carousel card \"Summer court booking tips\""],
  ["2026-10-02T04:30:00Z", "suspend_account", "player", "plr-1005", "Reason: Seven no-shows in six weeks and abusive messages to organisers"],
  ["2026-10-01T23:12:00Z", "suspend_league", "mini_league", "ml-4003", "Reason: Exclusionary and mocking league description, under review"],
  ["2026-10-01T23:10:00Z", "review_report", "report", "rpt-2036", "Outcome: resolved. League suspended pending review with the organiser."],
  ["2026-09-30T01:00:00Z", "review_report", "report", "rpt-2035", "Outcome: dismissed. Score was confirmed by both players."],
  ["2026-09-28T06:00:00Z", "suspend_account", "player", "plr-1016", "Reason: Abusive messages reported by three separate players"],
  ["2026-09-27T20:22:00Z", "hide_post", "game_post", "gp-3011", "Reason: Hostile tone towards other players"],
  ["2026-09-27T20:20:00Z", "review_report", "report", "rpt-2034", "Outcome: resolved. Post hidden. Organiser reminded of community guidelines."],
  ["2026-09-27T04:12:00Z", "delete_post", "game_post", "gp-2988", "Reason: Commercial spam, not a game post. Repeat offence."],
  ["2026-09-21T02:15:00Z", "publish_admin_post", "admin_post", "ap-8001", "Published carousel card \"Welcome to Badminton Social Connect\""],
  ["2026-09-18T01:30:00Z", "delete_league", "mini_league", "ml-3990", "Reason: Organiser requested removal of an accidental test league."],
  ["2026-09-15T03:40:00Z", "publish_admin_post", "admin_post", "ap-8002", "Published carousel card \"Be a reliable player\""],
];

export const activityLog: ActivityLog[] = logSeeds.map(([created_at, action, target_type, target_id, details], i) => ({
  log_id: `log-${String(logSeeds.length - i).padStart(4, "0")}`,
  admin_id: MOCK_ADMIN.admin_id,
  action,
  target_type,
  target_id,
  details,
  created_at,
  new_status: resultStatusOf(action, details),
}));

export const adminPosts: AdminPost[] = [
  { admin_post_id: "ap-8001", title: "Welcome to Badminton Social Connect", body: "Find games near you, build your ranking and meet new players. Tap Find Games to get started.", image_url: "/carousel/welcome.svg", display_order: 1, status: "published", created_by: MOCK_ADMIN.admin_id, published_at: "2026-09-21T02:15:00Z", updated_at: "2026-10-09T21:02:00Z" },
  { admin_post_id: "ap-8002", title: "Be a reliable player", body: "Turning up when you've joined a game keeps your reliability score high and helps organisers plan.", image_url: "/carousel/reliable.svg", display_order: 2, status: "published", created_by: MOCK_ADMIN.admin_id, published_at: "2026-09-15T03:40:00Z", updated_at: "2026-10-09T21:02:00Z" },
  { admin_post_id: "ap-8003", title: "Spring singles season now open", body: "Six weeks of singles across the inner east. Registrations close 20 October.", image_url: "/carousel/league.svg", display_order: 3, status: "published", created_by: MOCK_ADMIN.admin_id, published_at: "2026-10-09T21:02:00Z", updated_at: "2026-10-09T21:02:00Z" },
  { admin_post_id: "ap-8004", title: "Summer court booking tips", body: "Courts fill up fast over summer. Post your game early and confirm your venue booking first.", image_url: "", display_order: 4, status: "draft", created_by: MOCK_ADMIN.admin_id, published_at: null, updated_at: "2026-10-09T21:02:00Z" },
];
