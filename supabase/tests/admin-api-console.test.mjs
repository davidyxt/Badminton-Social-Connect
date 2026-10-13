import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, fixture, id, stamp } from "./helpers/admin-api-fixture.mjs";
import {
  dayBoundary,
  localDay,
  mapLimited,
} from "../functions/admin-api/console.mjs";
import { createAdminApiClient } from "../../frontend/src/services/adminApiClient.mjs";
const other = "22222222-2222-4222-8222-222222222222";
const restCalls = (f) =>
  f.calls.filter((c) => c.url.pathname.startsWith("/rest/"));

test("capabilities distinguish read-only rules from missing schema and require admin", async () => {
  const f = fixture();
  const r = await f.request("capabilities");
  assert.equal(r.response.status, 200);
  assert.ok(r.json.data.read_only.includes("results"));
  assert.ok(r.json.data.unavailable.activity_log);
  assert.equal(restCalls(f).length, 0);
  const denied = fixture({ user: { ...admin, app_metadata: {} } });
  assert.equal((await denied.request("capabilities")).response.status, 403);
});
for (const resource of ["games", "leagues", "matches", "results", "rankings"]) {
  test(`Final v6 blocks ${resource} changes without table or privileged calls`, async () => {
    const f = fixture();
    const path = `${resource}/${id}${
      resource === "rankings" ? "/singles" : ""
    }`;
    assert.equal(
      (await f.request(path, { method: "PATCH", raw: "{" })).response.status,
      405,
    );
    assert.equal(f.calls.length, 1);
  });
}
for (
  const path of [
    "users?sort=password",
    "reports?direction=reverse",
    "games?include=secret",
    "rankings?created_from=2026-10-01T00:00:00Z",
    "users?is_verified=1",
    "users?self_rating_band=expert",
    "reports?status=open&status=resolved",
    "users?created_from=invalid",
    "users?created_from=2026-10-02T00:00:00Z&created_to=2026-10-01T00:00:00Z",
  ]
) {
  test(`invalid console filter is rejected: ${path}`, async () => {
    const f = fixture();
    assert.equal((await f.request(path)).response.status, 400);
    assert.equal(restCalls(f).length, 0);
  });
}
test("search literals cannot inject PostgREST OR conditions", async () => {
  const f = fixture();
  await f.request(
    `users?q=${encodeURIComponent('A",status.eq.suspended,(%_')}`,
  );
  assert.equal(
    f.calls.at(-1).url.searchParams.get("or"),
    '(username.ilike."%A\\",status.eq.suspended,(\\\\%\\\\_%")',
  );
});
test("UUID search includes exact player ID as well as display name", async () => {
  const f = fixture();
  await f.request(`users?q=${id}`);
  assert.ok(
    f.calls.at(-1).url.searchParams.get("or").includes(`player_id.eq.${id}`),
  );
});
test("email search scans Auth pages and never exposes metadata or service key", async () => {
  const accounts = [
    ...Array.from(
      { length: 100 },
      () => ({ ...admin, email: "someone@example.test" }),
    ),
    {
      ...admin,
      id: other,
      email: "find-me@example.test",
      app_metadata: { secret: "hidden" },
    },
  ];
  const f = fixture({
    accounts,
    dbReply: () => ({ body: [{ player_id: other }] }),
  });
  const r = await f.request("users?q=find-me%40example.test");
  assert.equal(r.response.status, 200);
  assert.match(f.calls.at(-1).url.searchParams.get("or"), new RegExp(other));
  assert.equal(
    f.calls.filter((c) => c.url.pathname === "/auth/v1/admin/users").length,
    2,
  );
  assert.doesNotMatch(JSON.stringify(r.json), /hidden|test-server-key/);
  for (const c of restCalls(f)) {
    assert.equal(c.headers.get("apikey"), "test-public-key");
  }
  const denied = fixture({ user: { ...admin, app_metadata: {} } });
  assert.equal(
    (await denied.request("users?q=find-me%40example.test")).response.status,
    403,
  );
  assert.equal(denied.calls.length, 1);
});
test("user list account summaries are opt-in and whitelisted", async () => {
  const f = fixture({
    dbReply: () => ({ body: [{ player_id: id }] }),
    account: { ...admin, identities: [{ secret: true }] },
  });
  const r = await f.request(
    "users?include=account&is_verified=true&sort=username&direction=asc",
  );
  assert.deepEqual(Object.keys(r.json.data[0].account).sort(), [
    "email",
    "email_confirmed_at",
    "last_sign_in_at",
  ]);
  const c = restCalls(f)[0];
  assert.equal(c.url.searchParams.get("is_verified"), "eq.true");
  assert.equal(
    c.url.searchParams.get("order"),
    "username.asc.nullslast,player_id.asc",
  );
});
test("broad Auth email search returns an explicit narrowing error before table access", async () => {
  const f = fixture({ accounts: Array.from({ length: 201 }, () => admin) });
  const r = await f.request("users?q=example.test");
  assert.equal(r.response.status, 400);
  assert.equal(r.json.error.code, "search_too_broad");
  assert.equal(restCalls(f).length, 0);
});
test("ranking name search is server-filtered before pagination and includes player names", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("/player") ? [{ player_id: other }] : [],
      count: 29,
    }),
  });
  const r = await f.request("rankings?q=Alex&format=singles&page=2&limit=10");
  assert.equal(r.response.status, 200);
  assert.equal(r.json.pagination.total, 29);
  const c = f.calls.at(-1);
  assert.match(c.url.searchParams.get("or"), new RegExp(other));
  assert.equal(c.url.searchParams.get("offset"), "10");
  assert.match(c.url.searchParams.get("select"), /username/);
});
test("broad cross-resource name searches fail rather than truncate silently", async () => {
  const f = fixture({
    dbReply: () => ({
      body: Array.from({ length: 201 }, () => ({ player_id: id })),
    }),
  });
  assert.equal((await f.request("rankings?q=a")).response.status, 400);
  assert.equal(restCalls(f).length, 1);
});
test("no matching ranking names use an empty set, without inventing a sentinel ID", async () => {
  const f = fixture();
  const r = await f.request("rankings?q=MissingPerson");
  assert.equal(r.response.status, 200);
  assert.equal(f.calls.at(-1).url.searchParams.get("player_id"), "in.()");
});
test("game search matches club and individual hosts without using nonexistent titles", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("/groups")
        ? [{ group_id: other }]
        : c.url.pathname.endsWith("/player")
        ? [{ player_id: id }]
        : [],
    }),
  });
  assert.equal((await f.request("games?q=Team")).response.status, 200);
  const logic = f.calls.at(-1).url.searchParams.get("or");
  assert.ok(logic.includes(`organiser_group_id.in.(${other})`));
  assert.ok(logic.includes(`organiser_id.in.(${id})`));
});
test("match search combines exact ID with matching participants", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("/match_participant")
        ? [{ match_id: other }]
        : [],
    }),
  });
  await f.request(`matches?q=${id}`);
  const c = f.calls.at(-1);
  assert.ok(c.url.searchParams.get("or").includes(`match_id.eq.${id}`));
  assert.ok(c.url.searchParams.get("or").includes(`match_id.in.(${other})`));
});
test("report filters include actual club target and associated IDs", async () => {
  const f = fixture();
  await f.request(
    `reports?target_type=group&target_id=${other}&reported_by_player_id=${id}`,
  );
  const c = f.calls.at(-1);
  assert.equal(c.url.searchParams.get("target_type"), "eq.group");
  assert.equal(c.url.searchParams.get("target_id"), `eq.${other}`);
});
test("report context distinguishes current records from absent snapshots and deleted targets", async () => {
  for (const exists of [true, false]) {
    const f = fixture({
      dbReply: (c) => ({
        body: c.url.pathname.endsWith("/report")
          ? [{
            report_id: id,
            reported_by_player_id: id,
            target_type: "group",
            target_id: other,
          }]
          : c.url.pathname.endsWith("/groups")
          ? exists ? [{ group_id: other }] : []
          : [{ player_id: id, username: "Reporter" }],
      }),
    });
    const r = await f.request(`reports/${id}/context`);
    assert.equal(r.response.status, 200);
    assert.equal(r.json.data.target_missing, !exists);
    assert.equal(r.json.data.evidence_snapshot, null);
    assert.equal(r.json.data.private_decision, null);
    assert.equal(r.json.data.reporter.username, "Reporter");
  }
});
test("missing parents return 404 for new detail and participation endpoints", async () => {
  for (
    const path of [
      `users/${id}/games`,
      `users/${id}/summary`,
      `reports/${id}/context`,
      `matches/${id}/context`,
    ]
  ) {
    assert.equal((await fixture().request(path)).response.status, 404);
  }
});
test("user summary counts accepted joins, unresolved targeted reports and tied singles positions", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: c.url.pathname.endsWith("/ranking") && c.method !== "HEAD"
        ? [{ player_id: id, format: "singles", ranking_points: 100 }]
        : [{ player_id: id }],
      count: 2,
    }),
  });
  const r = await f.request(`users/${id}/summary`);
  assert.equal(r.json.data.rank_position, 3);
  assert.equal(r.json.data.games_joined, 2);
  assert.equal(r.json.data.ranking_history.paginated, true);
  assert.equal(r.json.data.account_state.state, "registration_pending");
  const c = f.calls.at(-1);
  assert.equal(c.url.searchParams.get("ranking_points"), "gt.100");
  assert.equal(c.url.searchParams.get("format"), "eq.singles");
});
for (const kind of ["games", "matches", "leagues"]) {
  test(`user ${kind} participation keeps parent constraints and paginates database embeds`, async () => {
    const f = fixture({
      dbReply: () => ({ body: [{ player_id: id }], count: 15 }),
    });
    const r = await f.request(`users/${id}/${kind}?page=2&limit=5`);
    assert.equal(r.response.status, 200);
    assert.equal(r.json.pagination.total, 15);
    const c = f.calls.at(-1);
    assert.equal(c.url.searchParams.get("player_id"), `eq.${id}`);
    assert.equal(c.url.searchParams.get("offset"), "5");
    assert.match(c.url.searchParams.get("select"), /!.*_fkey/);
  });
}
test("league standings search participant names and retain league boundary", async () => {
  const f = fixture({ dbReply: () => ({ body: [{ player_id: other }] }) });
  const r = await f.request(`leagues/${id}/standings?q=Alex`);
  assert.equal(r.response.status, 200);
  const c = f.calls.at(-1);
  assert.equal(c.url.searchParams.get("league_id"), `eq.${id}`);
  assert.equal(c.url.searchParams.get("player_id"), `in.(${other})`);
  assert.ok(
    c.url.searchParams.get("order").startsWith(
      "position.asc.nullslast,points.desc",
    ),
  );
});
test("overview attention queues retain unresolved states and mark results read-only", async () => {
  const f = fixture({ dbReply: () => ({ body: [], count: 12 }) });
  const r = await f.request("overview/attention?page=2&limit=5");
  assert.equal(r.json.data.results.read_only, true);
  assert.equal(r.json.data.reports.pagination.total, 12);
  assert.equal(
    restCalls(f)[0].url.searchParams.get("status"),
    "in.(open,under_review)",
  );
  assert.equal(
    restCalls(f)[1].url.searchParams.get("status"),
    "in.(pending,disputed)",
  );
});
test("Melbourne day boundaries handle both daylight-saving transitions", () => {
  assert.equal(dayBoundary("2026-10-04"), "2026-10-03T14:00:00.000Z");
  assert.equal(dayBoundary("2026-10-05"), "2026-10-04T13:00:00.000Z");
  assert.equal(
    Date.parse(dayBoundary("2026-04-06")) -
      Date.parse(dayBoundary("2026-04-05")),
    25 * 3600000,
  );
  assert.equal(localDay(Date.parse("2026-10-04T13:00:00Z")), "2026-10-05");
});
test("analytics uses exact bounded day counts and equal-length previous period", async () => {
  const f = fixture({
    dbReply: (c) => ({
      body: null,
      count: Date.parse(
          c.url.searchParams.getAll("registered_at").find((v) => v.startsWith("gte."))?.slice(4) ??
            c.url.searchParams.get("created_at")?.slice(4),
        ) >= Date.parse(dayBoundary("2026-10-04"))
        ? 2
        : 1,
    }),
  });
  const r = await f.request("analytics?start=2026-10-04&end=2026-10-05");
  assert.equal(r.response.status, 200);
  const a = r.json.data;
  assert.deepEqual(a.previous_period, {
    start: "2026-10-02",
    end: "2026-10-03",
  });
  assert.equal(a.metrics.new_users.total, 4);
  assert.equal(a.metrics.new_users.previous_total, 2);
  assert.equal(a.metrics.new_users.percent_change, 100);
  assert.equal(a.unavailable.app_usage.value, null);
  assert.equal(restCalls(f).length, 8);
  assert.ok(
    restCalls(f).every((c) =>
      c.method === "HEAD" && c.headers.get("apikey") === "test-public-key"
    ),
  );
  const startDay = restCalls(f).find((c) =>
    c.url.searchParams.getAll("registered_at").includes(
      `gte.${dayBoundary("2026-10-04")}`,
    )
  );
  assert.ok(
    startDay.url.searchParams.getAll("registered_at").includes(
      `lt.${dayBoundary("2026-10-05")}`,
    ),
  );
});
test("analytics avoids division by zero and fails on database outage", async () => {
  const f = fixture({ dbReply: () => ({ body: null, count: 0 }) });
  const r = await f.request("analytics?start=2026-01-01&end=2026-01-01");
  assert.equal(r.json.data.metrics.new_users.percent_change, null);
  const outage = fixture({
    dbReply: () => ({
      status: 500,
      body: { code: "XX000", message: "private SQL" },
    }),
  });
  const error = await outage.request(
    "analytics?start=2026-01-01&end=2026-01-01",
  );
  assert.equal(error.response.status, 503);
  assert.doesNotMatch(JSON.stringify(error.json), /private SQL/);
});
test("maximum 90-day analytics includes every day and exact counts", async () => {
  const f = fixture({ dbReply: () => ({ body: null, count: 3 }) });
  const r = await f.request("analytics?start=2026-01-01&end=2026-03-31");
  assert.equal(r.response.status, 200);
  assert.equal(r.json.data.metrics.new_users.by_day.length, 90);
  assert.equal(r.json.data.metrics.new_users.total, 270);
  assert.equal(restCalls(f).length, 360);
});
for (
  const query of [
    "start=2026-02-30",
    "start=2026-05-02&end=2026-05-01",
    "start=2026-01-01&end=2026-05-01",
    "end=2999-01-01",
    `end=${localDay(Date.now())}`,
    "timezone=UTC",
  ]
) {
  test(`invalid analytics period never reaches the database: ${query}`, async () => {
    const f = fixture();
    assert.equal((await f.request(`analytics?${query}`)).response.status, 400);
    assert.equal(restCalls(f).length, 0);
  });
}
test("concurrent account/count work is bounded and retains input order", async () => {
  let active = 0, peak = 0;
  const r = await mapLimited([1, 2, 3, 4, 5, 6], async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return n * 2;
  }, 3);
  assert.deepEqual(r, [2, 4, 6, 8, 10, 12]);
  assert.equal(peak, 3);
});
test("team read extensions expose real version fields and reject obsolete groupId", async () => {
  const f = fixture({
    dbReply: () => ({
      body: [{ updated_at: stamp, organiser_group_id: other, player_limit: 4 }],
    }),
  });
  const r = await f.request(
    "game_post?select=organiserClubId,playerLimit,updatedAt",
  );
  assert.deepEqual(r.json, [{
    organiserClubId: other,
    playerLimit: 4,
    updatedAt: stamp,
  }]);
  assert.equal(
    (await f.request("game_post?select=groupId")).response.status,
    501,
  );
});
test("frontend console helpers preserve current token and legacy error details", async () => {
  const calls = [];
  const client = createAdminApiClient({
    supabaseUrl: "https://test.example",
    apiKey: "public",
    getAccessToken: async () => "jwt",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        error: { code: "record_changed", message: "Reload" },
      }, { status: 409 });
    },
  });
  await assert.rejects(
    client.reportContext(id),
    (e) =>
      e.status === 409 && e.code === "record_changed" && e.message === "Reload",
  );
  assert.equal(
    calls[0].url.pathname,
    `/functions/v1/admin-api/reports/${id}/context`,
  );
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer jwt");
  for (
    const path of [
      "/users/../me",
      "/users?apikey=secret",
      "/users/#x",
      "https://other.example",
    ]
  ) await assert.rejects(client.request(path));
});
