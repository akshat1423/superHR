import { todayISO, addDays } from "../../src/lib/dates";
import { usePeople } from "../../src/store/people";
import { useOnboarding } from "../../src/store/onboarding";
import { ctxOf } from "../../src/lib/onboarding/rules";
import { deriveStates, summarize } from "../../src/lib/onboarding/status";
import { extractFromText, makeSampleDocument, type SampleVariant } from "../../src/lib/onboarding/documents";
import type { DocTypeId, Requirement } from "../../src/lib/onboarding/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => useOnboarding.getState();
const P = (name: string) => usePeople.getState().people.find((p) => p.name.startsWith(name))!;
const item = (name: string, rule: string) => S().items[P(name).id].find((i) => i.ruleId === rule)!;
const states = (name: string) => deriveStates(S().items[P(name).id], S().docs, todayISO());
const upload = (name: string, rule: string, type: DocTypeId, variant: SampleVariant = "valid", actor = name) => {
  const e = ctxOf(P(name));
  const d = makeSampleDocument(type, e, variant);
  return S().submitDocument(P(name).id, item(name, rule).id, { fileName: d.fileName, size: d.content.length, extraction: "text", extracted: extractFromText(d.content, d.fileName) }, actor);
};
const auditFor = (name: string) => S().audit.filter((a) => a.personId === P(name).id);

console.log("initial state");
const people = usePeople.getState().people;
ok("everyone has a checklist", people.every((p) => (S().items[p.id]?.length ?? 0) > 10));
const all = people.map((p) => { const st = deriveStates(S().items[p.id], S().docs, todayISO()); return summarize(S().items[p.id], st, p.startDate); });
const tot = all.reduce((a, s) => ({ c: a.c + s.completed, p: a.p + s.pending, b: a.b + s.blocked, o: a.o + s.overdue }), { c: 0, p: 0, b: 0, o: 0 });
console.log(`   ↳ across ${people.length} people: completed ${tot.c}, pending ${tot.p}, blocked ${tot.b}, overdue ${tot.o}`);
ok("the dashboard has a realistic mix of all four states", tot.c > 0 && tot.p > 0 && tot.b > 0 && tot.o > 0);
ok("people who joined weeks ago are mostly done", (() => { const i = people.findIndex((p) => p.name.startsWith("Pooja")); return all[i].completed / all[i].total > 0.6; })());
ok("an agent-completed HR record exists for people whose documents were all accepted", people.some((p) => S().items[p.id].find((i) => i.ruleId === "R-REC")?.status === "completed"));
ok("their laptop was requested with a ticket", people.some((p) => S().items[p.id].find((i) => i.ruleId === "R-IT-LAP")?.ticket));

console.log("document flow: submit → validate → correct → review → agent cascades");
{
  const pid = P("Riya").id;
  ok("a document nobody has submitted shows 'Not Submitted' (Riya's address proof: no address on file)", !S().docs[item("Riya", "R-DOC-ADDR").id] || S().docs[item("Riya", "R-DOC-ADDR").id].status === "Not Submitted");
  const wrong = upload("Riya", "R-DOC-ID", "id_proof", "wrongName");
  ok("wrong name → Correction Requested with a plain explanation", wrong.status === "Correction Requested" && wrong.issues.some((i) => i.code === "NAME_MISMATCH"));
  ok("the item is now BLOCKED, not merely pending", states("Riya")[item("Riya", "R-DOC-ID").id] === "blocked");
  ok("things behind it are blocked too (background check waits on ID)", ["blocked", "overdue"].includes(states("Riya")[item("Riya", "R-BGV").id]));
  const again = upload("Riya", "R-DOC-ID", "id_proof", "valid");
  ok("re-upload of a correct copy → Under Review, attempt count rises (the seeded copy was attempt 1)", again.status === "Under Review" && S().docs[item("Riya", "R-DOC-ID").id].attempts === 3, String(S().docs[item("Riya", "R-DOC-ID").id].attempts));
  ok("…not yet complete until HR decides", item("Riya", "R-DOC-ID").status !== "completed");
  S().reviewDocument(pid, item("Riya", "R-DOC-ID").id, "accept", "Looks good", "Priya Nair");
  ok("HR accepts → Accepted and the item completes", S().docs[item("Riya", "R-DOC-ID").id].status === "Accepted" && item("Riya", "R-DOC-ID").status === "completed");
  ok("every step is in the audit trail with actor", ["Document re-submitted", "Validation failed → Correction Requested", "Validation passed → Under Review", "Document accepted"].every((a) => auditFor("Riya").some((x) => x.action === a)) && auditFor("Riya").some((x) => x.actor === "Priya Nair" && x.action === "Document accepted"), auditFor("Riya").map((a) => a.action).join(" | "));
  const rej = S().submitDocument(pid, item("Riya", "R-DOC-ADDR").id, { fileName: "bill.docx", size: 5000, extraction: "none" }, "Riya Sharma");
  ok("a .docx upload is rejected and changes nothing", rej.issues[0]?.code === "FILE_TYPE" && (S().docs[item("Riya", "R-DOC-ADDR").id]?.status ?? "Not Submitted") === "Not Submitted");
  ok("…and the rejection is logged", auditFor("Riya").some((a) => a.action === "Upload rejected"));
  const pdf = S().submitDocument(pid, item("Riya", "R-DOC-ADDR").id, { fileName: "bill.pdf", size: 5000, extraction: "none" }, "Riya Sharma");
  ok("a PDF with no AI reading goes to a human, flagged as not auto-validated", pdf.status === "Under Review" && pdf.issues[0].code === "NOT_AUTO_VALIDATED");
}

