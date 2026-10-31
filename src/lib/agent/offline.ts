import { fmtHuman } from "../dates";
import { SERVICES } from "../services";
import { proposeWrite, runRead, type AgentData, type WriteProposal } from "./tools";
import { canSeeFailureDetail } from "../auth/policy";

/**
 * The chat without a model: a small intent router over the same tools the model would use. It answers from the
 * data and the approved policies only, and says plainly when it can't. Used when no API key is set or the model
 * can't be reached, so the assistant never goes dark.
 */
export interface OfflineReply { text: string; proposal?: WriteProposal }

const SERVICE_WORDS: [RegExp, string][] = [
  [/\b(email|sso|okta|mailbox)\b/, "identity-svc"], [/\b(offer|letter|e-?sign)\b/, "letter-svc"], [/\b(access|slack|github|jira)\b/, "access-svc"],
  [/\b(background|bgv|verification)\b/, "bgv-svc"], [/\b(payroll|pf|uan|insurance)\b/, "payroll-svc"], [/\bid card\b/, "idcard-svc"],
  [/\b(desk|premises|parking|building)\b/, "facility-svc"], [/\b(agenda|buddy)\b/, "agenda-svc"], [/\b(collection|magic link)\b/, "collect-svc"], [/\breminder/, "reminder-svc"],
];

type Row = { id: string; name: string; department: string; joining: string; completed: number; items: number; blocked: number; overdue: number; pending: number; readyForDayOne: boolean };

const line = (r: Row) => `• ${r.name} (${r.department}, joins ${fmtHuman(r.joining)}): ${r.completed}/${r.items} done${r.blocked ? `, ${r.blocked} blocked` : ""}${r.overdue ? `, ${r.overdue} overdue` : ""}${r.readyForDayOne ? " — ready for day one" : ""}`;

