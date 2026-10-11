// HTTP contract for the existing schema. All database calls retain the admin's
// JWT so existing RLS and updated_by triggers still apply.
import { ContractError, handleContract, isContractRoute } from "./contract.mjs";
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
/** @returns {never} */
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value ?? "",
    )
  ) {
    fail(400, "invalid_id", "A UUID is required.");
  }
  return value;
};
const choice = (value, values, field) => {
  if (!values.includes(value)) fail(400, "invalid_field", `Invalid ${field}.`);
  return value;
};
const text = (value, field, max = 1000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    fail(
      400,
      "invalid_field",
      `${field} must be non-empty text, up to ${max} characters.`,
    );
  }
  return value.trim();
};
const statuses = {
  reports: ["open", "under_review", "resolved", "dismissed"],
  disputes: ["open", "under_review", "resolved", "dismissed"],
  games: ["open", "full", "cancelled", "completed"],
  leagues: ["draft", "active", "completed", "cancelled"],
  matches: ["scheduled", "in_progress", "completed", "cancelled"],
  results: ["pending", "confirmed", "disputed", "rejected"],
  announcements: ["draft", "published", "archived"],
};
const resources = {
  users: {
    table: "player",
    key: "player_id",
    order: "joined_at",
    search: "display_name",
  },
  reports: { table: "report", key: "report_id", order: "created_at" },
  disputes: { table: "dispute", key: "dispute_id", order: "created_at" },
  games: { table: "game_post", key: "post_id", order: "created_at" },
  leagues: {
    table: "mini_league",
    key: "league_id",
    order: "created_at",
    search: "name",
  },
  matches: { table: "match", key: "match_id", order: "created_at" },
  results: { table: "match_result", key: "result_id", order: "created_at" },
  rankings: { table: "ranking", key: "player_id", order: "ranking_points" },
  announcements: {
    table: "admin_post",
    key: "admin_post_id",
    order: "created_at",
    search: "title",
  },
  notifications: {
    table: "notification",
    key: "notification_id",
    order: "created_at",
  },
};
const formats = ["singles", "doubles", "mixed_doubles"];
function resultOrThrow(result) {
  if (result.error) {
    const code = result.error.code;
    if (code === "23505") {
      fail(409, "conflict", "This conflicts with an existing record.");
    }
    if (["23514", "23503", "23502", "22P02", "22007"].includes(code)) {
      fail(400, "constraint_violation", "The change violates a database rule.");
    }
    if (code === "42501") {
      fail(403, "forbidden", "This operation is not permitted.");
    }
    fail(
      503,
      "database_unavailable",
      "The database request could not be completed.",
    );
  }
  return result;
}
async function one(query) {
  const { data } = resultOrThrow(await query.maybeSingle());
  if (!data) fail(404, "not_found", "Record not found.");
  return data;
}
async function bodyFor(request) {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    fail(415, "invalid_content_type", "Use application/json.");
  }
  // Limit the stream itself, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) fail(400, "invalid_json", "A JSON object is required.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      fail(413, "body_too_large", "Request body exceeds 16 KiB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "invalid_json", "A JSON object is required.");
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    fail(400, "invalid_json", "A JSON object is required.");
  }
  return body;
}
function pageFor(url) {
  const positive = (name, fallback, maximum) => {
    const raw = url.searchParams.get(name) ?? String(fallback);
    if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > maximum) {
      fail(400, "invalid_pagination", `Invalid ${name}.`);
    }
    return Number(raw);
  };
  const page = positive("page", 1, 10000);
  const limit = positive("limit", 25, 100);
  return { page, limit, from: (page - 1) * limit };
}
function validatePatch(resource, body) {
  const allowed = {
    reports: ["status"],
    disputes: ["status"],
    games: ["status"],
    leagues: ["status"],
    results: ["status", "score", "winning_side"],
    rankings: ["ranking_points"],
    announcements: ["title", "body", "status", "display_order"],
  }[resource];
  if (!allowed) fail(405, "method_not_allowed", "This resource is read-only.");
  for (const key of Object.keys(body)) {
    if (![...allowed, "expected_updated_at"].includes(key)) {
      fail(400, "unknown_field", `Unsupported field: ${key}.`);
    }
  }
  const stamp = body.expected_updated_at;
  if (
    typeof stamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(stamp) ||
    !Number.isFinite(Date.parse(stamp))
  ) {
    fail(
      400,
      "invalid_version",
      "Send expected_updated_at exactly as returned by GET.",
    );
  }
  const patch = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "status") patch[key] = choice(value, statuses[resource], key);
    else if (key === "winning_side") {
      patch[key] = value === null ? null : choice(value, ["a", "b"], key);
    } else if (["ranking_points", "display_order"].includes(key)) {
      if (
        !Number.isSafeInteger(value) ||
        value < (key === "ranking_points" ? 0 : -2147483648) ||
        value > 2147483647
      ) {
        fail(400, "invalid_field", `Invalid ${key}.`);
      }
      patch[key] = value;
    } else if (key === "body") {
      patch[key] = value === null ? null : text(value, key, 10000);
    } else patch[key] = text(value, key, key === "title" ? 200 : 1000);
  }
  if (!Object.keys(patch).length) {
    fail(400, "empty_patch", "Supply at least one editable field.");
  }
  return { patch, stamp };
}

