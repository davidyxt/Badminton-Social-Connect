import type { DeletedRecord, GamePost, Group, MiniLeague } from "@/lib/types";

export const groups: Group[] = [{ group_id: "grp-6001", name: "Richmond Smashers" }];

const post = (
  p: Omit<
    GamePost,
    | "group_id"
    | "organiser_group_id"
    | "organiser_group_name"
    | "duration_minutes"
    | "deleted_at"
    | "deletion_reason"
    | "status_before_hidden"
    | "hidden_by_account_suspension"
  > &
    Partial<GamePost>,
): GamePost => ({
  group_id: null,
  organiser_group_id: null,
  organiser_group_name: null,
  duration_minutes: 120,
  deleted_at: null,
  deletion_reason: null,
  status_before_hidden: null,
  hidden_by_account_suspension: false,
  ...p,
});

export const gamePosts: GamePost[] = [
  post({ post_id: "gp-3001", organiser_id: "plr-1001", format: "singles", suburb: "Box Hill", venue: "Box Hill Badminton Centre", proposed_time: "2026-10-12T08:00:00Z", status: "open", title: "Saturday morning singles hit", notes: "Looking for a strong singles hit, 90 minutes. Feathers provided.", skill_band: "Advanced", spots_total: 2, spots_filled: 1, created_at: "2026-10-07T21:14:00Z" }),
  post({ post_id: "gp-3002", organiser_id: "plr-1002", format: "doubles", suburb: "Parramatta", venue: "Parramatta Leisure Centre", proposed_time: "2026-10-13T08:30:00Z", status: "full", title: "Weeknight social doubles", notes: "Friendly doubles, rotating partners.", skill_band: "Intermediate", spots_total: 4, spots_filled: 4, created_at: "2026-10-06T10:02:00Z" }),
  post({ post_id: "gp-3003", organiser_id: "plr-1008", format: "doubles", suburb: "Bondi", venue: "Bondi Pavilion Hall", proposed_time: "2026-10-11T07:00:00Z", status: "hidden", status_before_hidden: "open", title: "CASH GAMES $$$ winner takes all", notes: "Bring $50 each, winner takes the pot. DM me on another app.", skill_band: "Intermediate", spots_total: 4, spots_filled: 2, created_at: "2026-10-05T12:40:00Z" }),
  post({ post_id: "gp-3004", organiser_id: "plr-1003", format: "singles", suburb: "Footscray", venue: "Maribyrnong Sports Stadium", proposed_time: "2026-10-14T09:00:00Z", status: "open", title: "Midweek singles ladder practice", notes: "Practice for the inner-west ladder. Any advanced player welcome.", skill_band: "Advanced", spots_total: 2, spots_filled: 1, created_at: "2026-10-08T07:45:00Z" }),
  post({ post_id: "gp-3005", organiser_id: "plr-1007", format: "doubles", suburb: "Brunswick", venue: "Brunswick Leisure Centre", proposed_time: "2026-10-12T23:00:00Z", status: "open", title: "Sunday social doubles", notes: "All levels welcome, bring your own racquet.", skill_band: "Intermediate", spots_total: 4, spots_filled: 3, created_at: "2026-10-08T15:30:00Z" }),
  post({ post_id: "gp-3006", organiser_id: "plr-1010", format: "singles", suburb: "Strathfield", venue: "Strathfield Badminton Hall", proposed_time: "2026-10-03T19:00:00Z", status: "cancelled", title: "Early bird singles", notes: "6am start before work.", skill_band: "Advanced", spots_total: 2, spots_filled: 1, created_at: "2026-09-29T09:20:00Z" }),
  post({ post_id: "gp-3007", organiser_id: "plr-1020", format: "singles", suburb: "Manly", venue: "Manly Indoor Courts", proposed_time: "2026-10-15T08:00:00Z", status: "open", title: "Only serious players, no beginners pls", notes: "If you can't smash don't bother turning up. Seriously.", skill_band: "Advanced", spots_total: 2, spots_filled: 1, created_at: "2026-10-08T22:10:00Z" }),
  post({ post_id: "gp-3008", organiser_id: "plr-1011", format: "doubles", suburb: "Carlton", venue: "Melbourne Uni Sports Centre", proposed_time: "2026-10-16T08:30:00Z", status: "open", title: "Mixed doubles night", notes: "Looking for two more for mixed doubles.", skill_band: "Intermediate", spots_total: 4, spots_filled: 2, created_at: "2026-10-09T03:15:00Z" }),
  post({ post_id: "gp-3009", organiser_id: "plr-1018", format: "singles", suburb: "Burwood", venue: "Burwood PCYC", proposed_time: "2026-10-11T22:00:00Z", status: "full", title: "State open prep session", notes: "Match-play practice, best of three.", skill_band: "Advanced", spots_total: 2, spots_filled: 2, created_at: "2026-10-04T11:00:00Z" }),
  post({ post_id: "gp-3010", organiser_id: "plr-1009", format: "doubles", suburb: "Doncaster", venue: "Doncaster Leisure Centre", proposed_time: "2026-10-17T07:30:00Z", status: "open", title: "Beginner-friendly doubles", notes: "Relaxed games, happy to explain rules.", skill_band: "Beginner", spots_total: 4, spots_filled: 1, created_at: "2026-10-09T08:40:00Z" }),
  post({ post_id: "gp-3011", organiser_id: "plr-1005", format: "doubles", suburb: "Glen Waverley", venue: "Waverley Badminton Centre", proposed_time: "2026-10-18T09:00:00Z", status: "hidden", status_before_hidden: "open", title: "Doubles - no time wasters", notes: "Last three people who joined didn't show. Don't join if you're going to flake.", skill_band: "Intermediate", spots_total: 4, spots_filled: 1, created_at: "2026-10-02T13:25:00Z" }),
  post({ post_id: "gp-3012", organiser_id: "plr-1020", format: "doubles", suburb: "Newtown", venue: "Newtown Community Hall", proposed_time: "2026-10-19T08:00:00Z", status: "open", title: "Casual Sunday doubles", notes: "Chill games then coffee.", skill_band: "Intermediate", spots_total: 4, spots_filled: 2, created_at: "2026-10-09T19:50:00Z" }),
  post({ post_id: "gp-3013", organiser_id: "", organiser_group_id: "grp-6001", organiser_group_name: "Richmond Smashers", format: "singles", suburb: "Richmond", venue: "Richmond Rec Centre", proposed_time: "2026-10-20T08:00:00Z", status: "open", title: "Singles round robin", notes: "Small round robin for intermediate+ players.", skill_band: "Intermediate", spots_total: 2, spots_filled: 0, created_at: "2026-10-09T23:05:00Z" }),
];

