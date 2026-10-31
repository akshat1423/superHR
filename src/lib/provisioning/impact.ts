import { countryOf } from "../geo";
import type { Person } from "../people";
import type { ProvAction, TaskStatus } from "../provision";
import { SERVICES } from "../services";
import { appsOf } from "../serviceRuntime/reverse";
import type { PersonPatch } from "@/store/people";

/** The person as they would be after a change (for previewing; the store applies the real thing). */
export function patched(p: Person, patch: PersonPatch): Person {
  return {
    ...p,
    role: patch.role ?? p.role,
    grade: patch.grade ?? p.grade,
    location: patch.location ?? p.location,
    manager: patch.manager ?? p.manager,
    startDate: patch.startDate ?? p.startDate,
    persona: { type: patch.type ?? p.persona.type, dept: patch.department ?? p.persona.dept, level: patch.level ?? p.persona.level },
  };
}

const live = (s: TaskStatus | undefined) => s === "done" || s === "waiting";

/**
 * What the provisioning services must do because a person's details changed. Only services that have already created
 * something are touched (a service that hasn't run yet will simply use the new details when it does). Applications the
 * new role no longer includes are revoked, new ones granted; the rest are updated where the changed detail matters:
 * a new joining date moves the calendar, the pass, the payroll start and the nudges; a new role or grade reissues the
 * offer and payroll; a new department or city moves the directory entry, the desk and the statutory set-up.
 */
export function provisioningImpact(before: Person, after: Person, statusOf: (service: string) => TaskStatus | undefined): ProvAction[] {
  const role = before.role !== after.role, grade = before.grade !== after.grade || before.persona.level !== after.persona.level, type = before.persona.type !== after.persona.type;
  const dept = before.persona.dept !== after.persona.dept, loc = before.location !== after.location, date = before.startDate !== after.startDate, mgr = before.manager !== after.manager;
  const country = countryOf(before.location) !== countryOf(after.location);
  if (!(role || grade || type || dept || loc || date || mgr)) return [];

  const out: ProvAction[] = [];
  const upd = (service: string, reason: string) => { if (live(statusOf(service))) out.push({ service, kind: "update", reason }); };

  // applications first: take away what no longer applies, before anything is moved
  if (live(statusOf("access-svc"))) {
    const was = appsOf(before), now = appsOf(after);
    const why = `${after.role}, ${after.persona.dept}${after.persona.level ? ` (${after.persona.level})` : ""}`;
    for (const app of was.filter((a) => !now.includes(a))) out.push({ service: "access-svc", kind: "deprovision", object: app, reason: `${app} is not part of the workflow for ${why}` });
    for (const app of now.filter((a) => !was.includes(a))) out.push({ service: "access-svc", kind: "provision", object: app, reason: `${app} is part of the workflow for ${why}` });
  }

  const changed = [role && "role", grade && "grade", type && "employment type", dept && "department", loc && "location", date && "joining date", mgr && "manager"].filter(Boolean).join(", ");
  if (role || dept || loc || mgr) upd("identity-svc", `${changed} changed: directory entry must match`);
  if (role || grade || type || loc || date) upd("letter-svc", `${changed} changed: the offer needs reissuing`);
  if (role || date || loc) upd("bgv-svc", `${changed} changed: the vendor case must match`);
  if (grade || dept || date || loc || type) upd("payroll-svc", `${changed} changed${country ? " (different country: statutory set-up differs)" : ""}: the payroll record must match`);
  if (role || dept || loc) upd("idcard-svc", `${changed} changed: the card shows the old details`);
  if (loc || dept || date) upd("facility-svc", loc ? `moved to ${after.location}: the desk and pass are at the old office` : `${changed} changed: the desk and pass dates must match`);
  if (date || mgr || dept) upd("agenda-svc", `${changed} changed: the day-1 calendar events and buddy must match`);
  if (loc || role) upd("collect-svc", `${changed} changed${country ? ": a different country needs different documents" : ""}: refresh what is asked for`);
  if (live(statusOf("reminder-svc"))) out.push({ service: "reminder-svc", kind: "update", reason: `${changed} changed: nudges and escalations follow the new dates and owners` });
  return out;
}

/** Display order for a list of actions: revokes first, then moves, then grants. */
export const ACTION_ORDER: Record<ProvAction["kind"], number> = { deprovision: 0, update: 1, provision: 2 };
export const serviceName = (id: string) => SERVICES.find((s) => s.id === id)?.name ?? id;
