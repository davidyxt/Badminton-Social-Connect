// Final v6 console queries. All table access uses the caller's RLS client.
import { ContractError } from "./contract.mjs";
import {
  accountState,
  handleUpdatedRead,
  notificationTypes,
  registrationCount,
} from "./reads.mjs";
const fail = (status, code, message) => {
  throw new ContractError(status, code, message);
};
const invalid = (message) => fail(400, "invalid_filter", message);
const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s ?? "",
  );
const uuid = (s) => {
  if (!isUuid(s)) invalid("A UUID is required.");
  return s;
};
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");
// PostgREST logic literals need quoting independently of URL encoding.
const literal = (s) => `"${s.replace(/[\\"]/g, "\\$&")}"`;
function checked(r) {
  if (r.error) {
    fail(
      503,
      "database_unavailable",
      "The database request could not be completed.",
    );
  }
  return r;
}
async function rows(q) {
  return checked(await q).data ?? [];
}
async function required(q) {
  const data = checked(await q.maybeSingle()).data;
  if (!data) fail(404, "not_found", "Record not found.");
  return data;
}
function only(url, names) {
  for (const key of url.searchParams.keys()) {
    if (!names.includes(key)) invalid(`Unsupported parameter: ${key}.`);
    if (url.searchParams.getAll(key).length > 1) {
      invalid(`Duplicate parameter: ${key}.`);
    }
  }
}
function page(url) {
  const get = (key, fallback, max) => {
    const s = url.searchParams.get(key) ?? String(fallback);
    if (!/^[1-9]\d*$/.test(s) || Number(s) > max) invalid(`Invalid ${key}.`);
    return Number(s);
  };
  const p = get("page", 1, 10000), limit = get("limit", 25, 100);
  return { page: p, limit, from: (p - 1) * limit };
}
export async function mapLimited(items, fn, concurrency = 5) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        output[i] = await fn(items[i], i);
      }
    }),
  );
  return output;
}
const bands = [
  "beginner",
  "lower_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];
const filters = {
  users: { is_verified: "boolean", self_rating_band: bands },
  reports: {
    target_id: "uuid",
    reported_by_player_id: "uuid",
    category: [
      "harassment",
      "inappropriate_content",
      "fake_account",
      "spam",
      "safety_concern",
      "underage",
      "other",
    ],
  },
  disputes: { match_id: "uuid", raised_by: "uuid" },
  games: { organiser_id: "uuid", organiser_group_id: "uuid", suburb: "text" },
  leagues: { organiser_id: "uuid" },
  matches: {
    league_id: "uuid",
    post_id: "uuid",
    created_by: "uuid",
    suburb: "text",
  },
  results: { match_id: "uuid", submitted_by: "uuid" },
  rankings: { player_id: "uuid", band: bands },
  notifications: {
    is_read: "boolean",
    type: notificationTypes,
  },
  announcements: {},
};
const sorts = {
  users: ["joined_at", "username", "self_rating_band", "deleted_at"],
  reports: ["created_at", "updated_at", "status", "target_type"],
  disputes: ["created_at", "updated_at", "status"],
  games: ["created_at", "proposed_time", "status", "suburb"],
  leagues: ["created_at", "name", "start_date", "end_date", "status"],
  matches: ["created_at", "played_at", "status"],
  results: ["created_at", "status"],
  rankings: ["ranking_points", "band", "verified_games_count"],
  notifications: ["created_at", "is_read"],
  announcements: ["created_at", "published_at", "display_order", "title"],
};
async function matchingPlayers(db, term) {
  if (isUuid(term)) return [term];
  const found = await rows(
    db.from("player").select("player_id").ilike(
      "username",
      `%${escapeLike(term)}%`,
    ).limit(201),
  );
  if (found.length > 200) {
    invalid("Too many matching players. Narrow the search.");
  }
  return found.map((r) => r.player_id);
}
export function listSelection(resource) {
  return {
    users:
      "*,display_name:username,registration:player_private!player_private_player_id_fkey!inner(registered_at)",
    games:
      "*,organiser_club_id:organiser_group_id,organiser:player!game_post_organiser_id_fkey(player_id,username,display_name:username),club:groups!game_post_organiser_group_id_fkey(group_id,name)",
    leagues:
      "*,organiser:player!mini_league_organiser_id_fkey(player_id,username,display_name:username)",
    rankings:
      "*,player:player!ranking_player_id_fkey(player_id,username,display_name:username)",
    reports:
      "*,reporter:player!report_reported_by_player_id_fkey(player_id,username,display_name:username)",
    matches:
      "*,participants:match_participant(player_id,side,status,player:player!match_participant_player_id_fkey(username,display_name:username))",
    results:
      "*,match:match!match_result_match_id_fkey(match_id,format,post_id,league_id)",
  }[resource] ?? "*";
}
export async function relatedFilters(url, table, query, db) {
  only(url, ["page", "limit", "q", "status"]);
  const states = {
    report: ["open", "under_review", "resolved", "dismissed"],
    game_participant: [
      "no_show",
      "requested",
      "invited",
      "accepted",
      "rejected",
      "declined",
      "withdrawn",
    ],
    match_participant: ["playing", "no_show", "withdrawn"],
    match: ["scheduled", "in_progress", "completed", "cancelled"],
    match_result: ["pending", "confirmed", "disputed", "rejected", "expired"],
  }[table];
  const status = url.searchParams.get("status");
  if (status !== null) {
    if (!states?.includes(status)) invalid("Invalid related-record status.");
    query = query.eq("status", status);
  }
  const q = url.searchParams.get("q");
  if (q !== null) {
    if (
      !["ranking", "league_standing", "game_participant", "match_participant"]
        .includes(table) || !q.trim() || q.length > 100
    ) {
      invalid(
        "This related list supports player name/ID search only where participants are stored.",
      );
    }
    const ids = await matchingPlayers(db, q.trim());
    query = query.in("player_id", ids);
  }
  return { query };
}
export async function consoleFilters(
  url,
  resource,
  spec,
  query,
  { db, searchAccounts },
) {
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1) {
      invalid(`Duplicate parameter: ${key}.`);
    }
  }
  const extra = filters[resource];
  if (url.searchParams.has("organiser_club_id")) {
    if (resource !== "games" || url.searchParams.has("organiser_group_id")) {
      invalid("Use one organiser group filter.");
    }
    url.searchParams.set(
      "organiser_group_id",
      url.searchParams.get("organiser_club_id"),
    );
    url.searchParams.delete("organiser_club_id");
  }
  if (url.searchParams.get("sort") === "display_name") {
    url.searchParams.set("sort", "username");
  }
  only(url, [
    "page",
    "limit",
    "status",
    "format",
    "q",
    "sort",
    "direction",
    "created_from",
    "created_to",
    "include",
    ...(["users", "games"].includes(resource) ? ["is_deleted"] : []),
    ...(resource === "users" ? ["registered"] : []),
    ...Object.keys(extra),
    ...(resource === "reports" ? ["target_type"] : []),
    ...(resource === "notifications" ? ["player_id"] : []),
  ]);
  for (const key of ["is_deleted", "registered"]) {
    const value = url.searchParams.get(key);
    if (value === null) continue;
    if (!["true", "false"].includes(value)) invalid(`Invalid ${key}.`);
    const column = key === "is_deleted"
      ? "deleted_at"
      : "registration.registered_at";
    query = value === "true"
      ? query.not(column, "is", null)
      : query.is(column, null);
  }
  const include = url.searchParams.get("include");
  if (include && !(resource === "users" && include === "account")) {
    invalid("Only users support include=account.");
  }
  for (const [column, type] of Object.entries(extra)) {
    const value = url.searchParams.get(column);
    if (value === null) continue;
    if (type === "uuid") uuid(value);
    else if (type === "boolean") {
      if (!["true", "false"].includes(value)) invalid(`Invalid ${column}.`);
    } else if (Array.isArray(type)) {
      if (!type.includes(value)) invalid(`Invalid ${column}.`);
    } else if (!value.trim() || value.length > 100) {
      invalid(`Invalid ${column}.`);
    }
    query = query.eq(column, value);
  }
  for (const [name, op] of [["created_from", "gte"], ["created_to", "lt"]]) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      if (resource === "rankings") {
        invalid("Rankings have no creation timestamp filter.");
      }
      if (
        !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value))
      ) invalid(`Invalid ${name}. Use an ISO timestamp with timezone.`);
      query = query[op](
        resource === "users" ? "joined_at" : "created_at",
        value,
      );
    }
  }
  if (
    url.searchParams.has("created_from") &&
    url.searchParams.has("created_to") &&
    Date.parse(url.searchParams.get("created_from")) >=
      Date.parse(url.searchParams.get("created_to"))
  ) invalid("created_to must be after created_from.");
  const term = url.searchParams.get("q");
  if (term !== null) {
    if (!term.trim() || term.length > 100) {
      invalid("q must contain 1-100 characters.");
    }
    const q = term.trim();
    const clauses = [];
    if (spec.search) {
      clauses.push(`${spec.search}.ilike.${literal(`%${escapeLike(q)}%`)}`);
    }
    if (isUuid(q)) clauses.push(`${spec.key}.eq.${q}`);
    if (resource === "users" && !isUuid(q)) {
      if (!searchAccounts) {
        fail(
          503,
          "account_search_unavailable",
          "Account search is unavailable.",
        );
      }
      const ids = await searchAccounts(q);
      if (ids.length) clauses.push(`player_id.in.(${ids.map(uuid).join(",")})`);
    }
    if (
      ["games", "leagues", "rankings", "reports", "matches", "results"]
        .includes(resource)
    ) {
      const ids = await matchingPlayers(db, q);
      if (ids.length) {
        const column = {
          games: "organiser_id",
          leagues: "organiser_id",
          rankings: "player_id",
          reports: "reported_by_player_id",
        }[resource];
        if (column) clauses.push(`${column}.in.(${ids.join(",")})`);
        if (resource === "reports") {
          clauses.push(
            `and(target_type.eq.player,target_id.in.(${ids.join(",")}))`,
          );
        }
        if (["matches", "results"].includes(resource)) {
          const found = await rows(
            db.from("match_participant").select("match_id").in("player_id", ids)
              .limit(201),
          );
          if (found.length > 200) {
            invalid(
              "Too many matching matches. Narrow the search or use a match ID.",
            );
          }
          const matchIds = [...new Set(found.map((r) => r.match_id))];
          if (matchIds.length) {
            clauses.push(`match_id.in.(${matchIds.join(",")})`);
          }
        }
      }
    }
    if (resource === "reports") {
      clauses.push(`reason.ilike.${literal(`%${escapeLike(q)}%`)}`);
    }
    if (resource === "games") {
      clauses.push(`suburb.ilike.${literal(`%${escapeLike(q)}%`)}`);
      clauses.push(`title.ilike.${literal(`%${escapeLike(q)}%`)}`);
    }
    if (resource === "games") {
      const clubs = await rows(
        db.from("groups").select("group_id").ilike("name", `%${escapeLike(q)}%`)
          .limit(201),
      );
      if (clubs.length > 200) {
        invalid("Too many matching clubs. Narrow the search.");
      }
      if (clubs.length) {
        clauses.push(
          `organiser_group_id.in.(${clubs.map((r) => r.group_id).join(",")})`,
        );
      }
    }
    if (resource === "reports" && isUuid(q)) clauses.push(`target_id.eq.${q}`);
    if (!clauses.length) {
      query = query.in(spec.key, []);
    } else if (clauses.length) query = query.or(clauses.join(","));
  }
  const sort = url.searchParams.get("sort") ?? spec.order;
  if (!sorts[resource].includes(sort)) invalid("Unsupported sort column.");
  const direction = url.searchParams.get("direction") ?? "desc";
  if (!["asc", "desc"].includes(direction)) {
    invalid("direction must be asc or desc.");
  }
  query = query.order(sort, {
    ascending: direction === "asc",
    nullsFirst: false,
  }).order(spec.key);
  if (resource === "rankings") query = query.order("format");
  return { query };
}

