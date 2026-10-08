#!/usr/bin/env python3
"""API tests for every endpoint the frontend calls, with a markdown report.

Runs against the local stack after `npx supabase db reset` (it signs in as the
dev seed accounts in supabase/seeds/dev/). Tests that change data use
throwaway accounts made for the run, so it can be run again without a reset.

    python3 supabase/tests/api_test.py                 # writes docs/api-test-report.md
    python3 supabase/tests/api_test.py --rls-log FILE  # also report rls_test.sh totals

Needs only the Python standard library, the `supabase` CLI (for the local keys)
and `psql` (for the two set-ups the API cannot do: a Google-style sign-up and
checking a deleted account's row).
"""

import argparse
import datetime as dt
import json
import random
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = "Passw0rd!"
ADULT = {"date_of_birth": "1992-06-15", "age_declared": True,
         "terms_version": "2026-10", "privacy_version": "2026-10", "state": "VIC"}

# Dev seed ids (supabase/seeds/dev/).
U = {name: f"00000000-0000-0000-0000-00000000a00{i}" for i, name in enumerate(
    ["admin", "alice", "bob", "carol", "dan", "erin", "frank", "grace", "henry", "ivy"])}
G = {k: f"00000000-0000-0000-0000-00000000{k}" for k in
     ["b001", "b002", "b003", "b004", "b005", "b006", "b007", "b008",
      "c101", "c102", "c103", "c104", "c105", "c106", "c107"]}
GROUP_SMASH = "00000000-0000-0000-0000-00000000c001"
GROUP_OLD = "00000000-0000-0000-0000-00000000c003"
LEAGUE = "00000000-0000-0000-0000-00000000e001"
MATCH_D101 = "00000000-0000-0000-0000-00000000d101"


# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------

def local_env():
    out = subprocess.run(["npx", "--no-install", "supabase", "status", "-o", "json"],
                         capture_output=True, text=True, cwd=ROOT, check=True).stdout
    env = json.loads(out[out.index("{"):])
    return env["API_URL"], env["ANON_KEY"], env["SERVICE_ROLE_KEY"], env["DB_URL"]


API, ANON, SERVICE, DB_URL = local_env()


def psql(sql):
    return subprocess.run(["psql", DB_URL, "-Atqc", sql], capture_output=True,
                          text=True, check=True).stdout.strip()


class Resp:
    def __init__(self, status, body, ms):
        self.status, self.body, self.ms = status, body, ms

    @property
    def code(self):
        """Postgres/PostgREST error code, or OK."""
        if isinstance(self.body, dict) and "code" in self.body and "message" in self.body:
            return str(self.body["code"])
        return "OK" if self.status < 400 else str(self.status)

    def __repr__(self):
        return f"{self.status} {json.dumps(self.body)[:160]}"


def call(method, path, token=None, body=None, prefer="return=representation", base="/rest/v1/"):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + base + path, data=data, method=method, headers=headers)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    ms = (time.perf_counter() - start) * 1000
    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = raw.decode(errors="replace")
    return Resp(status, parsed, ms)


def rpc(fn, token=None, **params):
    return call("POST", f"rpc/{fn}", token, params, prefer=None)


def sign_in(email, password=PASSWORD):
    r = call("POST", "token?grant_type=password", None,
             {"email": email, "password": password}, prefer=None, base="/auth/v1/")
    return r.body.get("access_token") if isinstance(r.body, dict) else None


