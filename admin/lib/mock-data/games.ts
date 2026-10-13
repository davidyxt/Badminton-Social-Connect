import type { Dispute, LeagueStanding, Match, MatchResult, Ranking, RankingHistoryPoint } from "@/lib/types";
import { players } from "./players";

const match = (m: Omit<Match, "league_id" | "post_id"> & Partial<Match>): Match => ({
  league_id: null,
  post_id: null,
  ...m,
});

export const matches: Match[] = [
  match({ match_id: "mt-5001", format: "singles", proposed_time: "2026-09-20T08:00:00Z", suburb: "Richmond", venue: "Richmond Rec Centre", status: "completed", side_a: ["plr-1001"], side_b: ["plr-1003"], league_id: "ml-4001" }),
  match({ match_id: "mt-5002", format: "singles", proposed_time: "2026-09-22T09:00:00Z", suburb: "Richmond", venue: "Richmond Rec Centre", status: "completed", side_a: ["plr-1013"], side_b: ["plr-1007"], league_id: "ml-4001" }),
  match({ match_id: "mt-5003", format: "doubles", proposed_time: "2026-09-24T08:30:00Z", suburb: "Parramatta", venue: "Parramatta Leisure Centre", status: "completed", side_a: ["plr-1002", "plr-1012"], side_b: ["plr-1006", "plr-1020"], league_id: "ml-4002" }),
  match({ match_id: "mt-5004", format: "singles", proposed_time: "2026-09-27T22:00:00Z", suburb: "Burwood", venue: "Burwood PCYC", status: "disputed", side_a: ["plr-1018"], side_b: ["plr-1010"] }),
  match({ match_id: "mt-5005", format: "singles", proposed_time: "2026-09-29T08:00:00Z", suburb: "Richmond", venue: "Richmond Rec Centre", status: "completed", side_a: ["plr-1011"], side_b: ["plr-1015"], league_id: "ml-4001" }),
  match({ match_id: "mt-5006", format: "doubles", proposed_time: "2026-10-01T08:30:00Z", suburb: "Footscray", venue: "Maribyrnong Sports Stadium", status: "disputed", side_a: ["plr-1003", "plr-1011"], side_b: ["plr-1015", "plr-1017"], league_id: "ml-4005" }),
  match({ match_id: "mt-5007", format: "singles", proposed_time: "2026-10-03T07:00:00Z", suburb: "Box Hill", venue: "Box Hill Badminton Centre", status: "completed", side_a: ["plr-1001"], side_b: ["plr-1017"], league_id: "ml-4001" }),
  match({ match_id: "mt-5008", format: "doubles", proposed_time: "2026-10-05T23:00:00Z", suburb: "Brunswick", venue: "Brunswick Leisure Centre", status: "completed", side_a: ["plr-1007", "plr-1019"], side_b: ["plr-1009", "plr-1004"] }),
  match({ match_id: "mt-5009", format: "singles", proposed_time: "2026-10-07T09:00:00Z", suburb: "Ryde", venue: "Ryde Aquatic Leisure Centre", status: "awaiting_result", side_a: ["plr-1006"], side_b: ["plr-1012"] }),
  match({ match_id: "mt-5010", format: "doubles", proposed_time: "2026-10-08T08:30:00Z", suburb: "Parramatta", venue: "Parramatta Leisure Centre", status: "disputed", side_a: ["plr-1002", "plr-1018"], side_b: ["plr-1010", "plr-1006"], league_id: "ml-4002" }),
  match({ match_id: "mt-5011", format: "singles", proposed_time: "2026-10-09T08:00:00Z", suburb: "Footscray", venue: "Maribyrnong Sports Stadium", status: "awaiting_result", side_a: ["plr-1003"], side_b: ["plr-1013"], league_id: "ml-4001" }),
  match({ match_id: "mt-5012", format: "singles", proposed_time: "2026-10-12T08:00:00Z", suburb: "Box Hill", venue: "Box Hill Badminton Centre", status: "scheduled", side_a: ["plr-1001"], side_b: ["plr-1015"], post_id: "gp-3001" }),
  match({ match_id: "mt-5013", format: "doubles", proposed_time: "2026-10-13T08:30:00Z", suburb: "Parramatta", venue: "Parramatta Leisure Centre", status: "scheduled", side_a: ["plr-1002", "plr-1012"], side_b: ["plr-1020", "plr-1010"], post_id: "gp-3002" }),
  match({ match_id: "mt-5014", format: "doubles", proposed_time: "2026-10-04T08:00:00Z", suburb: "Doncaster", venue: "Doncaster Leisure Centre", status: "completed", side_a: ["plr-1009", "plr-1014"], side_b: ["plr-1004", "plr-1019"], league_id: "ml-4004" }),
];

