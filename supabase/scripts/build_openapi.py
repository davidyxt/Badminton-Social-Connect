#!/usr/bin/env python3
"""Rebuild the API specs from the running local stack, so they always match
what the frontend can call:
  * docs/badminton-social-connect-api_v1.2.yaml, everything, with the
    design's not-yet-built endpoints tagged Planned;
  * docs/badminton-social-connect-api_implemented.yaml, only what is built.

    npx supabase db reset                      # migrations + dev seed
    python3 supabase/scripts/build_openapi.py

What comes from where:
  * Table endpoints: columns, types, allowed values (check constraints),
    column comments, which operations signed-in players are granted, and the
    names of the RLS policies (they say who may do what).
  * RPC endpoints: parameters and return type from the function signature,
    the description from its COMMENT, the errors from the `raise exception`
    lines in it and the private helpers it calls, and the response schema
    inferred from real calls made as the dev seed accounts, with an example.
  * Endpoints the original design describes but nobody has built yet are
    kept, tagged "Planned".

Needs: the supabase CLI, psql and ruby (for YAML), all already used by the
other scripts.
"""

import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs" / "badminton-social-connect-api_v1.2.yaml"
# The same, with only what has been built: no Planned endpoints.
BUILT_SPEC = ROOT / "docs" / "badminton-social-connect-api_implemented.yaml"
VERSION = "0.3.0"

# ---------------------------------------------------------------------------
# Local stack
# ---------------------------------------------------------------------------

out = subprocess.run(["npx", "--no-install", "supabase", "status", "-o", "json"],
                     capture_output=True, text=True, cwd=ROOT, check=True).stdout
ENV = json.loads(out[out.index("{"):])
API, ANON, DB_URL = ENV["API_URL"], ENV["ANON_KEY"], ENV["DB_URL"]


def sql_json(query):
    """Runs a query that returns one json value."""
    res = subprocess.run(["psql", DB_URL, "-Atqc", query], capture_output=True, text=True, check=True)
    return json.loads(res.stdout or "null")


def sign_in(email):
    req = urllib.request.Request(API + "/auth/v1/token?grant_type=password",
                                 data=json.dumps({"email": email, "password": "Passw0rd!"}).encode(),
                                 headers={"apikey": ANON, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["access_token"]


def call_rpc(fn, token, params):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}/rest/v1/rpc/{fn}", data=json.dumps(params).encode(),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Sample call {fn}({params}) failed: {e.code} {e.read()[:300]}. Run `npx supabase db reset`.")


def ruby_yaml_load(path):
    res = subprocess.run(["ruby", "-ryaml", "-rjson", "-e", "puts JSON.dump(YAML.load_file(ARGV[0]))", str(path)],
                         capture_output=True, text=True, check=True)
    return json.loads(res.stdout, object_pairs_hook=OrderedDict)


def ruby_yaml_dump(obj):
    res = subprocess.run(["ruby", "-ryaml", "-rjson", "-e",
                          "puts YAML.dump(JSON.parse(STDIN.read), line_width: 100)"],
                         input=json.dumps(obj), capture_output=True, text=True, check=True)
    return res.stdout


# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


def pg_type(t):
    t = t.lower()
    if t.endswith("[]"):
        return {"type": "array", "items": pg_type(t[:-2])}
    return {
        "uuid": {"type": "string", "format": "uuid"},
        "text": {"type": "string"}, "character varying": {"type": "string"},
        "integer": {"type": "integer"}, "smallint": {"type": "integer"},
        "bigint": {"type": "integer", "format": "int64"},
        "numeric": {"type": "number"}, "double precision": {"type": "number"}, "real": {"type": "number"},
        "boolean": {"type": "boolean"},
        "timestamp with time zone": {"type": "string", "format": "date-time"},
        "date": {"type": "string", "format": "date"},
        "jsonb": {"type": "object"}, "json": {"type": "object"},
    }.get(t, {"type": "string"})


