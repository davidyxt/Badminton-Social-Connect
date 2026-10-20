import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { admin, fixture, id, stamp } from "./helpers/admin-api-fixture.mjs";
import { createAdminApiClient } from "../../frontend/src/services/adminApiClient.mjs";

// This fixture is extracted from the supplied team YAML, not the implementation.
const contract = JSON.parse(
  readFileSync(
    new URL("./fixtures/team-admin-contract.json", import.meta.url),
    "utf8",
  ),
);
const row = {
  admin_post_id: id,
  title: "Season",
  body: "Welcome",
  image_url: "https://images.example.test/card.png",
  display_order: 3,
  status: "draft",
  created_by: id,
  published_at: null,
  updated_at: stamp,
};
const announcements = (overrides = {}) =>
  fixture({
    dbReply: (call) => ({
      body: call.method === "POST"
        ? { ...row, ...overrides, ...call.body }
        : [{ ...row, ...overrides, ...call.body }],
    }),
  });

test("contract authentication errors are flat and never reach the database", async () => {
  for (
    const options of [{
      user: { ...admin, app_metadata: {}, user_metadata: { role: "admin" } },
    }, { authStatus: 401 }]
  ) {
    const f = fixture(options), r = await f.request("report");
    assert.ok([401, 403].includes(r.response.status));
    assert.deepEqual(
      Object.keys(r.json).sort(),
      Object.keys(contract.schemas.Error.properties).sort(),
    );
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  assert.equal(
    (await f.request("admin_post", { token: null })).response.status,
    401,
  );
  assert.equal(f.calls.length, 0);
});
test("team table path returns camelCase rows without an envelope", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{
        player_id: id,
        username: "Alex",
        self_rating_band: "beginner",
        is_verified: false,
        joined_at: stamp,
        updated_by: "private",
      }],
      count: 27,
    }),
  });
  const r = await f.request(
    `player?playerId=eq.${id}&select=playerId,displayName&order=joinedAt.desc&limit=10&offset=20`,
  );
  assert.deepEqual(r.json, [{ playerId: id, displayName: "Alex" }]);
  assert.equal(r.response.headers.get("content-range"), "20-20/27");
  const call = f.calls.at(-1);
  assert.equal(call.url.searchParams.get("player_id"), `eq.${id}`);
  assert.equal(call.url.searchParams.get("select"), "player_id,username");
  assert.equal(call.url.searchParams.get("offset"), "20");
  assert.equal(call.url.searchParams.get("limit"), "10");
  assert.equal(
    call.url.searchParams.get("order"),
    "joined_at.desc,player_id.asc",
  );
  assert.equal(call.headers.get("authorization"), "Bearer admin-token");
  assert.equal(call.headers.get("apikey"), "test-public-key");
});
test("Range pagination and zero limit return truthful counts", async () => {
  const f = fixture({ dbReply: () => ({ body: [], count: 35 }) });
  const r = await f.request("report", {
    headers: { Range: "10-19", "Range-Unit": "items" },
  });
  assert.equal(r.response.status, 200);
  assert.equal(f.calls.at(-1).url.searchParams.get("offset"), "10");
  assert.equal(f.calls.at(-1).url.searchParams.get("limit"), "10");
  assert.equal(r.response.headers.get("content-range"), "*/35");
  assert.equal(
    (await f.request("report?limit=0")).response.headers.get("content-range"),
    "*/35",
  );
});
for (
  const path of [
    "player?select=password",
    "player?select=playerId:secret",
    "player?playerId=in.(x)",
    "player?playerId=eq.invalid",
    "player?order=joinedAt.wrong",
    "player?limit=-1",
    "player?limit=1001",
    "player?offset=1.5",
    "player?page=2",
  ]
) {
  test(`invalid query fails before database access: ${path}`, async () => {
    const f = fixture(), r = await f.request(path);
    assert.equal(r.response.status, 422);
    assert.equal(r.json.code, "validation_failed");
    assert.equal(f.calls.length, 1);
  });
}
test("conflicting or malformed ranges fail before database access", async () => {
  for (
    const [path, range] of [["report?limit=5", "0-4"], ["report", "20-10"], [
      "report",
      "0-1001",
    ], ["report", "bytes=1-5"]]
  ) {
    const f = fixture();
    assert.equal(
      (await f.request(path, { headers: { Range: range } })).response.status,
      422,
    );
    assert.equal(f.calls.length, 1);
  }
});
test("existing profile and report values are translated to the team units", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{
        player_id: id,
        reliability_score: "82.50",
        report_id: id,
        status: "under_review",
      }],
    }),
  });
  assert.deepEqual(
    (await f.request("player_profile?select=playerId,reliabilityScore")).json,
    [{ playerId: id, reliabilityScore: 0.825 }],
  );
  assert.deepEqual((await f.request("report?select=reportId,status")).json, [{
    reportId: id,
    status: "reviewing",
  }]);
});
test("doubles results expose the real side and never invent a single winner", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{
        result_id: id,
        match_id: id,
        score: "21-18",
        status: "confirmed",
        winning_side: "b",
      }],
    }),
  });
  const r = await f.request("match_result");
  assert.equal(r.json[0].winningSide, "b");
  assert.equal("winnerId" in r.json[0], false);
  assert.deepEqual((await f.request("match_result?select=winningSide")).json, [{
    winningSide: "b",
  }]);
  const before = f.calls.length;
  assert.equal(
    (await f.request("match_result?select=winnerId")).response.status,
    501,
  );
  assert.equal(f.calls.length, before + 1);
});
test("announcement creation follows the supplied schema and sets creator on server", async () => {
  const f = announcements();
  const r = await f.request("admin_post", {
    method: "POST",
    body: {
      title: "Season",
      imageUrl: row.image_url,
      displayOrder: 3,
      status: "published",
    },
  });
  assert.equal(r.response.status, 201);
  assert.equal(r.json.imageUrl, row.image_url);
  assert.equal(r.json.createdBy, id);
  assert.equal(Array.isArray(r.json), false);
  assert.ok(r.json.publishedAt);
  for (const key of Object.keys(r.json)) {
    assert.ok(
      key in contract.schemas.AdminPost.properties ||
        ["updatedAt", "updatedBy", "createdAt"].includes(key),
      key,
    );
  }
  const call = f.calls.at(-1);
  assert.equal(call.body.created_by, id);
  assert.equal(call.body.image_url, row.image_url);
  assert.equal(call.body.display_order, 3);
  assert.equal(call.body.status, "published");
});
test("draft creation accepts the contract's optional id without a picture", async () => {
  const f = announcements();
  const r = await f.request("admin_post", {
    method: "POST",
    body: { adminPostId: id, title: "Draft" },
  });
  assert.equal(r.response.status, 201);
  assert.equal(f.calls.at(-1).body.admin_post_id, id);
  assert.equal(f.calls.at(-1).body.status, "draft");
  assert.equal(f.calls.at(-1).body.published_at, null);
});
test("publishing requires a valid image and protects server-owned fields", async () => {
  for (
    const body of [
      { title: "Season", status: "published" },
      { title: "Season", imageUrl: "javascript:alert(1)" },
      { title: "Season", imageUrl: "https://u:p@example.test/x" },
      { title: "Season", createdBy: id },
      { title: "Season", displayOrder: 1.5 },
    ]
  ) {
    const f = announcements();
    const r = await f.request("admin_post", { method: "POST", body });
    assert.equal(r.response.status, 422);
    assert.equal(f.calls.length, 1);
  }
});
test("PATCH uses the team key filter, returns an array and checks concurrency internally", async () => {
  const f = announcements();
  const r = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH",
    body: {
      status: "published",
      imageUrl: "https://images.example.test/new.png",
    },
  });
  assert.equal(r.response.status, 200);
  assert.ok(Array.isArray(r.json));
  assert.equal(r.json[0].status, "published");
  assert.ok(r.json[0].publishedAt);
  assert.equal(
    f.calls.at(-1).url.searchParams.get("updated_at"),
    `eq.${stamp}`,
  );
});
test("ordinary content edits retain publication time, reverting to draft clears it", async () => {
  const f = announcements({ status: "published", published_at: stamp });
  const edited = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH",
    body: { title: "Edited" },
  });
  assert.equal(edited.json[0].publishedAt, stamp);
  assert.equal("published_at" in f.calls.at(-1).body, false);
  await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH",
    body: { status: "draft" },
  });
  assert.equal(f.calls.at(-1).body.published_at, null);
});
test("announcement caller version is checked before writing and retained in the atomic guard", async () => {
  const stale = announcements({ updated_at: "2026-10-20T12:00:00.000Z" });
  const refused = await stale.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH", body: { title: "Stale form", expectedUpdatedAt: stamp },
  });
  assert.equal(refused.response.status, 409);
  assert.equal(stale.calls.some((call) => call.method === "PATCH"), false);
  const current = announcements();
  const saved = await current.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH", body: { title: "Current form", expectedUpdatedAt: stamp },
  });
  assert.equal(saved.response.status, 200);
  assert.equal(current.calls.at(-1).url.searchParams.get("updated_at"), `eq.${stamp}`);
  assert.equal("expectedUpdatedAt" in current.calls.at(-1).body, false);
});
test("announcement caller version rejects malformed input", async () => {
  const f = announcements();
  const reply = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH", body: { title: "Invalid", expectedUpdatedAt: "not-a-version" },
  });
  assert.equal(reply.response.status, 422);
  assert.equal(f.calls.some((call) => call.method === "PATCH"), false);
});
test("a published announcement cannot lose its picture", async () => {
  const f = announcements({ status: "published", published_at: stamp });
  assert.equal(
    (await f.request(`admin_post?adminPostId=eq.${id}`, {
      method: "PATCH",
      body: { imageUrl: null },
    })).response.status,
    422,
  );
  assert.equal(f.calls.filter((c) => c.method === "PATCH").length, 0);
});
test("missing and changed announcements produce 404 and 409", async () => {
  const missing = fixture();
  assert.equal(
    (await missing.request(`admin_post?adminPostId=eq.${id}`, {
      method: "PATCH",
      body: { title: "Edited" },
    })).response.status,
    404,
  );
  const f = fixture({
    dbReply: (call) => ({ body: call.method === "PATCH" ? [] : [row] }),
  });
  const r = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH",
    body: { title: "Edited" },
  });
  assert.equal(r.response.status, 409);
  assert.equal(r.json.code, "record_changed");
});
test("DELETE is restricted to one announcement and returns an empty 204", async () => {
  const f = announcements();
  const r = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "DELETE",
  });
  assert.equal(r.response.status, 204);
  assert.equal(r.json, null);
  assert.equal(f.calls.at(-1).method, "DELETE");
  assert.equal(
    f.calls.at(-1).url.searchParams.get("admin_post_id"),
    `eq.${id}`,
  );
  assert.equal(
    f.calls.at(-1).headers.get("authorization"),
    "Bearer admin-token",
  );
  for (
    const path of [
      "admin_post",
      "admin_post?adminPostId=neq.invalid",
      `admin_post?adminPostId=eq.${id}&limit=1`,
    ]
  ) {
    const blocked = fixture();
    assert.equal(
      (await blocked.request(path, { method: "DELETE" })).response.status,
      422,
    );
    assert.equal(blocked.calls.length, 1);
  }
});
test("Prefer minimal produces empty bodies without hiding database errors", async () => {
  const f = announcements();
  const r = await f.request(`admin_post?adminPostId=eq.${id}`, {
    method: "PATCH",
    body: { title: "Edited" },
    headers: { Prefer: "return=minimal" },
  });
  assert.equal(r.response.status, 204);
  assert.equal(r.json, null);
  const invalid = await f.request("admin_post", {
    method: "POST",
    body: { title: "Draft" },
    headers: { Prefer: "return=minimal,return=representation" },
  });
  assert.equal(invalid.response.status, 422);
});
test("SQL errors use the team error shape and never expose SQL text", async () => {
  const f = fixture({
    dbReply: () => ({
      status: 400,
      body: { code: "23514", message: "sensitive SQL" },
    }),
  });
  const r = await f.request("admin_post", {
    method: "POST",
    body: { title: "Draft" },
  });
  assert.equal(r.response.status, 422);
  assert.deepEqual(Object.keys(r.json).sort(), ["code", "message"]);
  assert.doesNotMatch(JSON.stringify(r.json), /sensitive/);
});
for (const [path, operation] of Object.entries(contract.paths)) {
  test(`team operation rejects retired or unsupported mutations: ${path}`, async () => {
    const retired = path === "/rpc/resolve_dispute";
    const body = Object.fromEntries(
      Object.entries(
        operation.post.requestBody.content["application/json"].schema
          .properties,
      ).map((
        [key, field],
      ) => [key, field.format === "uuid" ? id : field.enum?.[0] ?? "Reviewed"]),
    );
    const f = fixture();
    const r = await f.request(path.slice(1), { method: "POST", body });
    assert.equal(r.response.status, retired ? 405 : 501);
    assert.equal(
      r.json.code,
      retired ? "method_not_allowed" : "schema_extension_required",
    );
    assert.equal(f.calls.length, 1);
    assert.equal(
      (await f.request(path.slice(1), { method: "POST", body: {} })).response
        .status,
      retired ? 405 : 422,
    );
  });
}
test("activity log is explicitly unavailable rather than an invented empty history", async () => {
  const f = fixture();
  assert.equal((await f.request("activity_log")).response.status, 501);
  assert.equal(f.calls.length, 1);
});
test("unknown RPCs and prototype names are not callable", async () => {
  const f = fixture();
  for (const name of ["unknown", "constructor", "toString"]) {
    assert.equal(
      (await f.request(`rpc/${name}`, { method: "POST", body: {} })).response
        .status,
      404,
    );
  }
  assert.equal(
    f.calls.filter((c) => c.url.pathname.startsWith("/rest")).length,
    0,
  );
});
test("contract CORS exposes pagination and permits DELETE and Range", async () => {
  const f = fixture();
  const r = await f.request("admin_post", {
    method: "OPTIONS",
    token: null,
    origin: "http://localhost:5173",
  });
  assert.match(
    r.response.headers.get("access-control-allow-methods"),
    /DELETE/,
  );
  assert.match(r.response.headers.get("access-control-allow-headers"), /range/);
  assert.match(
    r.response.headers.get("access-control-expose-headers"),
    /Content-Range/,
  );
});
test("frontend client uses adapter transport, current token and camelCase payload", async () => {
  const calls = [];
  let token = "first";
  const client = createAdminApiClient({
    supabaseUrl: "https://project.example.test/",
    apiKey: "public",
    getAccessToken: () => Promise.resolve(token),
    fetch: (url, options) => {
      calls.push({ url, options });
      return Promise.resolve(Response.json({ title: "Draft" }));
    },
  });
  await client.createAnnouncement({ title: "Draft", imageUrl: row.image_url });
  assert.equal(calls[0].url.pathname, "/functions/v1/admin-api/admin_post");
  assert.equal(calls[0].options.headers.get("authorization"), "Bearer first");
  token = "refreshed";
  await client.updateAnnouncement(id, { title: "Edited" });
  assert.equal(calls[1].url.searchParams.get("adminPostId"), `eq.${id}`);
  assert.equal(
    calls[1].options.headers.get("authorization"),
    "Bearer refreshed",
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), { title: "Edited" });
});
test("frontend client surfaces schema errors and handles empty DELETE responses", async () => {
  const client = createAdminApiClient({
    supabaseUrl: "https://project.example.test",
    apiKey: "public",
    getAccessToken: () => Promise.resolve("token"),
    fetch: (_url, options) =>
      Promise.resolve(
        options.method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({
            code: "schema_extension_required",
            message: "Needs schema",
          }, { status: 501 }),
      ),
  });
  assert.deepEqual(await client.deleteAnnouncement(id), {
    data: null,
    contentRange: null,
  });
  await assert.rejects(
    client.rpc("admin_review_report", { reportId: id, outcome: "resolved" }),
    (error) =>
      error.code === "schema_extension_required" && error.status === 501,
  );
});
