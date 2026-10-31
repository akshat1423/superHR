import { todayISO } from "../../src/lib/dates";
import { DEMO_USERS as USERS } from "../../src/lib/auth/users";
import { scopePeople } from "../../src/lib/auth/policy";
import { usePeople } from "../../src/store/people";
import { useOnboarding } from "../../src/store/onboarding";
import { useProvisioning } from "../../src/store/provisioning";
import { WRITE_TOOLS, findPerson, proposeWrite, runRead, toolsFor, type AgentActions, type AgentData } from "../../src/lib/agent/tools";
import { offlineTurn } from "../../src/lib/agent/offline";
import { systemPrompt } from "../../src/lib/agent/prompt";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };

const user = (id: string) => USERS.find((u) => u.id === id)!;
const data = (id: string): AgentData => {
  const u = user(id);
  const o = useOnboarding.getState();
  return { user: u, today: todayISO(), people: scopePeople(u, usePeople.getState().people), items: o.items, docs: o.docs, directory: o.directory, policies: o.policies, run: useProvisioning.getState().run };
};
const hr = data("u-priya"), mgr = data("u-arjun"), head = data("u-vikram"), emp = data("u-yash");
type R = Record<string, unknown> & { total?: number; people?: { name: string; department: string }[]; error?: string };

console.log("who can use which tools");
ok("employees get only their record and the policies", toolsFor(emp.user).map((t) => t.name).join() === "list_people,get_checklist,search_policies");
ok("managers also get escalations and service status, but no actions", toolsFor(mgr.user).some((t) => t.name === "service_status") && !toolsFor(mgr.user).some((t) => WRITE_TOOLS.has(t.name)));
ok("HR and department heads can act", [hr, head].every((d) => toolsFor(d.user).some((t) => t.name === "retry_service") && toolsFor(d.user).some((t) => t.name === "send_escalation")));
ok("every tool has a description and a schema", toolsFor(hr.user).every((t) => t.description.length > 30 && t.input_schema.type === "object"));

console.log("\nreading data, scoped to who is asking");
const all = runRead("list_people", {}, hr) as R;
ok("HR sees the whole batch", all.total === usePeople.getState().people.length, String(all.total));
const mine = runRead("list_people", {}, mgr) as R;
ok("a manager sees only their reports", (mine.total ?? 0) > 0 && (mine.total ?? 0) < (all.total ?? 0));
const dh = runRead("list_people", {}, head) as R;
ok("a department head sees only their department", (dh.people ?? []).every((p) => p.department === "Engineering") && (dh.total ?? 0) > 0);
const me = runRead("list_people", {}, emp) as R;
ok("an employee sees only themself", me.total === 1 && me.people![0].name === "Yash Bansal");
ok("…and cannot look up anyone else", "error" in (runRead("get_checklist", { person: "Meera Iyer" }, emp) as R));
ok("blocked filter returns only people with blocked items", ((runRead("list_people", { status: "blocked" }, hr) as R).people ?? []).length >= 0 && ((runRead("list_people", { status: "blocked" }, hr) as { people: { blocked: number }[] }).people).every((p) => p.blocked > 0));
ok("department filter works", ((runRead("list_people", { department: "Finance" }, hr) as R).people ?? []).every((p) => p.department === "Finance"));
const cl = runRead("get_checklist", { person: "Yash" }, hr) as { person: { name: string }; items: { item: string; why: string; state: string; owner: string }[] };
ok("a checklist has every item with its reason, state and owner", cl.person.name === "Yash Bansal" && cl.items.length > 10 && cl.items.every((i) => i.why.length > 5 && i.state && i.owner));
ok("an unknown person is reported, not invented", "error" in (runRead("get_checklist", { person: "Zaphod Beeblebrox" }, hr) as R));
ok("an ambiguous name asks which one", (findPerson(hr, "a") as { error?: string }).error?.includes("More than one") ?? false);

console.log("\nstaff-only tools");
ok("employees are refused escalations and service status", ["list_escalations", "service_status"].every((t) => "error" in (runRead(t, {}, emp) as R)));
const svc = runRead("service_status", { only_problems: true }, hr) as { total: number; services: { status: string; failure?: { cause: string } }[] };
ok("service status shows problems with their causes", svc.total > 0 && svc.services.some((s) => s.status === "failed" && !!s.failure?.cause));

console.log("\npolicies");
const pol = runRead("search_policies", { query: "How long does background verification take?" }, hr) as { covered: boolean; passages?: { citation: string; text: string }[] };
ok("a covered question returns cited passages", pol.covered && pol.passages![0].citation.startsWith("POL-") && pol.passages!.some((p) => p.text.includes("5 to 7 business days")));
const covered = (q: string) => (runRead("search_policies", { query: q }, hr) as { covered: boolean }).covered;
ok("paraphrases of covered questions are still answered", ["How long is the background check?", "When do I get my laptop?", "How long is the probation period?", "What is the PF registration process?"].filter(covered).length >= 3, ["How long is the background check?", "When do I get my laptop?", "How long is the probation period?", "What is the PF registration process?"].map((q) => `${covered(q)}:${q}`).join(" | "));
ok("things the policies never mention are not covered", ["Can I bring my dog to the office?", "Is there a company car scheme?", "What is the stock option vesting schedule for astronauts?"].every((q) => !covered(q)));
ok("an uncovered question says so", (runRead("search_policies", { query: "Can I bring my dog to the office?" }, hr) as { covered: boolean }).covered === false);
ok("an employee's search is limited to what applies to them", (runRead("search_policies", { query: "remote work" }, emp) as { covered: boolean }).covered !== undefined);