def admin_create_user(email, user_meta, app_meta=None):
    body = {"email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": user_meta}
    if app_meta:
        body["app_metadata"] = app_meta
    req = urllib.request.Request(API + "/auth/v1/admin/users", data=json.dumps(body).encode(),
                                 method="POST", headers={"apikey": SERVICE,
                                                         "Authorization": f"Bearer {SERVICE}",
                                                         "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


RUN = f"{random.randint(1000, 9999)}"


def new_player(tag, **meta):
    """A registered throwaway player for this run. Returns (id, token, username)."""
    username = f"t{RUN}_{tag}"[:20]
    status, body = admin_create_user(f"{username}@example.com",
                                     {"username": username, "first_name": tag.title(), **ADULT, **meta})
    assert status < 300, body
    return body["id"], sign_in(f"{username}@example.com"), username


def future(days, hour=8):
    d = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)
    return d.strftime(f"%Y-%m-%dT{hour:02d}:00:00Z")


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------

RESULTS = OrderedDict()   # endpoint -> list of (case, ok, detail, ms)
CURRENT = {"endpoint": None, "area": None}
AREAS = OrderedDict()     # area -> [endpoints]


def endpoint(area, name):
    CURRENT["endpoint"] = name
    AREAS.setdefault(area, [])
    if name not in AREAS[area]:
        AREAS[area].append(name)
    RESULTS.setdefault(name, [])


def check(case, ok, resp=None, detail=""):
    ms = resp.ms if isinstance(resp, Resp) else None
    if not ok and not detail and resp is not None:
        detail = repr(resp)
    RESULTS[CURRENT["endpoint"]].append((case, bool(ok), detail, ms))
    mark = "PASS" if ok else "FAIL"
    print(f"  {mark}  {CURRENT['endpoint']}: {case}" + ("" if ok else f"  -- {detail}"))


def has_keys(obj, keys):
    return isinstance(obj, dict) and all(k in obj for k in keys)


def ids(lst):
    return {x.get("id") for x in lst} if isinstance(lst, list) else set()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", default=str(ROOT / "docs" / "api-test-report.md"))
    ap.add_argument("--rls-log", help="output of supabase/tests/rls_test.sh to summarise")
    args = ap.parse_args()

    T = {name: sign_in(f"{name}@example.com") for name in
         ["admin", "alice", "bob", "carol", "dan", "erin", "frank", "grace", "ivy"]}
    missing = [n for n, t in T.items() if not t]
    if missing:
        sys.exit(f"Could not sign in as {missing}. Run `npx supabase db reset` first.")

    # ------------------------------------------------------------------ M4
    A = "M4 Registration and profile"

    endpoint(A, "rpc/is_username_available")
    r = rpc("is_username_available", None, p_username="alice")
    check("signed out: a taken name is unavailable", r.body is False, r)
    r = rpc("is_username_available", None, p_username=f"free_{RUN}")
    check("signed out: a free name is available", r.body is True, r)
    r = rpc("is_username_available", None, p_username="has space")
    check("a name breaking the format is unavailable", r.body is False, r)

    endpoint(A, "auth sign-up trigger")
    status, body = admin_create_user(f"nouser{RUN}@example.com", {"first_name": "No", **ADULT})
    check("an email sign-up without a username is refused", status >= 400 and body.get("code") == "23514",
          detail=f"{status} {body}")
    status, body = admin_create_user(f"kid{RUN}@example.com",
                                     {"username": f"kid{RUN}", **ADULT, "date_of_birth": "2015-01-01"})
    check("an under-18 sign-up is refused", status >= 400, detail=f"{status} {body}")
    status, body = admin_create_user(f"dup{RUN}@example.com", {"username": "ALICE", **ADULT})
    check("a username taken in another case is refused", status >= 400, detail=f"{status} {body}")

    endpoint(A, "rpc/register_player")
    gid = psql(f"""
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
        email_change, email_change_token_new, email_change_token_current, phone_change,
        phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'google{RUN}@example.com', extensions.crypt('{PASSWORD}', extensions.gen_salt('bf')), now(),
        '{{"provider":"google","providers":["google"]}}', '{{"full_name":"Gail Google"}}',
        now(), now(), '', '', '', '', '', '', '', '')
      returning id;""").splitlines()[0]
    psql(f"""insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
             values (gen_random_uuid(), '{gid}', '{gid}', '{{"sub":"{gid}","email":"google{RUN}@example.com"}}',
                     'email', now(), now());""")
    tg = sign_in(f"google{RUN}@example.com")
    check("a Google sign-up is created with no username", psql(
        f"select coalesce(username, 'NULL') from public.player where player_id = '{gid}'") == "NULL")
    r = rpc("get_my_home", tg)
    check("and is not registered yet (the app sends them to /complete-registration)",
          isinstance(r.body, dict) and r.body.get("registered") is False, r)
    base = dict(p_date_of_birth="1990-03-03", p_age_declared=True, p_terms_version="2026-10",
                p_privacy_version="2026-10", p_state="VIC")
    r = rpc("register_player", tg, **base)
    check("registering without choosing a username is refused (23514)", r.code == "23514", r)
    r = rpc("register_player", tg, **base, p_username="alice")
    check("a taken username is refused (23505)", r.code == "23505", r)
    r = rpc("register_player", tg, **{**base, "p_date_of_birth": "2012-01-01"}, p_username=f"gail{RUN}")
    check("under 18 is refused (23514)", r.code == "23514", r)
    r = rpc("register_player", tg, **{**base, "p_state": "XX"}, p_username=f"gail{RUN}")
    check("an unknown state is refused (22023)", r.code == "22023", r)
    r = rpc("register_player", tg, **base, p_username=f"gail{RUN}")
    check("an adult with a free username registers (204)", r.status == 204, r)
    r = rpc("get_my_home", tg)
    check("the username is saved and registered is true",
          isinstance(r.body, dict) and r.body.get("registered") is True and r.body.get("username") == f"gail{RUN}", r)
    r = rpc("register_player", tg, **base)
    check("registering twice is refused (23505)", r.code == "23505", r)
    r = rpc("register_player", None, **base)
    check("signed out is refused", r.status in (401, 403) or r.code == "42501", r)

    endpoint(A, "rpc/get_my_home")
    r = rpc("get_my_home", T["alice"])
    check("returns the Home page fields", has_keys(r.body, [
        "id", "username", "firstName", "lastName", "greetingName", "initials", "registered", "level", "ratingCard",
        "unreadNotifications", "nextGame"]), r)
    check("includes the player's own first and last name",
          ((r.body or {}).get("firstName"), (r.body or {}).get("lastName")) == ("Alice", "Nguyen"), r)
    ng = (r.body or {}).get("nextGame") or {}
    check("next game is the soonest one alice is in, with title and Maps link",
          ng.get("id") == G["b001"] and ng.get("title") == "Friday Night Doubles" and ng.get("mapsUrl"),
          r, detail=json.dumps(ng)[:200])
    r = rpc("get_my_home", T["grace"])
    check("an unregistered Google player gets registered: false", (r.body or {}).get("registered") is False, r)
    r = rpc("get_my_home", None)
    check("signed out is refused (42501)", r.code == "42501", r)

    endpoint(A, "rpc/get_my_profile")
    r = rpc("get_my_profile", T["bob"])
    check("returns the Profile page fields", has_keys(r.body, [
        "id", "username", "firstName", "lastName", "name", "initials", "level", "bio", "suburb", "state",
        "stateName", "location", "isDiscoverable", "preferredFormat", "emailNotifications", "reliability",
        "gamesPlayed", "noShows", "lateWithdrawals", "lateCancellations",
        "ratingCard", "unreadNotifications", "joinedAt"]), r)
    b = r.body or {}
    check("bob's late cancellation shows in his figures (89% reliable)",
          (b.get("reliability"), b.get("lateCancellations")) == (89, 1),
          r, detail=json.dumps({k: b.get(k) for k in ["reliability", "lateCancellations"]}))
    check("no reliability band is sent (screens show the %)", "reliabilityBand" not in b, r)
    check("the private real name is the owner's to see", b.get("name") == "Bob Smith", r)

    endpoint(A, "rpc/update_my_profile")
    pid, tp, uname = new_player("prof")
    r = rpc("update_my_profile", tp, p_bio="Keen doubles player", p_suburb="Fitzroy",
            p_preferred_format="singles", p_email_notifications=False)
    check("updates bio, suburb, preferred format and email opt-out",
          isinstance(r.body, dict) and (r.body.get("bio"), r.body.get("suburb"), r.body.get("preferredFormat"),
                                        r.body.get("emailNotifications")) == ("Keen doubles player", "Fitzroy", "singles", False), r)
    r = rpc("update_my_profile", tp, p_preferred_format="triples")
    check("an unknown format is refused (22023)", r.code == "22023", r)
    r = rpc("update_my_profile", tp, p_username="carol")
    check("a taken username is refused (23505)", r.code == "23505", r)
    r = rpc("update_my_profile", tp, p_state="ZZ")
    check("an unknown state is refused (22023)", r.code == "22023", r)

    endpoint(A, "table player_private")
    r = call("GET", "player_private?select=first_name,last_name", T["bob"])
    check("a player reads only their own private row", isinstance(r.body, list) and len(r.body) == 1
          and r.body[0]["first_name"] == "Bob", r)
    r = call("GET", f"player_private?player_id=eq.{U['alice']}&select=first_name", T["bob"])
    check("nobody else's real name is readable", r.body == [], r)

    endpoint(A, "rpc/delete_my_account")
    did, td, duname = new_player("del")
    gp = call("POST", "game_post", td, {"organiser_id": did, "title": "Soon gone", "format": "singles",
                                        "suburb": "Carlton", "proposed_time": future(12)})
    post = gp.body[0]["post_id"] if isinstance(gp.body, list) else None
    rpc("request_to_join", T["ivy"], p_post_id=post)
    r = rpc("delete_my_account", td)
    check("a player deletes their own account (204)", r.status == 204, r)
    check("they can no longer sign in", sign_in(f"{duname}@example.com") is None)
    row = psql(f"select username || '|' || (deleted_at is not null) from public.player where player_id = '{did}'")
    check("their player row stays, as 'Deleted User'", row == "Deleted User|true", detail=row)
    check("their personal details are gone", psql(
        f"select coalesce(first_name,'') || coalesce(date_of_birth::text,'') from public.player_private where player_id = '{did}'") == "")
    check("their upcoming game is cancelled", psql(
        f"select status from public.game_post where post_id = '{post}'") == "cancelled")
    r = call("GET", f"notification?post_id=eq.{post}&type=eq.game_cancelled&select=message", T["ivy"])
    check("and players who asked to join are told", isinstance(r.body, list) and len(r.body) == 1, r)
    r = rpc("get_player_history", T["alice"], p_player_id=U["alice"], p_limit=20)
    names = [o.get("name") for h in (r.body or []) for o in h.get("opponents", [])]
    check("past results with a deleted player stay, named 'Deleted User'", "Deleted User" in names,
          r, detail=str(names))
    r = rpc("delete_my_account", None)
    check("signed out is refused", r.code == "42501", r)

    # ------------------------------------------------------------------ M1
    A = "M1 Find games"

    endpoint(A, "rpc/get_game_form_options")
    r = rpc("get_game_form_options", T["alice"])
    o = r.body or {}
    check("returns formats, styles, levels, limits and post-as options", has_keys(o, [
        "formats", "styles", "abilityLevels", "limits", "defaultTitle", "postAs"]), r)
    check("venues are not sent here (the dropdown uses search_venues)", "venues" not in o, r)
    check("alice can post as herself or as Smash Group (she is its admin)",
          [p.get("name") for p in o.get("postAs", [])] == ["alice", "Smash Group"], r,
          detail=json.dumps(o.get("postAs")))
    check("the fallback title is 'Badminton game'", o.get("defaultTitle") == "Badminton game", r)
    r = rpc("get_game_form_options", T["grace"])
    check("unregistered players get null", r.body is None, r)

    endpoint(A, "rpc/search_venues")
    r = rpc("search_venues", T["alice"], p_query="msac")
    v = r.body if isinstance(r.body, list) else []
    check("returns dropdown rows: id, name, address, suburb, postcode, state, label, mapsUrl",
          v and all(has_keys(x, ["id", "name", "address", "suburb", "postcode", "state", "label", "mapsUrl"])
                    for x in v), r)
    check("'msac' finds Melbourne Sports and Aquatic Centre first",
          v and v[0]["name"].startswith("Melbourne Sports and Aquatic Centre"), r)
    r = rpc("search_venues", T["alice"], p_query="aquatc")
    check("tolerates a typo ('aquatc')", any("Aquatic" in x["name"] for x in (r.body or [])), r)
    r = rpc("search_venues", T["alice"], p_query="Blackburn North")
    check("matches the suburb", any(x["suburb"] == "Blackburn North" for x in (r.body or [])), r)
    r = rpc("search_venues", T["alice"], p_query="3130")
    check("matches the postcode", any(x["postcode"] == "3130" for x in (r.body or [])), r)
    r = rpc("search_venues", T["alice"], p_state="nsw", p_limit=50)
    check("no query: venues A to Z, filtered by state",
          r.body and all(x["state"] == "NSW" for x in r.body)
          and [x["name"].lower() for x in r.body] == sorted(x["name"].lower() for x in r.body), r)
    r = rpc("search_venues", T["alice"], p_limit=500)
    check("at most 50 rows", isinstance(r.body, list) and len(r.body) == 50, r)
    r = rpc("search_venues", T["alice"], p_query="zzzqqq")
    check("no match is an empty list", r.body == [], r)
    r = rpc("search_venues", T["grace"], p_query="msac")
    check("unregistered players get an empty list", r.body == [], r)
    r = rpc("search_venues", None, p_query="msac")
    check("signed out is refused (42501)", r.code == "42501", r)
    venue = rpc("search_venues", T["alice"], p_query="Melbourne Badminton Centre").body[0]

    endpoint(A, "table game_post (create, edit)")
    cid, tc, _ = new_player("host")
    r = call("POST", "game_post", tc, {"organiser_id": cid, "title": "API test doubles", "format": "doubles",
                                       "style": "competitive", "ability_level": "intermediate",
                                       "venue_id": venue["id"], "proposed_time": future(10, 9),
                                       "duration_minutes": 90, "player_limit": 4, "notes": "Test"})
    gpost = r.body[0] if isinstance(r.body, list) else {}
    check("a player posts a game at a listed venue (201)", r.status == 201, r)
    check("the suburb is filled in from the venue", gpost.get("suburb") == venue["suburb"], r,
          detail=f"{gpost.get('suburb')} vs {venue['suburb']}")
    r = call("POST", "game_post", tc, {"organiser_id": cid, "format": "singles", "proposed_time": future(10)})
    check("no venue and no suburb is refused (23514)", r.code == "23514", r)
    r = call("POST", "game_post", tc, {"organiser_id": cid, "format": "singles", "suburb": "Carlton",
                                       "proposed_time": "2020-01-01T08:00:00Z"})
    check("a start in the past is refused (23514)", r.code == "23514", r)
    r = call("POST", "game_post", tc, {"organiser_group_id": GROUP_SMASH, "format": "doubles",
                                       "suburb": "Carlton", "proposed_time": future(10)})
    check("posting for a group you are not an admin of is refused", r.code == "42501", r)
    r = call("POST", "game_post", T["alice"], {"organiser_group_id": GROUP_OLD, "format": "doubles",
                                               "suburb": "Carlton", "proposed_time": future(10)})
    check("posting for an inactive group is refused", r.code in ("42501", "23514"), r)
    r = call("PATCH", f"game_post?post_id=eq.{gpost.get('post_id')}", tc, {"notes": "Bring water"})
    check("the organiser edits their game", isinstance(r.body, list) and len(r.body) == 1, r)
    r = call("PATCH", f"game_post?post_id=eq.{gpost.get('post_id')}", T["bob"], {"notes": "Hijacked"})
    check("another player cannot edit it", r.body == [], r)

    endpoint(A, "rpc/search_games")
    r = rpc("search_games", T["alice"], p_limit=50)
    lst = r.body if isinstance(r.body, list) else []
    check("returns Find Games cards", lst and all(has_keys(g, [
        "id", "title", "format", "style", "rank", "date", "time", "location", "suburb", "mapsUrl",
        "playerCount", "maxPlayers", "organiser", "myStatus"]) for g in lst), r)
    check("cancelled and removed games are not listed", not ({G["b005"], G["b006"]} & ids(lst)), r)
    untitled = [g for g in lst if g["id"] == G["b002"]]
    check("an untitled game is called 'Badminton game'", untitled and untitled[0]["title"] == "Badminton game", r)
    fr = [g for g in lst if g["id"] == G["b007"]]
    check("alice still sees frank's game, with a Blocked badge (one-sided block)",
          fr and fr[0]["organiser"].get("isBlocked") is True, r)
    r = rpc("search_games", T["alice"], p_format="singles", p_limit=50)
    check("the format filter works", r.body and all(g["format"] == "Singles" for g in r.body), r)
    r = rpc("search_games", T["alice"], p_query="Smash", p_limit=50)
    check("search finds the group game by name", G["b004"] in ids(r.body), r)
    r = rpc("search_games", T["frank"], p_limit=50)
    check("frank (blocked by alice) cannot see games alice runs or plays in",
          not ({G["b001"], G["b004"]} & ids(r.body)), r)
    r = rpc("search_games", T["grace"], p_limit=50)
    check("unregistered players get an empty list", r.body == [], r)
    t0 = time.perf_counter()
    for _ in range(10):
        rpc("search_games", T["bob"], p_limit=20)
    avg = (time.perf_counter() - t0) * 100
    check(f"10 calls in a row average under 200 ms ({avg:.0f} ms)", avg < 200)

    endpoint(A, "rpc/search_games: the search bar")
    # A game tomorrow at 6:30 pm Melbourne time at MSAC, made for these checks.
    from zoneinfo import ZoneInfo
    mel = ZoneInfo("Australia/Melbourne")
    when = (dt.datetime.now(mel) + dt.timedelta(days=1)).replace(hour=18, minute=30, second=0, microsecond=0)
    sid, ts, _ = new_player("searchhost")
    msac_id = rpc("search_venues", ts, p_query="msac").body[0]["id"]
    r = call("POST", "game_post", ts, {"organiser_id": sid, "title": f"Search check {RUN}", "format": "doubles",
                                       "style": "competitive", "ability_level": "advanced", "venue_id": msac_id,
                                       "proposed_time": when.isoformat(), "player_limit": 4})
    sg = r.body[0]["post_id"] if isinstance(r.body, list) else None
    day = when.strftime("%A").lower()
    cases = [("venue name", "msac"), ("suburb", "Albert Park"), ("postcode", "3206"),
             ("tomorrow", "tomorrow"), ("day name", day), ("short day name", day[:3]),
             ("time 6:30pm", "6:30pm"), ("time 6:30 pm", "6:30 pm"), ("time 18:30", "18:30"),
             ("evening", "evening"), ("date", f"{when.day}/{when.month}"),
             ("month", when.strftime("%b").lower()), ("level", "advanced"), ("format", "doubles"),
             ("style", "competitive"), ("title", f"check {RUN}")]
    for label, q in cases:
        r = rpc("search_games", T["bob"], p_query=q, p_limit=50)
        check(f"finds it by {label} ('{q}')", sg in ids(r.body), r, detail=f"{len(r.body or [])} results")
    for label, q in [("morning", "morning"), ("another time", "7am"), ("another suburb", "Clayton"),
                     ("another level", "beginner"), ("another format", "singles"), ("social", "friendly")]:
        r = rpc("search_games", T["bob"], p_query=q, p_limit=50)
        check(f"does not find it by {label} ('{q}')", sg not in ids(r.body), r)
    r = rpc("search_games", T["bob"], p_query="evening", p_format="doubles", p_level="advanced", p_limit=50)
    check("the search bar combines with the level and format filters", sg in ids(r.body), r)
    r = rpc("search_games", T["bob"], p_query="evening", p_format="singles", p_limit=50)
    check("and a filter that does not fit leaves it out", sg not in ids(r.body), r)

    endpoint(A, "rpc/get_game_details")
    r = rpc("get_game_details", T["bob"], p_post_id=G["b001"])
    d = r.body or {}
    check("returns the Game Details fields", has_keys(d, [
        "id", "title", "duration", "durationMinutes", "location", "locationDetail", "address", "venueId",
        "mapsUrl", "notes", "abilityLevel", "host", "players", "canManage", "matchId", "myStatus"]), r)
    check("the host carries rating, matches and reliability",
          has_keys(d.get("host"), ["name", "rating", "verifiedMatches", "reliability"]), r)
    check("bob sees he has asked to join", d.get("myStatus") not in (None, ""), r, detail=str(d.get("myStatus")))
    r = rpc("get_game_details", T["frank"], p_post_id=G["b001"])
    check("frank gets null for alice's game", r.body is None, r)
    r = rpc("get_game_details", T["bob"], p_post_id=G["b006"])
    check("a removed game is null for players", r.body is None, r)
    r = rpc("get_game_details", T["admin"], p_post_id=G["b006"])
    check("but admins still see it", isinstance(r.body, dict), r)
    r = rpc("get_game_details", T["carol"], p_post_id=G["b008"])
    check("a deleted organiser shows as 'Deleted User'",
          (r.body or {}).get("host", {}).get("name") == "Deleted User", r)

    endpoint(A, "rpc/request_to_join")
    jid, tj, _ = new_player("joiner")
    r = rpc("request_to_join", tj, p_post_id=gpost.get("post_id"), p_message="Keen to play!")
    check("a player asks to join with a message (204)", r.status == 204, r)
    r = rpc("request_to_join", tj, p_post_id=gpost.get("post_id"))
    check("asking twice is refused (23505)", r.code == "23505", r)
    r = rpc("request_to_join", tc, p_post_id=gpost.get("post_id"))
    check("the organiser cannot ask to join their own game (23514)", r.code == "23514", r)
    r = rpc("request_to_join", T["frank"], p_post_id=G["b001"])
    check("a blocked player cannot ask to join (42501)", r.code == "42501", r)

    endpoint(A, "rpc/get_join_requests")
    r = rpc("get_join_requests", tc, p_post_id=gpost.get("post_id"))
    req = (r.body or [{}])[0] if isinstance(r.body, list) else {}
    check("the organiser sees the request with the requester's details", has_keys(req.get("requester"), [
        "id", "name", "level", "message", "rating", "verifiedMatches", "reliability",
        "noShows", "lateWithdrawals"]), r)
    check("a new player is 100% reliable", req.get("requester", {}).get("reliability") == 100, r)
    r = rpc("get_join_requests", T["bob"], p_post_id=gpost.get("post_id"))
    check("anyone else is refused (42501)", r.code == "42501", r)

    endpoint(A, "rpc/accept_request")
    r = rpc("accept_request", T["bob"], p_post_id=gpost.get("post_id"), p_player_id=jid)
    check("only the organiser can accept (42501)", r.code == "42501", r)
    r = rpc("accept_request", tc, p_post_id=gpost.get("post_id"), p_player_id=jid)
    check("the organiser accepts (204)", r.status == 204, r)
    r = call("GET", f"notification?post_id=eq.{gpost.get('post_id')}&type=eq.request_accepted&select=message", tj)
    check("the player is notified", isinstance(r.body, list) and len(r.body) == 1, r)

    endpoint(A, "rpc/withdraw_request")
    r = rpc("withdraw_request", tj, p_post_id=gpost.get("post_id"))
    check("an accepted player withdraws (204)", r.status == 204, r)
    r = rpc("withdraw_request", tj, p_post_id=gpost.get("post_id"))
    check("withdrawing again is refused (42501)", r.code == "42501", r)

    endpoint(A, "rpc/decline_request")
    rpc("request_to_join", T["ivy"], p_post_id=gpost.get("post_id"))
    r = rpc("decline_request", tc, p_post_id=gpost.get("post_id"), p_player_id=U["ivy"])
    check("the organiser declines (204)", r.status == 204, r)

    endpoint(A, "rpc/cancel_game_post")
    r = rpc("cancel_game_post", T["bob"], p_post_id=gpost.get("post_id"))
    check("only the organiser can cancel (42501)", r.code == "42501", r)
    r = rpc("cancel_game_post", tc, p_post_id=gpost.get("post_id"), p_reason="Rain")
    check("the organiser cancels (204)", r.status == 204, r)
    r = rpc("cancel_game_post", tc, p_post_id=gpost.get("post_id"))
    check("cancelling twice is refused (23505)", r.code == "23505", r)
    soon = call("POST", "game_post", tc, {"organiser_id": cid, "format": "singles", "suburb": "Carlton",
                                          "proposed_time": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=2)).isoformat()})
    sp = soon.body[0]["post_id"] if isinstance(soon.body, list) else None
    r = rpc("cancel_game_post", tc, p_post_id=sp)
    check("within 4 hours of the start it is refused (23514)", r.code == "23514", r)

    endpoint(A, "rpc/delete_game_post")
    r = rpc("delete_game_post", tc, p_post_id=sp)
    check("within 4 hours deleting is refused too (23514)", r.code == "23514", r)
    later = call("POST", "game_post", tc, {"organiser_id": cid, "format": "singles", "suburb": "Carlton",
                                           "proposed_time": future(15)})
    lp = later.body[0]["post_id"] if isinstance(later.body, list) else None
    r = rpc("delete_game_post", tc, p_post_id=lp)
    check("the organiser removes an upcoming game (204)", r.status == 204, r)
    r = rpc("delete_game_post", T["alice"], p_post_id=G["c101"])
    check("a game that has happened cannot be removed by its organiser (42501)", r.code == "42501", r)

    endpoint(A, "rpc/admin_game_post_deletion_impact")
    r = rpc("admin_game_post_deletion_impact", T["admin"], p_post_id=G["c101"])
    check("admins see what removing a played game would change", isinstance(r.body, dict), r)
    r = rpc("admin_game_post_deletion_impact", T["alice"], p_post_id=G["c101"])
    check("players are refused (42501)", r.code == "42501", r)

    endpoint(A, "rpc/admin_delete_game_post")
    r = rpc("admin_delete_game_post", T["admin"], p_post_id=G["c101"], p_reason="")
    check("an admin delete needs a reason (23514)", r.code == "23514", r)
    r = rpc("admin_delete_game_post", T["alice"], p_post_id=G["c101"], p_reason="x")
    check("players are refused (42501)", r.code == "42501", r)

    endpoint(A, "table venue / state")
    r = call("GET", "venue?select=venue_id,name,maps_url,latitude,longitude", T["bob"])
    check("venues are readable, each with a Maps link", isinstance(r.body, list) and len(r.body) >= 140
          and all(v["maps_url"] for v in r.body), r, detail=f"{len(r.body or [])} venues")
    sub = psql("select suburb_id from public.suburb where name = 'Carlton' limit 1")
    r = call("POST", "venue", T["bob"], {"name": "Bob's Barn", "suburb_id": sub})
    check("players cannot add venues", r.code == "42501", r)
    r = call("GET", "state?select=state_code,name&order=name", T["bob"])
    check("the 8 states and territories are listed", isinstance(r.body, list) and len(r.body) == 8, r)

    # ------------------------------------------------------------------ Players
    A = "M1/M5 Players and profiles"

    endpoint(A, "rpc/search_players")
    r = rpc("search_players", T["alice"], p_limit=50)
    lst = r.body if isinstance(r.body, list) else []
    check("returns player cards with reliability (%)", lst and all(has_keys(p, [
        "id", "name", "initials", "rank", "location", "reliability", "isBlocked"]) for p in lst), r)
    names = {p["name"] for p in lst}
    check("frank is found, badged as blocked",
          any(p["name"] == "frank" and p["isBlocked"] for p in lst), r)
    check("hidden (dan), unregistered (grace) and deleted players are not listed",
          not ({"dan", "Deleted User", None} & names), r, detail=str(sorted(n for n in names if n)))
    r = rpc("search_players", T["frank"], p_limit=50)
    check("frank cannot find alice", "alice" not in {p["name"] for p in (r.body or [])}, r)

    endpoint(A, "rpc/get_player_profile")
    r = rpc("get_player_profile", T["bob"], p_player_id=U["carol"])
    p = r.body or {}
    check("returns the Player Profile fields", has_keys(p, [
        "id", "name", "level", "status", "rating", "wins", "losses", "matches", "recentForm",
        "preferredFormat", "area", "league", "reliability", "gamesPlayed", "noShows",
        "lateWithdrawals", "lateCancellations", "isBlocked"]), r)
    r = rpc("get_player_profile", T["alice"], p_player_id=U["frank"])
    check("the blocker can open the blocked player's profile, badged",
          (r.body or {}).get("isBlocked") is True, r)
    r = rpc("get_player_profile", T["frank"], p_player_id=U["alice"])
    check("the blocked player cannot open the blocker's", r.body is None, r)
    r = rpc("get_player_profile", T["bob"], p_player_id=U["dan"])
    check("a hidden profile is open to a host dan asked to join", isinstance(r.body, dict), r)
    r = rpc("get_player_profile", T["ivy"], p_player_id=U["dan"])
    check("but not to anyone else", r.body is None, r)
    r = rpc("get_player_profile", T["alice"], p_player_id=U["henry"])
    check("a deleted account has no profile", r.body is None, r)
    r = rpc("get_player_profile", T["bob"], p_player_id=U["dan"])
    check("dan's no-show shows in his figures (80%, 1 no-show)",
          (r.body or {}).get("reliability") == 80 and (r.body or {}).get("noShows") == 1, r)

    endpoint(A, "rpc/get_player_history")
    r = rpc("get_player_history", T["bob"], p_player_id=U["alice"], p_limit=20)
    h = r.body if isinstance(r.body, list) else []
    check("lists verified matches with result, score and opponents", h and all(has_keys(x, [
        "matchId", "result", "score", "opponents"]) for x in h), r)
    check("only confirmed results count (the disputed one is left out)",
          MATCH_D101 in {x["matchId"] for x in h}, r)
    r = rpc("get_player_history", T["ivy"], p_player_id=U["dan"])
    check("a hidden profile's history is hidden too", r.body is None, r)

    # ------------------------------------------------------------------ M3
    A = "M3 Reporting and blocking"

    endpoint(A, "rpc/block_player")
    bid, tb, _ = new_player("blocker")
    r = rpc("block_player", tb, p_player_id=U["erin"], p_category="spam", p_reason="Keeps posting ads")
    check("block with a category and reason (204)", r.status == 204, r)
    r = rpc("block_player", tb, p_player_id=U["erin"])
    check("blocking again is harmless and keeps the reason", r.status == 204, r)
    r = rpc("block_player", tb, p_player_id=U["carol"], p_category="rude")
    check("an unknown category is refused (23514)", r.code == "23514", r)
    r = rpc("block_player", tb, p_player_id=bid)
    check("nobody can block themselves (23514)", r.code == "23514", r)

    endpoint(A, "rpc/get_blocked_players")
    r = rpc("get_blocked_players", tb)
    e = [x for x in (r.body or []) if x["id"] == U["erin"]]
    check("the Blocked Users list shows category and reason",
          e and (e[0]["categoryLabel"], e[0]["reason"]) == ("Spam", "Keeps posting ads"), r)
    r = rpc("get_blocked_players", T["alice"])
    check("alice's list shows frank", U["frank"] in ids(r.body), r)
    r = call("GET", "blocks?select=blocker_id,category", T["frank"])
    check("frank cannot see that alice blocked him", r.body == [], r)

    endpoint(A, "rpc/unblock_player")
    r = rpc("unblock_player", tb, p_player_id=U["erin"])
    check("unblock (204)", r.status == 204, r)
    check("the list is empty again", rpc("get_blocked_players", tb).body == [])

    endpoint(A, "rpc/report_player / report_post / report_group / report_league")
    rid, tr, _ = new_player("reporter")
    r = rpc("report_player", tr, p_player_id=U["frank"], p_category="harassment")
    check("a report without details is refused (23514)", r.code == "23514", r)
    r = rpc("report_player", tr, p_player_id=U["frank"], p_category="harassment", p_reason="Abusive messages")
    check("a player report with details returns its id", isinstance(r.body, str) and len(r.body) == 36, r)
    r = rpc("report_player", tr, p_player_id=U["frank"], p_category="spam", p_reason="Again")
    check("a second open report on the same player is refused (23505)", r.code == "23505", r)
    r = rpc("report_post", tr, p_post_id=G["b007"], p_category="spam", p_reason="Coaching ad")
    check("a game post can be reported", isinstance(r.body, str), r)
    r = rpc("report_group", tr, p_group_id=GROUP_SMASH, p_category="other", p_reason="Fake group")
    check("a group can be reported", isinstance(r.body, str), r)
    r = rpc("report_league", tr, p_league_id=LEAGUE, p_category="other", p_reason="Spam league")
    check("a league can be reported", isinstance(r.body, str), r)
    r = rpc("report_player", tr, p_player_id=U["frank"], p_category="threats", p_reason="x")
    check("an unknown category is refused", r.code in ("23514", "23505"), r)
    r = rpc("report_player", tr, p_player_id=rid, p_category="spam", p_reason="x")
    check("nobody can report themselves (23514)", r.code == "23514", r)

    endpoint(A, "table report")
    r = call("GET", "report?select=report_id,category,status", tr)
    check("a player reads only their own reports", isinstance(r.body, list) and len(r.body) == 4, r)
    r = call("GET", "report?select=report_id&status=in.(open,under_review)", T["admin"])
    check("admins see the queue", isinstance(r.body, list) and len(r.body) >= 2, r)

    # ------------------------------------------------------------------ M5
    A = "M5 Trust and reliability"

    endpoint(A, "rpc/get_notifications")
    r = rpc("get_notifications", T["carol"], p_limit=50)
    lst = r.body if isinstance(r.body, list) else []
    check("returns notification cards", lst and all(has_keys(n, [
        "id", "type", "title", "message", "unread", "createdAt", "postId", "matchId"]) for n in lst), r)
    check("carol was told the deleted player's game was cancelled",
          any(n["type"] == "game_cancelled" and n["postId"] == G["b008"] for n in lst), r)

    endpoint(A, "rpc/mark_all_notifications_read")
    r = rpc("mark_all_notifications_read", tj)
    check("returns how many were marked", isinstance(r.body, int) and r.body >= 1, r)
    r = call("GET", "notification?is_read=eq.false&select=notification_id", tj)
    check("nothing is unread afterwards", r.body == [], r)

    endpoint(A, "table notification")
    r = call("GET", f"notification?player_id=eq.{U['carol']}&select=notification_id", T["bob"])
    check("nobody reads another player's notifications", r.body == [], r)
    r = call("POST", "notification", T["bob"], {"player_id": U["bob"], "type": "system", "message": "x"})
    check("players cannot write notifications", r.code == "42501", r)

    endpoint(A, "rpc/mark_no_show / clear_no_show")
    r = rpc("mark_no_show", T["alice"], p_post_id=G["b001"], p_player_id=U["carol"])
    check("a no-show cannot be recorded before the start (23514)", r.code == "23514", r)
    r = rpc("mark_no_show", T["bob"], p_post_id=G["b001"], p_player_id=U["carol"])
    check("only the host can record one (42501)", r.code == "42501", r)
    r = rpc("clear_no_show", T["ivy"], p_post_id=G["c102"], p_player_id=U["dan"])
    check("nobody else can clear one either (42501)", r.code == "42501", r)
    r = rpc("clear_no_show", T["bob"], p_post_id=G["c102"], p_player_id=U["dan"])
    check("the host cannot change it after the 48-hour window (23514)", r.code == "23514", r)

    endpoint(A, "table player_profile (email opt-out)")
    r = call("PATCH", f"player_profile?player_id=eq.{tj and jid}", tj, {"email_notifications": False})
    check("a player turns notification emails off", isinstance(r.body, list) and len(r.body) == 1, r)
    r = call("PATCH", f"player_profile?player_id=eq.{U['carol']}", tj, {"email_notifications": False})
    check("but not for someone else", r.body == [], r)

    # ------------------------------------------------------------------ Request Game
    A = "Request Game (invitations)"

    endpoint(A, "rpc/invite_player")
    hid, th, huname = new_player("inviter")
    iid, ti, iuname = new_player("invitee")
    msac = rpc("search_venues", th, p_query="msac").body[0]["id"]
    base = dict(p_proposed_time=future(11, 9), p_venue_id=msac, p_title="Saturday singles?")
    r = rpc("invite_player", th, p_player_id=iid, p_message="Fancy a hit on Saturday?", **base)
    inv = r.body if isinstance(r.body, str) else None
    check("invite a player to a singles game; returns the game id", inv is not None and len(inv) == 36, r)
    r = rpc("get_game_details", th, p_post_id=inv)
    d = r.body or {}
    check("it is a singles game for 2, marked as an invitation",
          (d.get("format"), d.get("maxPlayers"), d.get("isInvite")) == ("Singles", 2, True), r)
    check("the organiser sees who is invited, the answer so far and the message",
          (d.get("invite") or {}).get("status") == "invited"
          and (d.get("invite") or {}).get("message") == "Fancy a hit on Saturday?", r)
    r = rpc("invite_player", th, p_player_id=hid, **base)
    check("nobody can invite themselves (23514)", r.code == "23514", r)
    r = rpc("invite_player", T["frank"], p_player_id=U["alice"], **base)
    check("a player who blocked you cannot be invited (42501)", r.code == "42501", r)
    r = rpc("invite_player", T["alice"], p_player_id=U["frank"], **base)
    check("nor someone you blocked (42501)", r.code == "42501", r)
    r = rpc("invite_player", th, p_player_id=U["henry"], **base)
    check("nor a deleted account (42501)", r.code == "42501", r)
    r = rpc("invite_player", th, p_player_id=U["grace"], **base)
    check("nor an unregistered player (42501)", r.code == "42501", r)
    r = rpc("invite_player", th, p_player_id=iid, p_proposed_time="2020-01-01T08:00:00Z", p_suburb="Carlton")
    check("the Post a Game rules apply: no start in the past (23514)", r.code == "23514", r)
    r = rpc("invite_player", None, p_player_id=iid, **base)
    check("signed out is refused", r.code == "42501", r)

    endpoint(A, "invitation privacy")
    r = rpc("search_games", T["carol"], p_limit=50)
    check("other players do not find it in Find Games", inv not in ids(r.body), r)
    r = rpc("get_game_details", T["carol"], p_post_id=inv)
    check("nor open it", r.body is None, r)
    r = call("GET", f"game_post?post_id=eq.{inv}&select=post_id", T["carol"])
    check("nor read it from the table", r.body == [], r)
    r = rpc("request_to_join", T["carol"], p_post_id=inv)
    check("nor ask to join it (42501)", r.code == "42501", r)
    r = call("GET", f"game_post?post_id=eq.{inv}&select=post_id", T["admin"])
    check("admins can see it", isinstance(r.body, list) and len(r.body) == 1, r)
    r = rpc("get_player_profile", ti, p_player_id=hid)
    check("the invited player can open the organiser's profile to decide", isinstance(r.body, dict), r)

    endpoint(A, "rpc/accept_invite / decline_invite")
    r = call("GET", f"notification?post_id=eq.{inv}&type=eq.match_invite&select=message,detail", ti)
    n = r.body[0] if isinstance(r.body, list) and r.body else {}
    check("the invited player is notified, with the organiser's message",
          n.get("message", "").startswith(f"{huname} invited you to") and n.get("detail") == "Fancy a hit on Saturday?",
          r, detail=json.dumps(n))
    r = rpc("get_game_details", ti, p_post_id=inv)
    check("Game Details tells the invited player to answer (myStatus 'invited')",
          (r.body or {}).get("myStatus") == "invited", r)
    r = call("PATCH", f"game_participant?post_id=eq.{inv}&player_id=eq.{iid}", th, {"status": "accepted"})
    check("the organiser cannot accept on the invited player's behalf", r.code == "42501", r)
    r = call("PATCH", f"game_participant?post_id=eq.{inv}&player_id=eq.{iid}", ti, {"status": "accepted"})
    check("the invited player cannot skip accept_invite either", r.code == "42501" or r.body == [], r)
    r = rpc("accept_invite", T["carol"], p_post_id=inv)
    check("only the invited player can answer (42501)", r.code == "42501", r)
    r = rpc("accept_invite", ti, p_post_id=inv)
    check("the invited player accepts (204)", r.status == 204, r)
    r = rpc("get_game_details", ti, p_post_id=inv)
    check("both are now on the roster, with a match",
          len((r.body or {}).get("players", [])) == 2 and (r.body or {}).get("matchId"), r)
    r = call("GET", f"notification?post_id=eq.{inv}&type=eq.invite_accepted&select=message,match_id", th)
    check("the organiser is notified, with the match to open",
          isinstance(r.body, list) and len(r.body) == 1 and r.body[0]["match_id"], r)
    r = rpc("accept_invite", ti, p_post_id=inv)
    check("answering twice is refused (23505)", r.code == "23505", r)

    r = rpc("invite_player", th, p_player_id=iid, **{**base, "p_proposed_time": future(12, 9)})
    inv2 = r.body
    r = rpc("decline_invite", ti, p_post_id=inv2)
    check("the invited player can decline (204)", r.status == 204, r)
    r = call("GET", f"notification?post_id=eq.{inv2}&type=eq.invite_declined&select=message", th)
    check("the organiser is told it was declined", isinstance(r.body, list) and len(r.body) == 1, r)
    r = rpc("request_to_join", ti, p_post_id=inv2)
    check("after declining, they cannot join by asking instead (23514)", r.code == "23514", r)
    r = rpc("get_player_profile", T["alice"], p_player_id=iid)
    rel = rpc("get_my_profile", ti).body or {}
    check("declining does not affect reliability", rel.get("reliability") == 100, detail=str(rel.get("reliability")))

    r = rpc("invite_player", th, p_player_id=iid, **{**base, "p_proposed_time": future(13, 9)})
    inv3 = r.body
    rpc("cancel_game_post", th, p_post_id=inv3, p_reason="Can't make it")
    r = call("GET", f"notification?post_id=eq.{inv3}&type=eq.game_cancelled&select=message", ti)
    check("if the organiser cancels, the invited player is told", isinstance(r.body, list) and len(r.body) == 1, r)
    r = rpc("accept_invite", ti, p_post_id=inv3)
    check("and can no longer accept (23514)", r.code == "23514", r)

    endpoint(A, "invitation limits and blocking")
    gid2, tg2, _ = new_player("guest")
    r = rpc("invite_player", th, p_player_id=gid2, **{**base, "p_proposed_time": future(14, 9)})
    inv4 = r.body
    rpc("block_player", tg2, p_player_id=hid)
    r = call("GET", f"game_participant?post_id=eq.{inv4}&player_id=eq.{gid2}&select=status", tg2)
    check("blocking the organiser closes their invitation (declined)",
          isinstance(r.body, list) and r.body and r.body[0]["status"] == "declined", r)
    r = call("POST", "game_post", th, {"organiser_id": hid, "invited_player_id": iid, "format": "singles",
                                       "suburb": "Carlton", "proposed_time": future(15)})
    check("an invitation cannot be made by writing the table directly (42501)", r.code == "42501", r)
    # The earlier invitations were all answered or cancelled: make 10 open ones.
    for k in range(10):
        rpc("invite_player", th, p_player_id=iid, **{**base, "p_proposed_time": future(16 + k, 9)})
    r = rpc("invite_player", th, p_player_id=iid, **{**base, "p_proposed_time": future(30, 9)})
    check("at most 10 unanswered invitations at a time (23514)", r.code == "23514", r)

    # ------------------------------------------------------------------ M6
    A = "M6 Groups"

    endpoint(A, "table groups")
    r = call("GET", "groups?select=group_id,name,is_active&order=name", T["bob"])
    check("groups are listed, active and inactive", isinstance(r.body, list) and len(r.body) >= 3, r)
    kid, tk, _ = new_player("groupber")
    r = call("POST", "groups", tk, {"name": f"Test Group {RUN}", "slug": f"test-group-{RUN}", "created_by": kid,
                                  "suburb": "Carlton", "state": "VIC"})
    newgroup = r.body[0]["group_id"] if isinstance(r.body, list) else None
    check("a player creates a group (201)", r.status == 201, r)
    r = call("GET", f"group_member?group_id=eq.{newgroup}&select=player_id,role,status", tk)
    check("and becomes its first admin", r.body == [{"player_id": kid, "role": "admin", "status": "approved"}], r)
    r = call("PATCH", f"groups?group_id=eq.{GROUP_SMASH}", tk, {"name": "Hijacked"})
    check("only a group's admins rename it", r.body == [], r)
    r = call("DELETE", f"groups?group_id=eq.{newgroup}", tk)
    check("groups cannot be deleted, only deactivated", r.code == "42501" or r.body == [], r)

    endpoint(A, "table group_member")
    r = call("POST", "group_member", tk, {"group_id": GROUP_SMASH, "player_id": kid})
    check("a player asks to join (pending member)", isinstance(r.body, list)
          and (r.body[0]["status"], r.body[0]["role"]) == ("pending", "member"), r)
    r = call("POST", "group_member", T["alice"], {"group_id": GROUP_SMASH, "player_id": jid, "status": "approved"})
    check("a group admin cannot add a player directly (players must ask)", r.code == "42501", r)
    r = call("GET", f"group_member?group_id=eq.{GROUP_SMASH}&status=eq.pending&select=player_id", T["erin"])
    check("other members do not see pending requests", r.body == [], r)
    r = call("PATCH", f"group_member?group_id=eq.{GROUP_SMASH}&player_id=eq.{kid}", tk, {"status": "approved"})
    check("nobody approves their own request", r.body == [], r)
    r = call("PATCH", f"group_member?group_id=eq.{GROUP_SMASH}&player_id=eq.{kid}", T["alice"], {"status": "approved"})
    check("the group admin approves it", isinstance(r.body, list) and len(r.body) == 1, r)
    r = call("DELETE", f"group_member?group_id=eq.{GROUP_SMASH}&player_id=eq.{kid}", tk)
    check("a member can leave", isinstance(r.body, list) and len(r.body) == 1, r)
    r = call("DELETE", f"group_member?group_id=eq.{newgroup}&player_id=eq.{kid}", tk)
    check("the last admin cannot leave (23514)", r.code == "23514", r)

    # ------------------------------------------------------------------ Other tables
    A = "Other tables the screens read"

    endpoint(A, "table admin_post")
    r = call("GET", "admin_post?select=title,status&order=display_order", T["bob"])
    check("players see published announcements only", isinstance(r.body, list) and len(r.body) == 2
          and all(x["status"] == "published" for x in r.body), r)
    r = call("GET", "admin_post?select=title", T["admin"])
    check("admins see drafts and archived ones too", isinstance(r.body, list) and len(r.body) == 4, r)

    endpoint(A, "table ranking / mini_league / league_standing")
    r = call("GET", "ranking?select=player_id,format,ranking_points&order=ranking_points.desc", T["bob"])
    check("rankings are readable", isinstance(r.body, list) and len(r.body) >= 8, r)
    r = call("GET", "mini_league?select=name,league_standing(position,player_id)", T["bob"])
    check("leagues and standings are readable", isinstance(r.body, list) and r.body
          and len(r.body[0]["league_standing"]) == 3, r)

    endpoint(A, "table match / match_result / dispute / check_in")
    r = call("GET", f"match_result?match_id=eq.{MATCH_D101}&select=score,status", T["alice"])
    check("a player in the match sees its result", r.body == [{"score": "21-15 21-17", "status": "confirmed"}], r)
    r = call("GET", f"match_result?match_id=eq.{MATCH_D101}&select=score", T["ivy"])
    check("players not in it do not", r.body == [], r)
    r = call("GET", "dispute?select=reason,status", T["bob"])
    check("the dispute is visible to the players in that match", isinstance(r.body, list) and len(r.body) == 1, r)
    r = call("GET", f"check_in?match_id=eq.{MATCH_D101}&select=player_id,method", T["carol"])
    check("check-ins are visible to the players in that match", isinstance(r.body, list) and len(r.body) == 2, r)

    # ------------------------------------------------------------------ Signed out
    A = "Signed-out access"
    endpoint(A, "anon")
    for fn in ["search_games", "search_players", "get_my_home", "get_notifications", "get_blocked_players",
               "get_game_form_options", "mark_all_notifications_read", "delete_my_account"]:
        r = rpc(fn, None)
        check(f"rpc/{fn} is refused (42501)", r.code == "42501", r)
    for table in ["player", "player_profile", "game_post", "venue", "groups", "notification", "report"]:
        r = call("GET", f"{table}?select=*&limit=1", None)
        check(f"table {table} returns nothing", r.body == [] or r.code in ("42501", "401"), r)

    write_report(args)
    total = sum(len(v) for v in RESULTS.values())
    failed = sum(1 for v in RESULTS.values() for c in v if not c[1])
    print(f"\n{total - failed} passed, {failed} failed. Report: {args.report}")
    return 1 if failed else 0


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

