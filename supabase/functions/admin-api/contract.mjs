// Team OpenAPI adapter. Database names remain unchanged; all queries use the
// caller's JWT. This adapter is hosted under /functions/v1/admin-api, not /rest/v1.
export class ContractError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ContractError(status, code, message);
};
const invalid = (message) => fail(422, "validation_failed", message);
const snake = (name) =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const definitions = {
  player: [
    "playerId",
    "displayName",
    "selfRatingBand",
    "isVerified",
    "joinedAt",
  ],
  player_profile: [
    "playerId",
    "bio",
    "suburb",
    "state",
    "reliabilityScore",
    "gamesPlayed",
    "noShowCount",
    "isDiscoverable",
  ],
  report: [
    "reportId",
    "reportedByPlayerId",
    "targetType",
    "targetId",
    "reason",
    "status",
  ],
  dispute: ["disputeId", "matchId", "reason", "status"],
  game_post: [
    "postId",
    "organiserId",
    "groupId",
    "format",
    "suburb",
    "proposedTime",
    "status",
  ],
  mini_league: [
    "leagueId",
    "organiserId",
    "name",
    "startDate",
    "endDate",
    "status",
  ],
  match: [
    "matchId",
    "leagueId",
    "venueId",
    "format",
    "playedAt",
    "suburb",
    "status",
  ],
  match_participant: ["matchId", "playerId", "status"],
  match_result: ["resultId", "matchId", "score", "winnerId", "status"],
  league_standing: [
    "leagueId",
    "playerId",
    "wins",
    "losses",
    "points",
    "position",
  ],
  ranking: [
    "playerId",
    "format",
    "rankingPoints",
    "band",
    "verifiedGamesCount",
  ],
  notification: ["notificationId", "playerId", "type", "message", "isRead"],
  admin_post: [
    "adminPostId",
    "title",
    "body",
    "imageUrl",
    "displayOrder",
    "status",
    "createdBy",
    "publishedAt",
  ],
  venue: ["venueId", "name", "address"],
  cancellation_record: ["postId", "cancelledAt", "reason", "isNoShow"],
  check_in: ["matchId", "playerId", "checkedInAt"],
};
const keys = {
  player: ["playerId"],
  player_profile: ["playerId"],
  report: ["reportId"],
  dispute: ["disputeId"],
  game_post: ["postId"],
  mini_league: ["leagueId"],
  match: ["matchId"],
  match_result: ["resultId"],
  notification: ["notificationId"],
  admin_post: ["adminPostId"],
  venue: ["venueId"],
  cancellation_record: ["postId"],
  ranking: ["playerId", "format"],
  league_standing: ["leagueId", "playerId"],
  match_participant: ["matchId", "playerId"],
  check_in: ["matchId", "playerId"],
};
// Read extensions expose existing schema fields and optimistic version tokens.
for (const fields of Object.values(definitions)) {
  fields.push("updatedAt", "updatedBy");
}
for (
  const table of [
    "venue",
    "mini_league",
    "game_post",
    "match",
    "match_result",
    "dispute",
    "notification",
    "report",
    "admin_post",
  ]
) definitions[table].push("createdAt");
definitions.game_post.push("organiserClubId", "playerLimit");
definitions.match.push("postId", "createdBy");
definitions.match_participant.push("side");
definitions.match_result.push("submittedBy");
definitions.dispute.push("raisedBy");
definitions.notification.push("matchId");
const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value ?? "",
    )
  ) invalid("A UUID is required.");
  return value;
};
const rpcArguments = {
  admin_hide_post: { postId: "uuid", reason: "text" },
  admin_restore_post: { postId: "uuid" },
  admin_suspend_account: { playerId: "uuid", reason: "text" },
  admin_restore_account: { playerId: "uuid" },
  admin_suspend_league: { leagueId: "uuid", reason: "text" },
  admin_resume_league: { leagueId: "uuid" },
  admin_review_report: { reportId: "uuid", outcome: ["resolved", "dismissed"] },
  resolve_dispute: { disputeId: "uuid", outcome: ["upheld", "dismissed"] },
};
export const isContractRoute = (route) =>
  Object.hasOwn(definitions, route[0]) || route[0] === "rpc" ||
  route[0] === "activity_log";