const unavailable = {
  account_suspension: "Account suspension state and enforcement are absent.",
  content_moderation:
    "Hide/restore, league suspension/registration and audited deletion are incomplete. Post soft-deletion exists upstream but alters ranking eligibility.",
  report_review:
    "Private decisions and atomic review/log processing are absent; submission-time evidence is available.",
  activity_log:
    "Latest updated_at/updated_by columns are not an event history.",
  ranking_snapshots:
    "Immutable daily leaderboard snapshots and comparison are absent.",
  confirmation_history:
    "Only the opposing confirmer/time is stored; no per-player decision history exists.",
  app_usage: "Foreground view events are absent.",
  games_published: "First-publication timestamps/events are absent.",
  mini_league_activity:
    "Accepted-join and result-submission activity events are absent.",
  reports_resolved: "Historical resolution events are absent.",
};
// Calendar calculations use IANA timezone rules, including 23/25-hour DST days.
const dayMs = 86400000;
const dayFormatters = new Map();
export function localDay(time, timezone = "Australia/Melbourne") {
  if (!dayFormatters.has(timezone)) {
    dayFormatters.set(
      timezone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  }
  const parts = dayFormatters.get(timezone).formatToParts(time);
  const get = (name) => parts.find((p) => p.type === name).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDay(day, delta) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * dayMs).toISOString()
    .slice(0, 10);
}
export function dayBoundary(day, timezone = "Australia/Melbourne") {
  // Search the first UTC instant of the local calendar date. This avoids
  // assuming a fixed Australian offset or a 24-hour day.
  const noon = Date.parse(`${day}T12:00:00Z`);
  let low = noon - 2 * dayMs, high = noon + dayMs;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (localDay(mid, timezone) < day) low = mid;
    else high = mid;
  }
  return new Date(high).toISOString();
}
function validDay(s) {
  return /^\d{4}-\d\d-\d\d$/.test(s ?? "") && Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
}
async function analytics(db, url) {
  only(url, ["start", "end"]);
  const timezone = "Australia/Melbourne",
    today = localDay(Date.now(), timezone);
  const end = url.searchParams.get("end") ?? addDay(today, -1);
  const start = url.searchParams.get("start") ?? addDay(end, -6);
  if (!validDay(start) || !validDay(end) || start > end || end >= today) {
    invalid("Select complete past calendar dates using YYYY-MM-DD.");
  }
  const length = (Date.parse(end) - Date.parse(start)) / dayMs + 1;
  if (length > 90) invalid("Select at most 90 days.");
  const priorStart = addDay(start, -length), priorEnd = addDay(start, -1);
  const days = Array.from(
    { length: length * 2 },
    (_, i) => addDay(priorStart, i),
  );
  const bounds = [...days, addDay(end, 1)].map((d) => dayBoundary(d, timezone));
  const metrics = {};
  for (
    const [name, table, key, column] of [[
      "new_users",
      "player_private",
      "player_id",
      "registered_at",
    ], ["reports_received", "report", "report_id", "created_at"]]
  ) {
    const counts = await mapLimited(days, async (_, i) => {
      const base = table === "player_private"
        ? registrationCount(db)
        : db.from(table).select(key, { count: "exact", head: true });
      const r = checked(
        await base.gte(
          column,
          bounds[i],
        ).lt(column, bounds[i + 1]),
      );
      if (r.count === null) {
        fail(503, "count_unavailable", "An exact count is unavailable.");
      }
      return r.count;
    });
    const current = counts.slice(length).reduce((a, b) => a + b, 0),
      previous = counts.slice(0, length).reduce((a, b) => a + b, 0);
    metrics[name] = {
      total: current,
      previous_total: previous,
      change: current - previous,
      percent_change: previous
        ? Math.round((current - previous) / previous * 10000) / 100
        : null,
      by_day: days.slice(length).map((date, i) => ({
        date,
        count: counts[length + i],
      })),
      previous_by_day: days.slice(0, length).map((date, i) => ({
        date,
        count: counts[i],
      })),
    };
  }
  return {
    timezone,
    period: { start, end },
    previous_period: { start: priorStart, end: priorEnd },
    metrics,
    unavailable: Object.fromEntries(
      [
        "app_usage",
        "games_published",
        "mini_league_activity",
        "reports_resolved",
      ].map((key) => [key, { value: null, reason: unavailable[key] }]),
    ),
    source_note:
      "Counts reflect currently retained player/report rows, not a deletion-proof historical event log. New users use player_private.registered_at for completed registrations and exclude deleted profiles. Admin/test classification is not available; historical counts are not deletion-proof.",
  };
}