def infer(values):
    """JSON schema for a list of sample values of the same field."""
    present = [v for v in values if v is not None]
    nullable = len(present) < len(values)
    if not present:
        # Not built yet (e.g. profile pictures, grades): typed as text until it is.
        return {"type": "string", "nullable": True, "description": "Null in every sample (not built yet)."}
    v0 = present[0]
    if isinstance(v0, bool):
        s = {"type": "boolean"}
    elif isinstance(v0, int) and all(isinstance(v, int) and not isinstance(v, bool) for v in present):
        s = {"type": "integer"}
    elif isinstance(v0, (int, float)):
        s = {"type": "number"}
    elif isinstance(v0, str):
        s = {"type": "string"}
        if all(UUID.match(v) for v in present):
            s["format"] = "uuid"
        elif all(DATETIME.match(v) for v in present):
            s["format"] = "date-time"
    elif isinstance(v0, list):
        items = [x for v in present for x in v]
        s = {"type": "array", "items": infer(items) if items else {}}
    elif isinstance(v0, dict):
        keys = list(OrderedDict.fromkeys(k for v in present if isinstance(v, dict) for k in v))
        s = {"type": "object", "properties": OrderedDict(
            (k, infer([v.get(k) for v in present if isinstance(v, dict)])) for k in keys)}
    else:
        s = {}
    if nullable:
        s["nullable"] = True
    return s


def errors_of(fn_name):
    """(code, message) pairs raised by a public function and the private helpers it calls."""
    src = sql_json(f"""
      select coalesce(json_agg(p.prosrc), '[]') from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = '{fn_name}'""")
    text = "\n".join(src)
    helpers = set(re.findall(r"private\.(\w+)\(", text))
    if helpers:
        more = sql_json(f"""
          select coalesce(json_agg(p.prosrc), '[]') from pg_proc p
          where p.pronamespace = 'private'::regnamespace
            and p.proname in ({",".join(f"'{h}'" for h in helpers)})""")
        text += "\n".join(more)
    found = []
    for msg, code in re.findall(r"raise exception\s+'((?:[^']|'')*)'[^;]*?errcode\s*=\s*'(\w+)'", text, re.S):
        pair = (code, msg.replace("''", "'"))
        if pair not in found:
            found.append(pair)
    return found


CODE_MEANING = {"42501": "not allowed", "23514": "a rule was broken", "23505": "already done / taken",
                "22023": "invalid value", "P0001": "error"}


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

TABLE_TAGS = {
    "player": "Players", "player_profile": "Players", "player_private": "Players",
    "game_post": "Games", "game_participant": "Games", "game_request_message": "Games",
    "game_participant_history": "Games", "cancellation_record": "Games",
    "match": "Results (tables)", "match_participant": "Results (tables)",
    "match_result": "Results (tables)", "dispute": "Results (tables)", "check_in": "Results (tables)",
    "ranking": "Rankings and leagues (tables)", "mini_league": "Rankings and leagues (tables)",
    "league_standing": "Rankings and leagues (tables)",
    "groups": "Groups", "group_member": "Groups",
    "blocks": "Trust and safety", "report": "Trust and safety",
    "notification": "Notifications",
    "venue": "Reference data", "state": "Reference data", "suburb": "Reference data",
    "venue_geocode_queue": "Internal",
    "admin_post": "Announcements",
}

tables = sql_json("""
  select json_agg(json_build_object(
    'name', c.relname,
    'comment', obj_description(c.oid, 'pg_class'),
    'columns', (
      select json_agg(json_build_object(
        'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
        'notnull', a.attnotnull, 'hasdefault', a.atthasdef or a.attidentity <> '' or a.attgenerated <> '',
        'generated', a.attgenerated <> '',
        'comment', col_description(c.oid, a.attnum),
        'select', has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT'),
        'insert', has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT'),
        'update', has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE'))
        order by a.attnum)
      from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
    'checks', (select coalesce(json_agg(pg_get_constraintdef(k.oid)), '[]') from pg_constraint k
               where k.conrelid = c.oid and k.contype = 'c'),
    'policies', (select coalesce(json_agg(json_build_object('name', p.polname, 'cmd', p.polcmd,
                   'permissive', p.polpermissive) order by p.polname), '[]')
                 from pg_policy p where p.polrelid = c.oid),
    'can', json_build_object(
      'select', has_table_privilege('authenticated', c.oid, 'SELECT')
                or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0
                           and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
      'insert', has_table_privilege('authenticated', c.oid, 'INSERT')
                or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0
                           and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
      'update', exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0
                        and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
      'delete', has_table_privilege('authenticated', c.oid, 'DELETE'))
  ) order by c.relname)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
""")


def enums_from_checks(checks):
    enums = {}
    for chk in checks:
        m = re.match(r"CHECK \(\(?\(?(\w+) = ANY \(ARRAY\[(.*)\]\)\)\)?\)?$", chk)
        if m:
            enums[m.group(1)] = re.findall(r"'([^']*)'::text", m.group(2))
    return enums


