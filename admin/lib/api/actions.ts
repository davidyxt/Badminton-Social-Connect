"use client";

/**
 * Real-API versions of the admin RPCs in lib/mock-api/rpc.ts. Same names and
 * return shapes. Arguments are trimmed to what the admin-api adapter accepts,
 * because it rejects unknown fields with 422.
 */
import type { AdminPost, GamePost, MiniLeague, Report } from "@/lib/types";
import { ApiError } from "@/lib/mock-api/errors";
import { getDb } from "@/lib/mock-api/store";
import { unavailableReason, type AdminAction } from "./capabilities";
import { adminRequest } from "./client";
import { syncNow } from "./sync";

type AdminPostInput = Pick<AdminPost, "title" | "body" | "image_url" | "display_order" | "status">;

/** Actions the backend doesn't support yet fail fast with the same message the UI shows. */
function assertAvailable(action: AdminAction): void {
  const reason = unavailableReason(action);
  if (reason) throw new ApiError("unavailable", reason);
}

/** Call a team-contract RPC, then refresh the store so every screen shows the result. */
async function rpc<T>(name: AdminAction, body: Record<string, unknown>): Promise<T> {
  assertAvailable(name);
  const result = await adminRequest<T>(`/rpc/${name}`, { method: "POST", body });
  await syncNow();
  return result;
}

const findPost = (id: string) => getDb().game_posts.find((p) => p.post_id === id) as GamePost;
const findLeague = (id: string) => getDb().mini_leagues.find((l) => l.league_id === id) as MiniLeague;

export const api = {
  admin_suspend_account: (a: { playerId: string; reason: string }) => rpc<{ success: boolean }>("admin_suspend_account", a),
  // The spec has no restore note yet (handoff DB02 proposes one).
  admin_restore_account: (a: { playerId: string }) => rpc<{ success: boolean }>("admin_restore_account", { playerId: a.playerId }),
  admin_hide_post: async (a: { postId: string; reason: string }) => {
    await rpc("admin_hide_post", a);
    return findPost(a.postId);
  },
  admin_restore_post: async (a: { postId: string }) => {
    await rpc("admin_restore_post", { postId: a.postId });
    return findPost(a.postId);
  },
  // Not in the spec yet: rpc() refuses before any request while the capability is unavailable.
  admin_delete_post: (a: { postId: string; reason: string }) => rpc<{ success: boolean }>("admin_delete_post", a),
  admin_suspend_league: async (a: { leagueId: string; reason: string }) => {
    await rpc("admin_suspend_league", a);
    return findLeague(a.leagueId);
  },
  admin_resume_league: async (a: { leagueId: string }) => {
    await rpc("admin_resume_league", { leagueId: a.leagueId });
    return findLeague(a.leagueId);
  },
  admin_close_league_registration: async (a: { leagueId: string; reason?: string }) => {
    await rpc("admin_close_league_registration", a);
    return findLeague(a.leagueId);
  },
  admin_delete_league: (a: { leagueId: string; reason: string }) => rpc<{ success: boolean }>("admin_delete_league", a),
  // The spec takes no note yet; handoff DB05 proposes adding the required private note.
  admin_review_report: async (a: { reportId: string; outcome: "resolved" | "dismissed" }) => {
    await rpc("admin_review_report", { reportId: a.reportId, outcome: a.outcome });
    return getDb().reports.find((r) => r.report_id === a.reportId) as Report;
  },

  // Carousel: PostgREST-style CRUD on /admin_post (works today).
  create_admin_post: async (input: AdminPostInput): Promise<AdminPost> => {
    const created = await adminRequest<{ adminPostId: string }>("/admin_post", {
      method: "POST",
      body: {
        title: input.title.trim(),
        body: input.body.trim() || null,
        imageUrl: input.image_url.trim() || null,
        displayOrder: input.display_order,
        status: input.status,
      },
    });
    await syncNow();
    return getDb().admin_posts.find((p) => p.admin_post_id === created.adminPostId) as AdminPost;
  },
  update_admin_post: async (args: { adminPostId: string } & Partial<AdminPostInput>): Promise<AdminPost> => {
    const { adminPostId, ...patch } = args;
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title.trim();
    if (patch.body !== undefined) body.body = patch.body.trim() || null;
    if (patch.image_url !== undefined) body.imageUrl = patch.image_url.trim() || null;
    if (patch.status !== undefined) body.status = patch.status;

    if (patch.display_order !== undefined) {
      // The API stores display order as given; renumber the others so moving a card behaves like the mock.
      const sorted = [...getDb().admin_posts].sort((a, b) => a.display_order - b.display_order);
      const moving = sorted.find((p) => p.admin_post_id === adminPostId);
      const rest = sorted.filter((p) => p.admin_post_id !== adminPostId);
      if (moving) rest.splice(Math.min(Math.max(patch.display_order - 1, 0), rest.length), 0, moving);
      for (const [i, p] of rest.entries()) {
        if (p.admin_post_id === adminPostId) body.displayOrder = i + 1;
        else if (p.display_order !== i + 1) {
          await adminRequest(`/admin_post`, { method: "PATCH", query: { adminPostId: `eq.${p.admin_post_id}` }, body: { displayOrder: i + 1 } });
        }
      }
    }
    if (Object.keys(body).length > 0) {
      await adminRequest(`/admin_post`, { method: "PATCH", query: { adminPostId: `eq.${adminPostId}` }, body });
    }
    await syncNow();
    return getDb().admin_posts.find((p) => p.admin_post_id === adminPostId) as AdminPost;
  },
  delete_admin_post: async (a: { adminPostId: string }) => {
    await adminRequest(`/admin_post`, { method: "DELETE", query: { adminPostId: `eq.${a.adminPostId}` } });
    await syncNow();
    return { success: true };
  },
};