export const matchResults: MatchResult[] = [
  { result_id: "res-6001", match_id: "mt-5001", score: "21-17, 19-21, 21-15", status: "confirmed", winning_side: "A", submitted_by: "plr-1001", submitted_at: "2026-09-20T10:05:00Z" },
  { result_id: "res-6002", match_id: "mt-5002", score: "21-12, 21-14", status: "confirmed", winning_side: "A", submitted_by: "plr-1013", submitted_at: "2026-09-22T11:00:00Z" },
  { result_id: "res-6003", match_id: "mt-5003", score: "18-21, 21-19, 22-20", status: "confirmed", winning_side: "A", submitted_by: "plr-1002", submitted_at: "2026-09-24T10:40:00Z" },
  { result_id: "res-6004", match_id: "mt-5004", score: "21-19, 21-18", status: "disputed", winning_side: "A", submitted_by: "plr-1018", submitted_at: "2026-09-27T23:30:00Z" },
  { result_id: "res-6005", match_id: "mt-5005", score: "21-16, 21-19", status: "confirmed", winning_side: "B", submitted_by: "plr-1015", submitted_at: "2026-09-29T09:30:00Z" },
  { result_id: "res-6006", match_id: "mt-5006", score: "21-15, 15-21, 21-23", status: "disputed", winning_side: "B", submitted_by: "plr-1017", submitted_at: "2026-10-01T10:15:00Z" },
  { result_id: "res-6007", match_id: "mt-5007", score: "21-10, 21-13", status: "confirmed", winning_side: "A", submitted_by: "plr-1001", submitted_at: "2026-10-03T08:20:00Z" },
  { result_id: "res-6008", match_id: "mt-5008", score: "21-18, 21-17", status: "confirmed", winning_side: "A", submitted_by: "plr-1007", submitted_at: "2026-10-06T00:45:00Z" },
  { result_id: "res-6009", match_id: "mt-5009", score: "21-14, 21-16", status: "pending", winning_side: "A", submitted_by: "plr-1006", submitted_at: "2026-10-07T10:30:00Z" },
  { result_id: "res-6010", match_id: "mt-5010", score: "21-19, 20-22, 21-17", status: "disputed", winning_side: "A", submitted_by: "plr-1002", submitted_at: "2026-10-08T10:10:00Z" },
  { result_id: "res-6014", match_id: "mt-5014", score: "21-11, 21-9", status: "confirmed", winning_side: "A", submitted_by: "plr-1009", submitted_at: "2026-10-04T09:30:00Z" },
];

export const disputes: Dispute[] = [
  { dispute_id: "dsp-7001", match_id: "mt-5004", reason: "Score entered as 21-18 in the second game, it was 18-21 and we went to a third.", status: "open", raised_by: "plr-1010", created_at: "2026-09-28T02:10:00Z" },
  { dispute_id: "dsp-7002", match_id: "mt-5006", reason: "Third game finished 23-21 to us, not the other way round.", status: "open", raised_by: "plr-1003", created_at: "2026-10-01T12:40:00Z" },
  { dispute_id: "dsp-7003", match_id: "mt-5010", reason: "We never played a third game, they retired injured after the second.", status: "open", raised_by: "plr-1010", created_at: "2026-10-08T12:05:00Z" },
  { dispute_id: "dsp-6999", match_id: "mt-5003", reason: "Wrong winner recorded.", status: "dismissed", raised_by: "plr-1020", created_at: "2026-09-25T03:00:00Z" },
];

/** Deterministic pseudo-random generator so fixtures look varied but never change between loads. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const bandFor = (points: number) => (points >= 1600 ? "A" : points >= 1300 ? "B" : "C");

const basePoints: Record<string, number> = { Advanced: 1650, Intermediate: 1380, Beginner: 1120 };

export const rankings: Ranking[] = players.flatMap((p, i) => {
  const rand = seeded(i + 11);
  const singles = Math.round(basePoints[p.self_rating_band] + (rand() - 0.5) * 260);
  const doubles = Math.round(basePoints[p.self_rating_band] + (rand() - 0.5) * 260);
  const verified = Math.max(0, Math.round(rand() * 30) + (p.is_verified ? 5 : 0));
  return [
    { player_id: p.player_id, format: "singles" as const, ranking_points: singles, band: bandFor(singles), verified_games_count: verified },
    { player_id: p.player_id, format: "doubles" as const, ranking_points: doubles, band: bandFor(doubles), verified_games_count: Math.round(verified * 0.7) },
  ];
});

/** Twelve weekly snapshots ending at the current ranking, per player and format. */
export const rankingHistory: RankingHistoryPoint[] = rankings.flatMap((r, i) => {
  const rand = seeded(i + 101);
  const points: RankingHistoryPoint[] = [];
  let value = r.ranking_points;
  const end = Date.UTC(2026, 9, 5);
  for (let w = 0; w < 12; w++) {
    points.unshift({
      player_id: r.player_id,
      format: r.format,
      recorded_at: new Date(end - w * 7 * 86_400_000).toISOString(),
      ranking_points: value,
    });
    value = Math.round(value - (rand() - 0.35) * 40);
  }
  return points;
});

type StandingSeed = [player_id: string, played: number, won: number];

const standingsFor = (league_id: string, rows: StandingSeed[]): LeagueStanding[] =>
  rows.map(([player_id, played, won]) => ({
    league_id,
    player_id,
    played,
    won,
    lost: played - won,
    points: won * 3 + (played - won),
  }));

export const leagueStandings: LeagueStanding[] = [
  ...standingsFor("ml-4001", [["plr-1001", 5, 4], ["plr-1013", 5, 4], ["plr-1003", 4, 3], ["plr-1015", 5, 3], ["plr-1011", 4, 2], ["plr-1017", 4, 1], ["plr-1007", 5, 1]]),
  ...standingsFor("ml-4002", [["plr-1002", 4, 3], ["plr-1012", 4, 3], ["plr-1006", 4, 2], ["plr-1018", 3, 2], ["plr-1010", 3, 1], ["plr-1020", 4, 0]]),
  ...standingsFor("ml-4003", [["plr-1016", 3, 3], ["plr-1018", 3, 2], ["plr-1010", 3, 1], ["plr-1006", 3, 0]]),
  ...standingsFor("ml-4004", [["plr-1009", 1, 1], ["plr-1014", 1, 1], ["plr-1004", 1, 0], ["plr-1019", 1, 0]]),
  ...standingsFor("ml-4005", [["plr-1003", 6, 4], ["plr-1011", 6, 4], ["plr-1015", 6, 3], ["plr-1017", 6, 3], ["plr-1001", 5, 2], ["plr-1007", 5, 1]]),
];