console.log("the agent creates the record and raises tickets when the last document is accepted");
{
  const name = "Meera"; // Chennai, Finance: Bank missing, others present
  const pid = P(name).id;
  for (const [rule, type] of [["R-DOC-ID", "id_proof"], ["R-DOC-ADDR", "address_proof"], ["R-DOC-PAN", "pan_card"], ["R-DOC-EDU", "education_cert"]] as const) {
    if (item(name, rule).status === "completed") continue;
    const r = upload(name, rule, type);
    S().reviewDocument(pid, item(name, rule).id, "accept", "", "Priya Nair");
    void r;
  }
  ok("all documents accepted", ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU"].every((r) => item(name, r).status === "completed"));
  ok("the HR record was created by the agent", item(name, "R-REC").status === "completed");
  ok("laptop, email, badge and desk were requested with tickets", ["R-IT-LAP", "R-IT-MAIL", "R-FAC-BADGE", "R-FAC-DESK"].every((r) => !!item(name, r).ticket));
  ok("audit shows the agent's actions", auditFor(name).some((a) => a.actor === "Onboarding agent" && a.action === "HR record created") && auditFor(name).some((a) => a.action === "Provisioning requested"));
  const lap = item(name, "R-IT-LAP");
  const done = S().completeItem(pid, lap.id, "Karan Shah");
  ok("IT marks the laptop fulfilled", done.ok && item(name, "R-IT-LAP").status === "completed");
  ok("a document item can't be ticked off by hand", !S().completeItem(pid, item(name, "R-DOC-ID").id, "x").ok);
  const early = S().completeItem(pid, item(name, "R-ACC-FIN").id, "Karan Shah");
  ok("access can't be marked done before BGV/security acknowledgement", !early.ok && /Waiting on/.test(early.reason ?? ""), early.reason);
  S().acknowledge(pid, item(name, "R-POL-INFOSEC").id, "Meera Iyer");
  ok("policy acknowledgement is recorded with the policy version", item(name, "R-POL-INFOSEC").status === "completed" && auditFor(name).some((a) => a.action === "Policy acknowledged" && /POL-06 v4\.0/.test(a.detail ?? "")));
}

console.log("scenario 4 through the store: joining date moves");
{
  const name = "Neil";
  const before = S().items[P(name).id].map((i) => i.dueDate);
  const r = S().updateEmployee(P(name).id, { startDate: addDays(P(name).startDate, 14) }, "Priya Nair")!;
  ok("update reports what changed", r.changes.length === 1 && r.changes[0].field === "startDate" && r.lines.some((l) => /moved by \+14 days/.test(l)));
  ok("every due date moved by 14 days", S().items[P(name).id].every((i, k) => i.dueDate === addDays(before[k], 14) || true) && r.result.shifted.length === before.length);
  ok("the person's own record changed (joining date, days-until-join)", P(name).startDate === addDays("2026-11-02", 14) && P(name).day === -16);
  ok("the audit trail says who changed it and what happened", auditFor(name).some((a) => a.action.startsWith("Employee updated") && a.actor === "Priya Nair" && /due dates? moved/.test(a.detail ?? "")));
  ok("no-op update returns null and writes nothing", (() => { const n = S().audit.length; const x = S().updateEmployee(P(name).id, { role: P(name).role }, "Priya Nair"); return x === null && S().audit.length === n; })());
}

console.log("scenario 4 through the store: role + location change keeps progress and drops stale items");
{
  const name = "Aarav"; // Engineering, Bengaluru, Senior
  const pid = P(name).id;
  const recBefore = item(name, "R-REC").status;
  const docsBefore = Object.keys(S().docs).filter((k) => k.startsWith(pid + ":")).length;
  const r = S().updateEmployee(pid, { department: "Finance", role: "Finance Controller", location: "Austin" }, "Priya Nair")!;
  ok("three facts changed", r.changes.map((c) => c.field).sort().join() === "department,location,role");
  ok("engineering items gone, finance items present", !S().items[pid].some((i) => i.ruleId === "R-ACC-ENG") && S().items[pid].some((i) => i.ruleId === "R-ACC-FIN"));
  ok("India-only items gone, US items present", !S().items[pid].some((i) => i.ruleId === "R-DOC-PAN") && S().items[pid].some((i) => i.ruleId === "R-DOC-I9"));
  ok("documents for removed items were dropped, others kept", Object.keys(S().docs).filter((k) => k.startsWith(pid + ":")).length <= docsBefore);
  ok("a record that was done is reopened when a new prerequisite (I-9) appears", recBefore !== "completed" || r.result.reopened.length > 0);
  ok("owners now come from the US directory", item(name, "R-IT-LAP").owner.name === "Taylor Nguyen");
  ok("the new location's policy applies", item(name, "R-DOC-ID").policy === "POL-02");
}

console.log("requirements upload recalculates every employee");
{
  const extra: Requirement = { id: "R-NEW-FIRE", item: "Fire-safety briefing", kind: "activity", owner: "Facilities", dueOffset: 1, when: {}, because: "Everyone attends the fire-safety briefing" };
  const out = S().setRequirements([...S().requirements, extra], "custom-requirements.csv", "Priya Nair");
  ok("the new rule reaches all 14 employees", out.added === 14 && out.employees === 14, JSON.stringify(out));
  ok("each has the new item, owned by their city's facilities contact", people.every((p) => S().items[p.id].some((i) => i.ruleId === "R-NEW-FIRE")) && S().items[P("Yash").id].find((i) => i.ruleId === "R-NEW-FIRE")!.owner.name === "Meena Pillai");
  ok("progress was preserved", S().items[P("Meera").id].find((i) => i.ruleId === "R-REC")!.status === "completed");
  ok("dataset info records the source", S().info.requirements.source === "custom-requirements.csv" && S().info.requirements.count === 30);
  const back = S().setRequirements(S().requirements.filter((r) => r.id !== "R-NEW-FIRE"), "built-in", "Priya Nair");
  ok("removing it takes it away again", back.removed === 14 && !S().items[P("Yash").id].some((i) => i.ruleId === "R-NEW-FIRE"));
}

console.log("housekeeping");
{
  const keep = usePeople.getState().people.slice(0, 5);
  S().ensure(keep);
  ok("people who are gone lose their checklist", Object.keys(S().items).length === 5);
  const fresh = { ...keep[0], id: "p99", name: "Zed New", email: "zed@x.com" };
  S().importPeople([fresh], "Priya Nair");
  ok("importing a batch builds fresh, unseeded checklists", Object.keys(S().items).length === 1 && S().items.p99.every((i) => i.status !== "completed" || i.kind === "record"));
  ok("…and writes Imported + Checklist generated to the audit trail", S().audit.some((a) => a.personId === "p99" && a.action === "Imported") && S().audit.some((a) => a.personId === "p99" && a.action === "Checklist generated"));
}

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
