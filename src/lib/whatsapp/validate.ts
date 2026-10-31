import { LEVELS } from "../workflow";
import type { ItemState, Policy } from "../onboarding/types";
import type { Snapshot } from "./types";

const STATES: ItemState[] = ["completed", "pending", "blocked", "overdue"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const s = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,120}\.[^\s@]{2,}$/;

/**
 * A snapshot arrives from a browser, so it is checked field by field and size-limited: it becomes what the WhatsApp
 * assistant is allowed to quote to a joiner, and what it sends to the model.
 */
export function validateSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const e = b.employee as Record<string, unknown> | undefined;
  const hr = b.hr as Record<string, unknown> | undefined;
  if (!e || !hr || !s(e.name, 80) || !s(e.role, 80) || !s(e.department, 40) || !s(e.location, 40) || !s(e.grade, 20) || !s(e.manager, 80) || !s(e.startDate, 10) || !ISO.test(e.startDate as string)
    || (e.country !== "IN" && e.country !== "US") || !LEVELS.includes(e.level as (typeof LEVELS)[number]) || !s(hr.name, 80) || !s(hr.email, 120)) return null;
  if (!Array.isArray(b.facts) || b.facts.length > 80) return null;
  const facts: Snapshot["facts"] = [];
  for (const f of b.facts as Record<string, unknown>[]) {
    if (!f || !s(f.item, 120) || !s(f.kind, 20) || !s(f.dueDate, 10) || !s(f.owner, 80) || !s(f.ownerFn, 20) || !s(f.reason, 700) || !STATES.includes(f.state as ItemState)) return null;
    facts.push({ item: f.item, kind: f.kind, dueDate: f.dueDate, owner: f.owner, ownerFn: f.ownerFn, state: f.state as ItemState, reason: f.reason, policy: typeof f.policy === "string" ? f.policy.slice(0, 20) : undefined, docStatus: typeof f.docStatus === "string" ? f.docStatus.slice(0, 30) : undefined });
  }
  let policies: Policy[] | undefined;
  if (Array.isArray(b.policies) && b.policies.length) {
    if (b.policies.length > 60 || JSON.stringify(b.policies).length > 150_000) return null;
    policies = (b.policies as Policy[]).filter((p) => p && typeof p.id === "string" && Array.isArray(p.sections));
  }
  return {
    employee: { name: e.name, role: e.role, department: e.department, location: e.location, country: e.country as "IN" | "US", grade: e.grade, level: e.level as Snapshot["employee"]["level"], startDate: e.startDate as string, manager: e.manager },
    hr: { name: hr.name, email: hr.email }, facts, ...(policies ? { policies } : {}), updatedAt: new Date().toISOString(),
  };
}
