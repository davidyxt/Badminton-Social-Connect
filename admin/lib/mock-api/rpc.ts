"use client";

/**
 * Mock admin RPCs.
 *
 * Function names and argument names match docs/badminton-social-connect-api_v1.2.yaml
 * (`/rpc/<name>` request bodies), and return shapes match each RPC's 200
 * response, so swapping this file for `supabase.rpc(name, args)` calls should
 * not require changes in any page or component.
 *
 * With NEXT_PUBLIC_ADMIN_DATA_SOURCE=api each function delegates to the real
 * admin API (lib/api/actions.ts) instead.
 *
 * RPCs marked NOT IN SPEC have confirmation screens in Figma but no backing
 * RPC in the API spec or Technical Design Document (see PRD Known Gaps).
 */

import { api } from "@/lib/api/actions";
import { IS_API } from "@/lib/config";
import { MOCK_ADMIN, liveReportTemplates } from "@/lib/mock-data";
import type {
  ActivityLog,
  AdminPost,
  AdminPostStatus,
  DeletedRecord,
  GamePost,
  MiniLeague,
  MockDatabase,
  Report,
} from "@/lib/types";
import { getMockConfig, setMockConfig } from "./config";
import { ApiError } from "./errors";
import { commit, getDb, replaceWhere } from "./store";

// ---------------------------------------------------------------------------
// Simulation helpers
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateNetwork(): Promise<void> {
  const config = getMockConfig();
  if (config.latency) await delay(300 + Math.random() * 500);
  if (config.failNext) {
    setMockConfig({ failNext: false });
    throw new ApiError("network_error", "The server didn't respond. Your changes weren't saved.");
  }
  if (config.failureRate > 0 && Math.random() < config.failureRate) {
    throw new ApiError("network_error", "The server didn't respond. Your changes weren't saved.");
  }
}

/**
 * When the dev panel arms a conflict, the mutation first applies `concurrentChange`
 * as if another admin session got there first, then fails with 409. The UI then
 * shows the record's real, changed state.
 */
function consumeForcedConflict(concurrentChange?: (db: MockDatabase) => MockDatabase): void {
  if (!getMockConfig().conflictNext) return;
  setMockConfig({ conflictNext: false });
  if (concurrentChange) commit(concurrentChange);
  throw conflict();
}

const conflict = (message = "This record was changed in another session. Review the latest version before trying again.") =>
  new ApiError("conflict", message);

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function requireReason(reason: string | undefined, what = "A reason"): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) throw new ApiError("validation", `${what} is required.`);
  return trimmed;
}

function logEntry(action: string, target_type: string, target_id: string, details: string): ActivityLog {
  return {
    log_id: newId("log"),
    admin_id: MOCK_ADMIN.admin_id,
    action,
    target_type,
    target_id,
    details,
    created_at: now(),
  };
}

function withLog(db: MockDatabase, entry: ActivityLog): MockDatabase {
  return { ...db, activity_log: [entry, ...db.activity_log] };
}

