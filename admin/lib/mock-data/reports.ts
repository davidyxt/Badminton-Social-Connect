import type { Report } from "@/lib/types";

const report = (r: Omit<Report, "resolution_note" | "reviewed_at" | "category" | "evidence"> & Partial<Report>): Report => ({
  resolution_note: null,
  reviewed_at: null,
  category: "other",
  evidence: null,
  ...r,
});

export const reports: Report[] = [
  report({ report_id: "rpt-2042", reported_by_player_id: "plr-1011", target_type: "group", target_id: "grp-6001", reason: "Spam", category: "spam", details: "Group description is an ad for paid coaching.", status: "pending", created_at: "2026-10-10T01:15:00Z", evidence: { name: "Richmond Smashers", description: "Book private coaching at $90/hr, link in bio", captured_at: "2026-10-10T01:15:00Z" } }),
  report({ report_id: "rpt-2041", reported_by_player_id: "plr-1004", target_type: "game_post", target_id: "gp-3007", reason: "Offensive or exclusionary language", details: "The post tells beginners not to bother and is pretty hostile. Not the vibe for a community app.", status: "pending", created_at: "2026-10-09T22:41:00Z", category: "inappropriate_content", evidence: { title: "Only serious players, no beginners pls", notes: "If you can't smash don't bother turning up. Seriously.", organiser: "Ryan Mitchell", captured_at: "2026-10-09T22:41:00Z" } }),
  report({ report_id: "rpt-2040", reported_by_player_id: "plr-1007", target_type: "player", target_id: "plr-1020", reason: "Repeated no-shows", details: "Joined our Sunday doubles three times and didn't turn up to any of them. No message either.", status: "pending", created_at: "2026-10-09T10:05:00Z", category: "other" }),
  report({ report_id: "rpt-2039", reported_by_player_id: "plr-1010", target_type: "mini_league", target_id: "ml-4002", reason: "Misleading league details", details: "League says fortnightly but the organiser keeps scheduling weekly games and dropping people who can't make it.", status: "pending", created_at: "2026-10-08T06:22:00Z", category: "other", evidence: { name: "Western Sydney Doubles League", organiser: "Liam Patel", captured_at: "2026-10-08T06:22:00Z" } }),
  report({ report_id: "rpt-2038", reported_by_player_id: "plr-1009", target_type: "player", target_id: "plr-1016", reason: "Abusive behaviour", details: "Shouted at me during a game and sent rude messages afterwards.", status: "pending", created_at: "2026-10-07T09:18:00Z", category: "harassment", evidence: { username: "Mason Clarke", captured_at: "2026-10-07T09:18:00Z" } }),
  report({ report_id: "rpt-2037", reported_by_player_id: "plr-1001", target_type: "game_post", target_id: "gp-3003", reason: "Gambling / money for games", details: "Post is asking for cash bets.", status: "resolved", created_at: "2026-10-05T14:02:00Z", category: "spam", evidence: { title: "CASH GAMES $$$ winner takes all", notes: "Bring $50 each, winner takes the pot. DM me on another app.", organiser: "Jack O'Connor", captured_at: "2026-10-05T14:02:00Z" }, resolution_note: "Post hidden for promoting gambling. Organiser account suspended separately.", reviewed_at: "2026-10-05T22:30:00Z" }),
  report({ report_id: "rpt-2036", reported_by_player_id: "plr-1017", target_type: "mini_league", target_id: "ml-4003", reason: "Exclusionary league rules", details: "League description is mocking other players and the organiser rejects anyone who isn't his mate.", status: "resolved", created_at: "2026-10-01T05:40:00Z", category: "inappropriate_content", resolution_note: "League suspended pending review with the organiser.", reviewed_at: "2026-10-01T23:10:00Z" }),
  report({ report_id: "rpt-2035", reported_by_player_id: "plr-1012", target_type: "player", target_id: "plr-1003", reason: "Unfair result submission", details: "I think she recorded the wrong score.", status: "dismissed", created_at: "2026-09-29T08:12:00Z", category: "other", resolution_note: "Score was confirmed by both players. Disputes go through the dispute flow, not reports.", reviewed_at: "2026-09-30T01:00:00Z" }),
  report({ report_id: "rpt-2034", reported_by_player_id: "plr-1015", target_type: "game_post", target_id: "gp-3011", reason: "Hostile tone", details: "Organiser is being aggressive towards people in the post.", status: "resolved", created_at: "2026-09-27T03:55:00Z", category: "harassment", resolution_note: "Post hidden. Organiser reminded of community guidelines.", reviewed_at: "2026-09-27T20:20:00Z" }),
];

/**
 * Pool used by the "simulate live reports" dev control so the Reports queue
 * visibly behaves like the admin:reports realtime channel.
 */
export const liveReportTemplates: Pick<Report, "reported_by_player_id" | "target_type" | "target_id" | "reason" | "details" | "category">[] = [
  { reported_by_player_id: "plr-1019", target_type: "game_post", target_id: "gp-3012", reason: "Spam", category: "spam", details: "Same post copied into three different suburbs." },
  { reported_by_player_id: "plr-1004", target_type: "player", target_id: "plr-1008", reason: "Harassment", category: "harassment", details: "Keeps messaging me after I declined a game." },
  { reported_by_player_id: "plr-1006", target_type: "mini_league", target_id: "ml-4005", reason: "Inaccurate standings", category: "other", details: "Standings don't match the games we actually played." },
  { reported_by_player_id: "plr-1002", target_type: "player", target_id: "plr-1012", reason: "Fake profile", category: "fake_account", details: "Rating band seems way off, beat everyone 21-3." },
];
