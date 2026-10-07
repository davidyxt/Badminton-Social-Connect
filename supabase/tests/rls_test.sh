#!/usr/bin/env bash
# End-to-end RLS check against the local stack, using real JWTs from the local
# Auth server and going through PostgREST exactly as the browser would.
set -uo pipefail

API=http://127.0.0.1:54321
STATUS=$(supabase status -o json 2>/dev/null)
ANON=$(echo "$STATUS" | python3 -c 'import sys,json;print(json.load(sys.stdin)["ANON_KEY"])')
SERVICE=$(echo "$STATUS" | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')

# Email confirmation is on (auth.email.enable_confirmations), so a plain
# /signup returns no session. Create the user already confirmed through the
# admin API, then sign in for a real token. user_metadata still reaches the
# sign-up trigger exactly as it would from the app.
signup() {
  curl -s "$API/auth/v1/admin/users" -H "apikey: $SERVICE" \
    -H "Authorization: Bearer $SERVICE" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"$3\"}}" > /dev/null
  curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

pass=0; fail=0
check() { # check <label> <expected> <actual>
  if [[ "$3" == "$2" ]]; then echo "  PASS  $1"; pass=$((pass+1))
  else echo "  FAIL  $1 -- expected [$2] got [$3]"; fail=$((fail+1)); fi
}

echo "== signing up two players =="
A=$(signup "alice-$RANDOM@example.com" 'Passw0rd!x' 'Alice')
B=$(signup "bob-$RANDOM@example.com"   'Passw0rd!x' 'Bob')
TA=$(echo "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
TB=$(echo "$B" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
IDA=$(echo "$A" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("user") or d).get("id",""))')
IDB=$(echo "$B" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("user") or d).get("id",""))')

if [[ -z "$TA" || -z "$TB" ]]; then echo "signup failed:"; echo "$A"; exit 1; fi
echo "  alice=$IDA"
echo "  bob=$IDB"

as() { # as <token> <method> <path> [body]
  local tok=$1 method=$2 path=$3 body=${4:-}
  # Prefer: return=representation goes on every request, including DELETE.
  # Without it a DELETE returns 204 with an empty body and there is nothing to
  # count, so a refused delete and a successful one look identical.
  if [[ -n "$body" ]]; then
    curl -s -X "$method" "$API/rest/v1/$path" -H "apikey: $ANON" \
      -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' \
      -H 'Prefer: return=representation' -d "$body"
  else
    curl -s -X "$method" "$API/rest/v1/$path" -H "apikey: $ANON" \
      -H "Authorization: Bearer $tok" -H 'Prefer: return=representation'
  fi
}
count() { echo "$1" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else "ERR:"+str(d.get("code","?")))
except Exception: print("PARSE_ERR")'; }

# BL-007: an account is unusable until it passes the age gate. Register the
# test players as adults so the sections below test what they always did.
register() { # register <token> [date_of_birth]
  as "$1" POST "rpc/register_player" \
    "{\"p_date_of_birth\":\"${2:-1995-05-20}\",\"p_age_declared\":true,\"p_terms_version\":\"2026-10\",\"p_privacy_version\":\"2026-10\",\"p_state\":\"VIC\"}"
}
register "$TA" > /dev/null
register "$TB" > /dev/null

# Game times relative to today, so "upcoming" games stay upcoming. 08:00 UTC is
# 6-7 pm in Melbourne.
future() { python3 -c 'import sys,datetime
d=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=int(sys.argv[1]))
print(d.strftime("%Y-%m-%dT08:00:00Z"))' "$1"; }

echo
echo "== 1. sign-up trigger created player + profile rows =="
check "alice has a player row"  1 "$(count "$(as "$TA" GET "player?player_id=eq.$IDA")")"
check "alice has a profile row" 1 "$(count "$(as "$TA" GET "player_profile?player_id=eq.$IDA")")"
UNA=$(as "$TA" GET "player?player_id=eq.$IDA&select=username" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["username"])')
check "username came from the legacy display_name key" "yes" \
  "$([[ "$(echo "$UNA" | tr A-Z a-z)" == alice* ]] && echo yes || echo "no ($UNA)")"

echo
echo "== 1b. usernames and private names =="
# Sign up through the admin API with arbitrary metadata, as the app or Google
# would send it. Prints the access token, or the error body if sign-up failed.
signup_meta() { # signup_meta <email> <user_metadata json>
  curl -s "$API/auth/v1/admin/users" -H "apikey: $SERVICE" \
    -H "Authorization: Bearer $SERVICE" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Passw0rd!x\",\"email_confirm\":true,\"user_metadata\":$2}" > /dev/null
  curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"Passw0rd!x\"}" |
    python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token") or "NO_SESSION")'
}
field() { python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
v=r.get(sys.argv[1])
print("" if v is None else v)' "$1"; }
me() { as "$1" GET "player?player_id=eq.$(echo "$1" | python3 -c 'import sys,json,base64;t=sys.stdin.read().split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"=="))["sub"])')&select=$2" | field "$2"; }

UN="jane_$RANDOM"
TJ=$(signup_meta "jane-$RANDOM@example.com" "{\"username\":\"$UN\",\"first_name\":\"Jane\",\"last_name\":\"Smith\"}")
check "a chosen username is used as given" "$UN" "$(me "$TJ" username)"
IDJ=$(echo "$TJ" | python3 -c 'import sys,json,base64;t=sys.stdin.read().split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"=="))["sub"])')
PRIV="player_private?player_id=eq.$IDJ&select=first_name,last_name"
check "the owner can read their names" '["Jane","Smith"]' \
  "$(as "$TJ" GET "$PRIV" | python3 -c 'import sys,json
d=json.load(sys.stdin); r=d[0] if isinstance(d,list) and d else {}
print(json.dumps([r.get("first_name"), r.get("last_name")], separators=(",",":")))')"
check "other players cannot read them" 0 "$(count "$(as "$TA" GET "$PRIV")")"
check "anon cannot read them" 0 "$(count "$(curl -s "$API/rest/v1/$PRIV" -H "apikey: $ANON")")"
check "the owner can correct their last name" 1 \
  "$(count "$(as "$TJ" PATCH "player_private?player_id=eq.$IDJ" '{"last_name":"Smyth"}')")"
check "other players cannot change them" 0 \
  "$(count "$(as "$TA" PATCH "player_private?player_id=eq.$IDJ" '{"last_name":"Hacked"}')")"
check "player_private carries the audit columns" "$IDJ" \
  "$(as "$TJ" GET "player_private?player_id=eq.$IDJ&select=updated_by" | field updated_by)"

UPPER=$(echo "$UN" | tr a-z A-Z)
check "a username taken in another case fails the sign-up" "NO_SESSION" \
  "$(signup_meta "jane2-$RANDOM@example.com" "{\"username\":\"$UPPER\"}")"
check "a username with a space fails the sign-up" "NO_SESSION" \
  "$(signup_meta "jane3-$RANDOM@example.com" '{"username":"jane smith"}')"
check "a username shaped like an email fails the sign-up" "NO_SESSION" \
  "$(signup_meta "jane4-$RANDOM@example.com" '{"username":"jane@example"}')"

TK=$(signup_meta "kim-$RANDOM@example.com" '{"first_name":"Kim","last_name":"Lee"}')
check "no username: one is generated from the first name" "yes" \
  "$([[ "$(me "$TK" username)" =~ ^kim_[0-9]{4}$ ]] && echo yes || echo "no ($(me "$TK" username))")"
EMAIL="secret.person.$RANDOM@example.com"
TS=$(signup_meta "$EMAIL" '{}')
check "no name at all: player_NNNN, never the email" "yes" \
  "$([[ "$(me "$TS" username)" =~ ^player_[0-9]{4}$ ]] && echo yes || echo "no ($(me "$TS" username))")"
TG=$(signup_meta "gee-$RANDOM@example.com" '{"full_name":"Grace Van Der Berg"}')
IDG=$(echo "$TG" | python3 -c 'import sys,json,base64;t=sys.stdin.read().split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"=="))["sub"])')
check "a Google full name is split into first and last" '["Grace","Van Der Berg"]' \
  "$(as "$TG" GET "player_private?player_id=eq.$IDG&select=first_name,last_name" | python3 -c 'import sys,json
d=json.load(sys.stdin); r=d[0] if isinstance(d,list) and d else {}
print(json.dumps([r.get("first_name"), r.get("last_name")], separators=(",",":")))')"

avail() { curl -s "$API/rest/v1/rpc/is_username_available" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' -d "{\"p_username\":\"$1\"}"; }
check "availability: a taken name, any case, is unavailable" "false" "$(avail "$UPPER")"
check "availability: a free name is available" "true" "$(avail "free_$RANDOM")"
check "availability: a malformed name is unavailable" "false" "$(avail "a b")"

check "a player can change their username" 1 \
  "$(count "$(as "$TJ" PATCH "player?player_id=eq.$IDJ" "{\"username\":\"${UN}_x\"}")")"
check "but not to one that is taken" "ERR:23505" \
  "$(count "$(as "$TJ" PATCH "player?player_id=eq.$IDJ" "{\"username\":\"$UNA\"}")")"

echo
echo "== 1c. 18+ age gate and consent (BL-007) =="
TU=$(signup_meta "unreg-$RANDOM@example.com" '{"first_name":"Uma"}')
IDU=$(echo "$TU" | python3 -c 'import sys,json,base64;t=sys.stdin.read().split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"=="))["sub"])')
check "an unregistered account can read its own player row" 1 \
  "$(count "$(as "$TU" GET "player?player_id=eq.$IDU")")"
check "but cannot see other players" 0 \
  "$(count "$(as "$TU" GET "player?player_id=eq.$IDA")")"
check "or any game posts" 0 "$(count "$(as "$TU" GET "game_post?select=post_id")")"
BODY="{\"organiser_id\":\"$IDU\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 90)\"}"
R=$(as "$TU" POST "game_post" "$BODY")
check "or post a game" "ERR:42501" "$(count "$R")"

# Ages are judged by the date in the player's state. These players register in
# VIC, so "today" is Melbourne's date, whatever the machine's time zone is.
melb_today() { python3 -c 'import datetime,zoneinfo;print(datetime.datetime.now(zoneinfo.ZoneInfo("Australia/Melbourne")).date().isoformat())'; }
years_ago() { python3 -c 'import sys,datetime
d=datetime.date.fromisoformat(sys.argv[1]); n=int(sys.argv[2])
try: print(d.replace(year=d.year-n).isoformat())
except ValueError: print(d.replace(year=d.year-n, day=28).isoformat())' "$(melb_today)" "$1"; }
MINOR=$(years_ago 17)
R=$(register "$TU" "$MINOR")
check "an under-18 date of birth is rejected" "23514" \
  "$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("code"))')"
check "and nothing about the minor is stored" '[null,null]' \
  "$(as "$TU" GET "player_private?player_id=eq.$IDU&select=date_of_birth,registered_at" | python3 -c 'import sys,json
r=json.load(sys.stdin)[0]; print(json.dumps([r["date_of_birth"], r["registered_at"]], separators=(",",":")))')"

R=$(as "$TU" POST "rpc/register_player" '{"p_date_of_birth":"1990-01-01","p_age_declared":false,"p_terms_version":"2026-10","p_privacy_version":"2026-10","p_state":"VIC"}')
check "registration needs the 18+ declaration" "23514" \
  "$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("code"))')"
R=$(as "$TU" POST "rpc/register_player" '{"p_date_of_birth":"1990-01-01","p_age_declared":true,"p_terms_version":"","p_privacy_version":"2026-10","p_state":"VIC"}')
check "registration needs the terms accepted" "23514" \
  "$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("code"))')"

ADULT18=$(years_ago 18)
TOMORROW18=$(python3 -c 'import sys,datetime
d=datetime.date.fromisoformat(sys.argv[1])+datetime.timedelta(days=1)
try: print(d.replace(year=d.year-18).isoformat())
except ValueError: print(d.replace(year=d.year-18, day=28).isoformat())' "$(melb_today)")
check "turning 18 tomorrow in Melbourne is not old enough" "23514" \
  "$(register "$TU" "$TOMORROW18" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("code"))')"
check "turning 18 today is old enough" "" "$(register "$TU" "$ADULT18")"
check "registration records consent with server timestamps" '["2026-10","2026-10",true]' \
  "$(as "$TU" GET "player_private?player_id=eq.$IDU&select=terms_version,privacy_version,terms_accepted_at,privacy_accepted_at,age_declared_at,registered_at" | python3 -c 'import sys,json
r=json.load(sys.stdin)[0]
stamped=all(r[k] for k in ("terms_accepted_at","privacy_accepted_at","age_declared_at","registered_at"))
print(json.dumps([r["terms_version"], r["privacy_version"], stamped], separators=(",",":")))')"
check "and the state lands on the profile" "VIC" \
  "$(as "$TU" GET "player_profile?player_id=eq.$IDU&select=state" | field state)"
check "once registered, other players become visible" 1 \
  "$(count "$(as "$TU" GET "player?player_id=eq.$IDA")")"
check "registration cannot be repeated" "23505" \
  "$(register "$TU" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("code"))')"
check "the player cannot rewrite their date of birth" "ERR:42501" \
  "$(count "$(as "$TU" PATCH "player_private?player_id=eq.$IDU" '{"date_of_birth":"1980-01-01"}')")"
check "other players cannot read a date of birth" 0 \
  "$(count "$(as "$TA" GET "player_private?player_id=eq.$IDU&select=date_of_birth")")"

META="{\"first_name\":\"Teen\",\"date_of_birth\":\"$MINOR\",\"age_declared\":true,\"terms_version\":\"2026-10\",\"privacy_version\":\"2026-10\",\"state\":\"VIC\"}"
check "an under-18 sign-up with a date of birth creates no account" "NO_SESSION" \
  "$(signup_meta "teen-$RANDOM@example.com" "$META")"
META='{"first_name":"Ada","date_of_birth":"1988-03-14","age_declared":true,"terms_version":"2026-10","privacy_version":"2026-10","state":"NSW"}'
TD=$(signup_meta "ada-$RANDOM@example.com" "$META")
check "an adult sign-up with the fields is registered at once" 1 \
  "$(count "$(as "$TD" GET "player?player_id=eq.$IDA")")"
check "anon cannot call register_player" "ERR:42501" \
  "$(count "$(curl -s "$API/rest/v1/rpc/register_player" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"p_date_of_birth":"1990-01-01","p_age_declared":true,"p_terms_version":"x","p_privacy_version":"x","p_state":"VIC"}')")"

echo
echo "== 2. discoverability is enforced by the database =="
check "alice sees bob's profile while discoverable" 1 \
  "$(count "$(as "$TA" GET "player_profile?player_id=eq.$IDB")")"
as "$TB" PATCH "player_profile?player_id=eq.$IDB" '{"is_discoverable":false}' > /dev/null
check "alice cannot see bob once he hides"          0 \
  "$(count "$(as "$TA" GET "player_profile?player_id=eq.$IDB")")"
check "bob can still see his own hidden profile"    1 \
  "$(count "$(as "$TB" GET "player_profile?player_id=eq.$IDB")")"

echo
echo "== 3. cross-user writes are refused =="
check "alice cannot edit bob's profile" 0 \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDB" '{"bio":"hacked"}')")"
check "alice can edit her own profile"  1 \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDA" '{"bio":"hi"}')")"
check "a new profile's preferred format is any" '"any"' \
  "$(as "$TA" GET "player_profile?player_id=eq.$IDA&select=preferred_format" | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin)[0]["preferred_format"]))')"
check "alice can set her preferred format" 1 \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDA" '{"preferred_format":"singles"}')")"
check "alice cannot set bob's preferred format" 0 \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDB" '{"preferred_format":"doubles"}')")"
check "an unknown format is rejected" "ERR:23514" \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDA" '{"preferred_format":"triples"}')")"

echo
echo "== 4. privilege escalation is blocked =="
check "alice cannot verify herself" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "player?player_id=eq.$IDA" '{"is_verified":true}')")"
check "alice cannot edit her reliability score" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDA" '{"reliability_score":100}')")"
# Build request bodies into variables first. Inlining them inside nested
# command substitution mangles the escaped quotes and PostgREST rejects the
# body before it ever reaches a policy.
BODY="{\"player_id\":\"$IDA\",\"format\":\"singles\",\"ranking_points\":9999}"
R=$(as "$TA" POST "ranking" "$BODY")
check "alice cannot award herself ranking points" "ERR:42501" "$(count "$R")"