export async function handleConsole(request, route, { db }, send) {
  const updated = await handleUpdatedRead(request, route, db, send);
  if (updated) return updated;
  const url = new URL(request.url), [resource, id, child] = route;
  const simple = route.length === 1 &&
    ["capabilities", "analytics"].includes(resource);
  const detail = route.length === 3 &&
    ((resource === "reports" && child === "context") ||
      (resource === "users" &&
        ["summary", "games", "matches", "leagues"].includes(child)) ||
      (resource === "matches" && child === "context"));
  const attention = route.length === 2 && resource === "overview" &&
    id === "attention";
  if (!simple && !detail && !attention) return null;
  if (request.method !== "GET") {
    fail(405, "method_not_allowed", "This endpoint is read-only.");
  }
  if (detail) uuid(id);
  if (resource === "capabilities") {
    only(url, []);
    return send({
      data: {
        design: "Admin Web Final v6",
        database_baseline: "Player BE-2 0.4.0 (50 migrations)",
        read_only: [
          "rankings",
          "results",
          "match_confirmation",
          "game_lifecycle",
          "league_lifecycle",
        ],
        supported: [
          "search_and_filters",
          "user_participation",
          "report_context",
          "match_context",
          "rating_summary",
          "rating_trend",
          "rating_history",
          "result_flags",
          "report_evidence",
          "registration_state",
          "shared_leaderboard",
          "overview_attention",
          "new_users_analytics",
          "reports_received_analytics",
          "report_status_only",
          "dispute_status_only",
          "announcements",
          "notifications",
        ],
        unavailable,
      },
    });
  }
  if (resource === "analytics") return send({ data: await analytics(db, url) });
  if (attention) {
    only(url, ["page", "limit"]);
    const { page: p, limit, from } = page(url);
    const [reports, results] = await Promise.all([
      db.from("report").select("*", { count: "exact" }).in("status", [
        "open",
        "under_review",
      ]).order("created_at").order("report_id").range(from, from + limit - 1),
      db.from("match_result").select("*", { count: "exact" }).in("status", [
        "pending",
        "disputed",
      ]).order("created_at").order("result_id").range(from, from + limit - 1),
    ]);
    checked(reports);
    checked(results);
    return send({
      data: {
        reports: {
          data: reports.data,
          pagination: { page: p, limit, total: reports.count },
        },
        results: {
          data: results.data,
          pagination: { page: p, limit, total: results.count },
          read_only: true,
        },
      },
    });
  }
  if (resource === "reports") {
    only(url, []);
    const report = await required(
      db.from("report").select("*").eq("report_id", id),
    );
    const target = {
      player: ["player", "player_id"],
      game_post: ["game_post", "post_id"],
      match: ["match", "match_id"],
      admin_post: ["admin_post", "admin_post_id"],
      group: ["groups", "group_id"],
      mini_league: ["mini_league", "league_id"],
    }[report.target_type];
    const [reporter, subject] = await Promise.all([
      rows(
        db.from("player").select("player_id,username,display_name:username").eq(
          "player_id",
          report.reported_by_player_id,
        ),
      ),
      target
        ? rows(db.from(target[0]).select("*").eq(target[1], report.target_id))
        : [],
    ]);
    return send({
      data: {
        report,
        reporter: reporter[0] ?? null,
        target: subject[0] ?? null,
        target_missing: !subject.length,
        evidence_snapshot:
          report.evidence && Object.keys(report.evidence).length
            ? report.evidence
            : null,
        private_decision: null,
        context_note:
          "Evidence is the server-captured submission snapshot. Target is the current record; empty legacy evidence is unavailable.",
      },
    });
  }
  if (resource === "matches") {
    only(url, []);
    const match = await required(
      db.from("match").select("*").eq("match_id", id),
    );
    const [participants, results, disputes] = (await Promise.all([
      db.from("match_participant").select(
        "*,player:player!match_participant_player_id_fkey(player_id,username,display_name:username)",
        { count: "exact" },
      ).eq("match_id", id).order("side").order("player_id").limit(100),
      db.from("match_result").select("*", { count: "exact" }).eq("match_id", id)
        .order("created_at").order("result_id").limit(100),
      db.from("dispute").select("*", { count: "exact" }).eq("match_id", id)
        .order("created_at").order("dispute_id").limit(100),
    ])).map(checked);
    return send({
      data: {
        match,
        participants: participants.data,
        results: results.data,
        disputes: disputes.data,
        related_counts: {
          participants: participants.count,
          results: results.count,
          disputes: disputes.count,
        },
        related_limit: 100,
        read_only: true,
        confirmations: results.data.map((r) => ({
          result_id: r.result_id,
          status: r.status,
          submitted_by: r.submitted_by,
          confirmed_by: r.confirmed_by ?? null,
          confirmed_at: r.confirmed_at ?? null,
        })),
        player_confirmation_history: null,
        confirmation_note:
          "Stored opposing-side confirmation only; this is not a complete per-player event history.",
      },
    });
  }
  const player = await required(
    db.from("player").select("player_id,deleted_at").eq("player_id", id),
  );
  if (child === "summary") {
    only(url, []);
    const [ranking, games, reports, rating, account] = await Promise.all([
      rows(
        db.from("ranking").select("*").eq("player_id", id).eq(
          "format",
          "singles",
        ),
      ),
      db.from("game_participant").select("post_id", {
        count: "exact",
        head: true,
      }).eq("player_id", id).eq("status", "accepted"),
      db.from("report").select("report_id", { count: "exact", head: true }).eq(
        "target_type",
        "player",
      ).eq("target_id", id).in("status", ["open", "under_review"]),
      db.rpc("get_rating_summary", { p_player_id: id }),
      accountState(db, player),
    ]);
    checked(games);
    checked(reports);
    let position = null;
    if (ranking.length) {
      position = checked(
        await db.from("ranking").select("player_id", {
          count: "exact",
          head: true,
        }).eq("format", "singles").gt(
          "ranking_points",
          ranking[0].ranking_points,
        ),
      ).count + 1;
    }
    return send({
      data: {
        player_id: id,
        singles_ranking: ranking[0] ?? null,
        rank_position: position,
        games_joined: games.count,
        unresolved_reports: reports.count,
        rating_summary: checked(rating).data,
        account_state: account,
        ranking_history: {
          endpoint: `/users/${id}/rating_history`,
          paginated: true,
        },
        note:
          "Rank uses stored singles points with tied competition positions. The shared rating engine owns calculations. This global stored-points position is not the established-only state leaderboard.",
      },
    });
  }
  only(url, ["page", "limit", "status", "q"]);
  const { page: p, limit, from } = page(url);
  const relations = {
    games: [
      "game_participant",
      "post_id",
      "game:game_post!game_participant_post_id_fkey(*)",
      [
        "requested",
        "invited",
        "accepted",
        "rejected",
        "declined",
        "withdrawn",
        "no_show",
      ],
    ],
    matches: [
      "match_participant",
      "match_id",
      "match:match!match_participant_match_id_fkey(*)",
      ["playing", "no_show", "withdrawn"],
    ],
    leagues: [
      "league_standing",
      "league_id",
      "league:mini_league!league_standing_league_id_fkey(*)",
      null,
    ],
  };
  const [table, key, embed, states] = relations[child];
  let query = db.from(table).select(`*,${embed}`, { count: "exact" }).eq(
    "player_id",
    id,
  );
  const state = url.searchParams.get("status");
  if (state !== null) {
    if (!states?.includes(state)) invalid("Invalid participation status.");
    query = query.eq("status", state);
  }
  const q = url.searchParams.get("q");
  if (q !== null) query = query.eq(key, uuid(q));
  const r = checked(
    await query.order("updated_at", { ascending: false }).order(key).range(
      from,
      from + limit - 1,
    ),
  );
  return send({
    data: r.data,
    pagination: { page: p, limit, total: r.count },
    source_note: child === "leagues"
      ? "Stored standing entries; the schema has no separate league join-request history."
      : "Currently retained participation rows.",
  });
}