def pascal(name):
    return "".join(p.title() for p in name.split("_"))


def table_schemas(t):
    enums = enums_from_checks(t["checks"])
    row, write = OrderedDict(), OrderedDict()
    required = []
    for c in t["columns"]:
        s = dict(pg_type(c["type"]))
        if c["name"] in enums:
            s["enum"] = enums[c["name"]]
        if not c["notnull"]:
            s["nullable"] = True
        if c["comment"]:
            s["description"] = c["comment"]
        if c["generated"]:
            s["readOnly"] = True
        if c["select"]:
            row[c["name"]] = s
        if (c["insert"] or c["update"]) and not c["generated"]:
            write[c["name"]] = s
            if c["insert"] and c["notnull"] and not c["hasdefault"]:
                required.append(c["name"])
    schema = {"type": "object", "description": t["comment"] or f"A row of {t['name']}.", "properties": row}
    write_schema = {"type": "object", "properties": write}
    if required:
        write_schema["required"] = required
    return schema, write_schema


CMD = {"r": "read", "a": "insert", "w": "update", "d": "delete", "*": "all"}


def table_paths(t, components):
    name, can = t["name"], t["can"]
    if not any(can.values()):
        return None
    tag = TABLE_TAGS.get(name, "Other tables")
    row, write = table_schemas(t)
    components[pascal(name)] = row
    if can["insert"] or can["update"]:
        components[pascal(name) + "Write"] = write
    policy_lines = [f"- {'(restrictive) ' if not p['permissive'] else ''}{p['name'].split(': ', 1)[-1]} "
                    f"[{CMD.get(p['cmd'], p['cmd'])}]" for p in t["policies"]]
    desc = (t["comment"] + "\n\n" if t["comment"] else "") + \
        "Row Level Security decides which rows each player can see or change:\n\n" + "\n".join(policy_lines)
    ref = {"$ref": f"#/components/schemas/{pascal(name)}"}
    wref = {"$ref": f"#/components/schemas/{pascal(name)}Write"}
    common = [{"$ref": "#/components/parameters/selectParam"}]
    ops = OrderedDict()
    base = {"tags": [tag], "x-implementation": "supabase-postgrest"}
    if can["select"]:
        ops["get"] = {**base, "summary": f"Read {name} rows",
                      "description": desc,
                      "parameters": common + [{"$ref": "#/components/parameters/orderParam"},
                                              {"$ref": "#/components/parameters/limitParam"},
                                              {"$ref": "#/components/parameters/offsetParam"},
                                              {"$ref": "#/components/parameters/rowFilter"}],
                      "responses": {"200": {"description": "Rows the caller may see (empty if none).",
                                            "content": {"application/json": {"schema": {"type": "array", "items": ref}}}},
                                    "401": {"$ref": "#/components/responses/Unauthorized"}}}
    if can["insert"]:
        ops["post"] = {**base, "summary": f"Create a {name} row", "description": desc,
                       "parameters": [{"$ref": "#/components/parameters/preferParam"}],
                       "requestBody": {"required": True, "content": {"application/json": {"schema": wref}}},
                       "responses": {"201": {"description": "Created (with Prefer: return=representation).",
                                             "content": {"application/json": {"schema": {"type": "array", "items": ref}}}},
                                     "400": {"$ref": "#/components/responses/RuleBroken"},
                                     "403": {"$ref": "#/components/responses/Forbidden"}}}
    if can["update"]:
        ops["patch"] = {**base, "summary": f"Update {name} rows",
                        "description": desc + "\n\nOnly the columns in the request schema can be changed. "
                                              "A row the caller may not change is silently skipped: check "
                                              "the returned rows.",
                        "parameters": [{"$ref": "#/components/parameters/rowFilter"},
                                       {"$ref": "#/components/parameters/preferParam"}],
                        "requestBody": {"required": True, "content": {"application/json": {"schema": wref}}},
                        "responses": {"200": {"description": "The rows that changed.",
                                              "content": {"application/json": {"schema": {"type": "array", "items": ref}}}},
                                      "400": {"$ref": "#/components/responses/RuleBroken"}}}
    if can["delete"]:
        ops["delete"] = {**base, "summary": f"Delete {name} rows", "description": desc,
                         "parameters": [{"$ref": "#/components/parameters/rowFilter"},
                                        {"$ref": "#/components/parameters/preferParam"}],
                         "responses": {"200": {"description": "The rows that were deleted.",
                                               "content": {"application/json": {"schema": {"type": "array", "items": ref}}}},
                                       "400": {"$ref": "#/components/responses/RuleBroken"}}}
    verbs = {"get": "list", "post": "create", "patch": "update", "delete": "delete"}
    for method, op in ops.items():
        op["operationId"] = f"{verbs[method]}_{name}"
    return ops