BODY="{\"player_id\":\"$IDA\",\"type\":\"system\",\"message\":\"x\"}"
R=$(as "$TA" POST "notification" "$BODY")
check "alice cannot send herself a notification" "ERR:42501" "$(count "$R")"

echo
echo "== 5. anonymous callers see nothing =="
check "anon cannot read the player roster" 0 \
  "$(count "$(curl -s "$API/rest/v1/player?select=*" -H "apikey: $ANON")")"
check "anon cannot read game posts"        0 \
  "$(count "$(curl -s "$API/rest/v1/game_post?select=*" -H "apikey: $ANON")")"

echo
echo "== 5b. reference data: states, suburbs and venues =="
check "anon can read the states (sign-up form)" 8 \
  "$(count "$(curl -s "$API/rest/v1/state?select=state_code" -H "apikey: $ANON")")"
check "anon can look up a suburb by postcode" 1 \
  "$(count "$(curl -s "$API/rest/v1/suburb?postcode=eq.3053&name=eq.Carlton&select=name" -H "apikey: $ANON")")"
check "NT postcodes keep their leading zero" 1 \
  "$(count "$(as "$TA" GET "suburb?name=eq.Darwin&postcode=eq.0800&select=name")")"
check "mail-only postcodes are excluded" 0 \
  "$(count "$(as "$TA" GET "suburb?state_code=eq.VIC&postcode=gte.8000&select=name")")"
check "anon cannot read venues" 0 \
  "$(count "$(curl -s "$API/rest/v1/venue?select=name" -H "apikey: $ANON")")"
check "players see the seeded venues with their suburb" '["Albert Park","3206"]' \
  "$(as "$TA" GET "venue?name=like.Melbourne%20Sports%20and%20Aquatic%20Centre*&select=suburb(name,postcode)" | python3 -c 'import sys,json
d=json.load(sys.stdin)
s=(d[0].get("suburb") or {}) if isinstance(d,list) and d else {}
print(json.dumps([s.get("name"), s.get("postcode")], separators=(",",":")))')"
check "all 142 seeded venues are listed across Australia" 142 \
  "$(count "$(as "$TA" GET "venue?source_url=like.https://www.badmintonhub.com.au/*&select=venue_id")")"
check "every venue has a Google Maps link" 0 \
  "$(count "$(as "$TA" GET "venue?or=(maps_url.is.null,maps_url.not.like.https://www.google.com/maps/*)&select=venue_id")")"
check "every seeded venue has a pin" 0 \
  "$(count "$(as "$TA" GET "venue?source_url=like.https://www.badmintonhub.com.au/*&latitude=is.null&select=venue_id")")"
check "pins from OpenStreetMap are marked for the credit" 1 \
  "$(count "$(as "$TA" GET "venue?coordinates_source=eq.openstreetmap&select=venue_id")")"
check "a venue with a pin links to its coordinates" "yes" \
  "$(as "$TA" GET "venue?name=like.Melbourne%20Sports%20and%20Aquatic%20Centre*&select=maps_url,latitude,longitude" | python3 -c 'import sys,json
v=json.load(sys.stdin)[0]; print("yes" if v["maps_url"].endswith("%.6f,%.6f" % (v["latitude"], v["longitude"])) else v["maps_url"])')"
check "players cannot change a venue's coordinates" 0 \
  "$(count "$(as "$TA" PATCH "venue?name=like.Melbourne%20Sports*" '{"latitude":-37.0}')")"
BODY='{"name":"Fake","postcode":"3000","state_code":"VIC"}'
R=$(as "$TA" POST "suburb" "$BODY")
check "players cannot add suburbs" "ERR:42501" "$(count "$R")"
check "players cannot rename a state" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "state?state_code=eq.VIC" '{"name":"Hacked"}')")"
SUB=$(as "$TA" GET "suburb?name=eq.Carlton&postcode=eq.3053&select=suburb_id" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["suburb_id"] if d else "")')
BODY="{\"name\":\"My Garage\",\"suburb_id\":\"$SUB\"}"
R=$(as "$TA" POST "venue" "$BODY")
check "players cannot add venues" "ERR:42501" "$(count "$R")"