function result(response) {
  if (!response.error) return response;
  const code = response.error.code;
  if (code === "23505") {
    fail(409, "conflict", "The change conflicts with an existing record.");
  }
  if (code === "42501") {
    fail(403, "forbidden", "This operation is not permitted.");
  }
  if (["23514", "23503", "23502", "22P02", "22007"].includes(code)) {
    invalid("The change violates a database rule.");
  }
  fail(
    503,
    "database_unavailable",
    "The database request could not be completed.",
  );
}
async function jsonBody(request) {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) fail(415, "invalid_content_type", "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) invalid("A JSON object is required.");
  const decoder = new TextDecoder();
  let source = "", size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      fail(413, "body_too_large", "Request body exceeds 16 KiB.");
    }
    source += decoder.decode(value, { stream: true });
  }
  source += decoder.decode();
  let body;
  try {
    body = JSON.parse(source);
  } catch {
    invalid("A JSON object is required.");
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    invalid("A JSON object is required.");
  }
  return body;
}
function only(body, allowed) {
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) invalid(`Unsupported field: ${field}.`);
  }
}
function requiredText(value, name, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalid(`${name} must be non-empty text, up to ${max} characters.`);
  }
  return value.trim();
}
function image(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2048) {
    invalid("imageUrl must be an HTTP or HTTPS URL.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid("imageUrl must be an HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password
  ) invalid("imageUrl must be an HTTP or HTTPS URL.");
  return url.href;
}
function announcement(body, creating) {
  only(body, [
    "title",
    "body",
    "imageUrl",
    "displayOrder",
    "status",
    ...(creating ? ["adminPostId"] : []),
  ]);
  const record = {};
  if (creating || "title" in body) {
    record.title = requiredText(body.title, "title", 200);
  }
  if ("body" in body) {
    record.body = body.body === null
      ? null
      : requiredText(body.body, "body", 10000);
  }
  if ("imageUrl" in body) record.image_url = image(body.imageUrl);
  if ("displayOrder" in body) {
    if (
      !Number.isInteger(body.displayOrder) || body.displayOrder < -2147483648 ||
      body.displayOrder > 2147483647
    ) invalid("displayOrder must be a 32-bit integer.");
    record.display_order = body.displayOrder;
  }
  if ("status" in body) {
    if (!["draft", "published"].includes(body.status)) {
      invalid("status must be draft or published.");
    }
    record.status = body.status;
  }
  if (creating && "adminPostId" in body) {
    record.admin_post_id = uuid(body.adminPostId);
  }
  if (!creating && !Object.keys(record).length) {
    invalid("Supply at least one editable field.");
  }
  return record;
}
function integer(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > maximum) {
    invalid("Invalid pagination.");
  }
  return Number(value);
}
function pagination(request, url) {
  let offset = integer(url.searchParams.get("offset"), 0, 1000000);
  let limit = integer(url.searchParams.get("limit"), 100, 1000);
  const range = request.headers.get("range");
  if (range) {
    if (url.searchParams.has("offset") || url.searchParams.has("limit")) {
      invalid("Use Range or limit/offset, not both.");
    }
    if (
      request.headers.has("range-unit") &&
      request.headers.get("range-unit") !== "items"
    ) invalid("Range-Unit must be items.");
    const match = /^(\d+)-(\d+)$/.exec(range);
    if (!match) invalid("Range must be start-end.");
    offset = integer(match[1], 0, 1000000);
    const end = integer(match[2], 0, 1000999);
    limit = end - offset + 1;
    if (limit < 1 || limit > 1000) invalid("Range must contain 1-1000 items.");
  }
  return { offset, limit };
}
function column(resource, name) {
  if (!definitions[resource].includes(name)) {
    invalid(`Unsupported column: ${name}.`);
  }
  if (name === "winnerId" || name === "groupId") {
    fail(
      501,
      "schema_extension_required",
      name === "winnerId"
        ? "winnerId cannot be queried or ordered: the database represents a winning side, including doubles. Select winningSide instead."
        : "groupId was replaced by organiserClubId in the current database. Select organiserClubId instead.",
    );
  }
  return snake(name);
}
function projection(resource, raw) {
  if (!raw || raw === "*") return null;
  const fields = raw.split(",");
  for (const field of fields) {
    if (resource === "match_result" && field === "winningSide") continue;
    column(resource, field);
  }
  return [...new Set(fields)];
}
function serialize(resource, row, fields) {
  const output = {};
  for (const field of fields ?? definitions[resource]) {
    if (resource === "match_result" && field === "winnerId") continue;
    let value = row[snake(field)];
    if (
      resource === "player_profile" && field === "reliabilityScore" &&
      value != null
    ) value = Number(value) / 100;
    if (
      resource === "report" && field === "status" && value === "under_review"
    ) value = "reviewing";
    if (
      resource === "game_post" && field === "status" && value === "completed"
    ) value = "closed";
    if (value !== undefined) output[field] = value;
  }
  // The current schema has two winners in doubles. Never invent a winnerId.
  if (resource === "match_result" && fields === null) {
    output.winningSide = row.winning_side ?? null;
  }
  return output;
}
function filter(url, resource, query, requireKey = false) {
  const allowed = requireKey
    ? keys[resource]
    : [...keys[resource], "select", "order", "limit", "offset"];
  for (const name of url.searchParams.keys()) {
    if (!allowed.includes(name)) invalid(`Unsupported parameter: ${name}.`);
  }
  for (const name of keys[resource]) {
    const raw = url.searchParams.get(name);
    if (raw === null && !requireKey) continue;
    if (!raw?.startsWith("eq.")) invalid(`${name}=eq.<value> is required.`);
    const value = raw.slice(3);
    if (name === "format") {
      if (!["singles", "doubles", "mixed_doubles"].includes(value)) {
        invalid("Invalid format.");
      }
    } else uuid(value);
    query = query.eq(snake(name), value);
  }
  return query;
}
function preference(request) {
  const directives = (request.headers.get("prefer") ?? "return=representation")
    .split(",").map((s) => s.trim());
  if (
    directives.some((s) =>
      !["return=representation", "return=minimal", "count=exact"].includes(s)
    )
  ) invalid("Unsupported Prefer directive.");
  if (
    directives.includes("return=representation") &&
    directives.includes("return=minimal")
  ) invalid("Conflicting Prefer directives.");
  return !directives.includes("return=minimal");
}

