import type { DemoUser } from "../auth/users";
import { canRetryService, canSeeFailureDetail } from "../auth/policy";
import { daysBetween } from "../dates";
import { draftEscalation, findEscalations } from "../onboarding/escalate";
import { ctxOf } from "../onboarding/rules";
import { passagesFor, relevant, retrieve, unknownTerms } from "../onboarding/retrieve";
import { deriveStates, isReady, summarize } from "../onboarding/status";
import type { ChecklistItem, Directory, DocumentRecord, Policy } from "../onboarding/types";
import type { Draft } from "../email";
import type { Person } from "../people";
import type { Run } from "../provision";
import { SERVICES } from "../services";

/** Everything the agent may look at. The caller passes only what this user is allowed to see (already scoped). */
export interface AgentData {
  user: DemoUser;
  today: string;
  people: Person[];
  items: Record<string, ChecklistItem[]>;
  docs: Record<string, DocumentRecord>;
  directory: Directory;
  policies: Policy[];
  run: Run;
}

/** The side effects a confirmed action may have. Injected so the UI wires the real stores and tests wire fakes. */
export interface AgentActions {
  retryService: (personId: string, service: string, by: string) => void;
  sendEmail: (draft: Draft, by: string) => Promise<string>;
}

export interface ToolDef { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] } }

const STATUS = ["all", "blocked", "overdue", "pending", "ready", "not_ready"] as const;

const READ: ToolDef[] = [
  { name: "list_people", description: "List new joiners you can see, with their counts of completed / pending / blocked / overdue checklist items and whether they are ready for day one. Use it to answer 'who is blocked', 'who joins next week', 'how many…'. Returns at most 25 rows plus the true total.",
    input_schema: { type: "object", properties: { status: { type: "string", enum: [...STATUS], description: "blocked/overdue/pending = has at least one such item; ready/not_ready = day-one readiness" }, department: { type: "string" }, location: { type: "string" }, joining_from: { type: "string", description: "yyyy-mm-dd" }, joining_to: { type: "string", description: "yyyy-mm-dd" }, query: { type: "string", description: "part of a name or job title" } } } },
  { name: "get_checklist", description: "One person's full checklist: every item with its state, due date, owner, linked policy, document status and the rule that put it there. Accepts a person's name or id.",
    input_schema: { type: "object", properties: { person: { type: "string" } }, required: ["person"] } },
  { name: "search_policies", description: "Search the approved HR policies. Returns the matching passages with their citation ids. If nothing relevant comes back, the policies do not cover the question. Pass `person` to restrict to the policies that apply to them (country, department, level).",
    input_schema: { type: "object", properties: { query: { type: "string" }, person: { type: "string" } }, required: ["query"] } },
];

const STAFF_READ: ToolDef[] = [
  { name: "list_escalations", description: "Overdue approvals and blocking items that should be escalated, with who they go to and how late they are.", input_schema: { type: "object", properties: {} } },
  { name: "service_status", description: "State of the automated provisioning services (email & SSO, access, payroll…) for people in the current run: done, running, paused, failed or skipped, with the cause and fix of any failure. Filter by person and/or service id.",
    input_schema: { type: "object", properties: { person: { type: "string" }, service: { type: "string", enum: SERVICES.map((s) => s.id) }, only_problems: { type: "boolean" } } } },
];

const WRITE: ToolDef[] = [
  { name: "retry_service", description: "Re-run a failed provisioning service for one person. The user is asked to confirm before it runs, so call it when they ask for it or after they agree to your suggestion.",
    input_schema: { type: "object", properties: { person: { type: "string" }, service: { type: "string", enum: SERVICES.map((s) => s.id) } }, required: ["person", "service"] } },
  { name: "send_escalation", description: "Email the right owner about an overdue item that qualifies for escalation (see list_escalations). The user is asked to confirm before it is sent.",
    input_schema: { type: "object", properties: { person: { type: "string" }, item: { type: "string", description: "the checklist item's name" } }, required: ["person", "item"] } },
];

export const WRITE_TOOLS = new Set(WRITE.map((t) => t.name));