export function offlineTurn(question: string, d: AgentData): OfflineReply {
  const q = question.toLowerCase();
  const staff = canSeeFailureDetail(d.user);
  const mentioned = d.people.filter((p) => q.includes(p.name.toLowerCase()) || q.includes(p.name.split(" ")[0].toLowerCase()));
  const named = mentioned.length === 1 ? mentioned[0] : null;
  const svcId = SERVICE_WORDS.find(([re]) => re.test(q))?.[1];

  // a policy-style question goes to the policies first (otherwise "how long does background verification take" reads as a service query)
  const POLICYISH = /\b(policy|policies|how long|how many days|allowed|can i|can we|do i|do we|am i|are we|what is|what are|what's|when (do|does|will|should)|where (do|can)|eligible|entitled|need to)\b/;
  if (POLICYISH.test(q) && !/\b(fail|failed|failing|stuck|blocked|overdue|escalat|retry)\b/.test(q) && !named) {
    const pol = runRead("search_policies", { query: question }, d) as { covered: boolean; passages?: { citation: string; policy: string; section: string; text: string }[] };
    if (pol.covered && pol.passages?.length) {
      const same = pol.passages.filter((x) => x.policy === pol.passages![0].policy).slice(0, 2);
      return { text: `${same.map((x) => x.text).join("\n\n")}\n\nSource: ${same[0].policy} — ${same.map((x) => `${x.section} [${x.citation}]`).join(", ")}` };
    }
  }

  // actions (the user confirms before anything happens)
  if (/\b(retry|re-?run)\b/.test(q) && staff) {
    if (!named) return { text: "Which person? For example: “retry email for Yash Bansal”." };
    const failed = (runRead("service_status", { person: named.id, only_problems: true }, d) as { services: { service: string; status: string }[] }).services.filter((s) => s.status === "failed");
    const target = svcId ?? (failed.length === 1 ? failed[0].service : undefined);
    if (!target) return { text: failed.length ? `${named.name} has ${failed.length} failed services (${failed.map((f) => f.service).join(", ")}). Which one should I retry?` : `Nothing has failed for ${named.name}, so there is nothing to retry.` };
    const p = proposeWrite("retry_service", { person: named.id, service: target }, d);
    return "error" in p ? { text: p.error } : { text: `I can do that — please confirm:\n${p.summary}`, proposal: p };
  }
  if (/\bescalat/.test(q) && /\b(send|email|do it|raise)\b/.test(q) && staff) {
    const all = (runRead("list_escalations", {}, d) as { escalations: { person: string; personId: string; item: string }[] }).escalations.filter((e) => !named || e.personId === named.id);
    if (all.length !== 1) return { text: all.length ? `There are ${all.length} candidates; say which person and item:\n${all.map((e) => `• ${e.item} — ${e.person}`).join("\n")}` : "Nothing qualifies for escalation right now." };
    const p = proposeWrite("send_escalation", { person: all[0].personId, item: all[0].item }, d);
    return "error" in p ? { text: p.error } : { text: `I can do that — please confirm:\n${p.summary}`, proposal: p };
  }

  if (/\bescalat/.test(q) && staff) {
    const r = runRead("list_escalations", {}, d) as { total: number; escalations: { person: string; item: string; daysLate: number; escalateTo: string }[] };
    return { text: r.total ? `${r.total} item${r.total > 1 ? "s" : ""} should be escalated:\n${r.escalations.map((e) => `• ${e.item} for ${e.person} — ${e.daysLate} day${e.daysLate > 1 ? "s" : ""} overdue → ${e.escalateTo}`).join("\n")}\nSay “send the escalation for <name>” and I’ll draft it for you to confirm.` : "Nothing needs escalating right now." };
  }

  if (staff && (svcId || /\b(fail|failed|failing|provision|stuck|service|services)\b/.test(q)) && !/\bpolicy|policies\b/.test(q)) {
    const r = runRead("service_status", { person: named?.id, service: svcId, only_problems: true }, d) as { total: number; services: { person: string; name: string; status: string; failure?: { code: string; title: string; cause: string; fix: string } ; detail?: string }[] };
    if (!r.total) return { text: `No service problems${named ? ` for ${named.name}` : ""}${svcId ? ` in ${SERVICES.find((s) => s.id === svcId)?.name}` : ""}.` };
    return { text: `${r.total} service${r.total > 1 ? "s need" : " needs"} attention:\n${r.services.slice(0, 8).map((s) => `• ${s.person} — ${s.name}: ${s.status}${s.failure ? `. ${s.failure.code} ${s.failure.title}. ${s.failure.cause} Fix: ${s.failure.fix}` : s.detail ? ` (${s.detail})` : ""}`).join("\n")}${r.total > 8 ? `\n…and ${r.total - 8} more.` : ""}` };
  }

  if (named) {
    const r = runRead("get_checklist", { person: named.id }, d) as { person: Row; items: { item: string; state: string; due: string; owner: string; documentStatus: string | null }[] };
    const open = r.items.filter((i) => i.state !== "completed").sort((a, b) => ["overdue", "blocked", "pending"].indexOf(a.state) - ["overdue", "blocked", "pending"].indexOf(b.state));
    return { text: `${line(r.person)}\n${open.length ? `Still open:\n${open.slice(0, 6).map((i) => `• ${i.item} — ${i.state}, due ${fmtHuman(i.due)}, owner ${i.owner}${i.documentStatus ? `, document ${i.documentStatus}` : ""}`).join("\n")}${open.length > 6 ? `\n…and ${open.length - 6} more.` : ""}` : "Everything is complete."}` };
  }

  const status = /\bblocked\b/.test(q) ? "blocked" : /\boverdue|late\b/.test(q) ? "overdue" : /\bnot ready\b/.test(q) ? "not_ready" : /\bready\b/.test(q) ? "ready" : /\bpending|waiting\b/.test(q) ? "pending" : null;
  const dept = ["Engineering", "Finance", "Product", "Business", "People"].find((x) => q.includes(x.toLowerCase()));
  if (status || dept || /\b(how many|overview|summary|everyone|who|list|show)\b/.test(q) && !/\b(policy|policies|allowed|can i|do i|how long|how do)\b/.test(q)) {
    const r = runRead("list_people", { status: status ?? "all", department: dept }, d) as { total: number; people: Row[] };
    if (!r.total) return { text: "Nobody matches that." };
    return { text: `${r.total} ${r.total === 1 ? "person" : "people"}${status ? ` (${status.replace("_", " ")})` : ""}${dept ? ` in ${dept}` : ""}:\n${r.people.slice(0, 12).map(line).join("\n")}${r.total > 12 ? `\n…and ${r.total - 12} more.` : ""}` };
  }

  const pol = runRead("search_policies", { query: question }, d) as { covered: boolean; passages?: { citation: string; policy: string; section: string; text: string }[] };
  if (pol.covered && pol.passages?.length) {
    const same = pol.passages.filter((x) => x.policy === pol.passages![0].policy).slice(0, 2);
    return { text: `${same.map((x) => x.text).join("\n\n")}\n\nSource: ${same[0].policy} — ${same.map((x) => `${x.section} [${x.citation}]`).join(", ")}` };
  }
  return { text: "I can’t find that in the approved policies or in the onboarding data I can see, so I won’t guess. Please ask HR." };
}
