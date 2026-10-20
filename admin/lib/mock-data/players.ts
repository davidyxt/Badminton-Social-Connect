import type { Player, PlayerProfile } from "@/lib/types";

type Seed = [
  id: string,
  name: string,
  band: string,
  verified: boolean,
  joined: string,
  status: Player["status"],
  suburb: string,
  state: string,
  reliability: number,
  played: number,
  noShows: number,
  discoverable: boolean,
  bio: string,
];

const seeds: Seed[] = [
  ["plr-1001", "Mia Chen", "Advanced", true, "2026-02-14T09:12:00Z", "active", "Box Hill", "VIC", 98, 64, 0, true, "Club player for 8 years, mostly singles. Happy to hit with anyone keen on long rallies."],
  ["plr-1002", "Liam Patel", "Intermediate", true, "2026-03-02T11:40:00Z", "active", "Parramatta", "NSW", 91, 38, 1, true, "Weeknight doubles regular. Looking for a consistent partner."],
  ["plr-1003", "Sophie Nguyen", "Advanced", true, "2026-01-21T08:05:00Z", "active", "Footscray", "VIC", 95, 72, 1, true, "Former state junior. Play 3x a week, singles and mixed."],
  ["plr-1004", "Noah Williams", "Beginner", false, "2026-08-30T19:22:00Z", "active", "Chatswood", "NSW", 80, 6, 1, true, "Picked up a racquet this winter. Keen to improve!"],
  ["plr-1005", "Ava Kumar", "Intermediate", true, "2026-04-11T07:55:00Z", "suspended", "Glen Waverley", "VIC", 62, 29, 7, false, "Doubles specialist."],
  ["plr-1006", "Ethan Brooks", "Advanced", true, "2026-02-03T13:10:00Z", "active", "Ryde", "NSW", 88, 51, 2, true, "Competitive singles, open to coaching juniors in casual hits."],
  ["plr-1007", "Isla Thompson", "Intermediate", true, "2026-05-19T18:31:00Z", "active", "Brunswick", "VIC", 93, 33, 0, true, "Sunday morning social games are my thing."],
  ["plr-1008", "Jack O'Connor", "Intermediate", false, "2026-06-07T10:02:00Z", "suspended", "Bondi", "NSW", 45, 18, 6, false, "Here to play."],
  ["plr-1009", "Chloe Martin", "Beginner", true, "2026-07-22T16:48:00Z", "active", "Doncaster", "VIC", 97, 12, 0, true, "New to the area, looking for friendly beginner doubles."],
  ["plr-1010", "Oliver Singh", "Advanced", true, "2026-01-09T06:30:00Z", "active", "Strathfield", "NSW", 90, 80, 3, true, "Top-band singles. Prefer early starts."],
  ["plr-1011", "Grace Lee", "Intermediate", true, "2026-03-28T12:15:00Z", "active", "Carlton", "VIC", 89, 41, 2, true, "Mixed doubles enthusiast."],
  ["plr-1012", "Lucas Rossi", "Intermediate", false, "2026-09-12T20:05:00Z", "active", "Hurstville", "NSW", 84, 9, 1, true, "Returning to badminton after a few years off."],
  ["plr-1013", "Zoe Harris", "Advanced", true, "2026-02-25T09:45:00Z", "active", "Richmond", "VIC", 96, 58, 1, true, "League organiser, singles and doubles."],
  ["plr-1014", "Henry Walker", "Beginner", false, "2026-09-28T07:20:00Z", "active", "Epping", "NSW", 100, 2, 0, true, "Just signed up!"],
  ["plr-1015", "Ruby Tran", "Intermediate", true, "2026-05-03T14:00:00Z", "active", "Clayton", "VIC", 87, 36, 2, true, "Uni club player, free most evenings."],
  ["plr-1016", "Mason Clarke", "Advanced", true, "2026-03-15T17:35:00Z", "suspended", "Manly", "NSW", 58, 44, 5, false, "Competitive."],
  ["plr-1017", "Ella Fraser", "Intermediate", true, "2026-06-21T08:50:00Z", "active", "Hawthorn", "VIC", 92, 27, 0, true, "Love a long doubles session on weekends."],
  ["plr-1018", "Daniel Kim", "Advanced", true, "2026-01-30T19:10:00Z", "active", "Burwood", "NSW", 94, 69, 1, true, "Singles focused. Training for state open."],
  ["plr-1019", "Hannah Scott", "Beginner", true, "2026-08-14T11:25:00Z", "active", "Preston", "VIC", 90, 8, 0, true, "Learning the ropes, all welcome."],
  ["plr-1020", "Ryan Mitchell", "Intermediate", false, "2026-07-05T15:40:00Z", "active", "Newtown", "NSW", 76, 21, 4, true, "Casual player, mostly doubles."],
];

export const players: Player[] = seeds.map(([player_id, display_name, self_rating_band, is_verified, joined_at, status]) => ({
  player_id,
  display_name,
  self_rating_band,
  is_verified,
  joined_at,
  status,
  email: `${display_name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
}));

export const playerProfiles: PlayerProfile[] = seeds.map(
  ([player_id, , , , , , suburb, state, reliability_score, games_played, no_show_count, is_discoverable, bio]) => ({
    player_id,
    bio,
    suburb,
    state,
    reliability_score,
    games_played,
    no_show_count,
    is_discoverable,
  }),
);