# ---------------------------------------------------------------------------
# RPCs
# ---------------------------------------------------------------------------

G = lambda k: f"00000000-0000-0000-0000-00000000{k}"  # noqa: E731

# function: (tag, schema name or None, [(account, params), ...] sample calls)
# Functions that change data are not called; their response is from the
# return type (void → 204).
RPCS = OrderedDict([
    ("is_username_available", ("Registration", None, [(None, {"p_username": "alice"})])),
    ("register_player", ("Registration", None, [])),
    ("delete_my_account", ("Registration", None, [])),
    ("get_my_home", ("Profile", "MyHome", [("alice", {}), ("ivy", {}), ("grace", {})])),
    ("get_my_profile", ("Profile", "MyProfile", [("alice", {}), ("bob", {}), ("ivy", {})])),
    ("update_my_profile", ("Profile", "MyProfile", [])),
    ("get_game_form_options", ("Find games", "GameFormOptions", [("alice", {}), ("bob", {})])),
    ("search_venues", ("Find games", "VenueOption", [("alice", {"p_query": "badminton"}),
                                                     ("bob", {"p_query": "msac"})])),
    ("search_games", ("Find games", "GameCard", [("alice", {"p_limit": 50}), ("bob", {"p_limit": 50})])),
    ("get_game_details", ("Find games", "GameDetails", [
        ("bob", {"p_post_id": G("b001")}), ("alice", {"p_post_id": G("b004")}),
        ("carol", {"p_post_id": G("b008")}), ("alice", {"p_post_id": G("b007")})])),
    ("request_to_join", ("Join requests", None, [])),
    ("withdraw_request", ("Join requests", None, [])),
    ("get_join_requests", ("Join requests", "JoinRequest", [("alice", {"p_post_id": G("b001")}),
                                                             ("bob", {"p_post_id": G("b002")})])),
    ("accept_request", ("Join requests", None, [])),
    ("decline_request", ("Join requests", None, [])),
    ("invite_player", ("Request Game", None, [])),
    ("accept_invite", ("Request Game", None, [])),
    ("decline_invite", ("Request Game", None, [])),
    ("cancel_game_post", ("Games", None, [])),
    ("delete_game_post", ("Games", None, [])),
    ("search_players", ("Players", "PlayerCard", [("alice", {"p_limit": 50})])),
    ("get_player_profile", ("Players", "PlayerProfileView", [
        ("bob", {"p_player_id": G("a003")}), ("alice", {"p_player_id": G("a006")}),
        ("bob", {"p_player_id": G("a001")})])),
    ("get_player_history", ("Players", "HistoryEntry", [("bob", {"p_player_id": G("a001"), "p_limit": 20}),
                                                        ("alice", {"p_player_id": G("a003"), "p_limit": 20})])),
    ("block_player", ("Trust and safety", None, [])),
    ("unblock_player", ("Trust and safety", None, [])),
    ("get_blocked_players", ("Trust and safety", "BlockedPlayer", [("alice", {})])),
    ("report_player", ("Trust and safety", None, [])),
    ("report_post", ("Trust and safety", None, [])),
    ("report_group", ("Trust and safety", None, [])),
    ("report_league", ("Trust and safety", None, [])),
    ("get_notifications", ("Notifications", "NotificationItem", [("carol", {}), ("alice", {}), ("dan", {})])),
    ("mark_all_notifications_read", ("Notifications", None, [])),
    ("mark_no_show", ("Reliability", None, [])),
    ("clear_no_show", ("Reliability", None, [])),
    ("admin_game_post_deletion_impact", ("Admin", "DeletionImpact", [("admin", {"p_post_id": G("c101")})])),
    ("admin_delete_game_post", ("Admin", None, [])),
    ("geocode_claim_batch", ("Internal", None, [])),
    ("geocode_complete", ("Internal", None, [])),
    ("geocode_release", ("Internal", None, [])),
])

ACCOUNTS = ["admin", "alice", "bob", "carol", "dan", "erin", "frank", "grace", "ivy"]


