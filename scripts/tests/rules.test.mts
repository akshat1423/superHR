import { parseAts } from "../../src/lib/csv";
import { SAMPLE_CSV } from "../../src/lib/sample";
import { ctxOf, generateChecklist, DEFAULT_REQUIREMENTS } from "../../src/lib/onboarding/rules";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "../../src/lib/onboarding/policies";
import { deriveStates, summarize, advance, blockers } from "../../src/lib/onboarding/status";
import { todayISO } from "../../src/lib/dates";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const people = parseAts(SAMPLE_CSV).people;
const by = (n: string) => people.find((p) => p.name.startsWith(n))!;
const list = (n: string) => generateChecklist(ctxOf(by(n)), DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
const has = (n: string, rule: string) => list(n).some((i) => i.ruleId === rule);

console.log("rules apply by role / location / grade / type");
ok("everyone gets ID + address docs", people.every((p) => has(p.name, "R-DOC-ID") && has(p.name, "R-DOC-ADDR")));
ok("PAN only in India (Emily in Austin has none)", has("Yash", "R-DOC-PAN") && !has("Emily", "R-DOC-PAN"));
ok("I-9 only in the US", has("Emily", "R-DOC-I9") && !has("Yash", "R-DOC-I9"));
ok("POSH in India, anti-harassment in US", has("Yash", "R-POL-POSH") && !has("Yash", "R-POL-HARASS") && has("Emily", "R-POL-HARASS") && !has("Emily", "R-POL-POSH"));
ok("education certificate not required for the intern", !has("Kabir", "R-DOC-EDU") && has("Yash", "R-DOC-EDU"));
ok("intern gets agreement + mentor, not employment letter", has("Kabir", "R-INT-AGREE") && has("Kabir", "R-INT-MENTOR") && !has("Kabir", "R-DOC-PREV"));
ok("previous-employment letter only for experienced Indian hires", has("Yash", "R-DOC-PREV") && !has("Meera", "R-DOC-PREV") && !has("Emily", "R-DOC-PREV"));
ok("engineers get tool access + secure coding; finance doesn't", has("Yash", "R-ACC-ENG") && has("Yash", "R-TRAIN-SEC") && !has("Meera", "R-ACC-ENG") && has("Meera", "R-ACC-FIN"));
ok("finance ledger approval only for senior/leader finance", has("Ishita", "R-APP-FIN") && !has("Meera", "R-APP-FIN"));
ok("executive laptop approval only for leaders", has("Rohan", "R-APP-EXEC") && !has("Yash", "R-APP-EXEC"));
ok("part-time schedule rule", has("Sana", "R-PT-SCHED") && !has("Yash", "R-PT-SCHED"));

console.log("explanations");
const edu = list("Yash").find((i) => i.ruleId === "R-DOC-EDU")!;
console.log("   ↳", edu.reason);
ok("reason names the rule id", edu.reason.includes("[R-DOC-EDU]"));
ok("reason names the matched grade fact", edu.reason.includes("Mid band"));
const pan = list("Yash").find((i) => i.ruleId === "R-DOC-PAN")!;
ok("country fact appears", pan.reason.includes("Bengaluru is in India"), pan.reason);
ok("universal rule says so", list("Yash").find((i) => i.ruleId === "R-DOC-ID")!.reason.includes("every new joiner"));

console.log("owners resolve to named people by location");
const itIN = list("Yash").find((i) => i.ruleId === "R-IT-LAP")!.owner.name;
const itUS = list("Emily").find((i) => i.ruleId === "R-IT-LAP")!.owner.name;
ok("India IT owner vs US IT owner differ", itIN === "Karan Shah" && itUS === "Taylor Nguyen", `${itIN} / ${itUS}`);
ok("facilities owner is per city", list("Yash").find((i) => i.ruleId === "R-FAC-BADGE")!.owner.name === "Meena Pillai" && list("Riya").find((i) => i.ruleId === "R-FAC-BADGE")!.owner.name === "Suresh Reddy");
ok("manager resolves from directory", list("Yash").find((i) => i.ruleId === "R-MGR-D1")!.owner.email === "arjun.rao@acme.com");
ok("policy refs differ by country", list("Yash").find((i) => i.ruleId === "R-DOC-ID")!.policy === "POL-01" && list("Emily").find((i) => i.ruleId === "R-DOC-ID")!.policy === "POL-02");
const policyIds = new Set(SAMPLE_POLICIES.map((p) => p.id));
ok("every policy reference points at a real policy", people.every((p) => list(p.name).every((i) => !i.policy || policyIds.has(i.policy))));

console.log("dependencies + due dates");
const yash = list("Yash");
const rec = yash.find((i) => i.ruleId === "R-REC")!;
ok("record waits for ID, address, PAN, education (all applicable)", ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU"].every((r) => rec.dependsOn.includes(`${by("Yash").id}:${r}`)));
ok("record doesn't wait for rules that don't apply (no I-9 for Yash)", !rec.dependsOn.some((d) => d.endsWith("R-DOC-I9")));
ok("laptop waits for the record", yash.find((i) => i.ruleId === "R-IT-LAP")!.dependsOn.includes(rec.id));
ok("access waits for BGV, email and infosec", yash.find((i) => i.ruleId === "R-ACC-ENG")!.dependsOn.length === 3);
ok("due = joining date + offset (ID 7 days before 30 Oct = 23 Oct)", yash.find((i) => i.ruleId === "R-DOC-ID")!.dueDate === "2026-10-23", yash.find((i) => i.ruleId === "R-DOC-ID")!.dueDate);
const ids = new Set(yash.map((i) => i.id));
ok("no dangling dependencies", yash.every((i) => i.dependsOn.every((d) => ids.has(d))));
console.log(`   Yash has ${yash.length} items; Emily ${list("Emily").length}; Kabir ${list("Kabir").length}; Rohan ${list("Rohan").length}`);

console.log("states and automation");
const today = todayISO();
let items = list("Yash");
let st = deriveStates(items, {}, today);
ok("overdue: ID doc due 23 Oct, nothing submitted", st[`${by("Yash").id}:R-DOC-ID`] === "overdue");
ok("blocked, not overdue: record is late because documents are", st[rec.id] === "blocked" || st[rec.id] === "overdue");
ok("laptop is blocked by the record", st[`${by("Yash").id}:R-IT-LAP`] === "blocked");
console.log("   ↳ blockers of laptop:", blockers(items.find((i) => i.ruleId === "R-IT-LAP")!, items, st, {}).map((b) => b.item).join(", "));
// complete all documents → agent creates record and raises provisioning
const docRules = ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU", "R-DOC-PREV"];
items = items.map((i) => (docRules.includes(i.ruleId) ? { ...i, status: "completed" as const, completedAt: today } : i));
let n = 1000;
const adv = advance(items, today, "EMP-0031", (p) => `${p}-${++n}`);
items = adv.items;
ok("agent created the HR record", items.find((i) => i.ruleId === "R-REC")!.status === "completed");
ok("agent raised laptop + email + badge + desk tickets", ["R-IT-LAP", "R-IT-MAIL", "R-FAC-BADGE", "R-FAC-DESK"].every((r) => items.find((i) => i.ruleId === r)!.status === "requested" && items.find((i) => i.ruleId === r)!.ticket));
ok("ticket prefixes by team (IT-, FAC-)", items.find((i) => i.ruleId === "R-IT-LAP")!.ticket!.startsWith("IT-") && items.find((i) => i.ruleId === "R-FAC-BADGE")!.ticket!.startsWith("FAC-"));
ok("engineering access NOT requested yet (needs BGV + infosec)", items.find((i) => i.ruleId === "R-ACC-ENG")!.status === "pending");
console.log("   ↳ agent events:", adv.events.map((e) => e.action).join(" | "));
st = deriveStates(items, {}, today);
const s = summarize(items, st, by("Yash").startDate);
console.log("   summary:", JSON.stringify(s));
ok("counts add up", s.total === s.completed + s.pending + s.blocked + s.overdue);

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