echo
echo "== 6. ownership rules on game posts =="
POST=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"proposed_time\":\"$(future 3)\",\"suburb\":\"Carlton\"}")
check "alice can create her own post" 1 "$(count "$POST")"
PID=$(echo "$POST" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["post_id"] if isinstance(d,list) and d else "")')
check "bob can see it on the board"   1 "$(count "$(as "$TB" GET "game_post?post_id=eq.$PID")")"
check "bob cannot edit it"            0 "$(count "$(as "$TB" PATCH "game_post?post_id=eq.$PID" '{"status":"cancelled"}')")"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 4)\"}"
R=$(as "$TB" POST "game_post" "$BODY")
check "bob cannot post as alice"      "ERR:42501" "$(count "$R")"
check "alice cannot cancel by editing the status" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$PID" '{"status":"cancelled"}')")"
check "alice can cancel her own post" "" \
  "$(as "$TA" POST "rpc/cancel_game_post" "{\"p_post_id\":\"$PID\"}")"

echo
echo "== 7. private helper schema is not reachable over the API =="
check "private.is_admin is not exposed as an RPC" "ERR:PGRST202" \
  "$(count "$(as "$TA" POST "rpc/is_admin" '{}')")"
echo
echo "== 8. clubs as organisers =="
SLUG="test-club-$RANDOM"
BODY="{\"name\":\"Test Smashers\",\"slug\":\"$SLUG\",\"created_by\":\"$IDA\",\"state\":\"VIC\"}"
R=$(as "$TA" POST "club" "$BODY")
check "alice can register a club" 1 "$(count "$R")"
CLUB=$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["club_id"] if isinstance(d,list) and d else "")')

check "the trigger made her an approved club admin" 1 \
  "$(count "$(as "$TA" GET "club_representative?club_id=eq.$CLUB&player_id=eq.$IDA&role=eq.admin&status=eq.approved")")"
check "bob is not a member" 0 \
  "$(count "$(as "$TB" GET "club_representative?club_id=eq.$CLUB&player_id=eq.$IDB")")"

BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 5)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a club admin can post on the club's behalf" 1 "$(count "$R")"
CPOST=$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["post_id"] if isinstance(d,list) and d else "")')

R=$(as "$TB" POST "game_post" "$BODY")
check "bob cannot post as a club he does not represent" "ERR:42501" "$(count "$R")"

check "bob cannot edit the club's post" 0 \
  "$(count "$(as "$TB" PATCH "game_post?post_id=eq.$CPOST" '{"status":"cancelled"}')")"
check "the rep can edit the club's post" 1 \
  "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$CPOST" '{"suburb":"Box Hill"}')")"

echo
echo "== 9. exactly one organiser, enforced by the database =="
# RLS is evaluated before check constraints. With no organiser at all, none of
# the three policy clauses can be true, so this is refused as a permission
# error (42501) and never reaches game_post_exactly_one_organiser. The test
# below proves the constraint itself still fires.
BODY="{\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 6)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a post with no organiser is refused" "ERR:42501" "$(count "$R")"

BODY="{\"organiser_id\":\"$IDA\",\"organiser_club_id\":\"$CLUB\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 6)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a post with both organisers is rejected" "ERR:23514" "$(count "$R")"

echo
echo "== 10. club integrity =="
check "nobody can verify their own club" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "club?club_id=eq.$CLUB" '{"is_verified":true}')")"
check "bob cannot edit alice's club" 0 \
  "$(count "$(as "$TB" PATCH "club?club_id=eq.$CLUB" '{"name":"Hijacked"}')")"

BREP="club_representative?club_id=eq.$CLUB&player_id=eq.$IDB"
AREP="club_representative?club_id=eq.$CLUB&player_id=eq.$IDA"

BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDB\",\"status\":\"approved\"}"
R=$(as "$TB" POST "club_representative" "$BODY")
check "bob cannot let himself straight into the club" "ERR:42501" "$(count "$R")"
BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDB\",\"role\":\"admin\",\"status\":\"approved\"}"
R=$(as "$TB" POST "club_representative" "$BODY")
check "bob cannot make himself a club admin" "ERR:42501" "$(count "$R")"
BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDA\"}"
R=$(as "$TB" POST "club_representative" "$BODY")
check "bob cannot file a join request for someone else" "ERR:42501" "$(count "$R")"

BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDB\"}"
R=$(as "$TB" POST "club_representative" "$BODY")
check "bob can request to join (pending by default)" '["pending","member"]' \
  "$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
print(json.dumps([r.get("status"), r.get("role")], separators=(",",":")))')"
check "bob cannot approve his own request" 0 \
  "$(count "$(as "$TB" PATCH "$BREP" '{"status":"approved"}')")"

BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 7)\"}"
R=$(as "$TB" POST "game_post" "$BODY")
check "a pending member cannot post for the club" "ERR:42501" "$(count "$R")"

check "the club admin approves bob" 1 \
  "$(count "$(as "$TA" PATCH "$BREP" '{"status":"approved"}')")"
R=$(as "$TB" POST "game_post" "$BODY")
check "an approved member still cannot post for the club" "ERR:42501" "$(count "$R")"
check "an approved member cannot rename the club" 0 \
  "$(count "$(as "$TB" PATCH "club?club_id=eq.$CLUB" '{"name":"Hijacked"}')")"

check "the club admin promotes bob to admin" 1 \
  "$(count "$(as "$TA" PATCH "$BREP" '{"role":"admin"}')")"
check "a second admin can edit the club" 1 \
  "$(count "$(as "$TB" PATCH "club?club_id=eq.$CLUB" '{"description":"Tuesday nights"}')")"
R=$(as "$TB" POST "game_post" "$BODY")
check "a second admin can post for the club" 1 "$(count "$R")"

check "an admin cannot demote another admin" 0 \
  "$(count "$(as "$TB" PATCH "$AREP" '{"role":"member"}')")"
check "an admin cannot remove another admin" 0 \
  "$(count "$(as "$TB" DELETE "$AREP")")"
check "not even a club admin can delete the club" "ERR:42501" \
  "$(count "$(as "$TB" DELETE "club?club_id=eq.$CLUB")")"
check "an admin can step down while another remains" 1 \
  "$(count "$(as "$TB" DELETE "$BREP")")"
check "the last admin cannot step down" "ERR:23514" \
  "$(count "$(as "$TA" DELETE "$AREP")")"

echo
echo "== 11. the organiser embeds in one request =="
# game_participant gives game_post a second path to player (many-to-many), so a
# bare player(...) embed is ambiguous and PostgREST refuses it with PGRST201.
# The hint after ! can be the column name or the constraint name; the column
# name is shorter and survives a constraint being renamed.
ORG='organiser:player!organiser_id(username)'
EMB=$(as "$TA" GET "game_post?post_id=eq.$CPOST&select=post_id,club(name,slug),$ORG")
check "club post embeds the club and a null organiser" '["Test Smashers",null]' \
  "$(echo "$EMB" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
c=r.get("club") or {}
print(json.dumps([c.get("name"), r.get("organiser")], separators=(",",":")))')"
EMB=$(as "$TA" GET "game_post?post_id=eq.$PID&select=post_id,club(name),$ORG")
check "player post embeds the organiser and a null club" "[\"$UNA\",null]" \
  "$(echo "$EMB" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
p=r.get("organiser") or {}
print(json.dumps([p.get("username"), r.get("club")], separators=(",",":")))')"
echo
echo "== 12. requesting to join a game =="
C=$(signup "carol-$RANDOM@example.com" 'Passw0rd!x' 'Carol')
TC=$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
IDC=$(echo "$C" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("user") or d).get("id",""))')
register "$TC" > /dev/null

# A singles game with two places. Alice organises, so she takes one of them.
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 30)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
GAME=$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["post_id"] if isinstance(d,list) and d else "")')
check "the organiser is on the roster automatically" 1 \
  "$(count "$(as "$TA" GET "game_participant?post_id=eq.$GAME&player_id=eq.$IDA&status=eq.accepted")")"

BODY="{\"post_id\":\"$GAME\",\"player_id\":\"$IDB\",\"status\":\"accepted\"}"
R=$(as "$TB" POST "game_participant" "$BODY")
check "bob cannot let himself in" "ERR:42501" "$(count "$R")"

BODY="{\"post_id\":\"$GAME\",\"player_id\":\"$IDB\"}"
R=$(as "$TB" POST "game_participant" "$BODY")
check "bob can request to join" 1 "$(count "$R")"

# The USING clause lets bob see his own row, so the update is attempted and the
# WITH CHECK then refuses it. That surfaces as a permission error rather than a
# silent zero-row update, which is the better of the two outcomes.
check "bob cannot accept his own request" "ERR:42501" \
  "$(count "$(as "$TB" PATCH "game_participant?post_id=eq.$GAME&player_id=eq.$IDB" '{"status":"accepted"}')")"
check "bob can withdraw his own request" 1 \
  "$(count "$(as "$TB" PATCH "game_participant?post_id=eq.$GAME&player_id=eq.$IDB" '{"status":"withdrawn"}')")"
check "the organiser can accept him" 1 \
  "$(count "$(as "$TA" PATCH "game_participant?post_id=eq.$GAME&player_id=eq.$IDB" '{"status":"accepted"}')")"

BODY="{\"post_id\":\"$GAME\",\"player_id\":\"$IDC\"}"
R=$(as "$TC" POST "game_participant" "$BODY")
check "carol can request even though the game is full" 1 "$(count "$R")"
check "bob cannot see carol's pending request" 0 \
  "$(count "$(as "$TB" GET "game_participant?post_id=eq.$GAME&player_id=eq.$IDC")")"
check "the organiser can see it" 1 \
  "$(count "$(as "$TA" GET "game_participant?post_id=eq.$GAME&player_id=eq.$IDC")")"
check "accepting carol would exceed the limit" "ERR:23514" \
  "$(count "$(as "$TA" PATCH "game_participant?post_id=eq.$GAME&player_id=eq.$IDC" '{"status":"accepted"}')")"

echo
echo "== 13. matches within a game =="
BODY="{\"post_id\":\"$GAME\",\"created_by\":\"$IDA\",\"format\":\"singles\"}"
R=$(as "$TA" POST "match" "$BODY")
check "the organiser can record a match" 1 "$(count "$R")"
M1=$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["match_id"] if isinstance(d,list) and d else "")')