def rpc_paths(components):
    tokens = {a: sign_in(f"{a}@example.com") for a in ACCOUNTS}
    funcs = {f["name"]: f for f in sql_json("""
      select json_agg(json_build_object(
        'name', p.proname, 'comment', obj_description(p.oid, 'pg_proc'),
        'result', pg_get_function_result(p.oid),
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'args', (select json_agg(json_build_object('name', n, 'type', format_type(t, null), 'mode', m)
                                 order by o)
                 from unnest(coalesce(p.proargnames, '{}'), p.proargtypes::oid[],
                             coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs])))
                      with ordinality as a(n, t, m, o)),
        'ndefaults', p.pronargdefaults))
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')""")}

    missing = set(funcs) - set(RPCS)
    if missing:
        sys.exit(f"Add these functions to RPCS in {__file__}: {sorted(missing)}")

    paths = OrderedDict()
    for name, (tag, schema_name, samples) in RPCS.items():
        f = funcs.get(name)
        if not f:
            sys.exit(f"{name} is in RPCS but not in the database.")
        args = f["args"] or []
        first_default = len(args) - (f["ndefaults"] or 0)
        props, required = OrderedDict(), []
        for i, a in enumerate(args):
            props[a["name"]] = pg_type(a["type"])
            if i < first_default:
                required.append(a["name"])
        body_schema = {"type": "object", "properties": props}
        if required:
            body_schema["required"] = required

        result = f["result"]
        responses = OrderedDict()
        if result == "void":
            responses["204"] = {"description": "Done. No body."}
        else:
            values = [call_rpc(name, tokens.get(acct), params) for acct, params in samples]
            if result == "jsonb":
                is_list = any(isinstance(v, list) for v in values)
                items = [x for v in values if isinstance(v, list) for x in v] if is_list else values
                shape = infer(items) if items else {"type": "object"}
                shape.pop("nullable", None)
                example = next((v for v in values if v), None)
                if schema_name and schema_name not in components:
                    components[schema_name] = shape
                ref = {"$ref": f"#/components/schemas/{schema_name}"} if schema_name else shape
                schema = {"type": "array", "items": ref} if is_list else dict(ref)
                if not is_list and any(v is None for v in values):
                    schema = {"allOf": [ref], "nullable": True}
                content = {"schema": schema}
                if example is not None:
                    content["example"] = example[:2] if isinstance(example, list) else example
                responses["200"] = {"description": "OK.", "content": {"application/json": content}}
            elif schema_name:
                responses["200"] = {"description": "OK.", "content": {"application/json": {
                    "schema": {"$ref": f"#/components/schemas/{schema_name}"}}}}
            else:
                responses["200"] = {"description": "OK.", "content": {"application/json": {
                    "schema": pg_type(result)}}}
        errs = errors_of(name)
        if errs:
            responses["400"] = {"$ref": "#/components/responses/RuleBroken"}
        if not f["anon"]:
            responses["401"] = {"$ref": "#/components/responses/Unauthorized"}

        desc = f["comment"] or ""
        if errs:
            desc += "\n\n**Errors** (`code`: message, safe to show to players):\n\n" + "\n".join(
                f"- `{c}` ({CODE_MEANING.get(c, 'error')}): {m}" for c, m in errs)
        if f["anon"]:
            desc += "\n\nCallable before sign-in."
        op = {"operationId": name, "tags": [tag], "summary": summary_of(f["comment"], name),
              "x-implementation": "postgres-rpc", "description": desc,
              "responses": responses}
        if tag == "Internal":
            op["x-internal"] = True
        if args:
            op["requestBody"] = {"required": bool(required), "content": {"application/json": {"schema": body_schema}}}
        paths[f"/rpc/{name}"] = {"post": op}
    return paths


# Where a function's COMMENT opens with a story number or code, not a sentence.
SUMMARIES = {
    "get_my_home": "Home page data",
    "get_my_profile": "The signed-in player's own profile",
    "update_my_profile": "Change profile settings (send only what changed)",
    "search_games": "Find Games: upcoming games, filtered",
    "get_game_details": "Game Details screen",
    "get_join_requests": "Requests for a game the caller organises",
    "search_players": "Find Games Players tab: search players",
    "get_player_profile": "Another player's profile",
    "get_player_history": "A player's verified match history",
    "block_player": "Block a player (one-sided), with an optional category and reason",
    "report_player": "Report a player",
    "get_notifications": "Notifications screen",
    "mark_no_show": "Host marks an accepted player as a no-show",
    "invite_player": "Request Game: invite one player to a singles game",
    "geocode_claim_batch": "Geocoder: take the worker lease and a batch of venues",
    "geocode_complete": "Geocoder: save a venue's pin, or record a miss",
    "geocode_release": "Geocoder: release the worker lease",
}


