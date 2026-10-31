import { createServer } from "node:http";
import { usePeople } from "../../src/store/people";
import { useOnboarding } from "../../src/store/onboarding";
import { ctxOf } from "../../src/lib/onboarding/rules";
import { deriveStates } from "../../src/lib/onboarding/status";
import { answer, toFacts } from "../../src/lib/onboarding/assistant";
import { todayISO } from "../../src/lib/dates";
import { expectedSignature, handshake, signatureOk } from "../../src/lib/whatsapp/verify";
import { metaPayload, parseWebhook } from "../../src/lib/whatsapp/parse";
import { graphSender, oneLine, toGraphBody, type WaConfig } from "../../src/lib/whatsapp/graph";
import { memoryStore, type WaStore } from "../../src/lib/whatsapp/store";
import { MAX_IN_PER_HOUR, deliver, handleInbound, invite, joinLink, notify, requestApproval, type Deps } from "../../src/lib/whatsapp/service";
import type { Inbound, Outbound, Snapshot } from "../../src/lib/whatsapp/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };

console.log("what we send matches Meta's shapes");
const t = toGraphBody("919810011001", { type: "text", body: "hello" }) as any;
ok("text", t.messaging_product === "whatsapp" && t.to === "919810011001" && t.type === "text" && t.text.body === "hello");
const b = toGraphBody("1", { type: "buttons", body: "Approve?", buttons: [{ id: "a", title: "Approve" }, { id: "b", title: "Reject now please, this is a very long title" }, { id: "c", title: "3" }, { id: "d", title: "4" }] }) as any;
ok("interactive buttons: at most 3, titles cut to 20, reply ids kept", b.type === "interactive" && b.interactive.type === "button" && b.interactive.action.buttons.length === 3 && b.interactive.action.buttons.every((x: any) => x.type === "reply" && x.reply.title.length <= 20) && b.interactive.action.buttons[0].reply.id === "a");
const tp = toGraphBody("1", { type: "template", name: "approval_v1", lang: "en", bodyParams: ["line one\nline two\t  x"], buttonPayloads: ["apr:rq_1:y", "apr:rq_1:n"] }) as any;
ok("template: body parameters without new lines, quick-reply payloads by index", tp.type === "template" && tp.template.name === "approval_v1" && tp.template.language.code === "en" && tp.template.components[0].parameters[0].text === "line one · line two · x" && tp.template.components[2].index === "1" && tp.template.components[2].parameters[0].payload === "apr:rq_1:n");
ok("oneLine turns new lines and tabs into separators and squeezes space runs", oneLine("a\n\nb\t c    d") === "a · b · c d");
ok("long text is cut to WhatsApp's limit", ((toGraphBody("1", { type: "text", body: "x".repeat(5000) }) as any).text.body as string).length === 4096);

console.log("\nis it really Meta?");
const raw = JSON.stringify({ a: 1 });
ok("a correct signature passes", signatureOk(raw, expectedSignature(raw, "s3cret"), "s3cret"));
ok("a tampered body fails", !signatureOk(raw + " ", expectedSignature(raw, "s3cret"), "s3cret"));
ok("the wrong secret fails", !signatureOk(raw, expectedSignature(raw, "other"), "s3cret"));
ok("a missing or short header fails, and so does a missing secret", !signatureOk(raw, null, "s3cret") && !signatureOk(raw, "sha256=abc", "s3cret") && !signatureOk(raw, expectedSignature(raw, "x"), ""));
ok("the handshake echoes the challenge only for our token", handshake(new URLSearchParams("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=777"), "tok").body === "777" && handshake(new URLSearchParams("hub.mode=subscribe&hub.verify_token=bad&hub.challenge=777"), "tok").status === 403 && handshake(new URLSearchParams("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=1"), undefined).status === 403 && handshake(new URLSearchParams("hub.mode=nope"), "tok").status === 400);

