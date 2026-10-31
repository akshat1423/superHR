import { daysBetween, fmtHuman } from "../dates";
import { escalationChain, type Rung } from "./owners";
import type { EmployeeCtx } from "./rules";
import type { ChecklistItem, Directory, DocumentRecord, ItemState } from "./types";
import { wrap } from "../email";
import type { Draft } from "../email";

export interface Escalation {
  itemId: string;
  personId: string;
  item: string;
  /** 1 = first rung (1+ days late), 2 = second rung (3+ days late) */
  level: 1 | 2;
  target: Rung;
  owner: { name: string; fn: string };
  daysLate: number;
  /** the items waiting on this one */
  blocking: string[];
  reason: string;
}

export const LEVEL1_DAYS = 1;
export const LEVEL2_DAYS = 3;

/**
 * Escalate the root cause, not the symptoms. An item qualifies when it is itself overdue (so it is the real
 * hold-up, not something merely waiting) and either it is an approval or other items are stuck behind it.
 */
export function findEscalations(
  items: ChecklistItem[],
  states: Record<string, ItemState>,
  docs: Record<string, DocumentRecord | undefined>,
  emp: EmployeeCtx,
  dir: Directory,
  today: string,
): Escalation[] {
  const out: Escalation[] = [];
  const dependents = new Map<string, ChecklistItem[]>();
  for (const i of items) for (const d of i.dependsOn) dependents.set(d, [...(dependents.get(d) ?? []), i]);

  for (const i of items) {
    if (states[i.id] !== "overdue") continue;
    const stuck = (dependents.get(i.id) ?? []).filter((d) => d.status !== "completed" && states[d.id] === "blocked");
    if (i.kind !== "approval" && stuck.length === 0) continue;
    const late = daysBetween(i.dueDate, today);
    if (late < LEVEL1_DAYS) continue;
    const level: 1 | 2 = late >= LEVEL2_DAYS ? 2 : 1;
    const chain = escalationChain(i.ownerFn, { name: emp.name, email: emp.email, department: emp.department, location: emp.location, manager: emp.manager }, dir);
    const target = chain.find((r) => r.level === level) ?? chain[chain.length - 1];
    const what = i.kind === "approval" ? "approval" : "task";
    const blockingNames = stuck.map((s) => s.item);
    out.push({
      itemId: i.id, personId: i.personId, item: i.item, level, target,
      owner: { name: i.owner.name, fn: i.ownerFn }, daysLate: late, blocking: blockingNames,
      reason: `${i.item} (${what} owned by ${i.owner.name}, ${i.ownerFn}) was due ${fmtHuman(i.dueDate)} and is ${late} day${late > 1 ? "s" : ""} overdue${blockingNames.length ? `, blocking ${blockingNames.join(", ")}` : ""}. Escalated to ${target.role} ${target.contact.name}.`,
    });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate || b.blocking.length - a.blocking.length);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The escalation email, ready for the outbox. */
export function draftEscalation(emp: EmployeeCtx, e: Escalation): Draft {
  const subject = `Escalation: ${e.item} for ${emp.name} is ${e.daysLate} day${e.daysLate > 1 ? "s" : ""} overdue`;
  const first = e.target.contact.name.split(" ")[0];
  const text = [`Hi ${first},`, "", e.reason, e.blocking.length ? `Waiting on it: ${e.blocking.join(", ")}.` : "", "", `Joining date: ${fmtHuman(emp.startDate)}.`, `Open the record: https://onboard.acme.com/employees/${emp.id}`].filter(Boolean).join("\n");
  const html = wrap(`Escalation: ${e.item}`, [`Hi ${esc(first)},`, esc(e.reason), `${esc(emp.name)} joins on <b>${esc(fmtHuman(emp.startDate))}</b>.`], e.blocking, { label: "Open the onboarding record", url: `https://onboard.acme.com/employees/${emp.id}` });
  return { kind: "escalation", level: e.level === 1 ? 2 : 3, to: { name: e.target.contact.name, email: e.target.contact.email, label: e.target.role }, subject, text, html, personId: emp.id, stepId: e.itemId, stepTitle: e.item };
}

/** The email telling a new joiner exactly why a document was sent back. */
export function draftCorrection(emp: EmployeeCtx, docLabel: string, reasons: string[], itemId: string): Draft {
  const first = emp.name.split(" ")[0];
  const subject = `Action needed: please re-upload your ${docLabel.toLowerCase()}`;
  const text = [`Hi ${first},`, "", `We couldn't accept your ${docLabel.toLowerCase()} yet:`, ...reasons.map((r) => ` - ${r}`), "", `Please upload a corrected copy: https://onboard.acme.com/me`].join("\n");
  const html = wrap("One document needs a fix", [`Hi ${esc(first)},`, `We couldn't accept your <b>${esc(docLabel.toLowerCase())}</b> yet:`], reasons, { label: "Upload a corrected copy", url: "https://onboard.acme.com/me" });
  return { kind: "candidate", level: 0, to: { name: emp.name, email: emp.email, label: "New joiner" }, subject, text, html, personId: emp.id, stepId: itemId, stepTitle: docLabel };
}
