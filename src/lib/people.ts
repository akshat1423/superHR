import { type Owner, type Perm } from "./catalog";
import { flatSteps, type Persona, type Step } from "./workflow";
import { hash01 } from "./utils";

/** Fixed "today" for the demo so prerendering and hydration agree. */
export const DEMO_TODAY = new Date(2026, 9, 31);
const MS_DAY = 86_400_000;

export const fmtDate = (daysSinceJoining: number) => {
  const d = new Date(DEMO_TODAY.getTime() - daysSinceJoining * MS_DAY);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
};

export type Status = "done" | "active" | "blocked" | "scheduled";
export type FieldState = "ats" | "cand" | "req" | "missing";

export const FIELD_KEYS = [
  "Name", "Email", "Phone", "DOB", "Education", "Prev. employer",
  "Address", "PAN", "Aadhaar", "Bank a/c", "Photo", "Emergency contact",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/** Which person-data fields a step cannot proceed without. */
const NEEDS: Record<string, FieldKey[]> = {
  payroll: ["PAN", "Bank a/c"],
  uan: ["Aadhaar", "PAN"],
  bank: ["Bank a/c"],
  stipend: ["Bank a/c"],
  idcard: ["Photo"],
  access: ["Photo"],
  bgv: ["Address", "Prev. employer"],
  edu: ["Education", "Address"],
  health: ["Emergency contact"],
};
/** Candidate document upload is "in progress" rather than blocked while fields are outstanding. */
const DOC_FIELDS: FieldKey[] = ["PAN", "Aadhaar", "Address", "Education"];

export interface Person {
  id: string;
  no: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  persona: Persona;
  manager: string;
  school: string;
  photoUrl?: string;
  /** days since joining; negative = joins in the future */
  day: number;
  fields: Partial<Record<FieldKey, FieldState>>;
  /** user-forced step statuses, keyed by step id */
  manual: Record<string, Status>;
  /** things the importer couldn't resolve cleanly */
  issues: string[];
  guessed: boolean;
}

export interface PersonStep extends Step {
  id: string;
  status: Status;
  note: string;
}

export function deriveSteps(p: Person): PersonStep[] {
  const isIntern = p.persona.level === "Intern";
  return flatSteps(p.persona).map((s, i) => {
    const id = `${s.key}-${i}`;
    const delta = p.day - s.day;
    const r = hash01(p.name + s.key);
    let status: Status = delta >= 3 ? "done" : delta >= 0 ? (r < 0.5 ? "done" : "active") : delta >= -1 && r < 0.25 ? "active" : "scheduled";
    let note = "";
    const due = s.day <= p.day;

    const needs = (NEEDS[s.key] ?? []).filter((f) => !(isIntern && f === "Prev. employer"));
    const missing = needs.filter((f) => p.fields[f] === "missing");
    const requested = needs.filter((f) => p.fields[f] === "req");
    if (missing.length) {
      if (due) { status = "blocked"; note = `waiting on ${missing.join(", ")}`; }
      else note = `needs ${missing.join(", ")}`;
    } else if (requested.length && due) {
      status = "active"; note = `awaiting candidate: ${requested.join(", ")}`;
    }
    if (s.key === "docs") {
      const out = DOC_FIELDS.filter((f) => p.fields[f] === "missing" || p.fields[f] === "req");
      if (out.length && due) { status = "active"; note = `${DOC_FIELDS.length - out.length} of ${DOC_FIELDS.length} documents in`; }
    }
    if (p.manual[id]) { status = p.manual[id]; note = ""; }
    return { ...s, id, status, note };
  });
}

export const countStatus = (steps: PersonStep[]) => {
  const c: Record<Status, number> = { done: 0, active: 0, blocked: 0, scheduled: 0 };
  for (const s of steps) c[s.status]++;
  return c;
};
export type Health = "ok" | "active" | "blocked";
export const healthOf = (steps: PersonStep[]): Health => {
  const c = countStatus(steps);
  return c.blocked ? "blocked" : c.active ? "active" : "ok";
};
/** Fields we ask this person for (interns aren't asked for a previous employer). */
export const visibleFields = (p: Person) =>
  FIELD_KEYS.filter((k) => !(p.persona.level === "Intern" && k === "Prev. employer"));
export const missingFields = (p: Person) => visibleFields(p).filter((k) => p.fields[k] === "missing");

export type { Owner, Perm };