def summary_of(comment, name):
    if name in SUMMARIES:
        return SUMMARIES[name]
    if not comment:
        return name
    first = re.split(r"(?<=[.:])\s", comment.strip())[0].rstrip(":.")
    first = re.sub(r"supabase\.rpc\(.*", "", first).strip().rstrip(":")
    return (first[:110] + "…") if len(first) > 110 else (first or name)


# ---------------------------------------------------------------------------
# Assemble
# ---------------------------------------------------------------------------

def main():
    old = ruby_yaml_load(SPEC)
    components = OrderedDict()
    paths = OrderedDict()

    for t in tables:
        ops = table_paths(t, components)
        if ops:
            paths[f"/{t['name']}"] = ops
    paths.update(rpc_paths(components))

    # Design-only endpoints from earlier versions, kept until someone builds them.
    planned_refs = set()
    # Built under other names, so the old design entries are dropped:
    # the design's /group became the club tables, which became groups.
    superseded = {"/group", "/club", "/club_representative", "/rpc/report_club"}
    for path, ops in old.get("paths", {}).items():
        if path in paths or path in superseded:
            continue
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            op["tags"] = ["Planned (not built yet)"]
            op.setdefault("operationId", "planned_" + method + "_" + re.sub(r"\W+", "_", path).strip("_"))
            op["x-status"] = "planned"
            if not op.get("summary", "").startswith("[Planned]"):
                op["summary"] = "[Planned] " + re.sub(r"^\[[^\]]+\]\s*", "", op.get("summary", path))
            planned_refs.update(re.findall(r"#/components/schemas/(\w+)", json.dumps(op)))
            # Old per-table filter parameters are replaced by the one generic row filter.
            seen, params_out = set(), []
            for prm in op.get("parameters", []):
                ref = prm.get("$ref", "") if isinstance(prm, dict) else ""
                if ref.endswith("Filter"):
                    prm = {"$ref": "#/components/parameters/rowFilter"}
                key = json.dumps(prm, sort_keys=True)
                if key not in seen:
                    seen.add(key)
                    params_out.append(prm)
            if params_out:
                op["parameters"] = params_out
        paths[path] = ops

    # Old component schemas the planned endpoints still use. A generated
    # schema with the same name wins.
    old_schemas = old.get("components", {}).get("schemas", {})
    pending = list(planned_refs)
    while pending:
        name = pending.pop()
        if name in components or name not in old_schemas:
            continue
        components[name] = old_schemas[name]
        pending.extend(re.findall(r"#/components/schemas/(\w+)", json.dumps(old_schemas[name])))
    for name in ["Error"]:
        components[name] = old_schemas.get(name, components.get(name))
    components["Error"] = {
        "type": "object",
        "description": "PostgREST error. `code` is the Postgres error code; `message` is written to be "
                       "shown to players.",
        "properties": {"code": {"type": "string", "example": "23514"},
                       "message": {"type": "string",
                                   "example": "Games cannot be cancelled within 4 hours of the start time."},
                       "details": {"type": "string", "nullable": True},
                       "hint": {"type": "string", "nullable": True}},
        "required": ["code", "message"]}

    params = old["components"]["parameters"]
    params = OrderedDict((k, v) for k, v in params.items() if not k.endswith("Filter"))
    params["selectParam"]["description"] = "PostgREST column projection, e.g. select=post_id,title,groups(name)."
    params["orderParam"]["description"] = "PostgREST ordering, e.g. order=proposed_time.asc."
    params["rowFilter"] = {
        "name": "<column>", "in": "query", "required": False, "schema": {"type": "string"},
        "description": "Any PostgREST filter on a column, e.g. post_id=eq.<uuid> or status=in.(open,full). "
                       "PATCH and DELETE must filter to the rows meant (the API refuses an unfiltered "
                       "update or delete)."}

    responses = OrderedDict([
        ("Unauthorized", {"description": "Not signed in, or the function is not open to signed-out visitors "
                                         "(`42501` permission denied).",
                          "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}}),
        ("Forbidden", {"description": "Row Level Security refused the write (`42501`).",
                       "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}}),
        ("RuleBroken", {"description": "A rule was broken. `code` says which kind (`23514` rule, `23505` "
                                       "already done, `22023` invalid value, `42501` not allowed); show "
                                       "`message` to the player.",
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}}),
    ])
    for name in ["ValidationError"]:
        if name in json.dumps(paths):
            responses[name] = old["components"]["responses"][name]

    tag_desc = OrderedDict([
        ("Registration", "Sign-up checks, the 18+ age gate (BL-007) and account deletion. Sign-up, sign-in, "
                         "Google and password reset themselves go through supabase.auth, not this API."),
        ("Profile", "The signed-in player's own data: Home page, Profile page and its settings screens."),
        ("Find games", "Post a Game form data, Find Games search and Game Details (BL-013, BL-015)."),
        ("Join requests", "Asking to join a game and the organiser's responses (BL-017)."),
        ("Games", "Cancelling and removing games, and the game tables (BL-013, BL-016)."),
        ("Request Game", "Inviting one player to a singles game, and their answer. Same fields as Post a "
                         "Game; only the two players and admins can see the game."),
        ("Players", "Other players: search, profiles, playing history (BL-019, BL-060)."),
        ("Trust and safety", "Blocking (one-sided, BL-027) and reporting (BL-028)."),
        ("Notifications", "In-app notifications (BL-050). New rows also arrive over Realtime: subscribe to "
                          "postgres_changes on public.notification; RLS sends each player only their own."),
        ("Reliability", "No-shows and the reliability score (BL-052, BL-054)."),
        ("Groups", "Groups, their admins and members (BL-080). Players join by asking; a group admin approves."),
        ("Results (tables)", "Matches, results, disputes and check-ins. Result submission and confirmation "
                             "screens are not built in the backend yet (Planned)."),
        ("Rankings and leagues (tables)", "Read access to rankings and Mini Leagues. Their calculations and "
                                          "league management are Planned."),
        ("Announcements", "Admin posts shown on the home page."),
        ("Reference data", "States, suburbs and venues. Venues carry a Google Maps link (maps_url)."),
        ("Admin", "Platform admin actions (app_metadata.role = admin)."),
        ("Internal", "Called by Edge Functions with the service role, never by the app."),
        ("Planned (not built yet)", "From the original design. Kept so the team can see what is still to "
                                    "build; the parameters may change when they are built."),
    ])
    used_tags = OrderedDict.fromkeys(op["tags"][0] for ops in paths.values() for op in ops.values()
                                     if isinstance(op, dict) and op.get("tags"))
    tags = [{"name": t, "description": tag_desc.get(t, "")} for t in tag_desc if t in used_tags]
    tags += [{"name": t, "description": ""} for t in used_tags if t not in tag_desc]

    info = old["info"]
    info["version"] = VERSION
    info["description"] = DESCRIPTION
    spec = OrderedDict([
        ("openapi", "3.0.3"), ("info", info), ("servers", old["servers"]), ("tags", tags),
        ("security", old["security"]), ("paths", paths),
        ("components", OrderedDict([
            ("securitySchemes", old["components"]["securitySchemes"]),
            ("parameters", params), ("responses", responses),
            ("schemas", components)])),
        ("x-realtime-channels", [
            {"channel": "postgres_changes on public.notification", "status": "built",
             "scope": "Own rows only (RLS)", "usedFor": "Live notification badge and list (BL-050)."},
            {"channel": "game_post:{postId}", "status": "planned", "scope": "Per open post",
             "usedFor": "Live status updates (join requests, full, cancelled)."},
            {"channel": "mini_league:{leagueId}:standings", "status": "planned", "scope": "Per league",
             "usedFor": "Leaderboard updates after a confirmed result."},
            {"channel": "admin:reports", "status": "planned", "scope": "Admin only",
             "usedFor": "Live report queue for the moderation dashboard."},
        ]),
    ])
    header = ("# Badminton Social Connect — API specification (OpenAPI 3.0)\n"
              "# Built by supabase/scripts/build_openapi.py from the running local stack. Do not edit by\n"
              "# hand: change the function COMMENT or the script, then run it again.\n"
              "# Open in https://editor.swagger.io or any OpenAPI 3.0 viewer.\n")
    SPEC.write_text(header + ruby_yaml_dump(spec).replace("---\n", "", 1))
    write_built_only(spec, header)
    built = sum(1 for ops in paths.values() for op in ops.values() if isinstance(op, dict) and op.get("x-status") != "planned")
    planned = sum(1 for ops in paths.values() for op in ops.values() if isinstance(op, dict) and op.get("x-status") == "planned")
    print(f"Wrote {SPEC.relative_to(ROOT)}: {built} built operations, {planned} planned, "
          f"{len(components)} schemas.")


def write_built_only(spec, header):
    """The spec without Planned endpoints, and without the schemas only they use."""
    built = json.loads(json.dumps(spec), object_pairs_hook=OrderedDict)
    built["paths"] = OrderedDict(
        (path, ops) for path, ops in built["paths"].items()
        if not any(isinstance(op, dict) and op.get("x-status") == "planned" for op in ops.values()))

    # Keep the schemas reachable from the remaining paths.
    schemas = built["components"]["schemas"]
    keep, pending = set(), re.findall(r"#/components/schemas/(\w+)", json.dumps(built["paths"]))
    pending += ["Error"]
    while pending:
        name = pending.pop()
        if name in keep or name not in schemas:
            continue
        keep.add(name)
        pending += re.findall(r"#/components/schemas/(\w+)", json.dumps(schemas[name]))
    built["components"]["schemas"] = OrderedDict((k, v) for k, v in schemas.items() if k in keep)
    paths_text = json.dumps(built["paths"])
    built["components"]["responses"] = OrderedDict(
        (k, v) for k, v in built["components"]["responses"].items()
        if f"#/components/responses/{k}" in paths_text)

    used = {op["tags"][0] for ops in built["paths"].values() for op in ops.values()
            if isinstance(op, dict) and op.get("tags")}
    built["tags"] = [t for t in built["tags"] if t["name"] in used]
    built["x-realtime-channels"] = [c for c in built["x-realtime-channels"] if c.get("status") == "built"]
    built["info"]["title"] = built["info"]["title"] + " (implemented)"
    built["info"]["description"] = built["info"]["description"].replace(
        "Endpoints the original design describes\nbut nobody has built yet are tagged **Planned (not built yet)**.",
        "This file has only what is built; the full spec, with the design's Planned\nendpoints, is "
        "`badminton-social-connect-api_v1.2.yaml`.")
    BUILT_SPEC.write_text(header.replace("API specification (OpenAPI 3.0)",
                                         "API specification, implemented endpoints only (OpenAPI 3.0)")
                          + ruby_yaml_dump(built).replace("---\n", "", 1))
    n = sum(1 for ops in built["paths"].values() for op in ops.values() if isinstance(op, dict))
    print(f"Wrote {BUILT_SPEC.relative_to(ROOT)}: {n} operations, {len(keep)} schemas.")


DESCRIPTION = """\
How the frontend talks to the backend. Everything goes through the Supabase client:

- **Tables** (`GET/POST/PATCH/DELETE /{table}`): `supabase.from('game_post').select(...)` and so on. Row
  Level Security is the authorisation boundary: a request can only see or change the rows its policies
  allow, so a refused PATCH or DELETE often returns an empty list rather than an error. Column names are
  the database's snake_case names.
- **Functions** (`POST /rpc/{name}`): `supabase.rpc('search_games', { p_query, ... })`. Parameters start
  with `p_`. Screen functions return camelCase JSON shaped for the screen, e.g. `get_game_details`
  returns what the Game Details page renders.

Version 0.3.0 (2026-10-08) is built from the running backend by `supabase/scripts/build_openapi.py`:
every table, column, allowed value and function parameter is what the database has; every response
schema and example comes from a real call as a dev seed account. Endpoints the original design describes
but nobody has built yet are tagged **Planned (not built yet)**.

**Errors.** Every error is `{ code, message, details, hint }`. `code` is the Postgres error code:
`42501` not allowed, `23514` a rule was broken, `23505` already done or taken, `22023` an invalid value.
`message` is written for players and can be shown as it is. Each function lists the errors it raises.

**Signed out.** Only `is_username_available` (for the sign-up form) works before sign-in.

**Not yet registered.** A player who has not passed the 18+ age gate (`get_my_home().registered` is false)
sees no other players or games: lists come back empty and details null. Send them to
`/complete-registration`, which calls `register_player`.

**Realtime.** New notifications arrive over Supabase Realtime (`postgres_changes` on `public.notification`);
see `x-realtime-channels`.
"""

if __name__ == "__main__":
    main()
