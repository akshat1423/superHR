import type { Person } from "../people";
import { DEPTS, LEVELS, TYPES } from "../workflow";

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn an untrusted request body into the Person the service functions work from, or null. Only the fields the
 * services read are kept, every string is length-limited, and the persona is checked against the real enums.
 */
export function asPerson(raw: unknown): Person | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ps = r.persona as Record<string, unknown> | undefined;
  if (!str(r.id, 40) || !r.id || !str(r.name, 80) || !r.name || !ps) return null;
  if (!DEPTS.includes(ps.dept as (typeof DEPTS)[number]) || !TYPES.includes(ps.type as (typeof TYPES)[number]) || !LEVELS.includes(ps.level as (typeof LEVELS)[number])) return null;
  if (!str(r.startDate, 10) || !ISO.test(r.startDate)) return null;
  const fields: Record<string, string> = {};
  if (r.fields && typeof r.fields === "object") for (const [k, v] of Object.entries(r.fields as Record<string, unknown>).slice(0, 20)) if (str(v, 16)) fields[k] = v;
  const opt = (v: unknown, max: number) => (str(v, max) ? v : "");
  return {
    id: r.id, no: opt(r.no, 20), name: r.name, email: opt(r.email, 120), phone: opt(r.phone, 30), role: opt(r.role, 80),
    persona: { type: ps.type as Person["persona"]["type"], dept: ps.dept as Person["persona"]["dept"], level: ps.level as Person["persona"]["level"] },
    manager: opt(r.manager, 80), school: opt(r.school, 80), location: opt(r.location, 40), grade: opt(r.grade, 20),
    dob: str(r.dob, 10) && ISO.test(r.dob) ? r.dob : undefined, address: str(r.address, 200) ? r.address : undefined,
    startDate: r.startDate, day: typeof r.day === "number" ? r.day : 0,
    fields: fields as Person["fields"], manual: {}, issues: [], guessed: false,
  };
}
