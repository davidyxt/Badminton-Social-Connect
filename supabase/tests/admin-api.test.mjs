import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, id, stamp, admin } from "./helpers/admin-api-fixture.mjs";

test("missing token is rejected before Auth or database access", async () => {
  const f = fixture(); const r = await f.request("overview", { token: null });
  assert.equal(r.response.status, 401); assert.equal(f.calls.length, 0);
});
test("invalid token is rejected by Auth", async () => {
  const f = fixture({ authStatus: 401 }); const r = await f.request("overview");
  assert.equal(r.response.status, 401); assert.equal(f.calls.length, 1);
});
test("ordinary user cannot enter admin API", async () => {
  const f = fixture({ user: { ...admin, app_metadata: {} } });
  assert.equal((await f.request("reports")).response.status, 403);
  assert.equal(f.calls.length, 1);
});
test("user-editable metadata cannot grant admin access", async () => {
  const f = fixture({ user: { ...admin, app_metadata: {}, user_metadata: { role: "admin" } } });
  assert.equal((await f.request("results", { method: "PATCH", body: {} })).response.status, 403);
  assert.equal(f.calls.length, 1);
});
test("Auth outage is not misreported as a logged-out user", async () => {
  const f = fixture({ authStatus: 503 }); assert.equal((await f.request("me")).response.status, 503);
});
test("me returns only the authenticated administrator summary", async () => {
  const f = fixture(); const r = await f.request("me");
  assert.equal(r.response.status, 200); assert.deepEqual(r.json.data, { id, email: admin.email, role: "admin" });
  assert.equal(r.response.headers.get("cache-control"), "no-store");
});
test("revoked role is denied even when an access token is supplied", async () => {
  const f = fixture({ user: { ...admin, app_metadata: { role: "player" } } });
  assert.equal((await f.request("users")).response.status, 403);
});
test("CORS preflight is allowed only for configured origins", async () => {
  const f = fixture(); const r = await f.request("reports", { method: "OPTIONS", token: null, origin: "http://localhost:5173" });
  assert.equal(r.response.status, 204); assert.equal(f.calls.length, 0);
  assert.equal(r.response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const denied = await f.request("reports", { method: "OPTIONS", origin: "https://untrusted.example" });
  assert.equal(denied.response.status, 403); assert.equal(denied.response.headers.get("access-control-allow-origin"), null);
});
test("list requests retain user JWT and support count, filters and pagination", async () => {
  const f = fixture({ dbReply: () => ({ body: [], count: 72 }) });
  const r = await f.request("reports?page=2&limit=10&status=open&target_type=player");
  assert.equal(r.response.status, 200); assert.deepEqual(r.json.pagination, { page: 2, limit: 10, total: 72 });
  const call = f.calls.at(-1);
  assert.equal(call.headers.get("authorization"), "Bearer admin-token");
  assert.equal(call.headers.get("apikey"), "test-public-key");
  assert.equal(call.url.searchParams.get("status"), "eq.open");
  assert.equal(call.url.searchParams.get("offset"), "10");
  assert.equal(call.url.searchParams.get("limit"), "10");
});
test("name search escapes wildcard characters", async () => {
  const f = fixture(); await f.request("users?q=Alex%25_");
  assert.equal(f.calls.at(-1).url.searchParams.get("or"), '(username.ilike."%Alex\\\\%\\\\_%")');
});
for (const path of ["reports?limit=101", "reports?page=0", "reports?page=1.5", "reports?status=hidden", "users?status=suspended", "reports?target_type=unknown", "results?format=singles", "games?title=title", "rankings?format=triples"]) {
  test(`unsupported filter or pagination is rejected: ${path}`, async () => {
    const f = fixture(); assert.equal((await f.request(path)).response.status, 400);
    assert.equal(f.calls.filter((c) => c.url.pathname.startsWith("/rest")).length, 0);
  });
}
test("overview counts actual supported states", async () => {
  const f = fixture({ dbReply: () => ({ body: null, count: 7 }) });
  const r = await f.request("overview"); assert.equal(r.response.status, 200);
  assert.deepEqual(r.json.data, { registered_users: 7, unresolved_reports: 7, pending_results: 7, upcoming_game_posts: 7, active_leagues: 7, registration_pending_users: 7, deleted_users: 7 });
  assert.equal(f.calls.filter((c) => c.method === "HEAD").length, 7);
});
test("player account details are whitelisted and privileged access follows authorization", async () => {
  const f = fixture({ dbReply: () => ({ body: [{ player_id: id, username: "Alex" }] }), account: { ...admin, app_metadata: { internal_secret: "private" } } });
  const r = await f.request(`users/${id}`);
  assert.deepEqual(r.json.data.account, { email: admin.email, last_sign_in_at: null, email_confirmed_at: null });
  const accountCall = f.calls.find((c) => c.url.pathname.includes("/auth/v1/admin/users/")); assert.match(accountCall.url.pathname, /auth\/v1\/admin\/users/);
  assert.equal(accountCall.headers.get("apikey"), "test-server-key");
});
test("a malformed record ID never reaches database", async () => {
  const f = fixture(); assert.equal((await f.request("reports/not-a-uuid")).response.status, 400);
  assert.equal(f.calls.length, 1);
});
test("missing detail returns 404", async () => {
  const f = fixture(); assert.equal((await f.request(`reports/${id}`)).response.status, 404);
});
test("related reports constrain both target ID and type", async () => {
  const f = fixture({ dbReply: () => ({ body: [{ player_id: id }] }) });
  assert.equal((await f.request(`users/${id}/reports`)).response.status, 200);
  assert.equal(f.calls.at(-1).url.searchParams.get("target_type"), "eq.player");
  assert.equal(f.calls.at(-1).url.searchParams.get("target_id"), `eq.${id}`);
});
test("Final v6 prohibits admin score changes and result confirmation before database access", async () => {
  const f = fixture();
  const r = await f.request(`results/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "confirmed", winning_side: "a" } });
  assert.equal(r.response.status, 405); assert.equal(f.calls.length, 1);
});
test("changed record returns 409 instead of reporting a successful write", async () => {
  const f = fixture({ dbReply: (call) => ({ body: call.method === "PATCH" ? [] : [{ report_id: id }] }) });
  const r = await f.request(`reports/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "resolved" } });
  assert.equal(r.response.status, 409); assert.equal(r.json.error.code, "record_changed");
});
test("database constraint errors are mapped without leaking SQL details", async () => {
  const f = fixture({ dbReply: (call) => call.method === "PATCH" ? { status: 400, body: { code: "23514", message: "secret SQL detail" } } : { body: [{ result_id: id }] } });
  const r = await f.request(`reports/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "resolved" } });
  assert.equal(r.response.status, 400); assert.equal(r.json.error.code, "constraint_violation");
  assert.doesNotMatch(JSON.stringify(r.json), /secret/);
});
test("write uniqueness conflict returns 409", async () => {
  const f = fixture({ dbReply: (call) => call.method === "PATCH" ? { status: 409, body: { code: "23505" } } : { body: [{ result_id: id }] } });
  assert.equal((await f.request(`reports/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "resolved" } })).response.status, 409);
});
for (const body of [{ status: "resolved" }, { expected_updated_at: stamp }, { expected_updated_at: stamp, status: "resolved", updated_by: id }, { expected_updated_at: stamp, status: "resolved", decision_note: "Not stored" }]) {
  test(`invalid report patch cannot write: ${Object.keys(body).join(",")}`, async () => {
    const f = fixture(); assert.equal((await f.request(`reports/${id}`, { method: "PATCH", body })).response.status, 400);
    assert.equal(f.calls.filter((c) => c.method === "PATCH").length, 0);
  });
}
test("unsupported moderation state is not translated into cancellation", async () => {
  const f = fixture(); assert.equal((await f.request(`games/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "hidden" } })).response.status, 405);
});
test("Final v6 prohibits manual ranking corrections before database access", async () => {
  const f = fixture({ dbReply: (call) => ({ body: [{ player_id: id, format: "singles", ...call.body }] }) });
  const r = await f.request(`rankings/${id}/singles`, { method: "PATCH", body: { expected_updated_at: stamp, ranking_points: 1248 } });
  assert.equal(r.response.status, 405); assert.equal(f.calls.length, 1);
});
test("announcement creation uses the caller as creator and begins as draft", async () => {
  const f = fixture({ dbReply: (call) => ({ body: { admin_post_id: id, ...call.body } }) });
  const r = await f.request("announcements", { method: "POST", body: { title: "Welcome", body: "New season" } });
  assert.equal(r.response.status, 201); assert.equal(f.calls.at(-1).body.created_by, id);
  assert.equal(f.calls.at(-1).body.status, "draft");
});
test("publishing an announcement preserves its first publication timestamp", async () => {
  const f = fixture({ dbReply: (call) => ({ body: [{ admin_post_id: id, published_at: stamp, ...call.body }] }) });
  const r = await f.request(`announcements/${id}`, { method: "PATCH", body: { expected_updated_at: stamp, status: "published" } });
  assert.equal(r.response.status, 200); assert.equal(f.calls.at(-1).body.published_at, stamp);
});
test("hard deletion is unavailable because current foreign keys cascade history", async () => {
  const f = fixture(); assert.equal((await f.request(`games/${id}`, { method: "DELETE" })).response.status, 405);
  assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 0);
});
test("malformed, oversized and non-JSON bodies are rejected", async () => {
  const f = fixture();
  assert.equal((await f.request(`reports/${id}`, { method: "PATCH", raw: "{" })).response.status, 400);
  assert.equal((await f.request(`reports/${id}`, { method: "PATCH", raw: "[]" })).response.status, 400);
  assert.equal((await f.request(`reports/${id}`, { method: "PATCH", raw: "x".repeat(17000) })).response.status, 413);
  assert.equal((await f.request(`reports/${id}`, { method: "PATCH", raw: "{}", contentType: "text/plain" })).response.status, 415);
});
test("unknown resources return 404", async () => {
  const f = fixture(); assert.equal((await f.request("unknown")).response.status, 404);
  assert.equal((await f.request("activity-log")).response.status, 404);
});
test("admin can send an in-app notice using supported notification fields", async () => {
  const f = fixture({ dbReply: (call) => ({ body: { notification_id: id, ...call.body } }) });
  const r = await f.request("notifications", { method: "POST", body: { player_id: id, type: "system", message: "Your report has been reviewed." } });
  assert.equal(r.response.status, 201);
  assert.deepEqual(f.calls.at(-1).body, { player_id: id, match_id: null, type: "system", message: "Your report has been reviewed." });
  assert.equal(f.calls.at(-1).headers.get("authorization"), "Bearer admin-token");
});
test("notification filtering uses the supplied recipient UUID", async () => {
  const f = fixture(); assert.equal((await f.request(`notifications?player_id=${id}`)).response.status, 200);
  assert.equal(f.calls.at(-1).url.searchParams.get("player_id"), `eq.${id}`);
});
test("unsupported notification targets or types cannot reach INSERT", async () => {
  const f = fixture();
  assert.equal((await f.request("notifications", { method: "POST", body: { player_id: id, type: "report_outcome", message: "Done" } })).response.status, 400);
  assert.equal((await f.request("notifications", { method: "POST", body: { player_id: "bad", type: "system", message: "Done" } })).response.status, 400);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
});
