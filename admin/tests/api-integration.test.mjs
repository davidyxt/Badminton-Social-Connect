import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(file, imports, globals = {}) {
  const js = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const resolve = (id) => {
    assert.ok(Object.hasOwn(imports, id), `Unstubbed dependency: ${id}`);
    return imports[id];
  };
  new Function("require", "exports", ...Object.keys(globals), js)(resolve, exports, ...Object.values(globals));
  return exports;
}
class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }

function transport(fetch, session = { access_token: "fake-admin-token" }) {
  return load("lib/api/client.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) },
    "@/lib/mock-api/errors": { ApiError },
    "@/lib/config": { SUPABASE_ANON_KEY: "fake-public-key", SUPABASE_URL: "http://localhost:56321" },
  }, { fetch });
}

test("browser transport uses Edge route, latest session token and public key", async () => {
  let observed;
  const client = transport(async (url, opts) => { observed = { url, opts }; return Response.json({ data: { state: "registered" } }); });
  const response = await client.consoleGet("/users/player/registration");
  assert.equal(observed.url.pathname, "/functions/v1/admin-api/users/player/registration");
  assert.equal(observed.opts.headers.Authorization, "Bearer fake-admin-token");
  assert.equal(observed.opts.headers.apikey, "fake-public-key");
  assert.equal(response.data.state, "registered");
});

test("table pagination keeps reading beyond the first 1000 rows", async () => {
  const offsets = [];
  const client = transport(async (url) => {
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    return Response.json(offset === 0 ? Array.from({ length: 1000 }, (_, i) => ({ playerId: String(i) })) : [{ playerId: "last" }]);
  });
  const rows = await client.readTable("player");
  assert.equal(rows.length, 1001);
  assert.equal(rows.at(-1).playerId, "last");
  assert.deepEqual(offsets, [0, 1000]);
});

test("missing or expired session notifies the auth guard", async () => {
  const client = transport(() => { throw new Error("Should not fetch"); }, null);
  const failures = [];
  client.onAuthFailure((reason) => failures.push(reason));
  await assert.rejects(client.adminRequest("/me"), { code: "unauthorized" });
  assert.deepEqual(failures, ["unauthorized"]);
});

test("revoked administrator role routes to restricted access, ordinary 403 does not end the session", async () => {
  let code = "admin_required";
  const client = transport(async () => Response.json({ error: { code, message: "Forbidden" } }, { status: 403 }));
  const failures = [];
  client.onAuthFailure((reason) => failures.push(reason));
  await assert.rejects(client.adminRequest("/me"), { code: "forbidden" });
  code = "forbidden";
  await assert.rejects(client.adminRequest("/admin_post"), { code: "forbidden" });
  assert.deepEqual(failures, ["forbidden"]);
});

test("flat compatibility conflicts and nested console errors retain their meaning", async () => {
  let status = 409;
  const client = transport(async () => Response.json({ code: "conflict", message: "Changed by another administrator" }, { status }));
  await assert.rejects(client.adminRequest("/admin_post"), { code: "conflict", message: "Changed by another administrator" });
  status = 405;
  await assert.rejects(client.adminRequest("/rpc/admin_rebuild_ratings"), { code: "unavailable" });
});