/** The tools this role may use. Employees get their own record and the policies only. */
export function toolsFor(user: DemoUser): ToolDef[] {
  if (user.role === "employee") return READ;
  return [...READ, ...STAFF_READ, ...(user.role === "hr" || user.role === "dept_head" ? WRITE : [])];
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Find one person from what the user typed: exact id, exact name, or a unique partial name. */
export function findPerson(d: AgentData, q: string): { person: Person } | { error: string } {
  const s = q.toLowerCase().trim();
  if (!s) return { error: "Say which person." };
  const byId = d.people.find((p) => p.id.toLowerCase() === s);
  if (byId) return { person: byId };
  const exact = d.people.filter((p) => p.name.toLowerCase() === s);
  if (exact.length === 1) return { person: exact[0] };
  const part = d.people.filter((p) => p.name.toLowerCase().includes(s) || s.split(/\s+/).every((w) => p.name.toLowerCase().split(/\s+/).includes(w)));
  if (part.length === 1) return { person: part[0] };
  if (part.length > 1) return { error: `More than one person matches "${q}": ${part.slice(0, 6).map((p) => `${p.name} (${p.id})`).join(", ")}. Ask which one.` };
  return { error: `No one called "${q}" among the people you can see.` };
}

const states = (d: AgentData, p: Person) => deriveStates(d.items[p.id] ?? [], d.docs, d.today);

function row(d: AgentData, p: Person) {
  const items = d.items[p.id] ?? [];
  const st = states(d, p);
  const s = summarize(items, st, p.startDate);
  return { id: p.id, name: p.name, role: p.role, department: p.persona.dept, location: p.location, joining: p.startDate, daysToJoin: daysBetween(d.today, p.startDate), items: s.total, completed: s.completed, pending: s.pending, blocked: s.blocked, overdue: s.overdue, readyForDayOne: !p.terminated && isReady(s), ...(p.terminated ? { terminated: `${p.terminated.reason} (${p.terminated.by})` } : {}) };
}

/** Run a read-only tool. Never throws: problems come back as `{ error }` for the model to relay. */
export function runRead(name: string, input: Json, d: AgentData): unknown {
  const staff = canSeeFailureDetail(d.user);
  switch (name) {
    case "list_people": {
      const status = str(input.status) || "all";
      const dept = str(input.department).toLowerCase(), loc = str(input.location).toLowerCase(), q = str(input.query).toLowerCase();
      const from = str(input.joining_from), to = str(input.joining_to);
      const rows = d.people
        .filter((p) => (!dept || p.persona.dept.toLowerCase() === dept) && (!loc || p.location.toLowerCase().includes(loc)) && (!q || `${p.name} ${p.role}`.toLowerCase().includes(q)) && (!from || p.startDate >= from) && (!to || p.startDate <= to))
        .map((p) => row(d, p))
        .filter((r) => status === "all" || (status === "ready" ? r.readyForDayOne : status === "not_ready" ? !r.readyForDayOne : r[status as "blocked" | "overdue" | "pending"] > 0));
      return { total: rows.length, shown: Math.min(rows.length, 25), people: rows.slice(0, 25), today: d.today };
    }
    case "get_checklist": {
      const f = findPerson(d, str(input.person));
      if ("error" in f) return f;
      const st = states(d, f.person);
      return {
        person: row(d, f.person),
        items: (d.items[f.person.id] ?? []).map((i) => ({ item: i.item, kind: i.kind, state: st[i.id], due: i.dueDate, owner: `${i.owner.name} (${i.ownerFn})`, policy: i.policy ?? null, documentStatus: i.docType ? (d.docs[i.id]?.status ?? "Not Submitted") : null, why: i.reason })),
      };
    }
    case "search_policies": {
      const q = str(input.query);
      if (!q) return { error: "Give a question to search for." };
      // a named person (or, for an employee, themselves) narrows to the policies that apply to them; staff otherwise search all
      let who: Person | undefined;
      if (str(input.person)) {
        const f = findPerson(d, str(input.person));
        if ("error" in f) return f;
        who = f.person;
      } else if (d.user.role === "employee") who = d.people[0];
      const passages = who
        ? passagesFor(d.policies, ctxOf(who))
        : d.policies.flatMap((pol) => pol.sections.map((sec) => ({ id: `${pol.id} ${sec.id}`, policyId: pol.id, title: pol.title, heading: sec.heading, text: sec.text })));
      const unknown = unknownTerms(q, passages);
      const hits = unknown.length ? [] : retrieve(q, passages, 4).filter((h) => relevant(h));
      return hits.length ? { covered: true, passages: hits.map((h) => ({ citation: h.id, policy: h.title, section: h.heading, text: h.text })) } : { covered: false, note: `No approved policy covers this${unknown.length ? ` (the policies never mention: ${unknown.join(", ")})` : ""}. Say so and point to HR.` };
    }
    case "list_escalations": {
      if (!staff) return { error: "Not available to you." };
      const out = d.people.filter((p) => !p.terminated).flatMap((p) => findEscalations(d.items[p.id] ?? [], states(d, p), d.docs, ctxOf(p), d.directory, d.today).map((e) => ({ person: p.name, personId: p.id, item: e.item, daysLate: e.daysLate, escalateTo: `${e.target.contact.name} (${e.target.role})`, level: e.level, blocking: e.blocking })));
      return { total: out.length, escalations: out.slice(0, 25) };
    }
    case "service_status": {
      if (!staff) return { error: "Not available to you." };
      let people = d.people;
      if (str(input.person)) { const f = findPerson(d, str(input.person)); if ("error" in f) return f; people = [f.person]; }
      const svc = str(input.service);
      const only = input.only_problems === true;
      const rows = people.flatMap((p) => {
        const pr = d.run.people.find((r) => r.personId === p.id);
        if (!pr) return [];
        return pr.tasks.flatMap((t, si) => {
          const s = SERVICES[si];
          if ((svc && s.id !== svc) || (only && t.status !== "failed" && t.status !== "waiting" && t.status !== "skipped")) return [];
          return [{ person: p.name, personId: p.id, service: s.id, name: s.name, status: t.status, detail: t.detail || undefined, failure: t.failure ? { code: t.failure.code, title: t.failure.title, cause: t.failure.cause, fix: t.failure.fix, retryable: t.failure.retryable } : undefined }];
        });
      });
      return { total: rows.length, services: rows.slice(0, 40) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export interface WriteProposal { tool: string; summary: string; run: (a: AgentActions) => Promise<string> }

/** Validate a write request and describe it for the user to confirm; `{ error }` when it can't be done. */
export function proposeWrite(name: string, input: Json, d: AgentData): WriteProposal | { error: string } {
  const f = findPerson(d, str(input.person));
  if ("error" in f) return f;
  const p = f.person;
  if (name === "retry_service") {
    if (!canRetryService(d.user, p)) return { error: `${d.user.name} can't retry services for ${p.name}.` };
    const sv = SERVICES.find((s) => s.id === str(input.service));
    if (!sv) return { error: "Unknown service." };
    const t = d.run.people.find((r) => r.personId === p.id)?.tasks[SERVICES.indexOf(sv)];
    if (!t || t.status !== "failed") return { error: `${sv.name} has not failed for ${p.name} (it is ${t?.status ?? "not running"}), so there is nothing to retry.` };
    return { tool: name, summary: `Retry ${sv.name} for ${p.name}${t.failure ? ` — it failed with ${t.failure.code} ${t.failure.title}` : ""}`, run: async (a) => { a.retryService(p.id, sv.id, d.user.name); return `Retrying ${sv.name} for ${p.name}.`; } };
  }
  if (name === "send_escalation") {
    if (!canRetryService(d.user, p)) return { error: `${d.user.name} can't escalate for ${p.name}.` };
    const want = str(input.item).toLowerCase();
    const e = findEscalations(d.items[p.id] ?? [], states(d, p), d.docs, ctxOf(p), d.directory, d.today).find((x) => x.item.toLowerCase() === want || x.item.toLowerCase().includes(want));
    if (!e) return { error: `"${str(input.item)}" doesn't qualify for escalation for ${p.name} right now (it must be overdue and holding something up).` };
    return { tool: name, summary: `Email ${e.target.contact.name} (${e.target.role}) that "${e.item}" for ${p.name} is ${e.daysLate} day${e.daysLate > 1 ? "s" : ""} overdue`, run: async (a) => `Escalation to ${e.target.contact.name}: ${await a.sendEmail(draftEscalation(ctxOf(p), e), d.user.name)}.` };
  }
  return { error: `Unknown action ${name}` };
}