function findOrThrow<T>(rows: T[], match: (row: T) => boolean, label: string): T {
  const row = rows.find(match);
  if (!row) throw new ApiError("not_found", `${label} no longer exists.`);
  return row;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** [Edge Function] Suspends a player and hides their active content. */
export async function admin_suspend_account(args: { playerId: string; reason: string }): Promise<{ success: boolean }> {
  if (IS_API) return api.admin_suspend_account(args);
  const reason = requireReason(args.reason);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    players: replaceWhere(db.players, (p) => p.player_id === args.playerId, (p) => ({ ...p, status: "suspended" })),
  }));

  const player = findOrThrow(getDb().players, (p) => p.player_id === args.playerId, "This player");
  if (player.status === "suspended") throw conflict("This account was already suspended in another session.");

  commit((db) => {
    let hiddenPosts = 0;
    let suspendedLeagues = 0;
    const game_posts = db.game_posts.map((post) => {
      if (post.organiser_id !== args.playerId || (post.status !== "open" && post.status !== "full")) return post;
      hiddenPosts++;
      return { ...post, status: "hidden" as const, status_before_hidden: post.status, hidden_by_account_suspension: true };
    });
    const mini_leagues = db.mini_leagues.map((league) => {
      if (league.organiser_id !== args.playerId || league.status === "suspended") return league;
      suspendedLeagues++;
      return { ...league, status: "suspended" as const, status_before_suspended: league.status, suspended_by_account_suspension: true };
    });
    const sideEffects = [
      hiddenPosts ? `${hiddenPosts} game post${hiddenPosts > 1 ? "s" : ""} hidden` : null,
      suspendedLeagues ? `${suspendedLeagues} Mini League${suspendedLeagues > 1 ? "s" : ""} suspended` : null,
    ].filter(Boolean);
    return withLog(
      {
        ...db,
        players: replaceWhere(db.players, (p) => p.player_id === args.playerId, (p) => ({ ...p, status: "suspended" })),
        game_posts,
        mini_leagues,
      },
      logEntry(
        "suspend_account",
        "player",
        args.playerId,
        `Reason: ${reason}${sideEffects.length ? ` (${sideEffects.join(", ")})` : ""}`,
      ),
    );
  });
  return { success: true };
}

/** [Edge Function] Reverses admin_suspend_account, including the content it hid. */
export async function admin_restore_account(args: { playerId: string; note?: string }): Promise<{ success: boolean }> {
  if (IS_API) return api.admin_restore_account(args);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    players: replaceWhere(db.players, (p) => p.player_id === args.playerId, (p) => ({ ...p, status: "active" })),
  }));

  const player = findOrThrow(getDb().players, (p) => p.player_id === args.playerId, "This player");
  if (player.status !== "suspended") throw conflict("This account was already restored in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        players: replaceWhere(db.players, (p) => p.player_id === args.playerId, (p) => ({ ...p, status: "active" })),
        game_posts: db.game_posts.map((post) =>
          post.organiser_id === args.playerId && post.hidden_by_account_suspension
            ? { ...post, status: post.status_before_hidden ?? "open", status_before_hidden: null, hidden_by_account_suspension: false }
            : post,
        ),
        mini_leagues: db.mini_leagues.map((league) =>
          league.organiser_id === args.playerId && league.suspended_by_account_suspension
            ? { ...league, status: league.status_before_suspended ?? "active", status_before_suspended: null, suspended_by_account_suspension: false }
            : league,
        ),
      },
      logEntry("restore_account", "player", args.playerId, args.note?.trim() ? `Note: ${args.note.trim()}` : "Account access restored"),
    ),
  );
  return { success: true };
}

// ---------------------------------------------------------------------------
// Game posts
// ---------------------------------------------------------------------------

export async function admin_hide_post(args: { postId: string; reason: string }): Promise<GamePost> {
  if (IS_API) return api.admin_hide_post(args);
  const reason = requireReason(args.reason);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    game_posts: replaceWhere(db.game_posts, (p) => p.post_id === args.postId, (p) => ({ ...p, status: "cancelled" })),
  }));

  const post = findOrThrow(getDb().game_posts, (p) => p.post_id === args.postId, "This game post");
  if (post.status === "hidden") throw conflict("This post was already hidden in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        game_posts: replaceWhere(db.game_posts, (p) => p.post_id === args.postId, (p) => ({
          ...p,
          status: "hidden",
          status_before_hidden: p.status === "hidden" ? p.status_before_hidden : p.status,
        })),
      },
      logEntry("hide_post", "game_post", args.postId, `Reason: ${reason}`),
    ),
  );
  return findOrThrow(getDb().game_posts, (p) => p.post_id === args.postId, "This game post");
}

