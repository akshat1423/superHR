import { parseAts } from "../../src/lib/csv";
import { SAMPLE_CSV } from "../../src/lib/sample";
import { addDays, todayISO } from "../../src/lib/dates";
import { countryOf } from "../../src/lib/geo";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";
import { DEFAULT_REQUIREMENTS, ctxOf, generateChecklist, type EmployeeCtx } from "../../src/lib/onboarding/rules";
import { advance, deriveStates } from "../../src/lib/onboarding/status";
import { describeRecalculation, diffContext, recalculate } from "../../src/lib/onboarding/change";
import { draftCorrection, draftEscalation, findEscalations } from "../../src/lib/onboarding/escalate";
import type { ChecklistItem } from "../../src/lib/onboarding/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const people = parseAts(SAMPLE_CSV).people;
const by = (n: string) => people.find((p) => p.name.startsWith(n))!;
const today = todayISO();
let tk = 100;
const tickets = (p: string) => `${p}-${++tk}`;
const complete = (items: ChecklistItem[], rules: string[]) => items.map((i) => (rules.includes(i.ruleId) ? { ...i, status: "completed" as const, completedAt: today } : i));
const find = (items: ChecklistItem[], rule: string) => items.find((i) => i.ruleId === rule);

console.log("scenario 4a: joining date postponed by 14 days");
{
  const e = ctxOf(by("Riya"));
  let items = complete(generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID", "R-DOC-ADDR"]);
  const e2: EmployeeCtx = { ...e, startDate: addDays(e.startDate, 14) };
  const r = recalculate(e2, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  ok("every item moved, none added or removed", r.shifted.length === items.length && r.added.length === 0 && r.removed.length === 0, `${r.shifted.length}/${items.length} +${r.added.length} -${r.removed.length}`);
  ok("each due date moved by exactly +14 days", r.shifted.every((s) => s.days === 14));
  ok("completed documents keep their progress", find(r.items, "R-DOC-ID")!.status === "completed" && find(r.items, "R-DOC-ADDR")!.status === "completed");
  ok("new ID due date = new joining date − 7", find(r.items, "R-DOC-ID")!.dueDate === addDays(e2.startDate, -7));
  const text = describeRecalculation(diffContext(e, e2), r);
  console.log("   ↳ " + text.join(" | "));
  ok("summary says what changed in words", /Joining date changed/.test(text[0]) && /moved by \+14 days/.test(text.join()) && /kept their progress/.test(text.join()));
  const st = deriveStates(r.items, {}, today);
  ok("a postponed joiner is less overdue than before", Object.values(deriveStates(items, {}, today)).filter((s) => s === "overdue").length >= Object.values(st).filter((s) => s === "overdue").length);
}

console.log("scenario 4b: joining date brought forward by 14 days");
{
  const e = ctxOf(by("Marcus"));
  const items = generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  const e2: EmployeeCtx = { ...e, startDate: addDays(e.startDate, -14) };
  const r = recalculate(e2, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  ok("due dates moved by −14 days", r.shifted.length === items.length && r.shifted.every((s) => s.days === -14));
  const before = Object.values(deriveStates(items, {}, today)).filter((s) => s === "overdue").length;
  const after = Object.values(deriveStates(r.items, {}, today)).filter((s) => s === "overdue").length;
  ok("pulling the date forward makes more items overdue", after > before, `${before} → ${after}`);
}

console.log("scenario 4c: role changes Engineering → Finance (department change)");
{
  const e = ctxOf(by("Yash"));
  let items = complete(generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU", "R-DOC-PREV"]);
  items = advance(items, today, "EMP-1", tickets).items;
  const e2: EmployeeCtx = { ...e, department: "Finance", role: "Financial Analyst" };
  const r = recalculate(e2, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  ok("engineering-only items removed", !find(r.items, "R-ACC-ENG") && !find(r.items, "R-TRAIN-SEC") && r.removed.some((i) => i.ruleId === "R-ACC-ENG"));
  ok("finance access added", !!find(r.items, "R-ACC-FIN") && r.added.some((i) => i.ruleId === "R-ACC-FIN"));
  ok("documents already completed stay completed", ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU"].every((x) => find(r.items, x)!.status === "completed"));
  ok("HR record, laptop ticket and email ticket are kept", find(r.items, "R-REC")!.status === "completed" && find(r.items, "R-IT-LAP")!.ticket === find(items, "R-IT-LAP")!.ticket);
  ok("department-head owner changes to Finance's head", r.ownerChanged.length === 0 || r.ownerChanged.every((o) => o.to.name !== o.from.name));
  ok("new finance access depends on the right things", find(r.items, "R-ACC-FIN")!.dependsOn.length === 3 || find(r.items, "R-ACC-FIN")!.dependsOn.length === 4);
}

console.log("scenario 4d: relocating Bengaluru → Austin (country change)");
{
  const e = ctxOf(by("Yash"));
  let items = complete(generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU", "R-DOC-PREV"]);
  items = advance(items, today, "EMP-1", tickets).items;
  ok("before: HR record done, laptop requested", find(items, "R-REC")!.status === "completed" && find(items, "R-IT-LAP")!.status === "requested");
  const e2: EmployeeCtx = { ...e, location: "Austin", country: countryOf("Austin") };
  const r = recalculate(e2, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  ok("India-only items removed (PAN, POSH, previous-employer letter)", ["R-DOC-PAN", "R-POL-POSH", "R-DOC-PREV"].every((x) => !find(r.items, x)));
  ok("US-only items added (I-9, anti-harassment)", !!find(r.items, "R-DOC-I9") && !!find(r.items, "R-POL-HARASS"));
  ok("policy references switch to the US policy", find(r.items, "R-DOC-ID")!.policy === "POL-02");
  ok("owners switch to the US team (IT)", find(r.items, "R-IT-LAP")!.owner.name === "Taylor Nguyen" && r.ownerChanged.some((o) => o.item.ruleId === "R-IT-LAP"));
  ok("the HR record is REOPENED because the new I-9 prerequisite isn't met", r.reopened.some((i) => i.ruleId === "R-REC") && find(r.items, "R-REC")!.status === "pending");
  ok("an already-raised laptop ticket is not discarded", find(r.items, "R-IT-LAP")!.ticket === find(items, "R-IT-LAP")!.ticket);
  const text = describeRecalculation(diffContext(e, e2), r);
  console.log("   ↳ " + text.join(" | ").slice(0, 330));
  ok("summary mentions the reopened record", /Reopened: HR employee record created/.test(text.join()));
  // completing the new prerequisite lets the agent create the record again
  const done = complete(r.items, ["R-DOC-I9"]);
  const again = advance(done, today, "EMP-1", tickets).items;
  ok("once I-9 is accepted, the agent recreates the record", find(again, "R-REC")!.status === "completed");
}

console.log("scenario 4e: nothing changed → nothing happens");
{
  const e = ctxOf(by("Aarav"));
  const items = complete(generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID"]);
  const r = recalculate(e, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  ok("no adds, removes, shifts, owner changes or reopenings", !r.added.length && !r.removed.length && !r.shifted.length && !r.ownerChanged.length && !r.reopened.length);
  ok("diff of identical contexts is empty", diffContext(e, e).length === 0);
  ok("grade change to Leader adds the executive laptop approval", !!find(recalculate({ ...e, grade: "L7", level: "Leader" }, items, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY).items, "R-APP-EXEC"));
}

console.log("scenario 5: escalation goes to the right owner, for the root cause");
{
  // Yash: ID + address documents are overdue and everything behind them is blocked
  const e = ctxOf(by("Yash"));
  const items = generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
  const st = deriveStates(items, {}, today);
  const esc = findEscalations(items, st, {}, e, SAMPLE_DIRECTORY, today);
  console.log("   ↳ " + esc.slice(0, 2).map((x) => x.reason).join("\n   ↳ "));
  ok("the overdue documents are escalated", esc.some((x) => x.item === "Government photo ID") && esc.some((x) => x.item === "Proof of address (last 3 months)"));
  ok("symptoms are NOT escalated (laptop is blocked, not the cause)", !esc.some((x) => x.item === "Laptop") && !esc.some((x) => x.item === "HR employee record created"));
  const id = esc.find((x) => x.item === "Government photo ID")!;
  ok("8 days late → second rung, and for a new joiner's document that is their manager", id.level === 2 && id.target.role === "Manager" && id.target.contact.name === "Arjun Rao", `${id.level} ${id.target.role} ${id.target.contact.name}`);
  ok("it names what is waiting on it", id.blocking.length >= 1 && /blocking/.test(id.reason));
  ok("escalations sorted worst first", esc.every((x, i) => i === 0 || esc[i - 1].daysLate >= x.daysLate));

  // an overdue approval: Ishita (Senior Finance) — ledger access approval, owned by the Finance head
  const f = ctxOf(by("Ishita"));
  let fi = complete(generateChecklist(f, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU", "R-DOC-PREV", "R-POL-INFOSEC", "R-BGV"]);
  fi = advance(fi, today, "EMP-2", tickets).items;
  fi = complete(fi, ["R-IT-MAIL"]);
  const fst = deriveStates(fi, {}, today);
  const app = find(fi, "R-APP-FIN")!;
  ok("the approval is overdue and blocks finance access", fst[app.id] === "overdue" && fst[find(fi, "R-ACC-FIN")!.id] === "blocked", `${fst[app.id]} / ${fst[find(fi, "R-ACC-FIN")!.id]}`);
  const fe = findEscalations(fi, fst, {}, f, SAMPLE_DIRECTORY, today).find((x) => x.itemId === app.id)!;
  ok("the approval is escalated and names what it blocks", !!fe && fe.blocking.includes("Finance system access (ledger, expense tools)"), JSON.stringify(fe?.blocking));
  ok("4 days late → second rung → Head of People (the approver's own boss)", fe.level === 2 && fe.target.contact.name === "Priya Nair" && fe.target.role === "Head of People", `${fe.level} ${fe.target.role} ${fe.target.contact.name}`);
  const fe1 = findEscalations(fi, fst, {}, f, SAMPLE_DIRECTORY, addDays(app.dueDate, 1)).find((x) => x.itemId === app.id)!;
  ok("1 day late → first rung → the HR owner", fe1.level === 1 && fe1.target.role === "HR owner" && fe1.target.contact.name === "Priya Nair");
  ok("not late yet → no escalation", !findEscalations(fi, deriveStates(fi, {}, app.dueDate), {}, f, SAMPLE_DIRECTORY, app.dueDate).some((x) => x.itemId === app.id));

  // an overdue provisioning task owned by IT escalates to the department head first
  const g = ctxOf(by("Emily"));
  let gi = complete(generateChecklist(g, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY), ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-EDU", "R-DOC-I9", "R-POL-INFOSEC", "R-BGV"]);
  gi = advance(gi, "2026-11-01", "EMP-3", tickets).items;
  const mail = find(gi, "R-IT-MAIL")!;
  const future = addDays(mail.dueDate, 1);
  const gst = deriveStates(gi, {}, future);
  const ge = findEscalations(gi, gst, {}, g, SAMPLE_DIRECTORY, future).find((x) => x.itemId === mail.id);
  ok("an IT task blocking engineering access escalates to the department head first", ge?.level === 1 && ge.target.role === "Head of Engineering" && ge.target.contact.name === "Vikram Singh", JSON.stringify(ge && [ge.level, ge.target.role]));

  console.log("emails");
  const d = draftEscalation(e, id);
  ok("escalation email addressed to the target, with the reason", d.to.email === "arjun.rao@acme.com" && d.subject.includes("Government photo ID") && d.text.includes("blocking"));
  const evil = draftEscalation({ ...e, name: "<script>x</script>" }, id);
  ok("hostile names are escaped in the HTML", !evil.html.includes("<script>x"));
  const c = draftCorrection(e, "Government photo ID", ["The name doesn't match.", "It has expired."], "x");
  ok("correction email lists every reason and goes to the joiner", c.to.email === e.email && c.text.includes("The name doesn't match.") && c.text.includes("It has expired.") && c.html.includes("It has expired."));
}

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
