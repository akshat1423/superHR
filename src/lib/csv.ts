import Papa from "papaparse";
import { addDays, daysSinceJoining, parseDateISO, todayISO } from "./dates";
import { FIELD_KEYS, type FieldKey, type FieldState, type Person } from "./people";
import type { Dept, EmpType, Level, Persona } from "./workflow";

export type CanonKey =
  | "name" | "email" | "phone" | "role" | "department" | "type" | "level" | "start" | "manager"
  | "dob" | "address" | "pan" | "aadhaar" | "bank" | "photo" | "emergency" | "education" | "prev_employer" | "school" | "location" | "grade";

const ALIASES: Record<CanonKey, string[]> = {
  name: ["full_name", "name", "candidate_name", "candidate", "employee_name"],
  email: ["email", "work_email", "personal_email", "email_address"],
  phone: ["phone", "mobile", "contact", "phone_number"],
  role: ["role", "title", "job_title", "designation", "position"],
  department: ["department", "dept", "team", "function"],
  type: ["emp_type", "employment_type", "type", "worker_type", "contract_type"],
  level: ["level", "seniority", "level_band"],
  grade: ["grade", "band", "job_grade", "grade_code"],
  location: ["location", "office", "city", "work_location", "base_location"],
  start: ["start_date", "joining_date", "doj", "date_of_joining", "join_date"],
  manager: ["manager", "reporting_manager", "hiring_manager"],
  dob: ["dob", "date_of_birth", "birth_date"],
  address: ["address", "current_address", "residential_address"],
  pan: ["pan", "pan_number", "tax_id"],
  aadhaar: ["aadhaar", "aadhar", "national_id", "ssn"],
  bank: ["bank_account", "bank_ac", "account_number", "bank"],
  photo: ["photo_url", "photo", "picture", "avatar"],
  emergency: ["emergency_contact", "emergency"],
  education: ["education", "highest_education", "degree"],
  prev_employer: ["prev_employer", "previous_employer", "last_employer"],
  school: ["school", "college", "university"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export interface ParsedAts {
  headers: string[];
  mapping: Record<string, CanonKey | null>;
  unmapped: string[];
  rows: Record<string, string>[];
  people: Person[];
}

export function resolvePersona(row: { type: string; dept: string; level: string; role: string }): { persona: Persona; guessed: boolean; issues: string[] } {
  const issues: string[] = [];
  let guessed = false;

  const t = row.type.toLowerCase();
  let type: EmpType = "Full-time";
  if (/intern/.test(t) || /intern/.test(row.level.toLowerCase())) type = "Intern";
  else if (/part/.test(t)) type = "Part-time";
  else if (!/full|perm|regular|ft/.test(t)) { guessed = true; if (t) issues.push(`unknown type “${row.type}” → Full-time`); }

  const d = (row.dept || row.role).toLowerCase();
  let dept: Dept;
  if (/eng|tech|software|dev|data|ml|platform/.test(d)) dept = "Engineering";
  else if (/fin|account|audit|treasury/.test(d)) dept = "Finance";
  else if (/prod|design|ux|research/.test(d)) dept = "Product";
  else if (/hr|people|talent|recruit/.test(d)) dept = "People";
  else if (/sales|bus|growth|market|ops|success|revenue/.test(d)) dept = "Business";
  else { dept = "Business"; guessed = true; issues.push(`unknown department “${row.dept}” → Business`); }

  let level: Level;
  const l = (row.level + " " + row.role).toLowerCase();
  if (type === "Intern") level = "Intern";
  else if (/director|\bvp\b|head|chief|leader|cxo|\bcto\b|\bceo\b/.test(l)) level = "Leader";
  else if (/sde.?3|senior|\bsr\b|staff|principal|\blead\b|l[45]/.test(l)) level = "Senior";
  else if (/sde.?1|junior|associate|analyst|entry|l[12]\b/.test(l)) level = "Associate";
  else if (/sde.?2|mid|\bii\b|l3/.test(l)) level = "Mid";
  else { level = "Mid"; guessed = true; if (row.level) issues.push(`unknown level “${row.level}” → Mid`); }

  return { persona: { type, dept, level }, guessed, issues };
}

export function parseAts(text: string, idStart = 0): ParsedAts {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return parseAtsRows(res.meta.fields ?? [], res.data, idStart);
}

/** Build people from already-parsed rows — shared by CSV, Excel and JSON uploads. */
export function parseAtsRows(headers: string[], data: Record<string, string>[], idStart = 0): ParsedAts {
  const mapping: Record<string, CanonKey | null> = {};
  const byCanon: Partial<Record<CanonKey, string>> = {};
  for (const h of headers) {
    const n = norm(h);
    const hit = (Object.keys(ALIASES) as CanonKey[]).find((k) => ALIASES[k].includes(n));
    mapping[h] = hit ?? null;
    if (hit && !byCanon[hit]) byCanon[hit] = h;
  }
  const unmapped = headers.filter((h) => !mapping[h]);
  const get = (row: Record<string, string>, k: CanonKey) => (byCanon[k] ? (row[byCanon[k]!] ?? "").trim() : "");

  const FIELD_SOURCE: Record<FieldKey, CanonKey> = {
    Name: "name", Email: "email", Phone: "phone", DOB: "dob", Education: "education", "Prev. employer": "prev_employer",
    Address: "address", PAN: "pan", Aadhaar: "aadhaar", "Bank a/c": "bank", Photo: "photo", "Emergency contact": "emergency",
  };

  const people: Person[] = data
    .filter((r) => get(r, "name"))
    .map((row, i) => {
      const { persona, guessed, issues } = resolvePersona({ type: get(row, "type"), dept: get(row, "department"), level: get(row, "level"), role: get(row, "role") });
      let startDate = parseDateISO(get(row, "start"));
      if (startDate === null) { startDate = addDays(todayISO(), 7); issues.push("start date missing or unreadable → assumed 7 days out"); }
      const dobISO = parseDateISO(get(row, "dob"));
      const fields: Partial<Record<FieldKey, FieldState>> = {};
      for (const k of FIELD_KEYS) fields[k] = get(row, FIELD_SOURCE[k]) ? "ats" : "missing";
      const name = get(row, "name");
      const photo = get(row, "photo");
      return {
        id: `p${idStart + i}`,
        no: String(30 + (idStart + i) * 3 + (i % 2)).padStart(3, "0"),
        name,
        email: get(row, "email"),
        phone: get(row, "phone"),
        role: get(row, "role") || "New joiner",
        persona,
        manager: get(row, "manager") || "Unassigned",
        school: get(row, "school") || get(row, "education"),
        photoUrl: /^https?:/.test(photo) ? photo : undefined,
        location: get(row, "location") || "Unspecified",
        grade: get(row, "grade") || persona.level,
        dob: dobISO ?? undefined,
        address: get(row, "address") || undefined,
        startDate,
        day: daysSinceJoining(startDate),
        fields,
        manual: {},
        issues,
        guessed,
      };
    });

  return { headers, mapping, unmapped, rows: data, people };
}