export async function admin_restore_post(args: { postId: string; note?: string }): Promise<GamePost> {
  if (IS_API) return api.admin_restore_post(args);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    game_posts: replaceWhere(db.game_posts, (p) => p.post_id === args.postId, (p) => ({ ...p, status: p.status_before_hidden ?? "open" })),
  }));

  const post = findOrThrow(getDb().game_posts, (p) => p.post_id === args.postId, "This game post");
  if (post.status !== "hidden") throw conflict("This post was already restored in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        game_posts: replaceWhere(db.game_posts, (p) => p.post_id === args.postId, (p) => ({
          ...p,
          status: p.status_before_hidden ?? "open",
          status_before_hidden: null,
          hidden_by_account_suspension: false,
        })),
      },
      logEntry("restore_post", "game_post", args.postId, args.note?.trim() ? `Note: ${args.note.trim()}` : "Post restored"),
    ),
  );
  return findOrThrow(getDb().game_posts, (p) => p.post_id === args.postId, "This game post");
}

/** NOT IN SPEC. Irreversible: removes the post and records it in deleted records. */
export async function admin_delete_post(args: { postId: string; reason: string }): Promise<{ success: boolean }> {
  if (IS_API) return api.admin_delete_post(args);
  const reason = requireReason(args.reason);
  await simulateNetwork();
  consumeForcedConflict();

  const post = findOrThrow(getDb().game_posts, (p) => p.post_id === args.postId, "This game post");
  const record: DeletedRecord = {
    deleted_id: newId("del"),
    target_type: "game_post",
    target_id: post.post_id,
    label: post.title,
    owner_id: post.organiser_id,
    reason,
    deleted_by: MOCK_ADMIN.admin_id,
    deleted_at: now(),
  };
  commit((db) =>
    withLog(
      {
        ...db,
        game_posts: db.game_posts.filter((p) => p.post_id !== args.postId),
        deleted_records: [record, ...db.deleted_records],
      },
      logEntry("delete_post", "game_post", args.postId, `Reason: ${reason}`),
    ),
  );
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mini Leagues
// ---------------------------------------------------------------------------

export async function admin_suspend_league(args: { leagueId: string; reason: string }): Promise<MiniLeague> {
  if (IS_API) return api.admin_suspend_league(args);
  const reason = requireReason(args.reason);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({ ...l, status: "registration_closed" })),
  }));

  const league = findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
  if (league.status === "suspended") throw conflict("This Mini League was already suspended in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({
          ...l,
          status: "suspended",
          status_before_suspended: l.status === "suspended" ? l.status_before_suspended : l.status,
        })),
      },
      logEntry("suspend_league", "mini_league", args.leagueId, `Reason: ${reason}`),
    ),
  );
  return findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
}

export async function admin_resume_league(args: { leagueId: string; note?: string }): Promise<MiniLeague> {
  if (IS_API) return api.admin_resume_league(args);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({ ...l, status: l.status_before_suspended ?? "active" })),
  }));

  const league = findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
  if (league.status !== "suspended") throw conflict("This Mini League was already resumed in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({
          ...l,
          status: l.status_before_suspended ?? "active",
          status_before_suspended: null,
          suspended_by_account_suspension: false,
        })),
      },
      logEntry("resume_league", "mini_league", args.leagueId, args.note?.trim() ? `Note: ${args.note.trim()}` : "League resumed"),
    ),
  );
  return findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
}

/** NOT IN SPEC. A lesser state than suspension: league stays visible and active, just not joinable. */
export async function admin_close_league_registration(args: { leagueId: string; reason?: string }): Promise<MiniLeague> {
  if (IS_API) return api.admin_close_league_registration(args);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({ ...l, status: "registration_closed" })),
  }));

  const league = findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
  if (league.status !== "active") throw conflict("This Mini League's status changed in another session.");

  commit((db) =>
    withLog(
      {
        ...db,
        mini_leagues: replaceWhere(db.mini_leagues, (l) => l.league_id === args.leagueId, (l) => ({ ...l, status: "registration_closed" })),
      },
      logEntry(
        "close_league_registration",
        "mini_league",
        args.leagueId,
        args.reason?.trim() ? `Closed registration: ${args.reason.trim()}` : "Closed registration",
      ),
    ),
  );
  return findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
}

