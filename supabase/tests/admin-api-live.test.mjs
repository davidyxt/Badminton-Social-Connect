// Real Auth, Edge Function and PostgREST integration test. Local stack only.
// Run from the repository root: node supabase/tests/admin-api-live.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

const bundledCli = process.env.LOCALAPPDATA && join(
  process.env.LOCALAPPDATA, "BadmintonDevTools", "node_modules", ".bin", "supabase.cmd",
);
const cli = process.env.SUPABASE_CLI ||
  (bundledCli && existsSync(bundledCli) ? bundledCli : "supabase");
const command = process.platform === "win32"
  ? ["powershell.exe", ["-NoProfile", "-Command", "& $env:LIVE_TEST_SUPABASE_CLI status -o json; if ($LASTEXITCODE) { exit $LASTEXITCODE }"]]
  : [cli, ["status", "-o", "json"]];
const status = JSON.parse(execFileSync(command[0], command[1], {
  encoding: "utf8", timeout: 30_000,
  cwd: process.env.SUPABASE_WORKDIR || process.cwd(),
  env: { ...process.env, LIVE_TEST_SUPABASE_CLI: cli },
  stdio: ["ignore", "pipe", "pipe"],
}));
const base = status.API_URL;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "This test refuses to create users or fixtures on a remote Supabase project.");
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, "Local keys are unavailable.");
const users = [];
const posts = [];
const fixtures = [];
let checks = 0;