BODY="{\"post_id\":\"$GAME\",\"created_by\":\"$IDB\",\"format\":\"singles\"}"
R=$(as "$TB" POST "match" "$BODY")
check "a roster player can also record one" 1 "$(count "$R")"

BODY="{\"post_id\":\"$GAME\",\"created_by\":\"$IDC\",\"format\":\"singles\"}"
R=$(as "$TC" POST "match" "$BODY")
check "someone not on the roster cannot" "ERR:42501" "$(count "$R")"

BODY="{\"match_id\":\"$M1\",\"player_id\":\"$IDA\",\"side\":\"a\"}"
R=$(as "$TA" POST "match_participant" "$BODY")
check "alice takes side a" 1 "$(count "$R")"

BODY="{\"match_id\":\"$M1\",\"player_id\":\"$IDC\",\"side\":\"b\"}"
R=$(as "$TA" POST "match_participant" "$BODY")
check "carol cannot play, she is not on the roster" "ERR:23514" "$(count "$R")"

check "a singles match cannot be completed with one side empty" "ERR:23514" \
  "$(count "$(as "$TA" PATCH "match?match_id=eq.$M1" '{"status":"completed"}')")"

BODY="{\"match_id\":\"$M1\",\"player_id\":\"$IDB\",\"side\":\"b\"}"
R=$(as "$TA" POST "match_participant" "$BODY")
check "bob takes side b" 1 "$(count "$R")"

check "now the match can be completed" 1 \
  "$(count "$(as "$TA" PATCH "match?match_id=eq.$M1" '{"status":"completed"}')")"

BODY="{\"match_id\":\"$M1\",\"submitted_by\":\"$IDA\",\"score\":\"21-18 21-15\",\"winning_side\":\"a\"}"
R=$(as "$TA" POST "match_result" "$BODY")
check "a participant submits a result naming the winning side" 1 "$(count "$R")"

echo
echo "== 14. side limits by format =="
BODY="{\"post_id\":\"$GAME\",\"created_by\":\"$IDA\",\"format\":\"singles\"}"
R=$(as "$TA" POST "match" "$BODY")
M2=$(echo "$R" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["match_id"] if isinstance(d,list) and d else "")')
BODY="{\"match_id\":\"$M2\",\"player_id\":\"$IDA\",\"side\":\"a\"}"
as "$TA" POST "match_participant" "$BODY" > /dev/null
BODY="{\"match_id\":\"$M2\",\"player_id\":\"$IDB\",\"side\":\"a\"}"
R=$(as "$TA" POST "match_participant" "$BODY")
check "a singles side cannot hold two players" "ERR:23514" "$(count "$R")"
# 3 recorded by hand, plus the one BL-017 creates when bob was accepted.
check "several matches can belong to one game" 4 \
  "$(count "$(as "$TA" GET "match?post_id=eq.$GAME&select=match_id")")"

# game_participant is what makes a bare player(...) embed on game_post
# ambiguous: before this migration there was only one route to player.
check "a bare player embed is refused as ambiguous" "ERR:PGRST201" \
  "$(count "$(as "$TA" GET "game_post?post_id=eq.$PID&select=post_id,player(username)")")"

# The query the game screen needs: a post, its organiser, and its
# accepted roster, in one round trip.
SEL="post_id,player_limit,organiser:player!organiser_id(username)"
SEL="$SEL,game_participant(status,player(username))"
EMB=$(as "$TA" GET "game_post?post_id=eq.$GAME&select=$SEL")
check "post, organiser and roster embed together" "[\"$UNA\",2]" \
  "$(echo "$EMB" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
o=r.get("organiser") or {}
roster=[p for p in (r.get("game_participant") or []) if p.get("status")=="accepted"]
print(json.dumps([o.get("username"), len(roster)], separators=(",",":")))')"
echo
echo "== 15. updated_at / updated_by =="
field() { python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
v=r.get(sys.argv[1])
print("" if v is None else v)' "$1"; }

BODY="{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"proposed_time\":\"$(future 60)\",\"suburb\":\"Clayton\"}"
R=$(as "$TA" POST "game_post" "$BODY")
APOST=$(echo "$R" | field post_id)
check "updated_by is stamped on insert" "$IDA" "$(echo "$R" | field updated_by)"
T0=$(echo "$R" | field updated_at)
check "updated_at is stamped on insert" "yes" "$([[ -n "$T0" ]] && echo yes || echo no)"

# A client naming updated_by should not be believed.
BODY="{\"suburb\":\"Clayton North\",\"updated_by\":\"$IDB\"}"
R=$(as "$TA" PATCH "game_post?post_id=eq.$APOST" "$BODY")
check "a forged updated_by is overwritten with the real actor" "$IDA" \
  "$(echo "$R" | field updated_by)"
T1=$(echo "$R" | field updated_at)
check "a real edit bumps updated_at" "yes" \
  "$([[ "$T1" > "$T0" ]] && echo yes || echo no)"

# Setting a column to the value it already holds is not an edit.
R=$(as "$TA" PATCH "game_post?post_id=eq.$APOST" '{"suburb":"Clayton North"}')
check "a no-op patch leaves updated_at alone" "$T1" "$(echo "$R" | field updated_at)"

# The actor, not the owner: alice accepted bob's request back in section 12.
R=$(as "$TA" GET "game_participant?post_id=eq.$GAME&player_id=eq.$IDB&select=player_id,updated_by")
check "updated_by records who made the change, not whose row it is" "$IDA" \
  "$(echo "$R" | field updated_by)"

# Every table that can change should expose the pair. Asking PostgREST for the
# columns fails with 42703 if either is missing.
MISSING=""
for tbl in player player_profile venue mini_league league_standing game_post \
           game_participant cancellation_record club club_representative \
           match match_participant check_in match_result dispute ranking \
           notification report admin_post
do
  RES=$(as "$TA" GET "$tbl?select=updated_at,updated_by&limit=1")
  echo "$RES" | grep -q '"code"' && MISSING="$MISSING $tbl"
done
check "all 19 changeable tables expose the pair" "" "$MISSING"

echo
echo "== 16. club join requests are private, membership is public =="
BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDC\"}"
R=$(as "$TC" POST "club_representative" "$BODY")
check "carol can request to join" 1 "$(count "$R")"
CREP="club_representative?club_id=eq.$CLUB&player_id=eq.$IDC"
check "bob cannot see carol's pending request" 0 "$(count "$(as "$TB" GET "$CREP")")"
check "the club admin can see it" 1 "$(count "$(as "$TA" GET "$CREP")")"
check "the club admin can decline it" 1 "$(count "$(as "$TA" DELETE "$CREP")")"

BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDC\",\"status\":\"approved\"}"
R=$(as "$TA" POST "club_representative" "$BODY")
check "a club admin can add a member directly" 1 "$(count "$R")"
check "approved membership is visible to other players" 1 "$(count "$(as "$TB" GET "$CREP")")"
check "approval is stamped with the admin, not the member" "$IDA" \
  "$(as "$TA" GET "$CREP&select=updated_by" | field updated_by)"
check "a member can leave" 1 "$(count "$(as "$TC" DELETE "$CREP")")"

echo
echo "== 17. clubs are deactivated, not deleted =="
# Bob is an approved member again, not an admin.
BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDB\",\"status\":\"approved\"}"
as "$TA" POST "club_representative" "$BODY" > /dev/null
check "a plain member cannot deactivate the club" 0 \
  "$(count "$(as "$TB" PATCH "club?club_id=eq.$CLUB" '{"is_active":false}')")"
check "a club with upcoming games cannot be deactivated" "ERR:23514" \
  "$(count "$(as "$TA" PATCH "club?club_id=eq.$CLUB" '{"is_active":false}')")"
for G in $(as "$TA" GET "game_post?organiser_club_id=eq.$CLUB&status=in.(open,full)&select=post_id" |
           python3 -c 'import sys,json;[print(r["post_id"]) for r in json.load(sys.stdin)]'); do
  BODY="{\"p_post_id\":\"$G\",\"p_reason\":\"Club closing\"}"
  as "$TA" POST "rpc/cancel_game_post" "$BODY" > /dev/null
done
check "once they are cancelled, a club admin can deactivate it" 1 \
  "$(count "$(as "$TA" PATCH "club?club_id=eq.$CLUB" '{"is_active":false}')")"

check "its game posts are still there" 1 \
  "$(count "$(as "$TB" GET "game_post?post_id=eq.$CPOST")")"
check "the post can show the club as inactive" '[false]' \
  "$(as "$TB" GET "game_post?post_id=eq.$CPOST&select=club(is_active)" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(json.dumps([(d[0].get("club") or {}).get("is_active")] if d else []))')"

BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 61)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "an inactive club cannot post a game" "ERR:23514" "$(count "$R")"
BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDC\"}"
R=$(as "$TC" POST "club_representative" "$BODY")
check "an inactive club cannot take join requests" "ERR:23514" "$(count "$R")"
check "a member can still leave an inactive club" 1 \
  "$(count "$(as "$TB" DELETE "$BREP")")"
check "an admin can still edit the club's existing posts" 1 \
  "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$CPOST" '{"suburb":"Richmond"}')")"

check "a club admin can reactivate it" 1 \
  "$(count "$(as "$TA" PATCH "club?club_id=eq.$CLUB" '{"is_active":true}')")"
BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 61)\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "once reactivated it can post again" 1 "$(count "$R")"
echo
echo "== 18. posting, cancelling and deleting games (BL-013) =="
code() { python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("code","?") if isinstance(d,dict) else "OK")
except Exception: print("EMPTY")'; }
VENUE=$(as "$TA" GET "venue?name=like.Melbourne%20Sports%20and%20Aquatic%20Centre*&select=venue_id" | field venue_id)
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"proposed_time\":\"$(future 20)\",\"venue_id\":\"$VENUE\",\"style\":\"competitive\",\"duration_minutes\":90,\"ability_level\":\"intermediate\",\"notes\":\"Bring your own shuttles\",\"player_limit\":2}"
R=$(as "$TA" POST "game_post" "$BODY")
G1=$(echo "$R" | field post_id)
check "a post stores the form's fields, suburb taken from the venue" \
  '["Albert Park","competitive",90,"intermediate","Bring your own shuttles"]' \
  "$(echo "$R" | python3 -c 'import sys,json