# Found while preparing the wiring and writing these tests. Kept in the report
# so the team can see what changed and why.
FINDINGS = [
    ("Fixed", "Signed-out visitors could call every API function",
     "Supabase's default privileges grant EXECUTE to `anon` directly, which `revoke ... from public` "
     "does not remove. Nothing leaked (every function checks the caller), but only "
     "`is_username_available` should be reachable before sign-in. Migration "
     "`20261008100700_revoke_anon_function_access.sql`; the 'Signed-out access' cases cover it."),
    ("Fixed", "Deleting an account deleted other players' results",
     "Now the player stays as \"Deleted User\" (items-to-confirm 5). `delete_my_account` cases."),
    ("Fixed", "Home page next game could be a removed game",
     "`get_my_home` (M4) was written before games could be removed (M1). It now skips them and "
     "adds the title, venue and Maps link."),
    ("Fixed", "Profile settings could not change preferred format or the email opt-out",
     "`update_my_profile` (M4) predates those columns (M1, M5). New parameters "
     "`p_preferred_format`, `p_email_notifications`."),
    ("Note", "Response times are from a laptop with the dev seed",
     "They show no call is slow by design; they are not a load test."),
    ("Not covered here", "Edge Functions, Realtime, email delivery, the geocoder",
     "The geocoder has its own Deno tests (`supabase/functions/geocode-venues/nominatim_test.ts`, "
     "10 passing). The email function was tested by hand with a dry run. Realtime notifications and "
     "real email sending need the frontend and an email provider."),
]


