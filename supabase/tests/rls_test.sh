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
BODY="{\"organiser_id\":\"$IDU\",\"format\":\"singles\",\"proposed_time\":\"2027-01-01T18:00:00Z\"}"
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
echo "== 6. ownership rules on game posts =="
POST=$(as "$TA" POST "game_post" "{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"proposed_time\":\"2026-10-01T18:00:00Z\",\"suburb\":\"Carlton\"}")
check "alice can create her own post" 1 "$(count "$POST")"
PID=$(echo "$POST" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(d[0]["post_id"] if isinstance(d,list) and d else "")')
check "bob can see it on the board"   1 "$(count "$(as "$TB" GET "game_post?post_id=eq.$PID")")"
check "bob cannot edit it"            0 "$(count "$(as "$TB" PATCH "game_post?post_id=eq.$PID" '{"status":"cancelled"}')")"
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"proposed_time\":\"2026-10-02T18:00:00Z\"}"
R=$(as "$TB" POST "game_post" "$BODY")
check "bob cannot post as alice"      "ERR:42501" "$(count "$R")"
check "alice can cancel her own post" 1 "$(count "$(as "$TA" PATCH "game_post?post_id=eq.$PID" '{"status":"cancelled"}')")"

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

check "the trigger made her a representative" 1 \
  "$(count "$(as "$TA" GET "club_representative?club_id=eq.$CLUB&player_id=eq.$IDA")")"
check "bob is not a representative" 0 \
  "$(count "$(as "$TB" GET "club_representative?club_id=eq.$CLUB&player_id=eq.$IDB")")"

BODY="{\"organiser_club_id\":\"$CLUB\",\"format\":\"doubles\",\"proposed_time\":\"2026-10-05T18:00:00Z\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a rep can post on the club's behalf" 1 "$(count "$R")"
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
BODY="{\"format\":\"singles\",\"proposed_time\":\"2026-10-06T18:00:00Z\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a post with no organiser is refused" "ERR:42501" "$(count "$R")"

BODY="{\"organiser_id\":\"$IDA\",\"organiser_club_id\":\"$CLUB\",\"format\":\"singles\",\"proposed_time\":\"2026-10-06T18:00:00Z\"}"
R=$(as "$TA" POST "game_post" "$BODY")
check "a post with both organisers is rejected" "ERR:23514" "$(count "$R")"

echo
echo "== 10. club integrity =="
check "nobody can verify their own club" "ERR:42501" \
  "$(count "$(as "$TA" PATCH "club?club_id=eq.$CLUB" '{"is_verified":true}')")"
check "bob cannot edit alice's club" 0 \
  "$(count "$(as "$TB" PATCH "club?club_id=eq.$CLUB" '{"name":"Hijacked"}')")"

BODY="{\"club_id\":\"$CLUB\",\"player_id\":\"$IDB\"}"
R=$(as "$TB" POST "club_representative" "$BODY")
check "bob cannot make himself a representative" "ERR:42501" "$(count "$R")"
R=$(as "$TA" POST "club_representative" "$BODY")
check "a rep can add another rep" 1 "$(count "$R")"
check "a rep cannot remove another rep" 0 \
  "$(count "$(as "$TB" DELETE "club_representative?club_id=eq.$CLUB&player_id=eq.$IDA")")"
check "a rep can step down" 1 \
  "$(count "$(as "$TB" DELETE "club_representative?club_id=eq.$CLUB&player_id=eq.$IDB")")"

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
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"singles\",\"player_limit\":2,\"proposed_time\":\"2026-11-01T18:00:00Z\"}"
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
check "several matches can belong to one game" 3 \
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

BODY="{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"proposed_time\":\"2026-12-01T18:00:00Z\",\"suburb\":\"Clayton\"}"
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
           game_participant cancellation_record club match match_participant \
           check_in match_result dispute ranking notification report admin_post
do
  RES=$(as "$TA" GET "$tbl?select=updated_at,updated_by&limit=1")
  echo "$RES" | grep -q '"code"' && MISSING="$MISSING $tbl"
done
check "all 18 changeable tables expose the pair" "" "$MISSING"

# club_representative has no updatable column, so it deliberately has neither.
check "club_representative is deliberately excluded" "ERR:42703" \
  "$(count "$(as "$TA" GET "club_representative?select=updated_at&limit=1")")"
echo
echo "== 16. my home and my profile =="
errcode() { python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("code","?") if isinstance(d,dict) and "code" in d else "OK")
except Exception: print("EMPTY")'; }
key() { python3 -c 'import sys,json
d=json.load(sys.stdin)
for k in sys.argv[1].split("."): d=d[k] if d is not None else None
print(json.dumps(d, ensure_ascii=False))' "$1"; }

HOME_J=$(as "$TJ" POST "rpc/get_my_home" '{}')
check "home greets the player by their own name" '"Jane Smyth"' "$(echo "$HOME_J" | key greetingName)"
check "with initials for the top bar" '"JS"' "$(echo "$HOME_J" | key initials)"
check "and a rating card" '[0,0]' "[$(echo "$HOME_J" | key ratingCard.matches),$(echo "$HOME_J" | key ratingCard.winRate)]"
check "no rating yet means no state rank" "null" "$(echo "$HOME_J" | key ratingCard.stateRank)"
check "no upcoming game shows as null (No game planned)" "null" "$(echo "$HOME_J" | key nextGame)"
check "unread notifications are counted" "0" "$(echo "$HOME_J" | key unreadNotifications)"

FUTURE=$(python3 -c 'import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=12)).strftime("%Y-%m-%dT08:00:00Z"))')
BODY="{\"organiser_id\":\"$IDA\",\"format\":\"doubles\",\"suburb\":\"Carlton\",\"proposed_time\":\"$FUTURE\"}"
GH=$(as "$TA" POST "game_post" "$BODY" | field post_id)
BODY="{\"post_id\":\"$GH\",\"player_id\":\"$IDB\"}"; as "$TB" POST "game_participant" "$BODY" > /dev/null
as "$TA" PATCH "game_participant?post_id=eq.$GH&player_id=eq.$IDB" '{"status":"accepted"}' > /dev/null
check "a game the player is accepted into is their next game" "\"$GH\"" \
  "$(as "$TB" POST "rpc/get_my_home" '{}' | key nextGame.id)"
check "and the host sees it too, marked as host" "true" \
  "$(as "$TA" POST "rpc/get_my_home" '{}' | key nextGame.isHost)"

PROF_J=$(as "$TJ" POST "rpc/get_my_profile" '{}')
check "my profile has my real name and username" "[\"Jane Smyth\",\"${UN}_x\"]" \
  "[$(echo "$PROF_J" | key name),$(echo "$PROF_J" | key username)]"
check "and the editable fields" "yes" \
  "$(echo "$PROF_J" | python3 -c 'import sys,json
p=json.load(sys.stdin)
keys=("firstName","lastName","selfRatingBand","bio","suburb","state","isDiscoverable","reliability","ratingCard","location")
print("yes" if all(k in p for k in keys) else [k for k in keys if k not in p])')"
check "it only ever returns the caller's own profile" "\"$IDA\"" \
  "$(as "$TA" POST "rpc/get_my_profile" '{}' | key id)"
check "signed-out callers get nothing" "42501" \
  "$(curl -s "$API/rest/v1/rpc/get_my_profile" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{}' | errcode)"

BODY='{"p_bio":"Weeknight doubles","p_suburb":"Carlton","p_state":"VIC","p_self_rating_band":"upper_intermediate"}'
UPD=$(as "$TJ" POST "rpc/update_my_profile" "$BODY")
check "update saves several fields and returns the profile" '["Weeknight doubles","Carlton area · VIC","Upper Intermediate"]' \
  "[$(echo "$UPD" | key bio),$(echo "$UPD" | key location),$(echo "$UPD" | key level)]"
BODY='{"p_bio":""}'
check "an empty string clears a field" "null" "$(as "$TJ" POST "rpc/update_my_profile" "$BODY" | key bio)"
check "fields not sent stay as they were" '"Carlton"' "$(as "$TJ" POST "rpc/get_my_profile" '{}' | key suburb)"
BODY="{\"p_username\":\"$UNA\"}"
check "a taken username is refused" "23505" "$(as "$TJ" POST "rpc/update_my_profile" "$BODY" | errcode)"
BODY='{"p_self_rating_band":"pro"}'
check "an unknown level is refused" "22023" "$(as "$TJ" POST "rpc/update_my_profile" "$BODY" | errcode)"
BODY='{"p_first_name":"  "}'
check "a blank first name is refused" "23514" "$(as "$TJ" POST "rpc/update_my_profile" "$BODY" | errcode)"
BODY='{"p_is_discoverable":false}'
check "a player can hide their profile" "false" "$(as "$TJ" POST "rpc/update_my_profile" "$BODY" | key isDiscoverable)"

echo
echo "-------------------------------------"
echo "  $pass passed, $fail failed"
[[ $fail -eq 0 ]]