function cache(overrides = {}) {
  let db = { players: [] };
  const tables = {
    player: ["registered", "pending", "deleted"].map((id) => ({ playerId: id, username: id, deletedAt: id === "deleted" ? "2026-10-12T01:00:00Z" : null, selfRatingBand: "intermediate", joinedAt: "2026-10-12T00:00:00Z", isVerified: false })),
    game_post: [{ postId: "visible", format: "singles", title: "Real title", organiserId: null, organiserClubId: "group" }, { postId: "deleted-post", format: "doubles", deletedAt: "2026-10-12T00:00:00Z", deletionReason: "Removed", organiserId: "registered" }],
    groups: [{ groupId: "group", name: "Local Group" }],
    report: [{ reportId: "report", targetType: "group", status: "reviewing" }],
    match_result: [{ resultId: "expired", status: "expired" }],
  };
  const consoleGet = async (path) => {
    if (path === "/users") return { data: [
      { player_id: "registered", registration: { registered_at: "2026-10-12T00:00:00Z" }, account: { email: "local@example.com" } },
      { player_id: "pending", registration: { registered_at: null } },
      { player_id: "deleted", deleted_at: "2026-10-12T01:00:00Z", registration: null, account: null },
    ], pagination: { total: 3, limit: 100, page: 1 } };
    if (path === "/games") return { data: [
      { post_id: "visible", format: "singles", title: "Real title", organiser_id: null, organiser_group_id: "group", club: { group_id: "group", name: "Local Group" } },
      { post_id: "deleted-post", format: "doubles", deleted_at: "2026-10-12T00:00:00Z", deletion_reason: "Removed", organiser_id: "registered" },
    ], pagination: { total: 2, limit: 100, page: 1 } };
    if (path === "/analytics") return { data: { metrics: {} } };
    return { data: { registered_users: 1, deleted_users: 1 } };
  };
  const sync = load("lib/api/sync.ts", {
    react: { useSyncExternalStore: () => null },
    "@/lib/format": { CATEGORY_LABEL: {}, humanize: (s) => s[0].toUpperCase() + s.slice(1) },
    "@/lib/mock-api/store": { commit: (f) => { db = f(db); } },
    "@/lib/mock-data": { createEmptyDb: () => ({ players: [], game_posts: [] }) },
    "@/lib/mock-api/errors": { isApiError: (e) => e instanceof ApiError },
    "./client": { readTable: async (table) => tables[table] ?? [], consoleGet: overrides.consoleGet ?? consoleGet },
  });
  return { sync, current: () => db };
}

test("real sync preserves registration/deletion, hides deleted posts and exposes retained deletion metadata", async () => {
  const { sync, current } = cache();
  await sync.syncNow();
  const db = current();
  assert.deepEqual(db.players.map((p) => p.registration_state), ["registered", "registration_pending", "deleted"]);
  assert.equal(db.players[0].email, "local@example.com");
  assert.equal(db.game_posts.length, 1);
  assert.equal(db.game_posts[0].title, "Real title");
  assert.equal(db.game_posts[0].organiser_group_name, "Local Group");
  assert.equal(db.deleted_records[0].target_id, "deleted-post");
  assert.equal(db.deleted_records[0].reason, "Removed");
  assert.equal(db.reports[0].target_type, "group");
  assert.equal(db.match_results[0].status, "expired");

});

test("sign-out invalidates an in-flight sync so another session cannot see cached admin records", async () => {
  const pending = Promise.withResolvers();
  const { sync, current } = cache({ consoleGet: async () => pending.promise });
  sync.setApiCacheOwner("first-admin");
  const request = sync.syncNow();
  await new Promise((resolve) => setImmediate(resolve));
  sync.resetApiCache();
  pending.resolve({ data: [], pagination: { total: 0, limit: 100 }, metrics: {} });
  await request;
  assert.deepEqual(current().players, []);
});

test("switching administrators clears an already populated directory", async () => {
  const { sync, current } = cache();
  sync.setApiCacheOwner("first-admin");
  await sync.syncNow();
  assert.equal(current().players.length, 3);
  sync.setApiCacheOwner("second-admin");
  assert.deepEqual(current().players, []);
});

test("registration lookup failure does not invent registered users", async () => {
  const { sync, current } = cache({ consoleGet: async (path) => {
    if (path === "/users") throw new ApiError("network_error", "Directory unavailable");
    return { data: [], pagination: { total: 0, limit: 100, page: 1 } };
  } });
  await assert.rejects(sync.loadFromApi(), { code: "network_error" });
  await sync.syncNow();
  assert.deepEqual(current().players, []);
});
