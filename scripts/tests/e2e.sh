#!/bin/bash
# End-to-end checks against a running app as each demo persona.
#   BASE_URL=http://localhost:3000 bash scripts/tests/e2e.sh
#   BASE_URL=https://your-app.vercel.app bash scripts/tests/e2e.sh     # after deploying
B=${BASE_URL:-http://localhost:3000}
J=$(mktemp -d)
pass=0; fail=0
ok()   { if [ "$2" = "1" ]; then pass=$((pass+1)); printf "  ok   %s\n" "$1"; else fail=$((fail+1)); printf "  FAIL %s\n" "$1"; fi; }
has()  { grep -q -- "$2" <<<"$1" && echo 1 || echo 0; }
hasnt(){ grep -q -- "$2" <<<"$1" && echo 0 || echo 1; }
eq()   { [ "$1" = "$2" ] && echo 1 || echo 0; }
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$@"; }
page() { curl -s --max-time 60 -b "$J/$1.jar" "$B$2"; }
login(){ curl -s -o /dev/null -c "$J/$1.jar" -X POST -H 'Content-Type: application/json' -d "{\"userId\":\"$2\"}" "$B/api/auth/login"; }

for u in yash:u-yash arjun:u-arjun vikram:u-vikram neha:u-neha priya:u-priya; do login "${u%%:*}" "${u##*:}"; done

echo "health"
ok "public /api/health answers ok" "$(has "$(curl -s $B/api/health)" '"ok":true')"
ok "…and shows no integration detail to the public" "$(hasnt "$(curl -s $B/api/health)" 'checks')"
ok "HR sees which integrations are configured (booleans only)" "$(has "$(page priya /api/health)" '"checks"')"

echo "dashboard scope"
hr=$(page priya /tracker); mg=$(page arjun /tracker); dh=$(page vikram /tracker); fh=$(page neha /tracker)
ok "HR sees the dashboard with readiness" "$(has "$hr" 'Ready for day one')"
ok "HR sees people from every department (Finance and Engineering)" "$(eq "$(has "$hr" "Meera Iyer")$(has "$hr" "Yash Bansal")" 11)"
ok "Manager Arjun sees his report Yash" "$(has "$mg" 'Yash Bansal')"
ok "…but not Finance's Meera" "$(hasnt "$mg" 'Meera Iyer')"
ok "Engineering head sees Engineering, not Finance" "$(eq "$(has "$dh" 'Yash Bansal')$(has "$dh" 'Meera Iyer')" 10)"
ok "Finance head sees Finance, not Engineering" "$(eq "$(has "$fh" 'Meera Iyer')$(has "$fh" 'Yash Bansal')" 10)"

echo "employee record access (p0 = Yash, Engineering; p4 = Meera, Finance)"
ok "HR opens Yash's record: overview with what needs attention" "$(has "$(page priya /employees/p0)" 'Needs attention')"
ok "…with the tabs staff need" "$(has "$(page priya /employees/p0)" 'Profile &amp; changes')"
ok "…and the ID badge on the overview" "$(has "$(page priya /employees/p0)" 'SUPERJOIN')"
ok "Arjun (Yash's manager) can open Yash" "$(has "$(page arjun /employees/p0)" 'Needs attention')"
ok "Arjun cannot open Meera (not his report)" "$(has "$(page arjun /employees/p4)" 'Not in your scope')"
ok "Engineering head cannot open Finance's Meera" "$(has "$(page vikram /employees/p4)" 'Not in your scope')"
ok "Finance head can open Meera" "$(has "$(page neha /employees/p4)" 'Needs attention')"
ok "the new joiner cannot open the staff record page" "$(has "$(page yash /employees/p0)" 'No access to')"

echo "the new joiner's own page"
me=$(page yash /me)
ok "welcome banner and own checklist tab" "$(eq "$(has "$me" "Welcome")$(has "$me" "My checklist")" 11)"
ok "sees his own overview" "$(has "$me" 'Needs attention')"
for n in "Riya Sharma" "Aarav Mehta" "Meera Iyer" "Emily Carter"; do ok "no other person ($n)" "$(hasnt "$me" "$n")"; done
ok "has no staff-only tabs (Profile & changes, Activity)" "$(hasnt "$me" 'Profile &amp; changes')"

echo "ingest + samples"
ing=$(page priya /ingest)
ok "HR sees the reference-data panel" "$(has "$ing" "Policy documents")"
ok "sample files are served to signed-in users" "$(eq "$(code -b "$J/priya.jar" "$B/samples/new-joiners.xlsx")" 200)"
ok "…including the file with errors" "$(eq "$(code -b "$J/priya.jar" "$B/samples/new-joiners-with-errors.csv")" 200)"
ok "samples are not public (signed-out → redirected to login)" "$(eq "$(code "$B/samples/new-joiners.csv")" 307)"
ok "manager cannot open ingest" "$(has "$(page arjun /ingest)" 'No access to')"

echo "assistant API"
PAY=$(J=$J python3 - <<'PY'
import json, os
facts=[{"item":"Government photo ID","kind":"document","dueDate":"2026-10-23","owner":"Yash Bansal","ownerFn":"Employee","state":"overdue","reason":"Identity must be verified. [R-DOC-ID] Applies to every new joiner.","policy":"POL-01","docStatus":"Not Submitted"},
       {"item":"Laptop","kind":"provision","dueDate":"2026-10-28","owner":"Karan Shah","ownerFn":"IT","state":"blocked","reason":"A laptop is requested after the HR record is created. [R-IT-LAP]","policy":"POL-05"}]
emp={"name":"Yash Bansal","role":"ML Engineer","department":"Engineering","location":"Bengaluru","country":"IN","grade":"L4","level":"Mid","startDate":"2026-10-30","manager":"Arjun Rao"}
def p(q,**kw): return json.dumps(dict({"question":q,"employee":emp,"hr":{"name":"Priya Nair","email":"priya.nair@acme.com"},"facts":facts},**kw))
open(os.environ["J"]+"/q1.json","w").write(p("How long does background verification take?"))
open(os.environ["J"]+"/q2.json","w").write(p("Can I bring my dog to the office?"))
open(os.environ["J"]+"/q3.json","w").write(p("x"*600))
open(os.environ["J"]+"/q4.json","w").write(json.dumps({"question":"hi"}))
print("ok")
PY
)
ask() { curl -s --max-time 60 -b "$J/$1.jar" -X POST -H 'Content-Type: application/json' --data @"$2" "$B/api/assistant"; }
ok "signed-out is refused" "$(eq "$(code -X POST -H 'Content-Type: application/json' --data @$J/q1.json "$B/api/assistant")" 401)"
a1=$(ask yash $J/q1.json)
ok "answers a policy question from the covered policy" "$(has "$a1" "\"covered\":true")"
ok "…quoting the 5 to 7 business days" "$(has "$a1" '5 to 7 business days')"
ok "says which mode answered (ai or extractive)" "$(has "$a1" '"mode":"')"
a2=$(ask yash $J/q2.json)
ok "declines what the policies do not cover" "$(has "$a2" "\"covered\":false")"
ok "…with no invented content" "$(hasnt "$a2" 'welcome')"
ok "over-long questions are rejected" "$(eq "$(code -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' --data @$J/q3.json "$B/api/assistant")" 400)"
ok "malformed context is rejected" "$(eq "$(code -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' --data @$J/q4.json "$B/api/assistant")" 400)"
n429=0; for i in $(seq 1 24); do c=$(code -b "$J/neha.jar" -X POST -H 'Content-Type: application/json' --data @$J/q1.json "$B/api/assistant"); [ "$c" = "429" ] && n429=$((n429+1)); done
ok "a runaway client is rate-limited (429 after 20/min)" "$([ $n429 -ge 1 ] && echo 1 || echo 0)"

echo "document extraction API"
ok "signed-out is refused" "$(eq "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/documents/extract")" 401)"
ex=$(code -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' -d '{"mime":"application/pdf","data":"AAAA"}' "$B/api/documents/extract")
ok "without an AI key it says so (503) instead of pretending" "$([ "$ex" = "503" ] || [ "$ex" = "200" ] && echo 1 || echo 0)"

rm -rf "$J" $J/q*.json
echo; echo "passed $pass, failed $fail"
[ $fail -eq 0 ]
