import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, fixture, id } from "./helpers/admin-api-fixture.mjs";

const other = "22222222-2222-4222-8222-222222222222";
const path = (f, name) => f.calls.find((c) => c.url.pathname.endsWith(name));
test("rating RPCs use explicit allowed arguments and the administrator JWT", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.includes("/rpc/")
        ? { rating: 1500, grade: null }
        : [{ player_id: id }],
    }),
  });
  const r = await f.request(`users/${id}/rating_trend?days=90`);
  assert.equal(r.response.status, 200);
  const call = path(f, "get_rating_trend");
  assert.deepEqual(call.body, { p_player_id: id, p_days: 90 });
  assert.equal(call.headers.get("authorization"), "Bearer admin-token");
  assert.equal(call.headers.get("apikey"), "test-public-key");
});
test("history filters and pagination always keep the selected player's boundary", async () => {
  const f = fixture({
    dbReply: () => ({ body: [{ player_id: id }], count: 33 }),
  });
  const r = await f.request(
    `users/${id}/rating_history?page=2&limit=5&result_id=${other}&played_from=2026-01-01T00:00:00Z&played_to=2026-02-01T00:00:00Z`,
  );
  assert.equal(r.json.pagination.total, 33);
  const q = path(f, "rating_history").url.searchParams;
  assert.equal(q.get("player_id"), `eq.${id}`);
  assert.equal(q.get("result_id"), `eq.${other}`);
  assert.equal(q.get("offset"), "5");
  assert.equal(q.get("limit"), "5");
  assert.equal(q.get("played_at"), "gte.2026-01-01T00:00:00Z");
});
test("result flags are bounded, filtered and informational", async () => {
  const f = fixture({ dbReply: () => ({ body: [], count: 8 }) });
  const r = await f.request(
    `result_flags?kind=rating_swing&match_id=${id}&page=2&limit=5`,
  );
  assert.equal(r.json.read_only, true);
  assert.equal(r.json.pagination.total, 8);
  const c = path(f, "result_flag");
  assert.equal(c.url.searchParams.get("match_id"), `eq.${id}`);
  assert.equal(c.url.searchParams.get("kind"), "eq.rating_swing");
});
test("registration returns only status and timestamps, without date of birth or consent details", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("player_private")
        ? [{ registered_at: "2026-10-01T00:00:00Z" }]
        : [{ player_id: id, deleted_at: null }],
    }),
  });
  const r = await f.request(`users/${id}/registration`);
  assert.equal(r.json.data.state, "registered");
  assert.deepEqual(Object.keys(r.json.data).sort(), [
    "deleted_at",
    "registered_at",
    "state",
  ]);
  assert.equal(
    path(f, "player_private").url.searchParams.get("select"),
    "registered_at",
  );
});
test("deleted account detail and account-inclusive lists never fail on missing Auth identity", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{
        player_id: id,
        username: "Deleted User",
        deleted_at: "2026-10-01T00:00:00Z",
      }],
    }),
  });
  const detail = await f.request(`users/${id}`);
  assert.equal(detail.json.data.account, null);
  assert.equal(detail.json.data.account_state.state, "deleted");
  const list = await f.request("users?include=account&is_deleted=true");
  assert.equal(list.json.data[0].account, null);
  assert.equal(
    f.calls.some((c) => c.url.pathname.includes("/auth/v1/admin/users/")),
    false,
  );
});
test("evidence survives a missing target and current target data is kept separate", async () => {
  const snapshot = {
    name: "Original league",
    captured_at: "2026-10-01T00:00:00Z",
  };
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("report")
        ? [{
          report_id: id,
          target_type: "mini_league",
          target_id: other,
          evidence: snapshot,
        }]
        : [],
    }),
  });
  const r = await f.request(`reports/${id}/context`);
  assert.equal(r.json.data.target_missing, true);
  assert.deepEqual(r.json.data.evidence_snapshot, snapshot);
  assert.equal(r.json.data.private_decision, null);
  assert.ok(path(f, "mini_league"));
});
test("native and deprecated user/group names query only real 0.4 database columns", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{ username: "alex", organiser_group_id: other }],
    }),
  });
  const r = await f.request("player?select=username,displayName");
  assert.deepEqual(r.json, [{ username: "alex", displayName: "alex" }]);
  assert.equal(
    path(f, "player").url.searchParams.get("select"),
    "username,username",
  );
  const g = await f.request(
    "game_post?select=organiserGroupId,organiserClubId",
  );
  assert.deepEqual(g.json, [{
    organiserGroupId: other,
    organiserClubId: other,
  }]);
});
test("expired results, report categories and result notification types are accepted", async () => {
  const f = fixture();
  assert.equal(
    (await f.request("results?status=expired")).response.status,
    200,
  );
  assert.equal(
    (await f.request("reports?category=harassment&target_type=mini_league"))
      .response.status,
    200,
  );
  assert.equal(
    (await f.request("notifications?type=result_confirmed")).response.status,
    200,
  );
  assert.equal(
    (await f.request("notifications?type=result_expired")).response.status,
    200,
  );
});
test("shared leaderboard retains scope, explicit state and page boundary", async () => {
  const f = fixture({ dbReply: () => ({ body: { rows: [], total: 0 } }) });
  const r = await f.request(
    "rankings/leaderboard?scope=state&state=VIC&limit=10&offset=20",
  );
  assert.equal(r.response.status, 200);
  assert.deepEqual(path(f, "get_leaderboard").body, {
    p_scope: "state",
    p_state: "VIC",
    p_limit: 10,
    p_offset: 20,
  });
});
for (
  const endpoint of [
    `users/${id}/rating`,
    `users/${id}/rating_trend`,
    `users/${id}/rating_history`,
    `users/${id}/registration`,
    "result_flags",
    "rankings/leaderboard",
  ]
) {
  test(`new endpoint denies non-admin and all writes: ${endpoint}`, async () => {
    const f = fixture({ user: { ...admin, app_metadata: {} } });
    assert.equal((await f.request(endpoint)).response.status, 403);
    assert.equal(f.calls.length, 1);
    const a = fixture();
    assert.equal(
      (await a.request(endpoint, { method: "POST", body: {} })).response.status,
      405,
    );
    assert.equal(a.calls.length, 1);
  });
}
for (
  const endpoint of [
    `users/${id}/rating_trend?days=366`,
    `users/${id}/rating_trend?days=1&days=2`,
    `users/${id}/rating_history?player_id=${other}`,
    `users/${id}/rating_history?result_id=bad`,
    `users/${id}/rating_history?played_from=2026-02-01T00:00:00Z&played_to=2026-01-01T00:00:00Z`,
    "result_flags?kind=unknown",
    "result_flags?match_id=bad",
    "rankings/leaderboard?scope=all",
    "rankings/leaderboard?state=invalid",
    `games?organiser_club_id=${id}&organiser_club_id=${other}`,
  ]
) {
  test(`malformed new filter cannot reach the database: ${endpoint}`, async () => {
    const f = fixture();
    assert.equal((await f.request(endpoint)).response.status, 400);
    assert.equal(f.calls.length, 1);
  });
}
test("rating RPC outages return a safe error instead of invented values", async () => {
  const f = fixture({
    dbReply: (c) =>
      c.url.pathname.includes("/rpc/")
        ? {
          status: 500,
          body: { code: "XX000", message: "private SQL detail" },
        }
        : { body: [{ player_id: id }] },
  });
  const r = await f.request(`users/${id}/rating`);
  assert.equal(r.response.status, 503);
  assert.doesNotMatch(JSON.stringify(r.json), /private SQL/);
});
test("old club filters map to one group predicate without contradictory constraints", async () => {
  const f = fixture();
  const r = await f.request("reports?target_type=club");
  assert.equal(r.response.status, 200);
  assert.deepEqual(path(f, "report").url.searchParams.getAll("target_type"), [
    "eq.group",
  ]);
});
for (const name of ["admin_rebuild_ratings", "admin_delete_game_post"]) {
  test(`upstream rating-affecting RPC remains prohibited: ${name}`, async () => {
    const f = fixture();
    const r = await f.request(`rpc/${name}`, {
      method: "POST",
      raw: "invalid JSON",
    });
    assert.equal(r.response.status, 405);
    assert.equal(f.calls.length, 1);
  });
}
