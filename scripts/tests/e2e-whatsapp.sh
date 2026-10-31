#!/bin/bash
# WhatsApp end-to-end checks. Sourced by e2e.sh when WA_E2E=1, so it shares the helpers ($B, $J, ok, has, hasnt, eq, code, page).
# The server under test must have been started with:
#   WHATSAPP_APP_SECRET=$WA_APP_SECRET WHATSAPP_VERIFY_TOKEN=$WA_VERIFY_TOKEN WHATSAPP_ROUTER_KEY=$WA_ROUTER_KEY
#   WHATSAPP_DISPLAY_NUMBER=15551234567 WHATSAPP_STORE=memory      (and no WHATSAPP_TOKEN: that is the sandbox)
SECRET=${WA_APP_SECRET:?set WA_APP_SECRET}; TOK=${WA_VERIFY_TOKEN:?set WA_VERIFY_TOKEN}; RKEY=${WA_ROUTER_KEY:?set WA_ROUTER_KEY}
npx tsx scripts/tests/make-wa-payloads.mts "$J" >/dev/null 2>&1

all() { for x in "$@"; do [ "$x" = 1 ] || { echo 0; return; }; done; echo 1; }
hasf() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }
hmac() { printf '%s' "$1" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //'; }
# Meta-format webhook bodies, written by hand (not by our own helper), then signed and posted
meta_text()   { printf '{"object":"whatsapp_business_account","entry":[{"id":"w","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","contacts":[{"wa_id":"%s","profile":{"name":"Test"}}],"messages":[{"from":"%s","id":"%s","timestamp":"1761900000","type":"text","text":{"body":"%s"}}]}}]}]}' "$1" "$1" "$2" "$3"; }
meta_button() { printf '{"object":"whatsapp_business_account","entry":[{"id":"w","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","contacts":[{"wa_id":"%s","profile":{"name":"Test"}}],"messages":[{"from":"%s","id":"%s","timestamp":"1761900000","type":"interactive","interactive":{"type":"button_reply","button_reply":{"id":"%s","title":"x"}}}]}}]}]}' "$1" "$1" "$2" "$3"; }
post_signed() { curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST -H 'Content-Type: application/json' -H "x-hub-signature-256: sha256=$(hmac "$1")" --data "$1" "$B/api/whatsapp/webhook"; }
# a unique WhatsApp message id each time (a counter would not survive $(...)); repeated ids are deliberately dropped as duplicates
mid() { echo "wamid.e2e.$$.$RANDOM$RANDOM"; }

ov() { curl -s --max-time 30 -b "$J/priya.jar" "$B/api/whatsapp/overview${1:+?contact=$1}"; }
hr_post() { curl -s --max-time 30 -b "$J/priya.jar" -X POST -H 'Content-Type: application/json' --data "$2" "$B/api/whatsapp/$1"; }
who_post() { curl -s -o /dev/null -w "%{http_code}" --max-time 30 -b "$J/$1.jar" -X POST -H 'Content-Type: application/json' --data "$3" "$B/api/whatsapp/$2"; }
route() { curl -s --max-time 20 -X POST -H 'Content-Type: application/json' ${1:+-H "Authorization: Bearer $1"} --data "$2" "$B/api/whatsapp/route"; }
field() { sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" <<<"$1" | head -1; }
cid() { sed -n 's/.*"contact":{"id":"\([^"]*\)".*/\1/p' <<<"$1"; }

# what the page's data says about one contact / request / conversation (parsed as JSON, not grepped)
cstatus() { ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((c["status"] for c in d["contacts"] if c["id"]==sys.argv[1]),""))' "$1"; }
cphone()  { ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((c.get("phone") or "" for c in d["contacts"] if c["id"]==sys.argv[1]),""))' "$1"; }
rstatus() { ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((r["status"] for r in d["requests"] if r["id"]==sys.argv[1]),""))' "$1"; }
bodies()  { ov "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("\n".join(m["body"] for m in d["messages"] if not sys.argv[2:] or m["phone"].endswith(sys.argv[2])))' "$1" ${2:+"$2"}; }
said()    { ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print("\n".join(m["body"] for m in d["messages"] if m["direction"]=="out" and m["phone"].endswith(sys.argv[1])))' "$1"; }
buttons() { ov "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(",".join(b["title"] for m in d["messages"] for b in ((m.get("meta") or {}).get("buttons") or [])))' ; }
count() { grep -c -- "$1" <<<"$2" | tr -d ' '; }
# poll up to ~8 s: until [ "$(eval "$1")" = "$2" ]  /  until the conversation contains a string
waitfor() { local i; for i in $(seq 1 16); do [ "$(eval "$1")" = "$2" ] && { echo 1; return; }; sleep 0.5; done; echo 0; }
waitmsg() { local i; for i in $(seq 1 16); do grep -qF -- "$1" <<<"$(bodies "$2" $3)" && { echo 1; return; }; sleep 0.5; done; echo 0; }

# a stranger is answered at most once an hour (by design), so each run uses a number that has never written before
YASHP=919810011001; KARANP=919810022002; STRANGER=919$RANDOM$RANDOM; NEWP=919810099001

# start from a clean slate so this can be run more than once against the same server: anyone left joined by an earlier run leaves
post_signed "$(meta_text $YASHP "$(mid)" EXIT)" >/dev/null
post_signed "$(meta_text $KARANP "$(mid)" EXIT)" >/dev/null
sleep 2

echo "whatsapp: the webhook"
ok "Meta's handshake echoes the challenge for our verify token" "$(eq "$(curl -s "$B/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$TOK&hub.challenge=424242")" 424242)"
ok "…and refuses a wrong token" "$(eq "$(code "$B/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1")" 403)"
body=$(meta_text $STRANGER "$(mid)" hello)
ok "an unsigned call is refused" "$(eq "$(code -X POST -H 'Content-Type: application/json' --data "$body" "$B/api/whatsapp/webhook")" 401)"
ok "a call signed with the wrong secret is refused" "$(eq "$(code -X POST -H 'Content-Type: application/json' -H "x-hub-signature-256: sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac wrong | sed 's/^.* //')" --data "$body" "$B/api/whatsapp/webhook")" 401)"
ok "a body altered after signing is refused" "$(eq "$(code -X POST -H 'Content-Type: application/json' -H "x-hub-signature-256: sha256=$(hmac "$body")" --data "${body/hello/hacked}" "$B/api/whatsapp/webhook")" 401)"
ok "a correctly signed call is accepted straight away" "$(eq "$(post_signed "$body")" 200)"

echo "whatsapp: who can use the page and the routes"
ok "a new joiner can't read the overview" "$(eq "$(code -b "$J/yash.jar" "$B/api/whatsapp/overview")" 403)"
ok "a manager can't read the overview" "$(eq "$(code -b "$J/arjun.jar" "$B/api/whatsapp/overview")" 403)"
ok "signed-out is refused" "$(eq "$(code "$B/api/whatsapp/overview")" 401)"
for r in invite simulate unlink; do ok "only HR can $r (a department head gets 403)" "$(eq "$(who_post vikram $r '{}')" 403)"; done
ov0=$(ov)
ok "HR sees the connection: sandbox, in memory, the webhook address, which settings are present" "$(all "$(hasf "$ov0" '"mode":"sandbox"')" "$(hasf "$ov0" '"appSecret":true')" "$(hasf "$ov0" '/api/whatsapp/webhook')" "$(hasf "$ov0" '"store":"memory"')")"
ok "…and never the secrets' values" "$(all "$(hasnt "$ov0" "$SECRET")" "$(hasnt "$ov0" "$TOK")" "$(hasnt "$ov0" "$RKEY")")"
ok "invite validation: a bad kind, a staff invite without an email, and a joiner without a person are all 400" "$(eq "$(who_post priya invite '{"kind":"x","name":"A"}')$(who_post priya invite '{"kind":"staff","name":"A"}')$(who_post priya invite '{"kind":"joiner","name":"A"}')" 400400400)"
ok "a malformed snapshot is rejected" "$(eq "$(who_post priya invite '{"kind":"joiner","name":"Y","personId":"p0","snapshot":{"employee":{}}}')" 400)"

echo "whatsapp: joining, and asking a question"
inv=$(hr_post invite "$(cat "$J/wa-invite-yash.json")")
YCODE=$(field "$inv" code); YID=$(cid "$inv")
ok "an invite returns a one-time code and a wa.me link carrying it" "$(all "$(hasf "$inv" "\"link\":\"https://wa.me/15551234567?text=JOIN%20$YCODE\"")" "$([ ${#YCODE} -eq 6 ] && echo 1 || echo 0)")"
ok "…and shows no phone number yet" "$(eq "$(cphone "$YID")" "")"
post_signed "$(meta_text $YASHP "$(mid)" "JOIN $YCODE")" >/dev/null
ok "writing JOIN <code> from a phone links that phone" "$(waitfor "cstatus $YID" active)"
ok "…the number is shown masked, never in full" "$(all "$(eq "$(cphone "$YID")" "••••1001")" "$(hasnt "$(ov "$YID")" "$YASHP")")"
ok "…and they are welcomed by name" "$(waitmsg "welcome!" "$YID")"
q="$(mid)"; post_signed "$(meta_text $YASHP "$q" "How long does background verification take?")" >/dev/null
ok "a question from the joiner is answered from policy, with its source" "$(all "$(waitmsg '5 to 7 business days' "$YID")" "$(waitmsg 'Source: POL-04' "$YID")")"
c1=$(count '5 to 7 business days' "$(bodies "$YID")")
post_signed "$(meta_text $YASHP "$q" "How long does background verification take?")" >/dev/null; sleep 2
ok "Meta sending the same message again is answered only once" "$(eq "$(count '5 to 7 business days' "$(bodies "$YID")")" "$c1")"
post_signed "$(meta_text $STRANGER "$(mid)" "tell me about Yash Bansal and his status")" >/dev/null
ok "a stranger gets a generic reply" "$(waitmsg "isn't connected" "" "${STRANGER: -4}")"
ok "…with nothing about anyone in it" "$(all "$([ -n "$(said "${STRANGER: -4}")" ] && echo 1 || echo 0)" "$(hasnt "$(said "${STRANGER: -4}")" 'Yash')" "$(hasnt "$(said "${STRANGER: -4}")" 'Engineering')" "$(hasnt "$(said "${STRANGER: -4}")" 'Bengaluru')")"

echo "whatsapp: approvals"
sinv=$(hr_post invite '{"kind":"staff","name":"Karan Shah","email":"karan.shah@acme.com"}'); SCODE=$(field "$sinv" code); SID=$(cid "$sinv")
post_signed "$(meta_text $KARANP "$(mid)" "join $SCODE")" >/dev/null
ok "an approver joins the same way (and inviting them again didn't make a second contact)" "$(all "$(waitfor "cstatus $SID" active)" "$(eq "$(ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print(sum(1 for c in d["contacts"] if c.get("email")=="karan.shah@acme.com"))')" 1)")"
REQ='{"personId":"p0","itemId":"item-1","toEmail":"karan.shah@acme.com","title":"Laptop: Yash Bansal","body":"Approve the engineering laptop?","dept":"Engineering","manager":"Arjun Rao"}'
r1=$(hr_post requests "$REQ"); RID=$(sed -n 's/.*"request":{"id":"\([^"]*\)".*/\1/p' <<<"$r1")
ok "HR asks the approver: it is sent, and recorded as pending" "$(all "$(hasf "$r1" '"ok":true')" "$(hasf "$r1" '"status":"pending"')" "$([ -n "$RID" ] && echo 1 || echo 0)")"
ok "asking again for the same item doesn't send twice" "$(hasf "$(hr_post requests "$REQ")" '"duplicate":true')"
ok "the approver's conversation shows Approve and Reject buttons" "$(hasf "$(buttons "$SID")" "Approve,Reject")"
ok "asking someone who hasn't joined says to invite them" "$(hasf "$(hr_post requests "${REQ/karan.shah/nobody.here}")" '"reason":"not_linked"')"
post_signed "$(meta_button $YASHP "$(mid)" "apr:$RID:y")" >/dev/null; sleep 1.5
ok "someone else tapping Approve changes nothing: it is still pending" "$(eq "$(rstatus "$RID")" pending)"
ok "…and there is nothing to apply" "$(hasf "$(curl -s -b "$J/priya.jar" "$B/api/whatsapp/decisions")" '"decisions":[]')"
post_signed "$(meta_button $KARANP "$(mid)" "apr:$RID:y")" >/dev/null
ok "the approver tapping Approve is recorded" "$(waitfor "rstatus $RID" approved)"
ok "…and the approver is told" "$(waitmsg 'you approved' "$SID")"
dec=$(curl -s -b "$J/priya.jar" "$B/api/whatsapp/decisions")
ok "the decision waits for a browser to apply it, with who decided" "$(all "$(hasf "$dec" "\"id\":\"$RID\"")" "$(hasf "$dec" '"status":"approved"')" "$(hasf "$dec" '"decidedBy":"Karan Shah"')")"
ok "Engineering's head sees it" "$(hasf "$(curl -s -b "$J/vikram.jar" "$B/api/whatsapp/decisions")" "$RID")"
ok "Finance's head doesn't" "$(hasnt "$(curl -s -b "$J/neha.jar" "$B/api/whatsapp/decisions")" "$RID")"
ok "Finance's head can't acknowledge it" "$(hasf "$(curl -s -b "$J/neha.jar" -X POST -H 'Content-Type: application/json' --data "{\"ids\":[\"$RID\"]}" "$B/api/whatsapp/decisions")" '"acked":0')"
ok "acknowledging it once marks it applied" "$(hasf "$(curl -s -b "$J/priya.jar" -X POST -H 'Content-Type: application/json' --data "{\"ids\":[\"$RID\"]}" "$B/api/whatsapp/decisions")" '"acked":1')"
ok "…and it is gone for everyone" "$(hasf "$(curl -s -b "$J/priya.jar" "$B/api/whatsapp/decisions")" '"decisions":[]')"
post_signed "$(meta_button $KARANP "$(mid)" "apr:$RID:n")" >/dev/null
ok "tapping again can't change an answer already given" "$(all "$(waitmsg 'already answered' "$SID")" "$(eq "$(rstatus "$RID")" approved)")"
ok "who may ask: a department head only for their own department" "$(eq "$(who_post vikram requests "${REQ/Engineering/Finance}")" 403)"
ok "…a manager only for their own reports" "$(eq "$(who_post arjun requests "${REQ/Arjun Rao/Someone Else}")" 403)"
ok "…a new joiner never" "$(eq "$(who_post yash requests "$REQ")" 403)"

echo "whatsapp: notifications"
sent=$(hr_post send '{"toEmail":"yash.bansal@gmail.com","title":"Reminder","body":"Please upload your ID.","dept":"Engineering","manager":"Arjun Rao"}')
ok "a notification reaches a joined person, inside the 24-hour window, as a plain message" "$(all "$(hasf "$sent" '"sent":true')" "$(hasf "$sent" '"via":"message"')")"
ok "someone not on WhatsApp is not an error: it says so" "$(hasf "$(hr_post send '{"toEmail":"nobody@x.com","title":"R","body":"b","dept":"Engineering"}')" '"reason":"not_linked"')"
ok "a manager can't notify outside their reports" "$(eq "$(who_post arjun send '{"toEmail":"yash.bansal@gmail.com","title":"R","body":"b","dept":"Engineering","manager":"Other"}')" 403)"
ok "a new joiner can't send notifications" "$(eq "$(who_post yash send '{"toEmail":"yash.bansal@gmail.com","title":"R","body":"b"}')" 403)"

echo "whatsapp: the simulator (trying it with no Meta account)"
SIMP=9197$RANDOM$RANDOM
ok "it needs a message and a plausible number" "$(eq "$(who_post priya simulate '{"phone":"12"}')$(who_post priya simulate "{\"phone\":\"$SIMP\"}")" 400400)"
sv=$(hr_post invite '{"kind":"staff","name":"Sim Person","email":"sim.person@acme.com"}'); SVCODE=$(field "$sv" code); SVID=$(cid "$sv")
j1=$(hr_post simulate "{\"contactId\":\"$SVID\",\"phone\":\"$SIMP\",\"text\":\"JOIN $SVCODE\"}")
ok "pretending to be an invited person writing JOIN <code> links them and shows the welcome, at once" "$(all "$(hasf "$j1" 'connected')" "$(eq "$(cstatus "$SVID")" active)")"
ok "…the reply is recorded as sandbox, never sent to WhatsApp" "$(hasf "$j1" '"mode":"sandbox"')"
ok "HELP gets the approver's help text" "$(hasf "$(hr_post simulate "{\"contactId\":\"$SVID\",\"text\":\"HELP\"}")" 'approval requests')"
hr_post requests '{"personId":"p0","itemId":"sim-1","toEmail":"sim.person@acme.com","title":"Badge: Yash Bansal","body":"Approve the badge?","dept":"Engineering","manager":"Arjun Rao"}' >/dev/null
SRID=$(ov | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((r["id"] for r in d["requests"] if r["title"].startswith("Badge")),""))')
tapd=$(hr_post simulate "{\"contactId\":\"$SVID\",\"buttonId\":\"apr:$SRID:y\",\"buttonTitle\":\"Approve\"}")
ok "tapping Approve in the simulator is a real approval: recorded and confirmed" "$(all "$(hasf "$tapd" 'you approved')" "$(eq "$(rstatus "$SRID")" approved)")"
ok "…and it is waiting for a browser to apply, like any other" "$(hasf "$(curl -s -b "$J/priya.jar" "$B/api/whatsapp/decisions")" "$SRID")"
curl -s -o /dev/null -b "$J/priya.jar" -X POST -H 'Content-Type: application/json' --data "{\"ids\":[\"$SRID\"]}" "$B/api/whatsapp/decisions"
hr_post simulate "{\"contactId\":\"$SVID\",\"text\":\"EXIT\"}" >/dev/null
ok "(clean-up) EXIT in the simulator disconnects them" "$(eq "$(cstatus "$SVID")" invited)"

echo "whatsapp: a number shared with another app"
ok "the routing check needs its key" "$(eq "$(code -X POST -H 'Content-Type: application/json' --data '{"phone":"919810011001"}' "$B/api/whatsapp/route")" 401)"
ok "…and a wrong key is refused" "$(eq "$(code -X POST -H 'Authorization: Bearer nope' -H 'Content-Type: application/json' --data '{"phone":"919810011001"}' "$B/api/whatsapp/route")" 401)"
ok "a joined person's messages belong here" "$(hasf "$(route "$RKEY" "{\"phone\":\"$YASHP\",\"text\":\"hi\"}")" '"handle":true')"
ok "a stranger's messages belong to the other app" "$(hasf "$(route "$RKEY" "{\"phone\":\"$STRANGER\",\"text\":\"hi\"}")" '"handle":false')"
einv=$(hr_post invite '{"kind":"staff","name":"Route Tester","email":"route.tester@acme.com"}'); ECODE=$(field "$einv" code)
rj=$(route "$RKEY" "{\"phone\":\"$NEWP\",\"text\":\"JOIN $ECODE\"}")
ok "JOIN with a valid code belongs here" "$(all "$(hasf "$rj" '"handle":true')" "$(hasf "$rj" '"reason":"join"')")"
ok "…and asking didn't use the code up" "$(hasf "$(route "$RKEY" "{\"phone\":\"$NEWP\",\"text\":\"JOIN $ECODE\"}")" '"handle":true')"
ok "JOIN with a made-up code doesn't" "$(hasf "$(route "$RKEY" "{\"phone\":\"$NEWP\",\"text\":\"JOIN ZZZZZZ\"}")" '"handle":false')"

echo "whatsapp: leaving"
post_signed "$(meta_text $YASHP "$(mid)" EXIT)" >/dev/null
ok "EXIT forgets the number" "$(waitfor "cstatus $YID" invited)"
ok "…so the other app handles that number again" "$(hasf "$(route "$RKEY" "{\"phone\":\"$YASHP\",\"text\":\"hi\"}")" '"handle":false')"
post_signed "$(meta_text $YASHP "$(mid)" "what is my status")" >/dev/null; sleep 1.5
ok "and nothing personal is said to that number afterwards" "$(hasnt "$(said 1001)" 'Government photo ID')"
post_signed "$(meta_text $KARANP "$(mid)" EXIT)" >/dev/null
ok "(clean-up) the approver leaves too, so this can be run again" "$(waitfor "cstatus $SID" invited)"

echo "whatsapp: connect my WhatsApp (the footer QR code)"
ok "signed-out can't make a code" "$(eq "$(code -X POST -H 'Content-Type: application/json' --data '{}' "$B/api/whatsapp/connect")" 401)"
con=$(curl -s -b "$J/priya.jar" -X POST -H 'Content-Type: application/json' --data '{}' "$B/api/whatsapp/connect")
ok "a signed-in approver gets their own code and a link carrying it" "$(all "$(hasf "$con" '"code":"')" "$(hasf "$con" 'wa.me/15551234567?text=JOIN%20')")"
ok "a new joiner can connect with their own record" "$(hasf "$(curl -s -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' --data "$(cat "$J/wa-connect-yash.json")" "$B/api/whatsapp/connect")" '"code":"')"
ok "…but not with someone else's record" "$(eq "$(code -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' --data "$(cat "$J/wa-connect-other.json")" "$B/api/whatsapp/connect")" 403)"
ok "a joiner without a snapshot is a 400" "$(eq "$(code -b "$J/yash.jar" -X POST -H 'Content-Type: application/json' --data '{}' "$B/api/whatsapp/connect")" 400)"

echo "whatsapp: pages"
ok "the QR strip is on the sign-in page" "$(has "$(curl -s "$B/login")" 'Onboarding on WhatsApp')"
ok "…and on every signed-in page, with the connect button" "$(all "$(has "$(page yash /me)" 'Connect my WhatsApp')" "$(has "$(page arjun /tracker)" 'Connect my WhatsApp')" "$(has "$(page priya /ingest)" 'Onboarding on WhatsApp')")"
ok "HR gets the WhatsApp page and its tab" "$(all "$(has "$(page priya /whatsapp)" 'WhatsApp')" "$(has "$(page priya /tracker)" '>WhatsApp<')")"
ok "a manager can't open it, and has no tab" "$(all "$(has "$(page arjun /whatsapp)" 'No access to')" "$(hasnt "$(page arjun /tracker)" '>WhatsApp<')")"