r=json.load(sys.stdin)[0]
print(json.dumps([r["suburb"],r["style"],r["duration_minutes"],r["ability_level"],r["notes"]], separators=(",",":")))')"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"proposed_time\":\"$(future 20)\"}"
check "a post needs a venue or a suburb" "ERR:23514" "$(count "$(as "$TA" POST "game_post" "$BODY")")"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"2020-01-01T08:00:00Z\"}"
check "a post cannot start in the past" "ERR:23514" "$(count "$(as "$TA" POST "game_post" "$BODY")")"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 20)\",\"style\":\"casual\"}"
check "an unknown style is rejected" "ERR:23514" "$(count "$(as "$TA" POST "game_post" "$BODY")")"

as "$TB" POST "game_participant" "{\"post_id\":\"$G1\",\"player_id\":\"$IDB\"}" > /dev/null
check "deleted_at cannot be set directly" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$G1" '{"deleted_at":"2026-01-01T00:00:00Z"}')")"
check "a non-organiser cannot cancel" "42501" \
  "$(as "$TB" POST "rpc/cancel_game_post" "{\"p_post_id\":\"$G1\"}" | code)"

SOON=$(python3 -c 'import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
G2=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$SOON\"}" | field post_id)
check "cancelling within 4 hours of the start is refused" "23514" \
  "$(as "$TA" POST "rpc/cancel_game_post" "{\"p_post_id\":\"$G2\"}" | code)"
check "so is deleting" "23514" \
  "$(as "$TA" POST "rpc/delete_game_post" "{\"p_post_id\":\"$G2\"}" | code)"

BODY="{\"p_post_id\":\"$G1\",\"p_reason\":\"Court closed\"}"
check "the organiser cancels with a reason" "" "$(as "$TA" POST "rpc/cancel_game_post" "$BODY")"
check "the post stays visible as cancelled" "cancelled" \
  "$(as "$TB" GET "game_post?post_id=eq.$G1&select=status" | field status)"
check "a cancellation record keeps the reason" "Court closed" \
  "$(as "$TB" GET "cancellation_record?post_id=eq.$G1&select=reason" | field reason)"
check "the player who asked to join is notified" "game_cancelled" \
  "$(as "$TB" GET "notification?type=eq.game_cancelled&order=created_at.desc&limit=1&select=type" | field type)"
check "a game cannot be cancelled twice" "23505" \
  "$(as "$TA" POST "rpc/cancel_game_post" "{\"p_post_id\":\"$G1\"}" | code)"
check "a cancelled game cannot be reopened" "ERR:23514" \
  "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$G1" '{"status":"open"}')")"

G3=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 21)\"}" | field post_id)
as "$TB" POST "game_participant" "{\"post_id\":\"$G3\",\"player_id\":\"$IDB\"}" > /dev/null
check "a hard delete is not allowed" "ERR:42501" "$(count "$(as "$TA" DELETE "game_post?post_id=eq.$G3")")"
check "the organiser deletes an upcoming game" "" \
  "$(as "$TA" POST "rpc/delete_game_post" "{\"p_post_id\":\"$G3\"}")"
check "it is hidden from players" 0 "$(count "$(as "$TB" GET "game_post?post_id=eq.$G3")")"
check "including the organiser" 0 "$(count "$(as "$TA" GET "game_post?post_id=eq.$G3")")"
check "players who asked to join are told it was removed" "game_removed" \
  "$(as "$TB" GET "notification?type=eq.game_removed&order=created_at.desc&limit=1&select=type" | field type)"

check "a game that has happened cannot be deleted by its organiser" "42501" \
  "$(as "$TA" POST "rpc/delete_game_post" "{\"p_post_id\":\"$GAME\"}" | code)"
check "players cannot see the admin warning data" "42501" \
  "$(as "$TA" POST "rpc/admin_game_post_deletion_impact" "{\"p_post_id\":\"$GAME\"}" | code)"

AEMAIL="admin-$RANDOM@example.com"
curl -s "$API/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AEMAIL\",\"password\":\"Passw0rd!x\",\"email_confirm\":true,\"app_metadata\":{\"role\":\"admin\"}}" > /dev/null
TADM=$(curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AEMAIL\",\"password\":\"Passw0rd!x\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
check "admins still see deleted posts" 1 "$(count "$(as "$TADM" GET "game_post?post_id=eq.$G3")")"
check "the admin warning shows what would change" '[true,4]' \
  "$(as "$TADM" POST "rpc/admin_game_post_deletion_impact" "{\"p_post_id\":\"$GAME\"}" | python3 -c 'import sys,json
d=json.load(sys.stdin); print(json.dumps([d["has_happened"], d["matches"]], separators=(",",":")))')"
BODY="{\"p_post_id\":\"$GAME\",\"p_reason\":\" \"}"
check "an admin delete needs a reason" "23514" "$(as "$TADM" POST "rpc/admin_delete_game_post" "$BODY" | code)"
BODY="{\"p_post_id\":\"$GAME\",\"p_reason\":\"Fabricated results\"}"
check "an admin can delete a game that has happened" "" "$(as "$TADM" POST "rpc/admin_delete_game_post" "$BODY")"
check "its matches are kept" 4 "$(count "$(as "$TADM" GET "match?post_id=eq.$GAME&select=match_id")")"
check "its results stop counting towards rankings" "True" \
  "$(as "$TADM" GET "match_result?match_id=eq.$M1&select=excluded_from_ranking" | field excluded_from_ranking)"

echo
echo "== 19. join requests (BL-017) =="
rpc() { # rpc <token> <function> <json body>; prints the error code, or OK
  as "$1" POST "rpc/$2" "$3" | code; }
G4=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"title\":\"Singles ladder\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 25)\"}" | field post_id)
BODY="{\"p_post_id\":\"$G4\",\"p_message\":\"Hi! Keen for a hit if there is room.\"}"
check "a player asks to join with a message" "EMPTY" "$(rpc "$TC" request_to_join "$BODY")"
BODY="{\"p_post_id\":\"$G4\"}"
check "asking twice is refused" "23505" "$(rpc "$TC" request_to_join "$BODY")"
BODY="{\"p_post_id\":\"$G4\"}"
check "the organiser cannot ask to join their own game" "23514" "$(rpc "$TA" request_to_join "$BODY")"
check "the requester can read their message" 1 \
  "$(count "$(as "$TC" GET "game_request_message?post_id=eq.$G4&select=message")")"
check "other players cannot" 0 \
  "$(count "$(as "$TB" GET "game_request_message?post_id=eq.$G4&select=message")")"
BODY="{\"post_id\":\"$G4\",\"player_id\":\"$IDC\",\"message\":\"forged\"}"
check "messages cannot be written directly" "ERR:42501" "$(count "$(as "$TC" POST "game_request_message" "$BODY")")"

BODY="{\"p_post_id\":\"$G4\"}"
REQ=$(as "$TA" POST "rpc/get_join_requests" "$BODY")
check "the host sees the request as the Play Request screen needs it" \
  '["pending","Hi! Keen for a hit if there is room.",true]' \
  "$(echo "$REQ" | python3 -c 'import sys,json
r=json.load(sys.stdin)[0]; q=r["requester"]
print(json.dumps([r["status"], q["message"], all(k in q for k in ("name","initials","rating","verifiedMatches","reliability","level","preferredFormat"))], separators=(",",":")))')"
BODY="{\"p_post_id\":\"$G4\"}"
check "other players cannot list a game's requests" "42501" "$(rpc "$TB" get_join_requests "$BODY")"
BODY="{\"p_post_id\":\"$G4\",\"p_player_id\":\"$IDC\"}"
check "only the organiser can accept" "42501" \
  "$(rpc "$TB" accept_request "$BODY")"
BODY="{\"p_post_id\":\"$G4\",\"p_player_id\":\"$IDC\"}"
check "the organiser accepts" "EMPTY" \
  "$(rpc "$TA" accept_request "$BODY")"
GM=$(as "$TA" GET "match?post_id=eq.$G4&select=match_id" | field match_id)
check "the first acceptance creates the match" "yes" "$([[ -n "$GM" ]] && echo yes || echo no)"
check "a singles match puts organiser and player on sides a and b" '["a","b"]' \
  "$(as "$TA" GET "match_participant?match_id=eq.$GM&select=player_id,side" | python3 -c 'import sys,json
rows={r["player_id"]:r["side"] for r in json.load(sys.stdin)}
print(json.dumps([rows.get("'$IDA'"), rows.get("'$IDC'")], separators=(",",":")))')"
BODY="{\"p_post_id\":\"$G4\",\"p_player_id\":\"$IDC\"}"
check "accepting again is refused" "23514" \
  "$(rpc "$TA" accept_request "$BODY")"

BODY="{\"p_post_id\":\"$G4\"}"
check "bob can still ask while the game is full" "EMPTY" "$(rpc "$TB" request_to_join "$BODY")"
BODY="{\"p_post_id\":\"$G4\",\"p_player_id\":\"$IDB\"}"
check "but accepting him would overfill it" "23514" \
  "$(rpc "$TA" accept_request "$BODY")"
BODY="{\"p_post_id\":\"$G4\",\"p_player_id\":\"$IDB\"}"
check "the organiser declines him" "EMPTY" \
  "$(rpc "$TA" decline_request "$BODY")"
BODY="{\"p_post_id\":\"$G4\"}"
check "a declined player cannot ask again" "23514" "$(rpc "$TB" request_to_join "$BODY")"
BODY="{\"p_post_id\":\"$G1\"}"
check "requests to a cancelled game are refused" "23514" "$(rpc "$TC" request_to_join "$BODY")"

check "the status history records each step" '["requested","accepted"]' \
  "$(as "$TC" GET "game_participant_history?post_id=eq.$G4&player_id=eq.$IDC&order=history_id&select=to_status" | python3 -c 'import sys,json
print(json.dumps([r["to_status"] for r in json.load(sys.stdin)], separators=(",",":")))')"
check "history cannot be edited" "ERR:42501" \
  "$(count "$(as "$TC" PATCH "game_participant_history?post_id=eq.$G4" '{"to_status":"accepted"}')")"
check "other players cannot read someone's history" 0 \
  "$(count "$(as "$TB" GET "game_participant_history?post_id=eq.$G4&player_id=eq.$IDC")")"

echo
echo "== 20. player profiles (BL-019) =="
SUB="{\"match_id\":\"$GM\",\"submitted_by\":\"$IDC\",\"score\":\"21-15 21-17\",\"winning_side\":\"b\"}"
RID=$(as "$TC" POST "match_result" "$SUB" | field result_id)
as "$TADM" PATCH "match_result?result_id=eq.$RID" '{"status":"confirmed"}' > /dev/null
BODY="{\"p_player_id\":\"$IDC\"}"
PROF=$(as "$TB" POST "rpc/get_player_profile" "$BODY")
check "a profile has the Player Profile screen's fields" "yes" \
  "$(echo "$PROF" | python3 -c 'import sys,json
p=json.load(sys.stdin)
keys=("name","initials","level","status","rating","wins","losses","matches","reliability","recentForm","preferredFormat","area","league")
print("yes" if all(k in p for k in keys) else "missing "+str([k for k in keys if k not in p]))')"
check "wins, losses and form come from confirmed results" '[1,0,1,["W"],"Provisional"]' \
  "$(echo "$PROF" | python3 -c 'import sys,json
p=json.load(sys.stdin); print(json.dumps([p["wins"],p["losses"],p["matches"],p["recentForm"],p["status"]], separators=(",",":")))')"
BODY="{\"p_player_id\":\"$IDA\"}"
check "the loser's record shows the loss" '[0,1]' \
  "$(as "$TC" POST "rpc/get_player_profile" "$BODY" | python3 -c 'import sys,json
p=json.load(sys.stdin); print(json.dumps([p["wins"],p["losses"]], separators=(",",":")))')"
check "a profile never carries real names or birth dates" "clean" \
  "$(echo "$PROF" | python3 -c 'import sys
t=sys.stdin.read(); print("leak" if any(k in t for k in ("first_name","last_name","date_of_birth","email")) else "clean")')"
# Bob hid his profile in section 2. Carol shares no game with him.
BODY="{\"p_player_id\":\"$IDB\"}"
check "a hidden profile is private to strangers" "null" \
  "$(as "$TC" POST "rpc/get_player_profile" "$BODY")"
BODY="{\"p_player_id\":\"$IDB\"}"
check "but visible to the host of a game he asked to join" "$(as "$TB" GET "player?player_id=eq.$IDB&select=username" | field username)" \
  "$(as "$TA" POST "rpc/get_player_profile" "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["name"])')"
