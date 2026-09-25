#!/usr/bin/env bash
# End-to-end RLS check against the local stack, using real JWTs from the local
# Auth server and going through PostgREST exactly as the browser would.
set -uo pipefail

API=http://127.0.0.1:54321
ANON=$(supabase status -o json 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["ANON_KEY"])')

signup() {
  curl -s "$API/auth/v1/signup" -H "apikey: $ANON" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"data\":{\"display_name\":\"$3\"}}"
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

echo
echo "== 1. sign-up trigger created player + profile rows =="
check "alice has a player row"  1 "$(count "$(as "$TA" GET "player?player_id=eq.$IDA")")"
check "alice has a profile row" 1 "$(count "$(as "$TA" GET "player_profile?player_id=eq.$IDA")")"
check "display_name came from user_metadata" '"Alice"' \
  "$(as "$TA" GET "player?player_id=eq.$IDA&select=display_name" | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin)[0]["display_name"]))')"

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
ORG='organiser:player!organiser_id(display_name)'
EMB=$(as "$TA" GET "game_post?post_id=eq.$CPOST&select=post_id,club(name,slug),$ORG")
check "club post embeds the club and a null organiser" '["Test Smashers",null]' \
  "$(echo "$EMB" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
c=r.get("club") or {}
print(json.dumps([c.get("name"), r.get("organiser")], separators=(",",":")))')"
EMB=$(as "$TA" GET "game_post?post_id=eq.$PID&select=post_id,club(name),$ORG")
check "player post embeds the organiser and a null club" '["Alice",null]' \
  "$(echo "$EMB" | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=d[0] if isinstance(d,list) and d else {}
p=r.get("organiser") or {}
print(json.dumps([p.get("display_name"), r.get("club")], separators=(",",":")))')"
echo
echo "-------------------------------------"
echo "  $pass passed, $fail failed"
[[ $fail -eq 0 ]]