export function createHandler(
  { getContext, allowedOrigins = ["http://localhost:5173"] },
) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info, prefer, range, range-unit",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Range, Range-Unit",
    };
    if (origin && allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const send = (data, status = 200, extraHeaders = {}) =>
      new Response(data === null ? null : JSON.stringify(data), {
        status,
        headers: { ...headers, ...extraHeaders },
      });
    const path = new URL(request.url).pathname.split("/").filter(Boolean);
    const prefix = path.indexOf("admin-api");
    const contractRoute = prefix >= 0 ? path.slice(prefix + 1) : [];
    const contract = isContractRoute(contractRoute);
    try {
      if (origin && !allowedOrigins.includes(origin)) {
        fail(403, "origin_denied", "Origin is not allowed.");
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      const bearer = /^Bearer\s+(\S+)$/i.exec(
        request.headers.get("authorization") ?? "",
      );
      if (!bearer) {
        fail(401, "unauthenticated", "A user access token is required.");
      }
      // getContext must validate against Supabase Auth, never decode a JWT alone.
      const { user, db, getAccount } = await getContext(bearer[1]);
      if (!user) {
        fail(401, "unauthenticated", "The session is invalid or expired.");
      }
      if (user.app_metadata?.role !== "admin") {
        fail(403, "admin_required", "Administrator access is required.");
      }
      if (contract) {
        return await handleContract(request, contractRoute, { db, user }, send);
      }
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);
      const base = parts.indexOf("admin-api");
      if (base < 0) fail(404, "not_found", "Endpoint not found.");
      const route = parts.slice(base + 1);
      if (route.length === 1 && route[0] === "me" && request.method === "GET") {
        return send({
          data: { id: user.id, email: user.email, role: "admin" },
        });
      }
      if (
        route.length === 1 && route[0] === "overview" &&
        request.method === "GET"
      ) {
        const queries = [
          db.from("player").select("player_id", { count: "exact", head: true }),
          db.from("report").select("report_id", { count: "exact", head: true })
            .in("status", ["open", "under_review"]),
          db.from("match_result").select("result_id", {
            count: "exact",
            head: true,
          }).eq("status", "pending"),
          db.from("game_post").select("post_id", { count: "exact", head: true })
            .in("status", ["open", "full"]).gte(
              "proposed_time",
              new Date().toISOString(),
            ),
          db.from("mini_league").select("league_id", {
            count: "exact",
            head: true,
          }).eq("status", "active"),
        ];
        const values = (await Promise.all(queries)).map(resultOrThrow).map((
          r,
        ) => r.count);
        return send({
          data: Object.fromEntries(
            [
              "registered_users",
              "unresolved_reports",
              "pending_results",
              "upcoming_game_posts",
              "active_leagues",
            ].map((name, i) => [name, values[i]]),
          ),
        });
      }
      const [resource, id, child] = route;
      const spec = resources[resource];
      if (!spec || route.length > 3) {
        fail(404, "not_found", "Endpoint not found.");
      }
      if (id) uuid(id);
      if (resource === "rankings" && id && !child) {
        fail(400, "format_required", "Use /rankings/{player_id}/{format}.");
      }
      if (resource === "rankings" && child) choice(child, formats, "format");
      else if (child) {
        if (request.method !== "GET") {
          fail(405, "method_not_allowed", "This endpoint is read-only.");
        }
        const relation = {
          "users/profile": ["player_profile", "player_id"],
          "users/rankings": ["ranking", "player_id"],
          "users/reports": ["report", "target_id"],
          "games/participants": ["game_participant", "post_id"],
          "games/matches": ["match", "post_id"],
          "leagues/standings": ["league_standing", "league_id"],
          "leagues/matches": ["match", "league_id"],
          "matches/participants": ["match_participant", "match_id"],
          "matches/results": ["match_result", "match_id"],
        }[`${resource}/${child}`];
        if (!relation || !id) fail(404, "not_found", "Endpoint not found.");
        await one(db.from(spec.table).select(spec.key).eq(spec.key, id));
        const { page, limit, from } = pageFor(url);
        let query = db.from(relation[0]).select("*", { count: "exact" }).eq(
          relation[1],
          id,
        );
        if (resource === "users" && child === "reports") {
          query = query.eq("target_type", "player");
        }
        query = query.order(relation[1]).order(
          relation[0] === "match_result"
            ? "result_id"
            : relation[0] === "report"
            ? "report_id"
            : relation[0] === "match"
            ? "match_id"
            : "player_id",
        );
        const r = resultOrThrow(await query.range(from, from + limit - 1));
        return send({
          data: r.data,
          pagination: { page, limit, total: r.count },
        });
      }
      if (request.method === "GET") {
        let query = db.from(spec.table).select("*", { count: "exact" });
        if (id) {
          query = query.eq(spec.key, id);
          if (resource === "rankings") query = query.eq("format", child);
          const data = await one(query);
          if (resource === "users" && getAccount) {
            const account = await getAccount(id);
            data.account = account;
          }
          return send({ data });
        }
        const { page, limit, from } = pageFor(url);
        if (url.searchParams.has("status")) {
          if (!statuses[resource]) {
            fail(400, "invalid_filter", "This resource has no status filter.");
          }
          query = query.eq(
            "status",
            choice(
              url.searchParams.get("status"),
              statuses[resource],
              "status",
            ),
          );
        }
        if (url.searchParams.has("format")) {
          if (!["games", "matches", "rankings"].includes(resource)) {
            fail(400, "invalid_filter", "This resource has no format filter.");
          }
          query = query.eq(
            "format",
            choice(url.searchParams.get("format"), formats, "format"),
          );
        }
        if (url.searchParams.has("q")) {
          if (!spec.search) {
            fail(
              400,
              "invalid_filter",
              "Text search is not supported for this resource.",
            );
          }
          const term = text(url.searchParams.get("q"), "q", 100).replace(
            /[\\%_]/g,
            "\\$&",
          );
          query = query.ilike(spec.search, `%${term}%`);
        }
        if (resource === "reports" && url.searchParams.has("target_type")) {
          query = query.eq(
            "target_type",
            choice(url.searchParams.get("target_type"), [
              "player",
              "game_post",
              "match",
              "admin_post",
            ], "target_type"),
          );
        }
        if (resource === "notifications" && url.searchParams.has("player_id")) {
          query = query.eq(
            "player_id",
            uuid(url.searchParams.get("player_id")),
          );
        }
        query = query.order(spec.order, { ascending: false }).order(spec.key);
        if (resource === "rankings") query = query.order("format");
        const r = resultOrThrow(await query.range(from, from + limit - 1));
        return send({
          data: r.data,
          pagination: { page, limit, total: r.count },
        });
      }
      if (request.method === "PATCH" && id) {
        const { patch, stamp } = validatePatch(
          resource,
          await bodyFor(request),
        );
        if (resource === "announcements" && patch.status === "published") {
          // First publication time is retained when updating published content.
          const current = await one(
            db.from(spec.table).select("published_at").eq(spec.key, id),
          );
          patch.published_at = current.published_at ?? new Date().toISOString();
        }
        // Distinguish missing records from a stale optimistic concurrency token.
        let exists = db.from(spec.table).select(spec.key).eq(spec.key, id);
        if (resource === "rankings") exists = exists.eq("format", child);
        await one(exists);
        let query = db.from(spec.table).update(patch).eq(spec.key, id).eq(
          "updated_at",
          stamp,
        );
        if (resource === "rankings") query = query.eq("format", child);
        const r = resultOrThrow(await query.select("*").maybeSingle());
        if (!r.data) {
          fail(
            409,
            "record_changed",
            "Reload the record before applying this change.",
          );
        }
        return send({ data: r.data });
      }
      if (request.method === "POST" && resource === "announcements" && !id) {
        const body = await bodyFor(request);
        if (Object.keys(body).some((key) => !["title", "body"].includes(key))) {
          fail(400, "unknown_field", "Only title and body are accepted.");
        }
        const record = {
          title: text(body.title, "title", 200),
          body: body.body == null ? null : text(body.body, "body", 10000),
          created_by: user.id,
          status: "draft",
        };
        const r = resultOrThrow(
          await db.from(spec.table).insert(record).select("*").single(),
        );
        return send({ data: r.data }, 201);
      }
      if (request.method === "POST" && resource === "notifications" && !id) {
        const body = await bodyFor(request);
        if (
          Object.keys(body).some((key) =>
            !["player_id", "match_id", "type", "message"].includes(key)
          )
        ) {
          fail(400, "unknown_field", "Unsupported notification field.");
        }
        const record = {
          player_id: uuid(body.player_id),
          match_id: body.match_id == null ? null : uuid(body.match_id),
          type: choice(body.type, [
            "match_reminder",
            "match_invite",
            "result_submitted",
            "dispute_update",
            "league_update",
            "system",
          ], "type"),
          message: text(body.message, "message", 2000),
        };
        const r = resultOrThrow(
          await db.from(spec.table).insert(record).select("*").single(),
        );
        return send({ data: r.data }, 201);
      }
      fail(
        405,
        "method_not_allowed",
        "This method is not supported for this endpoint.",
      );
    } catch (error) {
      const known = error instanceof ApiError || error instanceof ContractError;
      const status = known ? error.status : 503;
      const detail = {
        code: known ? error.code : "service_unavailable",
        message: known ? error.message : "The request could not be completed.",
      };
      return send(contract ? detail : { error: detail }, status);
    }
  };
}