export async function handleContract(request, route, { db, user }, send) {
  const [resource, command] = route;
  const url = new URL(request.url);
  if (resource === "rpc") {
    if (route.length !== 2 || !Object.hasOwn(rpcArguments, command)) {
      fail(404, "not_found", "Endpoint not found.");
    }
    if (request.method !== "POST") {
      fail(405, "method_not_allowed", "Use POST for RPC operations.");
    }
    if (command === "resolve_dispute") {
      fail(
        405,
        "method_not_allowed",
        "Final v6 does not allow administrator result corrections or rating recalculation. Match data is read-only.",
      );
    }
    const body = await jsonBody(request);
    const args = rpcArguments[command];
    only(body, Object.keys(args));
    for (const [name, type] of Object.entries(args)) {
      if (type === "uuid") uuid(body[name]);
      else if (type === "text") requiredText(body[name], name);
      else if (!type.includes(body[name])) invalid(`Invalid ${name}.`);
    }
    // Each promised action needs an event log; dispute resolution additionally
    // needs atomic result/rating/notification processing. No partial success.
    fail(
      501,
      "schema_extension_required",
      "This operation requires moderation state, ActivityLog or atomic result processing absent from the current schema. No changes were made.",
    );
  }
  if (route.length !== 1) fail(404, "not_found", "Endpoint not found.");
  if (resource === "activity_log") {
    fail(
      501,
      "schema_extension_required",
      "ActivityLog is not present in the current schema.",
    );
  }
  if (request.method === "GET") {
    const fields = projection(resource, url.searchParams.get("select"));
    const selected = fields?.map((name) =>
      name === "winningSide" ? "winning_side" : column(resource, name)
    ) ?? ["*"];
    let query = filter(
      url,
      resource,
      db.from(resource).select(selected.join(","), { count: "exact" }),
    );
    const orders = url.searchParams.get("order");
    if (orders) {
      for (const order of orders.split(",")) {
        const [name, direction = "asc", nulls] = order.split(".");
        if (
          order.split(".").length > 3 || !["asc", "desc"].includes(direction) ||
          (nulls && !["nullsfirst", "nullslast"].includes(nulls))
        ) {
          invalid("Invalid order.");
        }
        query = query.order(column(resource, name), {
          ascending: direction === "asc",
          ...(nulls ? { nullsFirst: nulls === "nullsfirst" } : {}),
        });
      }
    }
    for (const key of keys[resource]) {
      query = query.order(snake(key));
    }
    const { offset, limit } = pagination(request, url);
    if (limit === 0) {
      const empty = result(await query.limit(0));
      return send([], 200, {
        "Content-Range": `*/${empty.count ?? "*"}`,
        "Range-Unit": "items",
      });
    }
    const reply = result(await query.range(offset, offset + limit - 1));
    const rows = reply.data ?? [];
    return send(
      rows.map((row) =>
        serialize(resource, row, fields)
      ),
      200,
      {
        "Content-Range": `${
          rows.length ? `${offset}-${offset + rows.length - 1}` : "*"
        }/${reply.count ?? "*"}`,
        "Range-Unit": "items",
      },
    );
  }
  if (resource !== "admin_post") {
    fail(
      405,
      "method_not_allowed",
      "This adapter exposes read-only data resources. Use the documented business operations for writes.",
    );
  }
  if (request.method === "POST") {
    if (url.search) invalid("POST does not accept query parameters.");
    const representation = preference(request);
    const record = announcement(await jsonBody(request), true);
    record.created_by = user.id;
    record.status ??= "draft";
    if (record.status === "published" && !record.image_url) {
      invalid("imageUrl is required to publish.");
    }
    record.published_at = record.status === "published"
      ? new Date().toISOString()
      : null;
    const saved =
      result(await db.from(resource).insert(record).select("*").single()).data;
    return send(representation ? serialize(resource, saved, null) : null, 201);
  }
  if (request.method === "PATCH") {
    const representation = preference(request);
    const patch = announcement(await jsonBody(request), false);
    const current = result(
      await filter(url, resource, db.from(resource).select("*"), true)
        .maybeSingle(),
    ).data;
    if (!current) fail(404, "not_found", "Record not found.");
    const next = { ...current, ...patch };
    if (next.status === "published" && !image(next.image_url)) {
      invalid("imageUrl is required to publish.");
    }
    if (patch.status === "published" && current.status !== "published") {
      patch.published_at = new Date().toISOString();
    }
    if (patch.status === "draft") patch.published_at = null;
    const saved = result(
      await filter(url, resource, db.from(resource).update(patch), true).eq(
        "updated_at",
        current.updated_at,
      ).select("*").maybeSingle(),
    ).data;
    if (!saved) {
      fail(
        409,
        "record_changed",
        "Reload the record before applying this change.",
      );
    }
    return send(
      representation ? [serialize(resource, saved, null)] : null,
      representation ? 200 : 204,
    );
  }
  if (request.method === "DELETE") {
    const deleted = result(
      await filter(url, resource, db.from(resource).delete(), true).select(
        "admin_post_id",
      ),
    ).data;
    if (!deleted?.length) fail(404, "not_found", "Record not found.");
    return send(null, 204);
  }
  fail(405, "method_not_allowed", "Unsupported method.");
}