/** NOT IN SPEC. Irreversible. */
export async function admin_delete_league(args: { leagueId: string; reason: string }): Promise<{ success: boolean }> {
  if (IS_API) return api.admin_delete_league(args);
  const reason = requireReason(args.reason);
  await simulateNetwork();
  consumeForcedConflict();

  const league = findOrThrow(getDb().mini_leagues, (l) => l.league_id === args.leagueId, "This Mini League");
  const record: DeletedRecord = {
    deleted_id: newId("del"),
    target_type: "mini_league",
    target_id: league.league_id,
    label: league.name,
    owner_id: league.organiser_id,
    reason,
    deleted_by: MOCK_ADMIN.admin_id,
    deleted_at: now(),
  };
  commit((db) =>
    withLog(
      {
        ...db,
        mini_leagues: db.mini_leagues.filter((l) => l.league_id !== args.leagueId),
        league_standings: db.league_standings.filter((s) => s.league_id !== args.leagueId),
        deleted_records: [record, ...db.deleted_records],
      },
      logEntry("delete_league", "mini_league", args.leagueId, `Reason: ${reason}`),
    ),
  );
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * Records an outcome only; suspending, hiding or league suspension are always
 * separate actions. `note` is not in the v1.2 spec but the PRD requires one.
 */
export async function admin_review_report(args: {
  reportId: string;
  outcome: "resolved" | "dismissed";
  note: string;
}): Promise<Report> {
  if (IS_API) return api.admin_review_report(args);
  const note = requireReason(args.note, "A note");
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    reports: replaceWhere(db.reports, (r) => r.report_id === args.reportId, (r) => ({
      ...r,
      status: args.outcome === "resolved" ? "dismissed" : "resolved",
      resolution_note: "Reviewed in another session.",
      reviewed_at: now(),
    })),
  }));

  const report = findOrThrow(getDb().reports, (r) => r.report_id === args.reportId, "This report");
  if (report.status !== "pending") throw conflict(`This report was already ${report.status} in another session.`);

  commit((db) =>
    withLog(
      {
        ...db,
        reports: replaceWhere(db.reports, (r) => r.report_id === args.reportId, (r) => ({
          ...r,
          status: args.outcome,
          resolution_note: note,
          reviewed_at: now(),
        })),
      },
      logEntry("review_report", "report", args.reportId, `Outcome: ${args.outcome}. ${note}`),
    ),
  );
  return findOrThrow(getDb().reports, (r) => r.report_id === args.reportId, "This report");
}

// ---------------------------------------------------------------------------
// Carousel (AdminPost). The real backend uses PostgREST CRUD on /admin_post.
// ---------------------------------------------------------------------------

export type AdminPostInput = Pick<AdminPost, "title" | "body" | "image_url" | "display_order" | "status">;

function validateAdminPost(input: AdminPostInput): void {
  if (!input.title.trim()) throw new ApiError("validation", "A title is required.");
  if (input.status === "published") {
    if (!input.body.trim()) throw new ApiError("validation", "Body text is required to publish.");
    if (!input.image_url.trim()) throw new ApiError("validation", "An image is required to publish.");
  }
}

/** Place `id` at `position` (1-based) and renumber everything else in order. */
function reorder(posts: AdminPost[], id: string, position: number): AdminPost[] {
  const sorted = [...posts].sort((a, b) => a.display_order - b.display_order);
  const moving = sorted.find((p) => p.admin_post_id === id);
  if (!moving) return posts;
  const rest = sorted.filter((p) => p.admin_post_id !== id);
  const index = Math.min(Math.max(position - 1, 0), rest.length);
  rest.splice(index, 0, moving);
  return rest.map((p, i) => (p.display_order === i + 1 ? p : { ...p, display_order: i + 1 }));
}

export async function create_admin_post(input: AdminPostInput): Promise<AdminPost> {
  if (IS_API) return api.create_admin_post(input);
  validateAdminPost(input);
  await simulateNetwork();
  consumeForcedConflict();

  const post: AdminPost = {
    admin_post_id: newId("ap"),
    ...input,
    title: input.title.trim(),
    body: input.body.trim(),
    created_by: MOCK_ADMIN.admin_id,
    published_at: input.status === "published" ? now() : null,
  };
  commit((db) =>
    withLog(
      { ...db, admin_posts: reorder([...db.admin_posts, post], post.admin_post_id, input.display_order) },
      logEntry(
        input.status === "published" ? "publish_admin_post" : "create_admin_post",
        "admin_post",
        post.admin_post_id,
        `${input.status === "published" ? "Created and published" : "Created draft"} carousel card "${post.title}"`,
      ),
    ),
  );
  return findOrThrow(getDb().admin_posts, (p) => p.admin_post_id === post.admin_post_id, "This card");
}

