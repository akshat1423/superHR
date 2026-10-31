import { daysBetween, fmtHuman } from "../dates";
import { generateChecklist, type EmployeeCtx } from "./rules";
import type { ChecklistItem, Contact, Directory, Requirement } from "./types";

export type ChangeField = "startDate" | "role" | "department" | "location" | "grade" | "manager" | "type";
export interface Change { field: ChangeField; from: string; to: string }

const LABEL: Record<ChangeField, string> = { startDate: "Joining date", role: "Role", department: "Department", location: "Location", grade: "Grade", manager: "Manager", type: "Employment type" };

/** What differs between two versions of an employee's facts. */
export function diffContext(a: EmployeeCtx, b: EmployeeCtx): Change[] {
  const out: Change[] = [];
  for (const f of ["startDate", "role", "department", "location", "grade", "manager", "type"] as ChangeField[])
    if (a[f] !== b[f]) out.push({ field: f, from: a[f], to: b[f] });
  return out;
}

export interface Recalculation {
  /** the new checklist: progress, tickets and completion dates carried over for items that still apply */
  items: ChecklistItem[];
  added: ChecklistItem[];
  removed: ChecklistItem[];
  shifted: { item: ChecklistItem; from: string; to: string; days: number }[];
  ownerChanged: { item: ChecklistItem; from: Contact; to: Contact }[];
  /** completed record items that must be redone because a new prerequisite appeared */
  reopened: ChecklistItem[];
  kept: number;
}

/**
 * Re-evaluate the rules for the changed employee and merge into the existing checklist, instead of rebuilding it:
 *  - items that still apply keep their status, ticket and completion date, but get new due dates, owners and reasons
 *  - items that no longer apply are removed; new ones are added as pending
 *  - an HR record that was already created is reopened if the change introduced a prerequisite it hasn't met
 */
export function recalculate(next: EmployeeCtx, old: ChecklistItem[], rules: Requirement[], dir: Directory): Recalculation {
  const fresh = generateChecklist(next, rules, dir);
  const oldByRule = new Map(old.map((i) => [i.ruleId, i]));
  const freshRules = new Set(fresh.map((i) => i.ruleId));

  const added: ChecklistItem[] = [], shifted: Recalculation["shifted"] = [], ownerChanged: Recalculation["ownerChanged"] = [];
  const items = fresh.map((n): ChecklistItem => {
    const o = oldByRule.get(n.ruleId);
    if (!o) { added.push(n); return n; }
    if (o.dueDate !== n.dueDate) shifted.push({ item: n, from: o.dueDate, to: n.dueDate, days: daysBetween(o.dueDate, n.dueDate) });
    if (o.owner.email !== n.owner.email) ownerChanged.push({ item: n, from: o.owner, to: n.owner });
    return { ...n, status: o.status, completedAt: o.completedAt, ticket: o.ticket };
  });
  const removed = old.filter((o) => !freshRules.has(o.ruleId));

  const done = new Set(items.filter((i) => i.status === "completed").map((i) => i.id));
  const reopened: ChecklistItem[] = [];
  for (const i of items) {
    if (i.kind === "record" && i.status === "completed" && !i.dependsOn.every((d) => done.has(d))) {
      i.status = "pending"; i.completedAt = undefined; reopened.push(i); done.delete(i.id);
    }
  }
  return { items, added, removed, shifted, ownerChanged, reopened, kept: items.length - added.length };
}

/** A short, readable account of a recalculation, for the HR change summary and the audit log. */
export function describeRecalculation(changes: Change[], r: Recalculation): string[] {
  const lines: string[] = [];
  for (const c of changes) lines.push(`${LABEL[c.field]} changed: ${c.field === "startDate" ? `${fmtHuman(c.from)} → ${fmtHuman(c.to)}` : `${c.from} → ${c.to}`}`);
  if (r.shifted.length) {
    const days = [...new Set(r.shifted.map((s) => s.days))];
    lines.push(`${r.shifted.length} due date${r.shifted.length > 1 ? "s" : ""} moved${days.length === 1 ? ` by ${days[0] > 0 ? "+" : ""}${days[0]} days` : ""}`);
  }
  if (r.added.length) lines.push(`${r.added.length} new item${r.added.length > 1 ? "s" : ""}: ${r.added.map((i) => i.item).join("; ")}`);
  if (r.removed.length) lines.push(`${r.removed.length} item${r.removed.length > 1 ? "s" : ""} no longer apply: ${r.removed.map((i) => i.item).join("; ")}`);
  if (r.ownerChanged.length) lines.push(`${r.ownerChanged.length} owner${r.ownerChanged.length > 1 ? "s" : ""} changed: ${r.ownerChanged.slice(0, 3).map((o) => `${o.item.item} → ${o.to.name}`).join("; ")}${r.ownerChanged.length > 3 ? "…" : ""}`);
  if (r.reopened.length) lines.push(`Reopened: ${r.reopened.map((i) => i.item).join("; ")} (a new prerequisite applies)`);
  lines.push(`${r.kept} item${r.kept === 1 ? "" : "s"} kept their progress`);
  return lines;
}