console.log("\nwhat arrives is read correctly");
const one = (p: unknown) => parseWebhook(p).messages[0];
ok("plain text", one(metaPayload({ from: "919810011001", id: "m1", text: "hi", name: "Yash" })).text === "hi" && one(metaPayload({ from: "919810011001", id: "m1", text: "hi", name: "Yash" })).name === "Yash");
const bt = one(metaPayload({ from: "9", id: "m2", buttonId: "apr:rq_1:y", buttonTitle: "Approve" }));
ok("an interactive button tap", bt.type === "button" && bt.buttonId === "apr:rq_1:y" && bt.buttonTitle === "Approve");
const tq = one(metaPayload({ from: "9", id: "m3", buttonId: "apr:rq_1:n", buttonTitle: "Reject", template: true }));
ok("a template's quick-reply button (a different shape)", tq.type === "button" && tq.buttonId === "apr:rq_1:n");
ok("a list reply", one({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from: "9", id: "m4", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "x", title: "X" } } }] } }] }] }).buttonId === "x");
ok("media is passed on as unsupported, not dropped", one({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from: "9", id: "m5", type: "image", image: { id: "1" } }] } }] }] }).type === "unsupported");
ok("delivery receipts are read separately", parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "w1", status: "delivered", recipient_id: "9" }] } }] }] }).statuses[0].status === "delivered");
ok("garbage never throws", [null, undefined, 5, "x", [], {}, { object: "other" }, { object: "whatsapp_business_account", entry: "no" }].every((g) => parseWebhook(g).messages.length === 0));
ok("messages without an id or sender are ignored", parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ type: "text", text: { body: "x" } }] } }] }] }).messages.length === 0);

console.log("\nthe Graph API client, against a mock Meta");
const hits: { url: string; auth: string; body: any }[] = [];
const mock = createServer((req, res) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => {
    const body = JSON.parse(s || "{}"); hits.push({ url: req.url!, auth: String(req.headers.authorization), body });
    res.setHeader("content-type", "application/json");
    if (body.to === "BAD") { res.statusCode = 400; res.end(JSON.stringify({ error: { message: "Recipient not in allowed list", code: 131030 } })); return; }
    res.end(JSON.stringify({ messages: [{ id: `wamid.${hits.length}` }] }));
  });
});
await new Promise<void>((r) => mock.listen(0, r));
const base = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
const cfg: WaConfig = { token: "TKN", phoneNumberId: "555", version: "v20.0", base, lang: "en", templates: {} };
const g = graphSender(cfg);
const sent = await g("919810011001", { type: "text", body: "hi" });
ok("it posts to /{version}/{phone-number-id}/messages with the bearer token", sent.ok && sent.mode === "live" && hits[0].url === "/v20.0/555/messages" && hits[0].auth === "Bearer TKN" && hits[0].body.text.body === "hi");
ok("…and returns WhatsApp's message id", sent.ok && sent.waId === "wamid.1");
const bad = await g("BAD", { type: "text", body: "x" });
ok("a refusal comes back with Meta's reason", !bad.ok && bad.error.includes("Recipient not in allowed list") && bad.error.includes("131030"));
const down = await graphSender({ ...cfg, base: "http://127.0.0.1:1" })("1", { type: "text", body: "x" });
ok("an unreachable Meta is reported, not thrown", !down.ok && /Could not reach/.test(down.error));

console.log("\nsetting up: a real joiner and a real approver");
const people = usePeople.getState().people;
const yash = people.find((p) => p.name.startsWith("Yash"))!;
const snapshotOf = (p: typeof yash): Snapshot => {
  const o = useOnboarding.getState(), items = o.items[p.id], states = deriveStates(items, o.docs, todayISO());
  const c = ctxOf(p);
  return { employee: { name: c.name, role: c.role, department: c.department, location: c.location, country: c.country, grade: c.grade, level: c.level, startDate: c.startDate, manager: c.manager }, hr: { name: "Priya Nair", email: "priya.nair@acme.com" }, facts: toFacts(items, states, o.docs), updatedAt: new Date().toISOString() };
};

let clock = new Date("2026-10-31T10:00:00Z");
const sentLog: { to: string; msg: Outbound }[] = [];
let failNext = false;
const mkDeps = (store: WaStore, over: Partial<Deps> = {}): Deps => ({
  store, cfg: { version: "v20.0", base: "x", lang: "en", templates: {} }, now: () => clock,
  send: async (to, msg) => { if (failNext) { failNext = false; return { ok: false, mode: "sandbox", error: "boom" }; } sentLog.push({ to, msg }); return { ok: true, mode: "sandbox", waId: `wamid.t${sentLog.length}` }; },
  answer: (i) => answer(i), ...over,
});
const store = memoryStore();
const d = mkDeps(store);
let mid = 0;
const text = (from: string, body: string): Inbound => ({ id: `in${++mid}`, from, type: "text", text: body, at: clock.toISOString() });
const tap = (from: string, id: string): Inbound => ({ id: `in${++mid}`, from, type: "button", buttonId: id, buttonTitle: "x", at: clock.toISOString() });
const lastTo = (phone: string) => [...sentLog].reverse().find((s) => s.to === phone);
const lastText = (phone: string) => { const m = lastTo(phone)?.msg; return !m ? "" : m.type === "text" ? m.body : m.type === "buttons" ? m.body : m.bodyParams.join(" "); };
const countTo = (phone: string) => sentLog.filter((s) => s.to === phone).length;