export async function update_admin_post(args: { adminPostId: string } & Partial<AdminPostInput>): Promise<AdminPost> {
  if (IS_API) return api.update_admin_post(args);
  const { adminPostId, ...patch } = args;
  const existing = findOrThrow(getDb().admin_posts, (p) => p.admin_post_id === adminPostId, "This card");
  const next: AdminPostInput = { ...existing, ...patch };
  validateAdminPost(next);
  await simulateNetwork();
  consumeForcedConflict((db) => ({
    ...db,
    admin_posts: replaceWhere(db.admin_posts, (p) => p.admin_post_id === adminPostId, (p) => ({ ...p, title: `${p.title} (edited)` })),
  }));
  findOrThrow(getDb().admin_posts, (p) => p.admin_post_id === adminPostId, "This card");

  const statusChange: AdminPostStatus | null = patch.status && patch.status !== existing.status ? patch.status : null;
  const action =
    statusChange === "published" ? "publish_admin_post" : statusChange === "draft" ? "unpublish_admin_post" : patch.display_order !== undefined && Object.keys(patch).length === 1 ? "reorder_admin_post" : "update_admin_post";
  const details =
    action === "publish_admin_post"
      ? `Published carousel card "${next.title}"`
      : action === "unpublish_admin_post"
        ? `Moved carousel card "${next.title}" back to draft`
        : action === "reorder_admin_post"
          ? `Moved carousel card "${next.title}" to position ${patch.display_order}`
          : `Edited carousel card "${next.title}"`;

  commit((db) => {
    const updated = replaceWhere(db.admin_posts, (p) => p.admin_post_id === adminPostId, (p) => ({
      ...p,
      ...patch,
      title: next.title.trim(),
      body: next.body.trim(),
      published_at: statusChange === "published" ? now() : statusChange === "draft" ? null : p.published_at,
    }));
    return withLog(
      { ...db, admin_posts: patch.display_order !== undefined ? reorder(updated, adminPostId, patch.display_order) : updated },
      logEntry(action, "admin_post", adminPostId, details),
    );
  });
  return findOrThrow(getDb().admin_posts, (p) => p.admin_post_id === adminPostId, "This card");
}

export async function delete_admin_post(args: { adminPostId: string }): Promise<{ success: boolean }> {
  if (IS_API) return api.delete_admin_post(args);
  await simulateNetwork();
  consumeForcedConflict();
  const existing = findOrThrow(getDb().admin_posts, (p) => p.admin_post_id === args.adminPostId, "This card");
  commit((db) =>
    withLog(
      {
        ...db,
        admin_posts: db.admin_posts
          .filter((p) => p.admin_post_id !== args.adminPostId)
          .sort((a, b) => a.display_order - b.display_order)
          .map((p, i) => ({ ...p, display_order: i + 1 })),
      },
      logEntry("delete_admin_post", "admin_post", args.adminPostId, `Removed carousel card "${existing.title}"`),
    ),
  );
  return { success: true };
}

// ---------------------------------------------------------------------------
// Realtime simulation (stands in for the admin:reports channel)
// ---------------------------------------------------------------------------

let liveIndex = 0;

/** Inserts a new pending report as if a player had just submitted it. Not an admin action, so no log entry. */
export function simulate_incoming_report(): void {
  const template = liveReportTemplates[liveIndex++ % liveReportTemplates.length];
  commit((db) => ({
    ...db,
    reports: [
      {
        report_id: newId("rpt"),
        ...template,
        status: "pending",
        created_at: now(),
        resolution_note: null,
        reviewed_at: null,
        evidence: null,
      },
      ...db.reports,
    ],
  }));
}