function check(label, verify) {
  verify();
  checks++;
  console.log(`PASS ${label}`);
}
async function request(path, { token, privileged = false, method = "GET", body, headers = {} } = {}) {
  const key = privileged ? status.SERVICE_ROLE_KEY : status.ANON_KEY;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token || privileged ? { Authorization: `Bearer ${token || key}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
}
const api = (path, token, method = "GET", body, headers) =>
  request(`/functions/v1/admin-api/${path}`, { token, method, body, headers });
const rest = (path, token, method = "GET", body, privileged = false) =>
  request(`/rest/v1/${path}`, {
    token, method, body, privileged, headers: { Prefer: "return=representation" },
  });
function success(reply, expected = 200) {
  // Deliberately omit response bodies: Auth responses may contain credentials.
  assert.equal(reply.status, expected, `HTTP ${reply.status}; error code: ${reply.data?.code || reply.data?.error?.code || "none"}`);
  return reply.data;
}
async function createUser(role) {
  const password = `LocalTest9!${randomUUID()}`;
  const email = `admin-live-${role}-${randomUUID()}@example.com`;
  const created = success(await request("/auth/v1/admin/users", {
    privileged: true, method: "POST",
    body: {
      email, password, email_confirm: true,
      app_metadata: role === "admin" ? { role: "admin" } : {},
      user_metadata: { display_name: `Local ${role}`, role: "admin" },
    },
  }));
  users.push(created.id);
  const login = success(await request("/auth/v1/token?grant_type=password", {
    method: "POST", body: { email, password },
  }));
  assert.ok(login.access_token, "Local sign-in failed.");
  return { id: created.id, token: login.access_token, email };
}

try {
  const admin = await createUser("admin");
  const player = await createUser("player");
  const other = await createUser("other");
  check("real Auth sign-in and signup database trigger", () => assert.equal(users.length, 3));
  const me = success(await api("me", admin.token));
  check("administrator role comes from app_metadata", () => assert.equal(me.data.id, admin.id));
  const deniedAdmin = await api("me", player.token);
  check("ordinary user cannot call admin API, even with user_metadata.role=admin", () => assert.equal(deniedAdmin.status, 403));
  const unsigned = await api("me");
  check("unsigned caller is rejected", () => assert.equal(unsigned.status, 401));
  const invalidToken = await api("me", "invalid-token");
  check("invalid token is rejected by runtime/Auth", () => assert.equal(invalidToken.status, 401));
  const preflight = await api("player", undefined, "OPTIONS", undefined, {
    Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "authorization,apikey",
  });
  check("browser CORS preflight works through local gateway", () => {
    // Kong answers preflight before forwarding to the function's OPTIONS handler.
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.ok(preflight.headers.get("access-control-allow-headers").includes("authorization"));
  });
  const browserRead = await api("me", admin.token, "GET", undefined, { Origin: "http://localhost:5173" });
  success(browserRead);
  check("authenticated browser response works through gateway CORS", () =>
    assert.equal(browserRead.headers.get("access-control-allow-origin"), "*"));
  const blockedOrigin = await api("me", admin.token, "GET", undefined, { Origin: "https://untrusted.example" });
  check("function rejects unconfigured browser origins", () => assert.equal(blockedOrigin.status, 403));
  const overview = success(await api("overview", admin.token));
  check("overview counts query the real database", () => assert.ok(overview.data.registered_users >= 3));

  for (const route of ["player", "player_profile", "report", "dispute", "game_post", "mini_league", "match", "match_participant", "match_result", "league_standing", "ranking", "notification", "admin_post", "venue", "cancellation_record", "check_in"]) {
    const reply = await api(`${route}?limit=1`, admin.token);
    success(reply);
    check(`team contract GET ${route}`, () => assert.ok(Array.isArray(reply.data)));
  }
  for (const route of ["users", "reports", "disputes", "games", "leagues", "matches", "results", "rankings", "announcements", "notifications"]) {
    const data = success(await api(`${route}?limit=1`, admin.token));
    check(`legacy GET ${route}`, () => assert.ok(Array.isArray(data.data)));
  }
  const account = success(await api(`users/${player.id}`, admin.token));
  check("Auth account summary exposes only allowed fields", () => {
    assert.deepEqual(Object.keys(account.data.account).sort(), ["email", "email_confirmed_at", "last_sign_in_at"].sort());
  });
  const profile = success(await api(`player_profile?playerId=eq.${player.id}`, admin.token));
  check("profile reliability score uses contract scale", () => assert.equal(profile[0].reliabilityScore, 1));

  const own = success(await rest(`player?player_id=eq.${player.id}`, player.token));
  check("signup creates player with display name", () => assert.equal(own[0].display_name, "Local player"));
  success(await rest(`player_profile?player_id=eq.${other.id}`, other.token, "PATCH", { is_discoverable: false }));
  const hidden = success(await rest(`player_profile?player_id=eq.${other.id}`, player.token));
  check("RLS hides another player's private profile", () => assert.equal(hidden.length, 0));
  const visible = success(await api(`player_profile?playerId=eq.${other.id}`, admin.token));
  check("admin can inspect private profiles through RLS", () => assert.equal(visible.length, 1));
  const cross = success(await rest(`player_profile?player_id=eq.${other.id}`, player.token, "PATCH", { bio: "unauthorized" }));
  check("RLS blocks cross-user profile edits", () => assert.equal(cross.length, 0));
  for (const [label, path, method, body] of [
    ["self-verification", `player?player_id=eq.${player.id}`, "PATCH", { is_verified: true }],
    ["self-awarded reliability", `player_profile?player_id=eq.${player.id}`, "PATCH", { reliability_score: 100 }],
    ["self-awarded ranking", "ranking", "POST", { player_id: player.id, format: "singles", ranking_points: 9999 }],
    ["unsolicited notification", "notification", "POST", { player_id: other.id, type: "system", message: "unauthorized" }],
  ]) {
    const denied = await rest(path, player.token, method, body);
    check(`database blocks ${label}`, () => {
      assert.equal(denied.status, 403);
      assert.equal(denied.data.code, "42501");
    });
  }

  const postId = randomUUID();
  posts.push(postId);
  const draft = success(await api("admin_post", admin.token, "POST", {
    adminPostId: postId, title: "Local live test", body: "Temporary integration fixture",
  }), 201);
  check("draft creation returns camelCase and server-assigned creator", () => {
    assert.equal(draft.adminPostId, postId);
    assert.equal(draft.createdBy, admin.id);
    assert.equal(draft.status, "draft");
  });
  const row = success(await rest(`admin_post?admin_post_id=eq.${postId}`, undefined, "GET", undefined, true))[0];
  check("announcement is persisted with audit identity", () => assert.equal(row.updated_by, admin.id));
  const drafts = success(await rest(`admin_post?admin_post_id=eq.${postId}`, player.token));
  check("players cannot read drafts directly", () => assert.equal(drafts.length, 0));
  const missingImage = await api(`admin_post?adminPostId=eq.${postId}`, admin.token, "PATCH", { status: "published" });
  check("publication without image returns 422", () => assert.equal(missingImage.status, 422));
  const published = success(await api(`admin_post?adminPostId=eq.${postId}`, admin.token, "PATCH", {
    status: "published", imageUrl: "https://example.com/local-test.png",
  }))[0];
  check("publication persists image and publication timestamp", () => assert.ok(published.publishedAt));
  const publicPost = success(await rest(`admin_post?admin_post_id=eq.${postId}`, player.token));
  check("published announcement is visible to players", () => assert.equal(publicPost.length, 1));
  const edited = success(await api(`admin_post?adminPostId=eq.${postId}`, admin.token, "PATCH", { body: "Edited fixture" }))[0];
  check("content edits preserve publication timestamp", () => assert.equal(edited.publishedAt, published.publishedAt));
  const range = await api("admin_post", admin.token, "GET", undefined, { Range: "0-0", "Range-Unit": "items" });
  success(range);
  check("contract response includes pagination headers", () => assert.ok(range.headers.get("content-range")));
  const backToDraft = await api(`admin_post?adminPostId=eq.${postId}`, admin.token, "PATCH", { status: "draft" }, { Prefer: "return=minimal" });
  check("minimal PATCH returns 204", () => assert.equal(backToDraft.status, 204));
  const reset = success(await rest(`admin_post?admin_post_id=eq.${postId}`, undefined, "GET", undefined, true))[0];
  check("unpublishing clears published_at in database", () => assert.equal(reset.published_at, null));

  const report = success(await rest("report", player.token, "POST", {
    reported_by_player_id: player.id, target_type: "player", target_id: other.id,
    reason: "Temporary live test report",
  }), 201)[0];
  const updated = success(await api(`reports/${report.report_id}`, admin.token, "PATCH", {
    status: "under_review", expected_updated_at: report.updated_at,
  })).data;
  check("admin report update records actor and status", () => {
    assert.equal(updated.status, "under_review");
    assert.equal(updated.updated_by, admin.id);
  });
  const stale = await api(`reports/${report.report_id}`, admin.token, "PATCH", {
    status: "resolved", expected_updated_at: report.updated_at,
  });
  check("stale database timestamp rejects overwrites with 409", () => assert.equal(stale.status, 409));
  const mapped = success(await api(`report?reportId=eq.${report.report_id}`, admin.token));
  check("report status maps under_review to reviewing", () => assert.equal(mapped[0].status, "reviewing"));
  const blocked = await api("rpc/admin_review_report", admin.token, "POST", { reportId: report.report_id, outcome: "resolved" });
  check("unsupported moderation returns explicit 501", () => assert.equal(blocked.status, 501));
  const unchanged = success(await rest(`report?report_id=eq.${report.report_id}`, admin.token))[0];
  check("unsupported moderation performs no partial write", () => assert.equal(unchanged.status, "under_review"));

  const notification = success(await api("notifications", admin.token, "POST", {
    player_id: player.id, type: "system", message: "Temporary live test notification",
  }), 201).data;
  const inbox = success(await rest(`notification?notification_id=eq.${notification.notification_id}`, player.token));
  check("administrator notification is delivered to target inbox", () => assert.equal(inbox.length, 1));
  const wrongInbox = success(await rest(`notification?notification_id=eq.${notification.notification_id}`, other.token));
  check("notification is private to its recipient", () => assert.equal(wrongInbox.length, 0));
  const rankings = success(await rest(`ranking?player_id=eq.${player.id}`, player.token));
  check("no ranking algorithm or points are fabricated", () => assert.equal(rankings.length, 0));

  async function seed(table, key, record) {
    const id = randomUUID();
    fixtures.unshift([table, key, id]);
    return success(await rest(table, undefined, "POST", { ...record, [key]: id }, true), 201)[0];
  }
  async function patchStatus(resource, id, record, patch) {
    return success(await api(`${resource}/${id}`, admin.token, "PATCH", {
      ...patch, expected_updated_at: record.updated_at,
    })).data;
  }
  const game = await seed("game_post", "post_id", {
    organiser_id: player.id, format: "singles", proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const gameBlocked = await api(`games/${game.post_id}`, admin.token, "PATCH", { status: "cancelled", expected_updated_at: game.updated_at });
  check("Final v6 blocks lifecycle changes as a substitute for hiding a game", () => assert.equal(gameBlocked.status, 405));
  const league = await seed("mini_league", "league_id", {
    organiser_id: player.id, name: "Temporary test league",
    start_date: new Date().toISOString(), end_date: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const leagueBlocked = await api(`leagues/${league.league_id}`, admin.token, "PATCH", { status: "active", expected_updated_at: league.updated_at });
  check("Final v6 blocks lifecycle changes as a substitute for league moderation", () => assert.equal(leagueBlocked.status, 405));
  const match = await seed("match", "match_id", { created_by: player.id, format: "singles", league_id: league.league_id });
  success(await rest("match_participant", undefined, "POST", [
    { match_id: match.match_id, player_id: player.id, side: "a", status: "playing" },
    { match_id: match.match_id, player_id: other.id, side: "b", status: "playing" },
  ], true), 201);
  const matchReadOnly = await api(`matches/${match.match_id}`, admin.token, "PATCH", {
    status: "completed", expected_updated_at: match.updated_at,
  });
  check("match resource remains read-only in the admin API", () => assert.equal(matchReadOnly.status, 405));
  const matchSaved = success(await rest(`match?match_id=eq.${match.match_id}`, admin.token, "PATCH", { status: "completed" }))[0];
  check("database match completion validates real singles lineup", () => assert.equal(matchSaved.status, "completed"));
  const pending = await seed("match_result", "result_id", {
    match_id: match.match_id, submitted_by: player.id, score: "21-15,21-17", winning_side: "a",
  });
  const confirmationBlocked = await api(`results/${pending.result_id}`, admin.token, "PATCH", { status: "confirmed", winning_side: "a", expected_updated_at: pending.updated_at });
  check("Final v6 prohibits confirming results for players", () => assert.equal(confirmationBlocked.status, 405));
  const unchangedResult = success(await rest(`match_result?result_id=eq.${pending.result_id}`, admin.token))[0];
  check("blocked confirmation leaves persisted result pending", () => assert.equal(unchangedResult.status, "pending"));
  // Privileged fixture setup tests the database rule, not an admin API action.
  success(await rest(`match_result?result_id=eq.${pending.result_id}`, undefined, "PATCH", { status: "confirmed" }, true));
  const duplicate = await seed("match_result", "result_id", {
    match_id: match.match_id, submitted_by: other.id, score: "21-15,21-17", winning_side: "a",
  });
  const conflict = await rest(`match_result?result_id=eq.${duplicate.result_id}`, undefined, "PATCH", { status: "confirmed", winning_side: "a" }, true);
  check("database refuses two confirmed results for one match", () => assert.equal(conflict.status, 409));
  const dispute = await seed("dispute", "dispute_id", {
    match_id: match.match_id, raised_by: other.id, reason: "Temporary result dispute",
  });
  const disputeSaved = await patchStatus("disputes", dispute.dispute_id, dispute, { status: "under_review" });
  check("admin dispute triage respects existing database statuses", () => assert.equal(disputeSaved.status, "under_review"));
  const singlesRanking = success(await rest("ranking", undefined, "POST", {
    player_id: player.id, format: "singles", ranking_points: 100,
  }, true), 201)[0];
  success(await rest("ranking", undefined, "POST", {
    player_id: player.id, format: "doubles", ranking_points: 200,
  }, true), 201);
  const correctionBlocked = await api(`rankings/${player.id}/singles`, admin.token, "PATCH", {
    ranking_points: 123, expected_updated_at: singlesRanking.updated_at,
  });
  check("Final v6 prohibits manual ranking corrections", () => assert.equal(correctionBlocked.status, 405));
  const singles = success(await rest(`ranking?player_id=eq.${player.id}&format=eq.singles`, player.token))[0];
  check("blocked correction leaves persisted singles points unchanged", () => assert.equal(singles.ranking_points, 100));
  const doubles = success(await rest(`ranking?player_id=eq.${player.id}&format=eq.doubles`, player.token))[0];
  check("blocked correction does not modify doubles ranking", () => assert.equal(doubles.ranking_points, 200));
  const resultContract = success(await api(`match_result?resultId=eq.${pending.result_id}`, admin.token));
  check("real result contract exposes winningSide instead of inventing winnerId", () => {
    assert.equal(resultContract[0].winningSide, "a"); assert.equal(Object.hasOwn(resultContract[0], "winnerId"), false);
  });

  const capabilities = success(await api("capabilities", admin.token)).data;
  check("capabilities describe Final v6 policy and missing schema", () => {
    assert.ok(capabilities.read_only.includes("results")); assert.ok(capabilities.unavailable.activity_log);
  });
  const emailSearch = success(await api(`users?q=${encodeURIComponent(player.email)}&include=account`, admin.token));
  check("email search uses real Auth and includes only matching player", () => {
    assert.equal(emailSearch.data.length, 1); assert.equal(emailSearch.data[0].player_id, player.id);
    assert.equal(emailSearch.data[0].account.email, player.email);
  });
  const exactSearch = success(await api(`users?q=${player.id}`, admin.token));
  check("exact ID search finds a player", () => assert.equal(exactSearch.data[0].player_id, player.id));
  const namedRanking = success(await api("rankings?q=Local%20player&format=singles", admin.token));
  check("ranking name search includes joined player identity", () => {
    assert.equal(namedRanking.data[0].player.display_name, "Local player"); assert.equal(namedRanking.data[0].ranking_points, 100);
  });
  const noRankings = success(await api(`rankings?q=Absent-${randomUUID()}`, admin.token));
  check("no matching name returns an empty filtered ranking list", () => assert.equal(noRankings.data.length, 0));
  const gameSearch = success(await api(`games?q=${game.post_id}`, admin.token));
  check("game ID search includes organiser identity", () => assert.equal(gameSearch.data[0].organiser.player_id, player.id));
  const nameMatches = success(await api("matches?q=Local%20other", admin.token));
  check("match search resolves participant names", () => assert.ok(nameMatches.data.some((row) => row.match_id === match.match_id)));
  const nameResults = success(await api("results?q=Local%20other", admin.token));
  check("result search resolves participant names", () => assert.ok(nameResults.data.some((row) => row.result_id === pending.result_id)));
  const reportContext = success(await api(`reports/${report.report_id}/context`, admin.token)).data;
  check("report context links reporter and current target without inventing evidence", () => {
    assert.equal(reportContext.reporter.player_id, player.id); assert.equal(reportContext.target.player_id, other.id);
    assert.equal(reportContext.evidence_snapshot, null);
  });
  const matchContext = success(await api(`matches/${match.match_id}/context`, admin.token)).data;
  check("match context returns sides, scores and disputes read-only", () => {
    assert.equal(matchContext.participants.length, 2); assert.equal(matchContext.results.length, 2);
    assert.equal(matchContext.disputes.length, 1); assert.equal(matchContext.read_only, true);
  });
  const userGames = success(await api(`users/${player.id}/games?status=accepted`, admin.token));
  check("user participation joins real game record and organiser roster", () => assert.equal(userGames.data[0].game.post_id, game.post_id));
  const userMatches = success(await api(`users/${player.id}/matches`, admin.token));
  check("user matches join real match record", () => assert.equal(userMatches.data[0].match.match_id, match.match_id));
  success(await rest("league_standing", undefined, "POST", { league_id: league.league_id, player_id: player.id, points: 10, position: 1 }, true), 201);
  const userLeagues = success(await api(`users/${player.id}/leagues`, admin.token));
  check("user league history returns stored standings and league identity", () => assert.equal(userLeagues.data[0].league.league_id, league.league_id));
  const standings = success(await api(`leagues/${league.league_id}/standings?q=Local%20player`, admin.token));
  check("league standings search returns real participant names", () => assert.equal(standings.data[0].player.player_id, player.id));
  const summary = success(await api(`users/${player.id}/summary`, admin.token)).data;
  check("user summary reads stored singles ranking and accepted joins", () => {
    assert.equal(summary.singles_ranking.ranking_points, 100); assert.ok(summary.games_joined >= 1); assert.equal(summary.ranking_history, null);
  });
  const attention = success(await api("overview/attention", admin.token)).data;
  check("attention queues include unresolved report and read-only result", () => {
    assert.ok(attention.reports.data.some((r) => r.report_id === report.report_id)); assert.equal(attention.results.read_only, true);
  });
  const extensions = success(await api(`game_post?postId=eq.${game.post_id}&select=organiserId,playerLimit,updatedAt`, admin.token));
  check("team read extensions match real columns and version timestamp", () => {
    assert.equal(extensions[0].organiserId, player.id); assert.equal(extensions[0].playerLimit, 4); assert.ok(extensions[0].updatedAt);
  });
  const obsoleteGroup = await api("game_post?select=groupId", admin.token);
  check("obsolete groupId is explicit 501 rather than a missing-column failure", () => assert.equal(obsoleteGroup.status, 501));
  const resolutionBlocked = await api("rpc/resolve_dispute", admin.token, "POST", { disputeId: dispute.dispute_id, outcome: "upheld" });
  check("Final v6 also blocks obsolete dispute resolution with score/rating changes", () => assert.equal(resolutionBlocked.status, 405));

  // Controlled historical fixtures verify inclusive local days and raw counts.
  success(await rest(`player?player_id=eq.${player.id}`, undefined, "PATCH", { joined_at: "2026-02-01T00:00:00Z" }, true));
  success(await rest(`report?report_id=eq.${report.report_id}`, undefined, "PATCH", { created_at: "2026-02-01T00:00:00Z" }, true));
  const analytics = success(await api("analytics?start=2026-02-01&end=2026-02-01", admin.token)).data;
  for (const [name, table, field] of [["new_users", "player", "joined_at"], ["reports_received", "report", "created_at"]]) {
    const direct = await request(`/rest/v1/${table}?select=*&${field}=gte.2026-01-31T13:00:00Z&${field}=lt.2026-02-01T13:00:00Z`, { method: "HEAD", token: admin.token, headers: { Prefer: "count=exact" } });
    success(direct);
    check(`analytics ${name} equals exact real database count`, () => {
      assert.equal(analytics.metrics[name].total, Number(direct.headers.get("content-range").split("/")[1])); assert.ok(analytics.metrics[name].total >= 1);
    });
  }
  check("analytics uses Melbourne complete days and explicit unavailable usage", () => {
    assert.equal(analytics.timezone, "Australia/Melbourne"); assert.equal(analytics.unavailable.app_usage.value, null);
    assert.deepEqual(analytics.previous_period, { start: "2026-01-31", end: "2026-01-31" });
  });

  const deleted = await api(`admin_post?adminPostId=eq.${postId}`, admin.token, "DELETE");
  check("announcement DELETE returns 204", () => assert.equal(deleted.status, 204));
  const gone = success(await rest(`admin_post?admin_post_id=eq.${postId}`, undefined, "GET", undefined, true));
  check("announcement DELETE removes actual database row", () => assert.equal(gone.length, 0));
  console.log(`\n${checks} real-stack checks passed.`);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  // Only delete this run's fixtures. Auth deletion cascades profiles/reports/inbox.
  for (const id of posts) {
    try { success(await rest(`admin_post?admin_post_id=eq.${id}`, undefined, "DELETE", undefined, true)); }
    catch { console.error("Cleanup failed for a test announcement."); process.exitCode = 1; }
  }
  for (const [table, key, id] of fixtures) {
    try { success(await rest(`${table}?${key}=eq.${id}`, undefined, "DELETE", undefined, true)); }
    catch { console.error(`Cleanup failed for a test ${table} fixture.`); process.exitCode = 1; }
  }
  for (const id of users.reverse()) {
    try { success(await request(`/auth/v1/admin/users/${id}`, { privileged: true, method: "DELETE" })); }
    catch { console.error("Cleanup failed for a test user."); process.exitCode = 1; }
  }
  console.log("Temporary test account and data cleanup finished.");
}