const YASH = "919810011001", KARAN = "919810022002", RIYA = "919810033003", STRANGER = "919999999999";
const inv = await invite(d, { kind: "joiner", name: yash.name, email: yash.email, personId: yash.id, dept: yash.persona.dept, manager: yash.manager, createdBy: "Priya Nair" });
await store.saveContact({ ...inv, snapshot: snapshotOf(yash) });
const kinv = await invite(d, { kind: "staff", name: "Karan Shah", email: "karan.shah@acme.com", createdBy: "Priya Nair" });
const rinv = await invite(d, { kind: "staff", name: "Riya Verma", email: "riya.verma@acme.com", createdBy: "Priya Nair" });

console.log("\ninviting the same person twice");
const dupA = await invite(d, { kind: "staff", name: "Dana Dup", email: "dana.dup@acme.com", createdBy: "Priya Nair" });
const dupB = await invite(d, { kind: "staff", name: "Dana Dup", email: "Dana.Dup@acme.com", createdBy: "Priya Nair" });
ok("an approver invited twice is still one contact, with a fresh code", dupA.id === dupB.id && dupA.inviteCode !== dupB.inviteCode && (await store.listContacts()).filter((c) => c.email?.toLowerCase() === "dana.dup@acme.com").length === 1);
const dupC1 = await invite(d, { kind: "joiner", name: "Joe Dup", email: "joe.dup@x.com", personId: "pDup", createdBy: "Priya Nair" });
const dupC2 = await invite(d, { kind: "joiner", name: "Joe Dup", email: "joe.dup@x.com", personId: "pDup", createdBy: "Priya Nair" });
ok("…and so is a joiner invited twice", dupC1.id === dupC2.id && (await store.listContacts()).filter((c) => c.personId === "pDup").length === 1);
ok("the older code stops working once a new one is made", (await store.contactByCode(dupA.inviteCode!)) === null);
console.log("\njoining");
ok("an invite has a code, an expiry and no number yet", /^[A-Z2-9]{6}$/.test(inv.inviteCode!) && !!inv.inviteExpiresAt && !inv.phone && inv.status === "invited");
ok("the join link carries the code (when a business number is set)", joinLink({ ...d.cfg, displayNumber: "15551234567" }, inv.inviteCode!) === `https://wa.me/15551234567?text=JOIN%20${inv.inviteCode}` && joinLink(d.cfg, inv.inviteCode!) === null);
await handleInbound(d, text(STRANGER, "JOIN ZZZZZZ"));
ok("a wrong code is refused", /isn't valid/.test(lastText(STRANGER)));
ok("…and nothing is linked", (await store.contactByPhone(STRANGER)) === null);
await handleInbound(d, text(YASH, `join ${inv.inviteCode!.toLowerCase()}`));
const yc = await store.contactByPhone(YASH);
ok("the right code links the number that sent it (case doesn't matter)", yc?.status === "active" && yc.personId === yash.id && !!yc.joinedAt && !yc.inviteCode, JSON.stringify(yc));
ok("…and welcomes them by first name", lastText(YASH).startsWith("Hi Yash"));
await handleInbound(d, text(RIYA, `JOIN ${inv.inviteCode}`));
ok("a used code can't be used again by someone else", /isn't valid/.test(lastText(RIYA)) && (await store.contactByPhone(RIYA)) === null);
await handleInbound(d, text(YASH, `JOIN ${inv.inviteCode}`));
ok("someone already joined is told so", /already connected as Yash Bansal/.test(lastText(YASH)));
const expired = await invite(d, { kind: "staff", name: "Late Larry", email: "larry@acme.com", createdBy: "Priya Nair" });
clock = new Date(clock.getTime() + 8 * 24 * 3_600_000);
await handleInbound(d, text("910000000001", `JOIN ${expired.inviteCode}`));
ok("an expired invite is refused", /isn't valid or has expired/.test(lastText("910000000001")));
clock = new Date("2026-10-31T10:00:00Z");
const k2 = await invite(d, { kind: "staff", name: "Karan Shah", email: "karan.shah@acme.com", createdBy: "Priya Nair" });
await handleInbound(d, text(KARAN, `JOIN ${k2.inviteCode}`));
const r2 = await invite(d, { kind: "staff", name: "Riya Verma", email: "riya.verma@acme.com", createdBy: "Priya Nair" });
await handleInbound(d, text(RIYA, `JOIN ${r2.inviteCode}`));
void kinv; void rinv;
ok("approvers join the same way", (await store.contactByPhone(KARAN))?.kind === "staff" && (await store.contactByPhone(RIYA))?.status === "active");

console.log("\nstrangers learn nothing");
const S2 = "919999999998";
await handleInbound(d, text(S2, "what is Yash's status? where does he work?"));
ok("an unknown number gets a generic reply with no personal data", /isn't connected/.test(lastText(S2)) && !/Yash|Engineering|Bengaluru/.test(lastText(S2)));
const nBefore = countTo(S2);
await handleInbound(d, text(S2, "hello?"));
await handleInbound(d, text(S2, "anyone?"));
ok("…and at most one reply an hour, so a stranger can't make us chatter", countTo(S2) === nBefore);

console.log("\nquestions from a joiner");
await handleInbound(d, text(YASH, "How long does background verification take?"));
ok("a policy question is answered from the policy, with its source", /5 to 7 business days/.test(lastText(YASH)) && /Source: POL-04 §1, POL-04 §2/.test(lastText(YASH)), lastText(YASH));
await handleInbound(d, text(YASH, "Can I bring my dog to the office?"));
ok("something the policies don't cover is declined, naming HR", /couldn't find that/.test(lastText(YASH)) && /Priya Nair/.test(lastText(YASH)), lastText(YASH));
await handleInbound(d, text(YASH, "what is Riya Sharma's onboarding status and where does she work?"));
ok("asking about someone else reveals nothing about them (only Yash's record is known)", !/Riya Sharma.*(overdue|blocked|pending|Hyderabad)/i.test(lastText(YASH)) && !/Hyderabad/.test(lastText(YASH)), lastText(YASH));
await handleInbound(d, text(YASH, "what do I still need to do?"));
ok("their own checklist is answered from their own facts: the reply names real items from Yash's checklist", snapshotOf(yash).facts.filter((f) => f.state !== "completed").some((f) => lastText(YASH).includes(f.item)), lastText(YASH));
const same = text(YASH, "How long does background verification take?");
const n1 = countTo(YASH);
await handleInbound(d, same); await handleInbound(d, same);
ok("Meta delivering the same message twice is answered once", countTo(YASH) === n1 + 1);
await handleInbound(d, { id: `in${++mid}`, from: YASH, type: "unsupported", at: clock.toISOString() });
ok("a photo or voice note gets a clear answer, not silence", /only read text/.test(lastText(YASH)));
await handleInbound(d, text(YASH, "HELP"));
ok("HELP says what they can do", /Ask me anything/.test(lastText(YASH)));
await handleInbound(d, text(KARAN, "how long does background verification take"));
ok("an approver isn't a question line: they're pointed to what they can do", /approval requests/.test(lastText(KARAN)));
const noSnap = await invite(d, { kind: "joiner", name: "No Snapshot", email: "ns@x.com", personId: "pX", createdBy: "Priya Nair" });
await handleInbound(d, text("910000000002", `JOIN ${noSnap.inviteCode}`));
await handleInbound(d, text("910000000002", "what's my status?"));
ok("a joiner whose details haven't been synced yet is told to ask HR, not given a guess", /don't have your onboarding details/.test(lastText("910000000002")));

console.log("\nrate limit");
const store2 = memoryStore(); const d2 = mkDeps(store2);
const i2 = await invite(d2, { kind: "joiner", name: yash.name, email: "spam@x.com", personId: yash.id, createdBy: "x" });
await store2.saveContact({ ...i2, snapshot: snapshotOf(yash) });
await handleInbound(d2, text("910000000003", `JOIN ${i2.inviteCode}`));
const before = sentLog.length;
for (let i = 0; i < MAX_IN_PER_HOUR + 12; i++) await handleInbound(d2, text("910000000003", `question number ${i} about policy`));
const answered = sentLog.length - before;
ok("past the hourly cap we stop spending on them: far fewer replies than messages, and one polite pause", answered <= MAX_IN_PER_HOUR + 2 && sentLog.some((s) => s.to === "910000000003" && s.msg.type === "text" && /pausing/.test(s.msg.body)), String(answered));

console.log("\nstopping and starting");
await handleInbound(d, text(YASH, "STOP"));
ok("STOP turns messages off", (await store.contactByPhone(YASH))?.status === "opted_out" && /won't get any more/.test(lastText(YASH)));
const dlv = await notify(d, (await store.contactByPhone(YASH))!, "Reminder", "Upload your ID");
ok("…and nothing more is sent to them", !dlv.ok && dlv.via === "blocked" && /opted out/.test((dlv as any).error));
await handleInbound(d, text(YASH, "hello"));
ok("they get one line saying how to come back", /Reply START/.test(lastText(YASH)));
await handleInbound(d, text(YASH, "START"));
ok("START turns them back on", (await store.contactByPhone(YASH))?.status === "active" && /Messages are on again/.test(lastText(YASH)));

console.log("\nnotifications and the 24-hour window");
const yc2 = (await store.contactByPhone(YASH))!;
const inWin = await notify(d, yc2, "Document reminder", "Your PAN card is due.");
ok("inside 24 hours a notification is sent as a normal message", inWin.ok && inWin.via === "message" && lastText(YASH).startsWith("*Document reminder*"));
clock = new Date(clock.getTime() + 25 * 3_600_000);
const late = await notify(d, (await store.contactByPhone(YASH))!, "Document reminder", "Your PAN card is due.\nPlease upload it.");
const lt = lastTo(YASH)!.msg;
ok("after 24 hours WhatsApp requires a template: sent as one, with the text as its parameter", late.ok && late.via === "template" && lt.type === "template" && lt.name === "superjoin_notify" && lt.bodyParams[0].includes("PAN card"));
const live = mkDeps(store, { cfg: { token: "t", phoneNumberId: "1", version: "v20.0", base: "x", lang: "en", templates: {} } });
const blocked = await notify(live, (await store.contactByPhone(YASH))!, "Reminder", "x");
ok("live with no template configured: it is not sent, and the reason is clear", !blocked.ok && blocked.via === "blocked" && /WHATSAPP_TEMPLATE_NOTIFY/.test((blocked as any).error) && /24 hours/.test((blocked as any).error));
const withTpl = mkDeps(store, { cfg: { token: "t", phoneNumberId: "1", version: "v20.0", base: "x", lang: "en", templates: { notify: "my_notify_v2", approval: "my_approval_v2" } } });
const viaTpl = await notify(withTpl, (await store.contactByPhone(YASH))!, "Reminder", "x");
ok("live with a template configured: that template is used", viaTpl.ok && viaTpl.via === "template" && (lastTo(YASH)!.msg as any).name === "my_notify_v2");
await handleInbound(d, text(YASH, "hi"));
ok("when they write back the window opens again", ((await notify(d, (await store.contactByPhone(YASH))!, "Reminder", "y")) as any).via === "message");

console.log("\napprovals");
clock = new Date("2026-10-31T12:00:00Z");
await handleInbound(d, text(KARAN, "hi"));
await handleInbound(d, text(RIYA, "hi"));
const ask = (over: Partial<Parameters<typeof requestApproval>[1]> = {}) => requestApproval(d, { personId: yash.id, itemId: "item-1", toEmail: "karan.shah@acme.com", title: "Laptop for Yash Bansal", body: "Yash joins on 30 Oct. Approve the engineering laptop?", dept: "Engineering", manager: "Arjun Rao", createdBy: "Priya Nair", ...over });
const a1 = await ask();
const am = lastTo(KARAN)!.msg;
ok("a request goes to the approver as Approve and Reject buttons, with a code", a1.ok && am.type === "buttons" && am.buttons.map((x) => x.title).join() === "Approve,Reject" && am.buttons[0].id === `apr:${a1.request.id}:y` && am.body.includes(`APPROVE ${a1.request.code}`));
ok("…recorded as pending, to that number, expiring in 72 hours", a1.ok && a1.request.status === "pending" && a1.request.toPhone === KARAN && Date.parse(a1.request.expiresAt) - clock.getTime() === 72 * 3_600_000);
const dupe = await ask();
ok("asking twice for the same item doesn't send twice", dupe.ok && dupe.duplicate === true && dupe.request.id === (a1.ok ? a1.request.id : "") && sentLog.filter((s) => s.to === KARAN && s.msg.type === "buttons").length === 1);
const nl = await ask({ toEmail: "nobody@acme.com" });
ok("someone who hasn't joined can't be asked, and the reason says to invite them", !nl.ok && nl.reason === "not_linked" && /Invite/.test(nl.detail));

const reqId = a1.ok ? a1.request.id : "";
await handleInbound(d, tap(RIYA, `apr:${reqId}:y`));
ok("someone else tapping the button changes nothing and learns nothing about it", /wasn't sent to you/.test(lastText(RIYA)) && (await store.getRequest(reqId))?.status === "pending" && !/Laptop|Yash/.test(lastText(RIYA)));
await handleInbound(d, tap(STRANGER, `apr:${reqId}:y`));
ok("an unknown number can't decide either", (await store.getRequest(reqId))?.status === "pending");
await handleInbound(d, tap(KARAN, "apr:rq_doesnotexist:y"));
ok("a made-up request id is refused", /no longer exists/.test(lastText(KARAN)));
await handleInbound(d, tap(KARAN, "garbage"));
ok("a malformed button is refused", /no longer valid/.test(lastText(KARAN)));
const both = await Promise.all([handleInbound(d, tap(KARAN, `apr:${reqId}:y`)), handleInbound(d, tap(KARAN, `apr:${reqId}:n`))]);
void both;
const decided = await store.getRequest(reqId);
ok("two taps at once: exactly one wins and the answer is whichever recorded first", (decided?.status === "approved" || decided?.status === "rejected") && decided.decidedByPhone === KARAN);
const recorded = sentLog.filter((s) => s.to === KARAN && s.msg.type === "text" && /^Recorded:/.test(s.msg.body)).length;
ok("…and only one 'Recorded' went back (the other got 'already answered')", recorded === 1 && sentLog.some((s) => s.to === KARAN && s.msg.type === "text" && /already answered/.test(s.msg.body)));
await handleInbound(d, tap(KARAN, `apr:${reqId}:n`));
ok("tapping again after the answer can't change it", (await store.getRequest(reqId))?.status === decided?.status && /already answered/.test(lastText(KARAN)));
ok("the decision waits to be applied by the app, once", (await store.decidedUnapplied()).some((r) => r.id === reqId));
await store.markApplied([reqId]);
ok("…and is gone from that list once applied", !(await store.decidedUnapplied()).some((r) => r.id === reqId));

const a2 = await ask({ itemId: "item-2", title: "Ledger access", body: "Approve?" });
await handleInbound(d, tap(KARAN, `apr:${a2.ok ? a2.request.id : ""}:n`));
ok("Reject is recorded as rejected", (await store.getRequest(a2.ok ? a2.request.id : ""))?.status === "rejected" && /you rejected "Ledger access"/.test(lastText(KARAN)));

const a3 = await ask({ itemId: "item-3", title: "Badge", body: "Approve?" });
await handleInbound(d, text(KARAN, "approve"));
ok("typing APPROVE works when exactly one request is waiting", (await store.getRequest(a3.ok ? a3.request.id : ""))?.status === "approved");
const a4 = await ask({ itemId: "item-4", title: "Desk", body: "Approve?" });
const a5 = await ask({ itemId: "item-5", title: "Card", body: "Approve?" });
await handleInbound(d, text(KARAN, "yes"));
ok("with two waiting, a bare YES doesn't guess: it lists the codes", /2 requests are waiting/.test(lastText(KARAN)) && a4.ok && lastText(KARAN).includes(a4.request.code) && (await store.getRequest(a4.ok ? a4.request.id : ""))?.status === "pending");
await handleInbound(d, text(KARAN, `reject ${a5.ok ? a5.request.code.toLowerCase() : ""}`));
ok("…and the code picks one", (await store.getRequest(a5.ok ? a5.request.id : ""))?.status === "rejected" && (await store.getRequest(a4.ok ? a4.request.id : ""))?.status === "pending");
await handleInbound(d, text(KARAN, "approve ZZZZ"));
ok("a code nothing matches is said so", /No waiting request has the code ZZZZ/.test(lastText(KARAN)));
await handleInbound(d, text(RIYA, "approve"));
ok("an approver with nothing waiting is told so (she can't approve Karan's)", /Nothing is waiting/.test(lastText(RIYA)) && (await store.getRequest(a4.ok ? a4.request.id : ""))?.status === "pending");
await handleInbound(d, text(YASH, "approve"));
ok("a joiner typing APPROVE is just asking a question: nothing is approved", (await store.getRequest(a4.ok ? a4.request.id : ""))?.status === "pending");

clock = new Date(clock.getTime() + 73 * 3_600_000);
await handleInbound(d, tap(KARAN, `apr:${a4.ok ? a4.request.id : ""}:y`));
ok("after 72 hours a request can no longer be answered", (await store.getRequest(a4.ok ? a4.request.id : ""))?.status === "expired" && /expired/.test(lastText(KARAN)));

clock = new Date("2026-11-05T09:00:00Z");
const outside = await ask({ itemId: "item-6", title: "Monitor", body: "Approve?" });
const om = lastTo(KARAN)!.msg;
ok("to someone who hasn't written for over 24 hours the request goes as a template with the buttons' payloads", outside.ok && outside.delivery.ok && (outside.delivery as any).via === "template" && om.type === "template" && om.buttonPayloads?.[0] === `apr:${outside.ok ? outside.request.id : ""}:y`);
await handleInbound(d, { id: `in${++mid}`, from: KARAN, type: "button", buttonId: `apr:${outside.ok ? outside.request.id : ""}:y`, buttonTitle: "Approve", at: clock.toISOString() });
ok("…and tapping the template's quick-reply approves it", (await store.getRequest(outside.ok ? outside.request.id : ""))?.status === "approved");

failNext = true;
const failed = await ask({ itemId: "item-7", title: "Dock", body: "Approve?" });
ok("if WhatsApp refuses to send, the request is not left hanging as pending", !failed.ok && failed.reason === "send_failed" && failed.request?.status === "expired" && (await store.pendingFor(KARAN, clock.toISOString())).every((r) => r.itemId !== "item-7"));

console.log("\nthe log");
const log = await store.recentMessages(500);
ok("every message in and out is recorded, with its mode", log.some((m) => m.direction === "in") && log.some((m) => m.direction === "out") && log.every((m) => m.mode === "sandbox" || m.mode === "live"));
ok("buttons are kept on the logged message so the simulator can show them", log.some((m) => m.kind === "approval" && Array.isArray((m.meta as any)?.buttons)));
ok("a blocked send is logged with its reason", (await store.recentMessages(500)).some((m) => m.status === "blocked" && /WHATSAPP_TEMPLATE/.test(String((m.meta as any)?.error))));
void deliver;

console.log("\napplying answers given on WhatsApp to the checklist");
const { applyDecisions } = await import("../../src/lib/whatsapp/apply");
const { useOutbox } = await import("../../src/store/outbox");
const items0 = useOnboarding.getState().items[yash.id];
const live0 = (id: string) => useOnboarding.getState().items[yash.id].find((i) => i.id === id);
const actionable = items0.filter((i) => ["activity", "approval"].includes(i.kind) && i.status !== "completed");
const isDone = (id: string) => items0.find((i) => i.id === id)?.status === "completed";
const readyItems = actionable.filter((i) => i.dependsOn.every(isDone));
const waitingItem = items0.find((i) => ["activity", "approval", "provision"].includes(i.kind) && i.status !== "completed" && i.dependsOn.some((x) => !isDone(x)));
ok("the sample data has items to approve, reject, and one that waits on another", readyItems.length >= 2 && !!waitingItem, `${readyItems.length} ready, waiting: ${!!waitingItem}`);
const dec = (item: { id: string }, status: "approved" | "rejected", id = `rq_${item.id}`) => ({ id, personId: yash.id, itemId: item.id, status, title: "Test request", decidedBy: "Karan Shah" });
const auditOf = (action: string) => useOnboarding.getState().audit.filter((x) => x.personId === yash.id && x.action === action);

const ap = applyDecisions([dec(readyItems[0], "approved")]);
ok("an approval completes the item", live0(readyItems[0].id)?.status === "completed" && ap.ack.length === 1);
ok("…recorded as the approver, with 'via WhatsApp' on the audit trail", useOnboarding.getState().audit.some((x) => x.personId === yash.id && x.actor === "Karan Shah (via WhatsApp)" && x.detail?.includes(readyItems[0].item)));
ok("…and says so", ap.notes[0] === 'Karan Shah approved "Test request" on WhatsApp');
const rj = applyDecisions([dec(readyItems[1], "rejected")]);
ok("a rejection does not complete anything", live0(readyItems[1].id)?.status !== "completed" && rj.ack.length === 1 && auditOf("Rejected on WhatsApp").length === 1);
const wt = applyDecisions([dec(waitingItem!, "approved")]);
ok("approving something that is still waiting on another item doesn't force it through", live0(waitingItem!.id)?.status !== "completed");
ok("…but the approval isn't lost: it is on the audit trail with the reason, and acknowledged", auditOf("Approved on WhatsApp, not completed").some((x) => /Waiting on/.test(x.detail ?? "")) && wt.ack.length === 1 && /can't be completed yet/.test(wt.notes[0]));
const auditBefore = useOnboarding.getState().audit.length;
const again = applyDecisions([dec(readyItems[0], "approved", "rq_again")]);
ok("an item already complete is acknowledged quietly, with no second audit entry", again.ack.includes("rq_again") && again.notes.length === 0 && useOnboarding.getState().audit.length === auditBefore);
const other = applyDecisions([{ ...dec(readyItems[0], "approved", "rq_x"), personId: "nobody-here" }, { ...dec(readyItems[0], "approved", "rq_y"), itemId: "no-such-item" }]);
ok("a decision about someone (or something) this browser doesn't hold is left for a browser that does", other.ack.length === 0 && other.notes.length === 0);
ok("several at once are each handled", applyDecisions([dec(actionable.find((i) => i.id !== readyItems[0].id && i.id !== readyItems[1].id && i.id !== waitingItem!.id && i.dependsOn.every(isDone)) ?? readyItems[1], "rejected", "rq_multi1"), dec(readyItems[1], "rejected", "rq_multi2")]).ack.length === 2);

console.log("\nWhatsApp alongside email in the outbox");
const realFetch = globalThis.fetch;
const wa: { url: string; body: any }[] = [];
let waAnswer: unknown = { sent: true, via: "message" };
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  if (String(url).includes("/api/whatsapp/send")) { wa.push({ url: String(url), body: JSON.parse(init!.body!) }); return new Response(JSON.stringify(waAnswer), { status: 200 }); }
  return new Response(JSON.stringify({ mode: "preview", note: "no provider" }), { status: 200 });
}) as typeof fetch;
const draft = { kind: "nudge" as const, level: 0 as const, to: { name: yash.name, email: yash.email, label: "Employee" }, subject: "Please upload your ID", text: "Hi Yash,\nplease upload your ID.", html: "<p>x</p>", personId: yash.id, stepId: "s1", stepTitle: "ID" };
await useOutbox.getState().send(draft, "Priya Nair");
await new Promise((r) => setTimeout(r, 30));
ok("an email also goes to WhatsApp, to the same person, with the person's department and manager so the server can check scope", wa.length === 1 && wa[0].body.toEmail === yash.email && wa[0].body.dept === yash.persona.dept && wa[0].body.manager === yash.manager && wa[0].body.title === "Please upload your ID" && wa[0].body.body.includes("please upload your ID"));
ok("…and the outbox says it also went to WhatsApp", /also sent on WhatsApp/.test(useOutbox.getState().emails[0].note ?? ""));
waAnswer = { sent: false, reason: "not_linked" };
await useOutbox.getState().send({ ...draft, stepId: "s2" }, "Priya Nair");
await new Promise((r) => setTimeout(r, 30));
ok("someone not on WhatsApp costs nothing: no note, no error, the email result stands", !/WhatsApp/.test(useOutbox.getState().emails[0].note ?? "") && useOutbox.getState().emails[0].status === "preview");
const waBefore = wa.length;
await useOutbox.getState().send({ ...draft, personId: "unknown-person", stepId: "s3" }, "Priya Nair");
await new Promise((r) => setTimeout(r, 30));
ok("a message about someone this browser doesn't know isn't sent to WhatsApp (the server couldn't check its scope)", wa.length === waBefore);
globalThis.fetch = (async (url: string) => { if (String(url).includes("/api/whatsapp/")) throw new Error("network down"); return new Response(JSON.stringify({ mode: "sent" }), { status: 200 }); }) as typeof fetch;
const st = await useOutbox.getState().send({ ...draft, stepId: "s4" }, "Priya Nair");
await new Promise((r) => setTimeout(r, 30));
ok("if WhatsApp is unreachable the email is still reported as sent", st === "sent" && useOutbox.getState().emails[0].status === "sent");
globalThis.fetch = realFetch;

mock.close();
console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