const league = (
  l: Omit<MiniLeague, "status_before_suspended" | "suspended_by_account_suspension"> & Partial<MiniLeague>,
): MiniLeague => ({
  status_before_suspended: null,
  suspended_by_account_suspension: false,
  ...l,
});

export const miniLeagues: MiniLeague[] = [
  league({ league_id: "ml-4001", organiser_id: "plr-1013", name: "Inner East Spring Singles", description: "Six-week singles ladder for intermediate and advanced players across the inner east.", format: "singles", suburb: "Richmond", start_date: "2026-09-21", end_date: "2026-11-02", status: "active", member_ids: ["plr-1001", "plr-1003", "plr-1007", "plr-1011", "plr-1013", "plr-1015", "plr-1017"], max_members: 12, created_at: "2026-09-01T10:00:00Z" }),
  league({ league_id: "ml-4002", organiser_id: "plr-1002", name: "Western Sydney Doubles League", description: "Fortnightly doubles league, rotating partners.", format: "doubles", suburb: "Parramatta", start_date: "2026-09-07", end_date: "2026-11-30", status: "registration_closed", member_ids: ["plr-1002", "plr-1006", "plr-1010", "plr-1012", "plr-1018", "plr-1020"], max_members: 8, created_at: "2026-08-20T09:00:00Z" }),
  league({ league_id: "ml-4003", organiser_id: "plr-1016", name: "Northern Beaches Elite", description: "Invite-only. Top band only. Losers buy drinks.", format: "singles", suburb: "Manly", start_date: "2026-09-14", end_date: "2026-10-26", status: "suspended", status_before_suspended: "active", member_ids: ["plr-1016", "plr-1006", "plr-1010", "plr-1018"], max_members: 6, created_at: "2026-08-28T12:00:00Z" }),
  league({ league_id: "ml-4004", organiser_id: "plr-1009", name: "Beginners Welcome Autumn Ladder", description: "A gentle introduction to league play for beginners.", format: "doubles", suburb: "Doncaster", start_date: "2026-10-05", end_date: "2026-11-23", status: "active", member_ids: ["plr-1004", "plr-1009", "plr-1014", "plr-1019"], max_members: 12, created_at: "2026-09-20T08:30:00Z" }),
  league({ league_id: "ml-4005", organiser_id: "plr-1003", name: "Footscray Midweek Mixed", description: "Mixed doubles on Wednesday nights.", format: "doubles", suburb: "Footscray", start_date: "2026-08-19", end_date: "2026-10-28", status: "active", member_ids: ["plr-1003", "plr-1011", "plr-1015", "plr-1017", "plr-1007", "plr-1001"], max_members: 8, created_at: "2026-08-01T11:00:00Z" }),
];

export const deletedRecords: DeletedRecord[] = [
  { deleted_id: "del-9001", target_type: "game_post", target_id: "gp-2988", label: "Selling used racquets cheap", owner_id: "plr-1008", reason: "Commercial spam, not a game post. Repeat offence.", deleted_by: "adm-0001", deleted_at: "2026-09-27T04:12:00Z" },
  { deleted_id: "del-9002", target_type: "mini_league", target_id: "ml-3990", label: "Test league please ignore", owner_id: "plr-1012", reason: "Organiser requested removal of an accidental test league.", deleted_by: "adm-0001", deleted_at: "2026-09-18T01:30:00Z" },
];
