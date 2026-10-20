// Read-only integration with Player BE-2 0.4. All operations use the caller's JWT.
import { ContractError } from "./contract.mjs";

export const notificationTypes = [
  "match_reminder",
  "match_invite",
  "result_submitted",
  "dispute_update",
  "league_update",
  "system",
  "game_cancelled",
  "game_removed",
  "join_request",
  "request_accepted",
  "request_declined",
  "request_withdrawn",
  "no_show",
  "invite_accepted",
  "invite_declined",
  "result_confirmed",
  "result_expired",
];
const invalid = (message) => {
  throw new ContractError(400, "invalid_filter", message);
};
const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value ?? "",
    )
  ) invalid("A UUID is required.");
  return value;
};
function only(url, keys) {
  for (const key of url.searchParams.keys()) {
    if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      invalid(`Unsupported or duplicate parameter: ${key}.`);
    }
  }
}
function integer(url, key, fallback, min, max) {
  const raw = url.searchParams.get(key) ?? String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    invalid(`Invalid ${key}.`);
  }
  return Number(raw);
}
export function checkedRead(result) {
  if (result.error) {
    throw new ContractError(
      503,
      "database_unavailable",
      "The database request could not be completed.",
    );
  }
  return result;
}
export function registrationCount(db, registered = true) {
  let q = db.from("player_private").select(
    "player_id,player!inner(deleted_at)",
    { count: "exact", head: true },
  ).is("player.deleted_at", null);
  q = registered
    ? q.not("registered_at", "is", null)
    : q.is("registered_at", null);
  return q;
}
export async function accountState(db, player) {
  const r = checkedRead(
    await db.from("player_private").select("registered_at").eq(
      "player_id",
      player.player_id,
    ).maybeSingle(),
  );
  return {
    state: player.deleted_at
      ? "deleted"
      : r.data?.registered_at
      ? "registered"
      : "registration_pending",
    registered_at: r.data?.registered_at ?? null,
    deleted_at: player.deleted_at ?? null,
  };
}
export async function handleUpdatedRead(request, route, db, send) {
  const [resource, id, child] = route;
  const user = resource === "users" && route.length === 3 &&
    ["rating", "rating_trend", "rating_history", "registration"].includes(
      child,
    );
  const flags = resource === "result_flags" && route.length === 1;
  const leaderboard = resource === "rankings" && id === "leaderboard" &&
    route.length === 2;
  if (!user && !flags && !leaderboard) return null;
  if (request.method !== "GET") {
    throw new ContractError(
      405,
      "method_not_allowed",
      "This endpoint is read-only.",
    );
  }
  const url = new URL(request.url);
  if (user) {
    uuid(id);
    // Validate every argument before reading the parent or invoking a function.
    only(
      url,
      child === "rating_trend"
        ? ["days"]
        : child === "rating_history"
        ? ["page", "limit", "result_id", "match_id", "played_from", "played_to"]
        : [],
    );
    if (child === "rating_trend") integer(url, "days", 30, 1, 365);
    if (child === "rating_history") validateHistory(url);
    const p = checkedRead(
      await db.from("player").select("player_id,deleted_at").eq(
        "player_id",
        id,
      ).maybeSingle(),
    ).data;
    if (!p) throw new ContractError(404, "not_found", "Player not found.");
    if (child === "registration") {
      return send({ data: await accountState(db, p) });
    }
    if (child === "rating" || child === "rating_trend") {
      const args = { p_player_id: id };
      if (child === "rating_trend") {
        args.p_days = integer(url, "days", 30, 1, 365);
      }
      const name = child === "rating"
        ? "get_rating_summary"
        : "get_rating_trend";
      const r = checkedRead(await db.rpc(name, args));
      return send({ data: r.data, read_only: true, source: name });
    }
    const { page, limit, from } = pagination(url);
    let q = db.from("rating_history").select("*", { count: "exact" }).eq(
      "player_id",
      id,
    );
    for (const key of ["result_id", "match_id"]) {
      if (url.searchParams.has(key)) {
        q = q.eq(key, uuid(url.searchParams.get(key)));
      }
    }
    for (const [key, op] of [["played_from", "gte"], ["played_to", "lt"]]) {
      if (url.searchParams.has(key)) {
        q = q[op]("played_at", url.searchParams.get(key));
      }
    }
    const r = checkedRead(
      await q.order("played_at", { ascending: false }).order("history_id")
        .range(from, from + limit - 1),
    );
    return send({
      data: r.data,
      pagination: { page, limit, total: r.count },
      read_only: true,
      source_note:
        "Current rating history can be replayed by the shared engine; it is not an immutable daily leaderboard snapshot.",
    });
  }
  if (leaderboard) {
    only(url, ["scope", "state", "limit", "offset"]);
    const scope = url.searchParams.get("scope") ?? "state",
      state = url.searchParams.get("state");
    if (!["state", "nearby"].includes(scope)) {
      invalid("Scope must be state or nearby.");
    }
    if (
      state !== null &&
      !["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].includes(state)
    ) invalid("Invalid state.");
    const r = checkedRead(
      await db.rpc("get_leaderboard", {
        p_scope: scope,
        p_state: state,
        p_limit: integer(url, "limit", 25, 1, 100),
        p_offset: integer(url, "offset", 0, 0, 1000000),
      }),
    );
    return send({
      data: r.data,
      read_only: true,
      source_note:
        "Shared player leaderboard: established, registered, discoverable players only. Nearby uses the caller's suburb; stored /rankings remains the broader admin view.",
    });
  }
  only(url, [
    "page",
    "limit",
    "kind",
    "result_id",
    "match_id",
    "created_from",
    "created_to",
  ]);
  const { page, limit, from } = pagination(url);
  const kind = url.searchParams.get("kind");
  if (
    kind !== null &&
    !["repeat_pairing", "unusual_win_pattern", "rating_swing"].includes(kind)
  ) invalid("Invalid result flag kind.");
  for (const key of ["result_id", "match_id"]) {
    if (url.searchParams.has(key)) uuid(url.searchParams.get(key));
  }
  validateDates(url, "created_from", "created_to");
  let q = db.from("result_flag").select(
    "*,result:match_result!result_flag_result_id_fkey(result_id,status,games,confirmed_at)",
    { count: "exact" },
  );
  if (kind !== null) q = q.eq("kind", kind);
  for (const key of ["result_id", "match_id"]) {
    if (url.searchParams.has(key)) q = q.eq(key, url.searchParams.get(key));
  }
  for (const [key, op] of [["created_from", "gte"], ["created_to", "lt"]]) {
    if (url.searchParams.has(key)) {
      q = q[op]("created_at", url.searchParams.get(key));
    }
  }
  const r = checkedRead(
    await q.order("created_at", { ascending: false }).order("flag_id").range(
      from,
      from + limit - 1,
    ),
  );
  return send({
    data: r.data,
    pagination: { page, limit, total: r.count },
    read_only: true,
    source_note: "Flags are informational and do not block or reject results.",
  });
}
function pagination(url) {
  const page = integer(url, "page", 1, 1, 10000),
    limit = integer(url, "limit", 25, 1, 100);
  return { page, limit, from: (page - 1) * limit };
}
function validateDates(url, lower, upper) {
  for (const key of [lower, upper]) {
    const value = url.searchParams.get(key);
    if (
      value !== null &&
      (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    ) invalid(`Invalid ${key}. Use an ISO timestamp with timezone.`);
  }
  if (
    url.searchParams.has(lower) && url.searchParams.has(upper) &&
    Date.parse(url.searchParams.get(lower)) >=
      Date.parse(url.searchParams.get(upper))
  ) invalid(`${upper} must be after ${lower}.`);
}
function validateHistory(url) {
  pagination(url);
  for (const key of ["result_id", "match_id"]) {
    if (url.searchParams.has(key)) uuid(url.searchParams.get(key));
  }
  validateDates(url, "played_from", "played_to");
}