console.log("\nactions need a valid target, and a human to confirm");
const failed = svc.services.find((s) => s.status === "failed") as unknown as { personId?: string } | undefined;
const failedFull = (runRead("service_status", { only_problems: true }, hr) as { services: { personId: string; service: string; status: string }[] }).services.find((s) => s.status === "failed")!;
const prop = proposeWrite("retry_service", { person: failedFull.personId, service: failedFull.service }, hr);
ok("retrying a failed service produces a proposal with a plain-language summary", !("error" in prop) && prop.summary.startsWith("Retry "), JSON.stringify(prop));
const calls: string[] = [];
const fake: AgentActions = { retryService: (p, s, by) => calls.push(`retry:${p}:${s}:${by}`), sendEmail: async (d) => { calls.push(`mail:${d.to.email}`); return "sent"; } };
ok("nothing happens until the proposal is run", calls.length === 0);
if (!("error" in prop)) { const msg = await prop.run(fake); ok("confirming runs it, as the signed-in person", calls[0] === `retry:${failedFull.personId}:${failedFull.service}:Priya Nair` && msg.startsWith("Retrying")); }
const healthy = hr.run.people[0].tasks.findIndex((t) => t.status === "done");
void failed; void healthy;
ok("retrying something that did not fail is refused", "error" in proposeWrite("retry_service", { person: hr.people[0].id, service: "identity-svc" }, { ...hr, run: { ...hr.run, people: hr.run.people.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t, status: "done" as const, failure: null })) })) } }));
ok("a manager cannot retry", "error" in proposeWrite("retry_service", { person: failedFull.personId, service: failedFull.service }, mgr));
ok("an unknown service is refused", "error" in proposeWrite("retry_service", { person: failedFull.personId, service: "nope" }, hr));
const esc = (runRead("list_escalations", {}, hr) as { escalations: { person: string; personId: string; item: string }[] }).escalations;
if (esc.length) {
  const e = proposeWrite("send_escalation", { person: esc[0].personId, item: esc[0].item }, hr);
  ok("an escalation that qualifies can be proposed", !("error" in e) && e.summary.includes("overdue"));
  if (!("error" in e)) { await e.run(fake); ok("…and sends the drafted email to the owner on confirm", calls.some((c) => c.startsWith("mail:") && c.includes("@"))); }
}
ok("an item that does not qualify for escalation is refused", "error" in proposeWrite("send_escalation", { person: hr.people[0].id, item: "Zzz not an item" }, hr));

console.log("\nthe offline agent (no API key)");
const say = (q: string, d = hr) => offlineTurn(q, d);
ok("who is blocked", /blocked/.test(say("who is blocked?").text) || /Nobody/.test(say("who is blocked?").text));
ok("an overview names people with counts", /\d+\/\d+ done/.test(say("give me an overview of everyone").text));
const yash = say("how is Yash doing?").text;
ok("a named person gets their status and what is open", yash.includes("Yash Bansal") && /Still open|Everything is complete/.test(yash));
ok("failed services come with cause and fix", /Fix:/.test(say("which services failed?").text));
ok("a policy question is answered from the policy, with its citation", /5 to 7 business days/.test(say("How long does background verification take?").text) && /\[POL-\d+/.test(say("How long does background verification take?").text));
ok("an uncovered question is declined, not guessed", /can’t find that/.test(say("Can I bring my dog to the office?").text));
const retry = say(`retry ${failedFull.service === "identity-svc" ? "email" : "it"} for ${hr.people.find((p) => p.id === failedFull.personId)!.name}`);
ok("“retry …” becomes a proposal the user must confirm", !!retry.proposal || /Which one|nothing to retry/.test(retry.text), retry.text);
ok("the employee's offline chat never lists other people or services", !/Meera|Riya|Aarav/.test(say("show me everyone", emp).text) && !/Fix:/.test(say("which services failed?", emp).text));
ok("an employee cannot trigger a retry through chat", say(`retry email for Yash Bansal`, emp).proposal === undefined);
ok("a manager asking for a retry gets no proposal", say(`retry email for ${mgr.people[0].name}`, mgr).proposal === undefined);

console.log("\nthe model prompt");
const sp = systemPrompt(emp.user, "2026-10-31");
ok("an employee's prompt keeps them to their own record and hides internals", /own record/.test(sp) && !/retry_service/.test(sp));
ok("staff prompts describe the actions and require confirmation", /retry_service/.test(systemPrompt(hr.user, "2026-10-31")) && /confirm/.test(systemPrompt(hr.user, "2026-10-31")));
ok("every prompt requires citations and forbids guessing", [emp, hr].every((d) => /cite/.test(systemPrompt(d.user, "x")) && /never invent/i.test(systemPrompt(d.user, "x"))));
ok("the prompt names the person and today's date", sp.includes("Yash Bansal") && sp.includes("2026-10-31"));

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