BODY="{\"p_player_id\":\"$IDB\"}"
check "and to the player themselves" "yes" \
  "$([[ "$(as "$TB" POST "rpc/get_player_profile" "$BODY")" != "null" ]] && echo yes || echo no)"

echo
echo "== 21. find games and players (BL-015) =="
G5=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"title\":\"Friday Night Doubles\",\"format\":\"doubles\",\"player_limit\":4,\"venue_id\":\"$VENUE\",\"ability_level\":\"beginner\",\"duration_minutes\":90,\"proposed_time\":\"$(future 26)\"}" | field post_id)
has() { # has <json array> <post id>: yes if the id is in it
  echo "$1" | python3 -c 'import sys,json;print("yes" if sys.argv[1] in [g["id"] for g in json.load(sys.stdin)] else "no")' "$2"; }
search() { as "$TB" POST "rpc/search_games" "$1"; }
check "search finds an upcoming game" "yes" "$(has "$(search '{}')" "$G5")"
CARD=$(search '{"p_query":"friday"}')
check "by title" "yes" "$(has "$CARD" "$G5")"
check "a card has the Find Games fields" '["Friday Night Doubles","Doubles","Beginner","Melbourne Sports and Aquatic Centre@ MSAC, Albert Park",1,4]' \
  "$(echo "$CARD" | python3 -c 'import sys,json
g=[x for x in json.load(sys.stdin) if x["id"]=="'$G5'"][0]
print(json.dumps([g["title"],g["format"],g["rank"],g["location"],g["playerCount"],g["maxPlayers"]], separators=(",",":")))')"
check "the time shows start and end" "yes" \
  "$(echo "$CARD" | python3 -c 'import sys,json
g=[x for x in json.load(sys.stdin) if x["id"]=="'$G5'"][0]; print("yes" if " – " in g["time"] else g["time"])')"
check "by suburb" "yes" "$(has "$(search '{"p_suburb":"albert park"}')" "$G5")"
check "by venue name in the search box" "yes" "$(has "$(search '{"p_query":"aquatic"}')" "$G5")"
check "the level filter keeps matching games" "yes" "$(has "$(search '{"p_level":"beginner"}')" "$G5")"
check "and drops others" "no" "$(has "$(search '{"p_level":"advanced"}')" "$G5")"
check "the format filter drops other formats" "no" "$(has "$(search '{"p_format":"singles"}')" "$G5")"
check "cancelled games are not listed" "no" "$(has "$(search '{}')" "$G1")"
check "deleted games are not listed" "no" "$(has "$(search '{}')" "$G3")"
check "results come in pages" 1 "$(search '{"p_limit":1}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
TN=$(signup_meta "nobody-$RANDOM@example.com" '{"first_name":"Ned"}')
check "unregistered accounts find nothing" "[]" "$(as "$TN" POST "rpc/search_games" '{}')"

BODY="{\"p_post_id\":\"$G4\"}"
DET=$(as "$TB" POST "rpc/get_game_details" "$BODY")
check "game details show the host's stats and the roster" "yes" \
  "$(echo "$DET" | python3 -c 'import sys,json
d=json.load(sys.stdin); h=d["host"]
ok=all(k in h for k in ("name","rating","verifiedMatches","reliability")) and len(d["players"])==2 and d["players"][0]["host"]
print("yes" if ok else json.dumps(d)[:300])')"
check "and the caller's own request status" "declined" \
  "$(echo "$DET" | python3 -c 'import sys,json;print(json.load(sys.stdin)["myStatus"])')"
check "players do not manage someone else's game" "False" \
  "$(echo "$DET" | python3 -c 'import sys,json;print(json.load(sys.stdin)["canManage"])')"

BODY="{\"p_query\":\"$UNA\"}"
PLAYERS=$(as "$TC" POST "rpc/search_players" "$BODY")
check "player search finds discoverable players" "yes" \
  "$(echo "$PLAYERS" | python3 -c 'import sys,json;print("yes" if "'$IDA'" in [p["id"] for p in json.load(sys.stdin)] else "no")')"
check "but never hidden ones" "no" \
  "$(as "$TC" POST "rpc/search_players" '{}' | python3 -c 'import sys,json;print("yes" if "'$IDB'" in [p["id"] for p in json.load(sys.stdin)] else "no")')"
BODY="{\"p_query\":\"$UNA\"}"
check "or the person searching" "no" \
  "$(as "$TA" POST "rpc/search_players" "$BODY" | python3 -c 'import sys,json;print("yes" if "'$IDA'" in [p["id"] for p in json.load(sys.stdin)] else "no")')"
BODY="{\"p_post_id\":\"$G4\"}"
check "carol withdraws her place" "EMPTY" "$(rpc "$TC" withdraw_request "$BODY")"