def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, cwd=ROOT).stdout.strip()


def write_report(args):
    total = sum(len(v) for v in RESULTS.values())
    failed = sum(1 for v in RESULTS.values() for c in v if not c[1])
    timings = [c[3] for v in RESULTS.values() for c in v if c[3] is not None]
    lines = []
    w = lines.append
    w("# API test report")
    w("")
    w(f"Generated by `supabase/tests/api_test.py` on {dt.datetime.now().strftime('%Y-%m-%d %H:%M')} "
      f"against the local stack, branch `{git('rev-parse', '--abbrev-ref', 'HEAD')}` "
      f"(`{git('rev-parse', '--short', 'HEAD')}`), after `npx supabase db reset` with the dev seed.")
    w("")
    w("## Summary")
    w("")
    w("| | |")
    w("|---|---|")
    w(f"| Endpoints tested | {len(RESULTS)} |")
    w(f"| Test cases | {total} |")
    w(f"| Passed | {total - failed} |")
    w(f"| Failed | {failed} |")
    if timings:
        w(f"| Response time (all calls) | median {statistics.median(timings):.0f} ms, "
          f"95th percentile {sorted(timings)[int(len(timings) * 0.95) - 1]:.0f} ms, max {max(timings):.0f} ms |")
    if args.rls_log:
        log = Path(args.rls_log).read_text()
        m = re.search(r"(\d+) passed, (\d+) failed", log)
        if m:
            w(f"| Access-control suite (`rls_test.sh`) | {m.group(1)} passed, {m.group(2)} failed |")
    w("")
    w("Every case runs through PostgREST with a real signed-in user's token, exactly as the app calls it. "
      "Error codes are the Postgres codes the API returns: `42501` not allowed, `23514` a rule was broken, "
      "`23505` already done, `22023` an invalid value. Messages are written to be shown to players.")
    w("")
    w("## Findings")
    w("")
    w("| Status | Finding | Detail |")
    w("|---|---|---|")
    for status, title, detail in FINDINGS:
        w(f"| {status} | {title} | {detail} |")
    w("")
    w("## How to run")
    w("")
    w("```bash")
    w("npx supabase db reset                                   # migrations + dev seed")
    w("./supabase/tests/rls_test.sh > /tmp/rls.log             # access-control suite")
    w("python3 supabase/tests/api_test.py --rls-log /tmp/rls.log  # this report")
    w("```")
    w("")
    w("## By area")
    w("")
    w("| Area | Endpoint | Cases | Passed | Median ms |")
    w("|---|---|---:|---:|---:|")
    for area, eps in AREAS.items():
        for ep in eps:
            cases = RESULTS[ep]
            ms = [c[3] for c in cases if c[3] is not None]
            w(f"| {area} | `{ep}` | {len(cases)} | {sum(c[1] for c in cases)} | "
              f"{statistics.median(ms):.0f} |" if ms else
              f"| {area} | `{ep}` | {len(cases)} | {sum(c[1] for c in cases)} | – |")
    w("")
    w("## Cases")
    for area, eps in AREAS.items():
        w("")
        w(f"### {area}")
        for ep in eps:
            w("")
            w(f"**`{ep}`**")
            w("")
            w("| Result | Case | ms |")
            w("|---|---|---:|")
            for case, ok, detail, ms in RESULTS[ep]:
                text = case.replace("|", "\\|")
                if not ok and detail:
                    text += f" <br>`{detail[:200].replace('|', '/')}`"
                w(f"| {'✅' if ok else '❌'} | {text} | {'' if ms is None else f'{ms:.0f}'} |")
    Path(args.report).write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