echo
echo "== 22. blocking (BL-027) =="
sub_of() { echo "$1" | python3 -c 'import sys,json,base64;t=sys.stdin.read().split(".")[1];print(json.loads(base64.urlsafe_b64decode(t+"=="))["sub"])'; }
ADULT='"date_of_birth":"1990-01-01","age_declared":true,"terms_version":"2026-10","privacy_version":"2026-10","state":"VIC"'
TP=$(signup_meta "pat-$RANDOM@example.com" "{\"first_name\":\"Pat\",$ADULT}");   IDP=$(sub_of "$TP")
TQ=$(signup_meta "quinn-$RANDOM@example.com" "{\"first_name\":\"Quinn\",$ADULT}"); IDQ=$(sub_of "$TQ")
BODY="{\"organiser_id\":\"$IDQ\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 27)\"}"
GQ=$(as "$TQ" POST "game_post" "$BODY" | field post_id)
BODY="{\"organiser_id\":\"$IDP\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 28)\"}"
GP=$(as "$TP" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GQ\"}";  rpc "$TP" request_to_join "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GP\"}";  rpc "$TQ" request_to_join "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GP\",\"p_player_id\":\"$IDQ\"}"; rpc "$TP" accept_request "$BODY" > /dev/null
check "before blocking, they can see each other" 1 "$(count "$(as "$TP" GET "player?player_id=eq.$IDQ&select=player_id")")"

BODY="{\"p_player_id\":\"$IDQ\"}"
check "pat blocks quinn" "EMPTY" "$(rpc "$TP" block_player "$BODY")"
check "blocking twice is harmless" "EMPTY" "$(rpc "$TP" block_player "$BODY")"
BODY="{\"p_player_id\":\"$IDP\"}"
check "nobody can block themselves" "23514" "$(rpc "$TP" block_player "$BODY")"
BODY="{\"blocker_id\":\"$IDQ\",\"blocked_id\":\"$IDP\"}"
check "blocks cannot be written directly" "ERR:42501" "$(count "$(as "$TQ" POST "blocks" "$BODY")")"

echo "-- blocker's side: pat still sees quinn, with a Blocked badge"
has_id() { echo "$1" | python3 -c 'import sys,json;print("yes" if sys.argv[1] in [g["id"] for g in json.load(sys.stdin)] else "no")' "$2"; }
check "pat still sees quinn's name" 1 "$(count "$(as "$TP" GET "player?player_id=eq.$IDQ&select=player_id")")"
flag() { python3 -c 'import sys,json
d=json.load(sys.stdin)
r=[x for x in (d if isinstance(d,list) else []) if x.get("id")==sys.argv[1]]
print(r[0].get("isBlocked") if r else "absent")' "$1"; }
BODY="{\"p_query\":\"$(as "$TQ" GET "player?player_id=eq.$IDQ&select=username" | field username)\"}"
check "pat finds quinn in player search, badged" "True" "$(as "$TP" POST "rpc/search_players" "$BODY" | flag "$IDQ")"
check "pat still sees quinn's game, organiser badged" "True" \
  "$(as "$TP" POST "rpc/search_games" '{"p_limit":50}' | python3 -c 'import sys,json
g=[x for x in json.load(sys.stdin) if x["id"]=="'$GQ'"]; print(g[0]["organiser"]["isBlocked"] if g else "absent")')"
BODY="{\"p_post_id\":\"$GQ\"}"
check "and its details, host badged" "True" \
  "$(as "$TP" POST "rpc/get_game_details" "$BODY" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["host"]["isBlocked"] if d else "null")')"
check "but cannot join it" "42501" "$(rpc "$TP" request_to_join "$BODY")"
BODY="{\"p_player_id\":\"$IDQ\"}"
check "profiles stay closed for the blocker too" "null" "$(as "$TP" POST "rpc/get_player_profile" "$BODY")"

echo "-- blocked side: quinn loses sight of pat"
check "quinn cannot see pat's name" 0 "$(count "$(as "$TQ" GET "player?player_id=eq.$IDP&select=player_id")")"
check "nor pat's profile row" 0 "$(count "$(as "$TQ" GET "player_profile?player_id=eq.$IDP&select=player_id")")"
BODY="{\"p_player_id\":\"$IDP\"}"
check "nor pat's profile" "null" "$(as "$TQ" POST "rpc/get_player_profile" "$BODY")"
check "nor find pat in player search" "absent" "$(as "$TQ" POST "rpc/search_players" '{"p_limit":50}' | flag "$IDP")"
check "nor pat's games" 0 "$(count "$(as "$TQ" GET "game_post?post_id=eq.$GP&select=post_id")")"
check "other players still see both" 2 \
  "$(count "$(as "$TA" GET "player?player_id=in.($IDP,$IDQ)&select=player_id")")"
check "pat's request to quinn's game was withdrawn" "withdrawn" \
  "$(as "$TP" GET "game_participant?post_id=eq.$GQ&player_id=eq.$IDP&select=status" | field status)"
check "quinn's place in pat's game was closed" "rejected" \
  "$(as "$TQ" GET "game_participant?post_id=eq.$GP&player_id=eq.$IDQ&select=status" | field status)"

echo "-- a third player's game"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"player_limit\":4,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 31)\"}"
GA=$(as "$TA" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GA\"}"; rpc "$TP" request_to_join "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GA\",\"p_player_id\":\"$IDP\"}"; rpc "$TA" accept_request "$BODY" > /dev/null
check "once pat joins alice's game, quinn cannot see it" "no" "$(has_id "$(as "$TQ" POST "rpc/search_games" '{"p_limit":50}')" "$GA")"
BODY="{\"p_post_id\":\"$GA\"}"
check "nor its details" "null" "$(as "$TQ" POST "rpc/get_game_details" "$BODY")"
check "nor join it" "42501" "$(rpc "$TQ" request_to_join "$BODY")"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"player_limit\":4,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 32)\"}"
GA2=$(as "$TA" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GA2\"}"; rpc "$TQ" request_to_join "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GA2\",\"p_player_id\":\"$IDQ\"}"; rpc "$TA" accept_request "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GA2\"}"
check "where quinn is playing, pat sees quinn on the roster, badged" "True" \
  "$(as "$TP" POST "rpc/get_game_details" "$BODY" | python3 -c 'import sys,json
p=[x for x in json.load(sys.stdin)["players"] if x["id"]=="'$IDQ'"]; print(p[0]["isBlocked"] if p else "absent")')"
check "and pat may still choose to join" "EMPTY" "$(rpc "$TP" request_to_join "$BODY")"
check "quinn, already in it, keeps seeing it" "yes" \
  "$([[ "$(as "$TQ" POST "rpc/get_game_details" "$BODY")" != "null" ]] && echo yes || echo no)"
check "but without pat on the roster" "absent" \
  "$(as "$TQ" POST "rpc/get_game_details" "$BODY" | python3 -c 'import sys,json
print("present" if "'$IDP'" in [x["id"] for x in json.load(sys.stdin)["players"]] else "absent")')"

BODY="{\"organiser_id\":\"$IDP\",\"format\":\"singles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 29)\"}"
GP2=$(as "$TP" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GP2\"}"
check "quinn cannot ask to join pat's new game" "42501" "$(rpc "$TQ" request_to_join "$BODY")"
BODY="{\"post_id\":\"$GP2\",\"player_id\":\"$IDQ\"}"
check "not even with a direct insert" "ERR:42501" "$(count "$(as "$TQ" POST "game_participant" "$BODY")")"

check "pat's blocked list shows quinn" "yes" \
  "$(has_id "$(as "$TP" POST "rpc/get_blocked_players" '{}')" "$IDQ")"
check "quinn cannot see that pat blocked them" 0 "$(count "$(as "$TQ" GET "blocks?select=blocker_id")")"
BODY="{\"p_player_id\":\"$IDQ\",\"p_category\":\"harassment\",\"p_reason\":\"Kept messaging after I said no\"}"
check "a blocked player can still be reported" "OK" "$(as "$TP" POST "rpc/report_player" "$BODY" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("OK" if isinstance(d,str) else d.get("code"))')"

BODY="{\"p_player_id\":\"$IDQ\"}"
check "pat unblocks quinn" "EMPTY" "$(rpc "$TP" unblock_player "$BODY")"
check "they can see each other again" 1 "$(count "$(as "$TP" GET "player?player_id=eq.$IDQ&select=player_id")")"

echo
echo "== 23. reporting (BL-028) =="
report() { # report <token> <function> <json body>; prints OK for a new report id, else the error code
  as "$1" POST "rpc/$2" "$3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("OK" if isinstance(d,str) else d.get("code"))'; }
BODY="{\"p_player_id\":\"$IDA\",\"p_category\":\"harassment\",\"p_reason\":\"Rude at the last game\"}"
RID=$(as "$TC" POST "rpc/report_player" "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin))')
check "a player reports another, and gets the report id" "yes" "$([[ ${#RID} -eq 36 ]] && echo yes || echo "no ($RID)")"
check "the server captured evidence of the profile" "$UNA" \
  "$(as "$TC" GET "report?report_id=eq.$RID&select=evidence" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["evidence"]["username"])')"
check "the same item cannot be reported twice while open" "23505" "$(report "$TC" report_player "$BODY")"
BODY="{\"p_player_id\":\"$IDJ\",\"p_category\":\"other\"}"
check "'other' needs details" "23514" "$(report "$TC" report_player "$BODY")"
BODY="{\"p_player_id\":\"$IDJ\",\"p_category\":\"rude\"}"
check "unknown categories are rejected" "23514" "$(report "$TC" report_player "$BODY")"
BODY="{\"p_player_id\":\"$IDC\",\"p_category\":\"spam\"}"
check "nobody can report themselves" "23514" "$(report "$TC" report_player "$BODY")"

BODY="{\"p_post_id\":\"$G5\",\"p_category\":\"spam\"}"
check "a game post can be reported" "OK" "$(report "$TC" report_post "$BODY")"
check "with the post's title in the evidence" "Friday Night Doubles" \
  "$(as "$TC" GET "report?target_id=eq.$G5&select=evidence" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["evidence"]["title"])')"
check "but not by its organiser" "23514" "$(report "$TA" report_post "$BODY")"
BODY="{\"p_club_id\":\"$CLUB\",\"p_category\":\"fake_account\",\"p_reason\":\"Pretends to be an official club\"}"
check "a club can be reported" "OK" "$(report "$TC" report_club "$BODY")"
BODY="{\"p_league_id\":\"00000000-0000-0000-0000-000000000000\",\"p_category\":\"spam\"}"
check "a league that does not exist cannot" "42501" "$(report "$TC" report_league "$BODY")"
BODY="{\"reported_by_player_id\":\"$IDC\",\"target_type\":\"player\",\"target_id\":\"$IDB\",\"reason\":\"x\",\"category\":\"spam\",\"evidence\":{\"username\":\"made up\"}}"
check "reports cannot be inserted directly (no faked evidence)" "ERR:42501" "$(count "$(as "$TC" POST "report" "$BODY")")"

check "other players cannot read the report" 0 "$(count "$(as "$TB" GET "report?report_id=eq.$RID&select=report_id")")"
check "admins see it in the queue" 1 "$(count "$(as "$TADM" GET "report?report_id=eq.$RID&status=eq.open&select=report_id")")"

# Carol has filed 3 reports this hour. Two more reach the limit of 5.
IDK=$(sub_of "$TK"); IDD=$(sub_of "$TD")
BODY="{\"p_player_id\":\"$IDJ\",\"p_category\":\"spam\"}";  report "$TC" report_player "$BODY" > /dev/null
BODY="{\"p_player_id\":\"$IDK\",\"p_category\":\"spam\"}";  report "$TC" report_player "$BODY" > /dev/null
BODY="{\"p_player_id\":\"$IDD\",\"p_category\":\"spam\"}"
check "a sixth report within the hour is refused" "23514" "$(report "$TC" report_player "$BODY")"

echo
echo "== 24. notifications (BL-050) =="
TH=$(signup_meta "host-$RANDOM@example.com" "{\"first_name\":\"Hana\",$ADULT}"); IDH=$(sub_of "$TH")
TR=$(signup_meta "req-$RANDOM@example.com" "{\"first_name\":\"Ravi\",$ADULT}");  IDR=$(sub_of "$TR")
UNR=$(as "$TR" GET "player?player_id=eq.$IDR&select=username" | field username)
latest() { # latest <token> <type> <field>: that field of the newest notification of that type
  as "$1" GET "notification?type=eq.$2&order=created_at.desc&limit=1&select=$3" | field "$3"; }
BODY="{\"organiser_id\":\"$IDH\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 33)\"}"
GN=$(as "$TH" POST "game_post" "$BODY" | field post_id)

BODY="{\"p_post_id\":\"$GN\"}"; rpc "$TR" request_to_join "$BODY" > /dev/null
check "the host hears about a new request" "$GN" "$(latest "$TH" join_request post_id)"
check "naming the player" "yes" \
  "$([[ "$(latest "$TH" join_request message)" == "$UNR asked to join your Singles game on"* ]] && echo yes || echo "no: $(latest "$TH" join_request message)")"
BODY="{\"p_post_id\":\"$GN\",\"p_player_id\":\"$IDR\"}"; rpc "$TH" accept_request "$BODY" > /dev/null
check "the player hears they were accepted" "$GN" "$(latest "$TR" request_accepted post_id)"
check "with the match to open" "yes" "$([[ -n "$(latest "$TR" request_accepted match_id)" ]] && echo yes || echo no)"
BODY="{\"p_post_id\":\"$GN\"}"; rpc "$TR" withdraw_request "$BODY" > /dev/null
check "the host hears that an accepted player withdrew" "A place has opened up" "$(latest "$TH" request_withdrawn detail)"
rpc "$TR" request_to_join "$BODY" > /dev/null
BODY="{\"p_post_id\":\"$GN\",\"p_player_id\":\"$IDR\"}"; rpc "$TH" decline_request "$BODY" > /dev/null
check "the player hears they were declined" "$GN" "$(latest "$TR" request_declined post_id)"
check "nobody else can read them" 0 "$(count "$(as "$TA" GET "notification?player_id=eq.$IDR&select=notification_id")")"

BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 34)\"}"
GC=$(as "$TA" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GC\"}"; rpc "$TR" request_to_join "$BODY" > /dev/null
check "for a club game, the club's admins hear about requests" "$GC" "$(latest "$TA" join_request post_id)"

LIST=$(as "$TR" POST "rpc/get_notifications" '{}')
check "the screen gets title, message, unread and the game to open" "yes" \
  "$(echo "$LIST" | python3 -c 'import sys,json
n=json.load(sys.stdin)[0]; print("yes" if all(k in n for k in ("id","type","title","message","unread","createdAt","postId","matchId")) and n["unread"] else json.dumps(n))')"
check "mark all read reports how many changed" "yes" \
  "$([[ $(as "$TR" POST "rpc/mark_all_notifications_read" '{}') -ge 2 ]] && echo yes || echo no)"
check "after which nothing is unread" 0 "$(count "$(as "$TR" GET "notification?is_read=eq.false&select=notification_id")")"
BODY="{\"player_id\":\"$IDR\",\"type\":\"system\",\"message\":\"x\"}"
check "players cannot write notifications" "ERR:42501" "$(count "$(as "$TR" POST "notification" "$BODY")")"

BODY="{\"organiser_id\":\"$IDH\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 35)\"}"
GN2=$(as "$TH" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GN2\"}"; rpc "$TR" request_to_join "$BODY" > /dev/null
BODY="{\"p_player_id\":\"$IDR\"}"; rpc "$TH" block_player "$BODY" > /dev/null
check "blocking closes the request without telling the blocked player" 0 \
  "$(count "$(as "$TR" GET "notification?type=eq.request_declined&post_id=eq.$GN2&select=notification_id")")"

echo
echo "== 25. no-shows, late withdrawals, reliability, history (BL-054, BL-052, BL-060) =="
TO=$(signup_meta "org-$RANDOM@example.com" "{\"first_name\":\"Olga\",$ADULT}"); IDO=$(sub_of "$TO")
TW=$(signup_meta "wil-$RANDOM@example.com" "{\"first_name\":\"Wil\",$ADULT}");  IDW=$(sub_of "$TW")
in_secs() { python3 -c 'import sys,datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=int(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
rel() { # rel <token> <player id> <key>: a reliability figure from the profile
  BODY="{\"p_player_id\":\"$2\"}"; as "$1" POST "rpc/get_player_profile" "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)[sys.argv[1]])' "$3"; }
join_and_accept() { # join_and_accept <post id>
  BODY="{\"p_post_id\":\"$1\"}"; rpc "$TW" request_to_join "$BODY" > /dev/null
  BODY="{\"p_post_id\":\"$1\",\"p_player_id\":\"$IDW\"}"; rpc "$TO" accept_request "$BODY" > /dev/null; }
check "a new player starts at 100% reliability" 100 "$(rel "$TA" "$IDW" reliability)"

# A game starting in 20 seconds, so a no-show can be recorded during the run.
BODY="{\"organiser_id\":\"$IDO\",\"format\":\"singles\",\"player_limit\":2,\"duration_minutes\":15,\"suburb\":\"Carlton\",\"proposed_time\":\"$(in_secs 20)\"}"
GS=$(as "$TO" POST "game_post" "$BODY" | field post_id)
join_and_accept "$GS"
BODY="{\"p_post_id\":\"$GS\",\"p_player_id\":\"$IDW\"}"
check "a no-show cannot be recorded before the start" "23514" "$(rpc "$TO" mark_no_show "$BODY")"
sleep 21
check "only the host can record one" "42501" "$(rpc "$TA" mark_no_show "$BODY")"
check "nobody can set it by editing the status" "ERR:42501" \
  "$(count "$(as "$TO" PATCH "game_participant?post_id=eq.$GS&player_id=eq.$IDW" '{"status":"no_show"}')")"
check "after the start, the host records the no-show" "EMPTY" "$(rpc "$TO" mark_no_show "$BODY")"
check "the player is told" "$GS" "$(latest "$TW" no_show post_id)"
check "and their reliability drops (2 / 3 = 67%)" "[67,1]" \
  "[$(rel "$TA" "$IDW" reliability),$(rel "$TA" "$IDW" noShows)]"
check "the copy on their profile row is refreshed too" 67 \
  "$(as "$TW" GET "player_profile?player_id=eq.$IDW&select=reliability_score" | python3 -c 'import sys,json;print(round(json.load(sys.stdin)[0]["reliability_score"]))')"
check "the host can undo a mistaken no-show" "EMPTY" "$(rpc "$TO" clear_no_show "$BODY")"
check "which restores the score" 100 "$(rel "$TA" "$IDW" reliability)"
check "undoing it does not send an 'accepted' notification" 1 \
  "$(count "$(as "$TW" GET "notification?type=eq.request_accepted&post_id=eq.$GS&select=notification_id")")"

BODY="{\"organiser_id\":\"$IDO\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(future 40)\"}"
GE=$(as "$TO" POST "game_post" "$BODY" | field post_id)
join_and_accept "$GE"
BODY="{\"p_post_id\":\"$GE\"}"; rpc "$TW" withdraw_request "$BODY" > /dev/null
check "withdrawing weeks ahead is not late" "False" \
  "$(as "$TW" GET "game_participant?post_id=eq.$GE&player_id=eq.$IDW&select=late_withdrawal" | field late_withdrawal)"
BODY="{\"organiser_id\":\"$IDO\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(in_secs 36000)\"}"
GL=$(as "$TO" POST "game_post" "$BODY" | field post_id)
join_and_accept "$GL"
BODY="{\"p_post_id\":\"$GL\"}"; rpc "$TW" withdraw_request "$BODY" > /dev/null
check "withdrawing within 24 hours is late" "True" \
  "$(as "$TW" GET "game_participant?post_id=eq.$GL&player_id=eq.$IDW&select=late_withdrawal" | field late_withdrawal)"
check "and costs reliability (2 / 2.5 = 80%)" "[80,1]" \
  "[$(rel "$TA" "$IDW" reliability),$(rel "$TA" "$IDW" lateWithdrawals)]"
BODY="{\"organiser_id\":\"$IDO\",\"format\":\"singles\",\"player_limit\":2,\"suburb\":\"Carlton\",\"proposed_time\":\"$(in_secs 36000)\"}"
GLC=$(as "$TO" POST "game_post" "$BODY" | field post_id)
BODY="{\"p_post_id\":\"$GLC\"}"; rpc "$TO" cancel_game_post "$BODY" > /dev/null
check "an organiser cancelling within 24 hours loses reliability too" 80 "$(rel "$TA" "$IDO" reliability)"

BODY="{\"p_player_id\":\"$IDC\"}"
HIST=$(as "$TB" POST "rpc/get_player_history" "$BODY")
check "history lists verified matches with result, score and opponent" "[\"W\",\"21-15 21-17\",\"$UNA\"]" \
  "$(echo "$HIST" | python3 -c 'import sys,json
h=[x for x in json.load(sys.stdin) if x["matchId"]=="'$GM'"][0]
print(json.dumps([h["result"],h["score"],h["opponents"][0]["name"]], separators=(",",":")))')"
BODY="{\"p_player_id\":\"$IDB\"}"
check "a private profile's history is private too" "null" "$(as "$TC" POST "rpc/get_player_history" "$BODY")"
check "profiles now include games played" "yes" \
  "$(rel "$TA" "$IDW" gamesPlayed >/dev/null && echo yes)"

check "a player can turn notification emails off" 1 \
  "$(count "$(as "$TW" PATCH "player_profile?player_id=eq.$IDW" '{"email_notifications":false}')")"
check "but not for someone else" 0 \
  "$(count "$(as "$TA" PATCH "player_profile?player_id=eq.$IDW" '{"email_notifications":false}')")"

echo
echo "== 26. venue geocoding queue =="
check "players cannot read the geocoding queue" 0 "$(count "$(as "$TA" GET "venue_geocode_queue?select=queue_id")")"
check "players cannot take the worker lease" "42501" "$(rpc "$TA" geocode_claim_batch '{}')"
BODY='{"p_queue_id":1,"p_lat":-37.8,"p_lng":144.9}'
check "players cannot write a pin through the worker functions" "42501" "$(rpc "$TA" geocode_complete "$BODY")"
check "players cannot release the lease" "42501" "$(rpc "$TA" geocode_release '{}')"
SUBP=$(as "$TA" GET "suburb?name=eq.Parkville&postcode=eq.3052&select=suburb_id" | field suburb_id)
BODY="{\"name\":\"Queue Test Hall $RANDOM\",\"address\":\"103 Tin Alley, Parkville VIC 3010\",\"suburb_id\":\"$SUBP\"}"
NEWV=$(as "$TADM" POST "venue" "$BODY" | field venue_id)
check "a venue added without a pin is queued for a look-up" 1 \
  "$(count "$(as "$TADM" GET "venue_geocode_queue?venue_id=eq.$NEWV&status=eq.pending&select=queue_id")")"
check "and links to Google Maps by address until then" "yes" \
  "$(as "$TADM" GET "venue?venue_id=eq.$NEWV&select=maps_url" | field maps_url | grep -q 'query=Queue+Test+Hall' && echo yes || echo no)"
BODY="{\"name\":\"Pinned Hall $RANDOM\",\"suburb_id\":\"$SUBP\",\"latitude\":-37.79,\"longitude\":144.96}"
PINNED=$(as "$TADM" POST "venue" "$BODY" | field venue_id)
check "a venue added with a pin is not queued" 0 \
  "$(count "$(as "$TADM" GET "venue_geocode_queue?venue_id=eq.$PINNED&select=queue_id")")"

echo
echo "-------------------------------------"
echo "  $pass passed, $fail failed"
[[ $fail -eq 0 ]]
