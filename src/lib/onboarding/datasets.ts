import Papa from "papaparse";
import { parseAtsRows, type ParsedAts } from "../csv";
import { parseDateISO, toISO, todayISO, daysBetween } from "../dates";
import { isKnownLocation, KNOWN_LOCATIONS, type Country } from "../geo";
import type { Person } from "../people";
import type { Level } from "../workflow";
import type { Condition, DirFn, Directory, DocTypeId, ItemKind, ManagerRow, OwnerFn, OwnerRow, Policy, PolicySection, Requirement } from "./types";

export type DatasetKind = "profiles" | "requirements" | "policies" | "owners";
export type Format = "csv" | "xlsx" | "json" | "markdown";

export interface Tabular { headers: string[]; rows: Record<string, string>[] }
/** A file after reading: either a table (csv / xlsx), parsed JSON, or raw text (markdown). */
export interface Loaded { name: string; format: Format; tabular?: Tabular; json?: unknown; text?: string }

export interface RowIssue {
  /** 1-based data row (header excluded); 0 = a problem with the file as a whole */
  row: number;
  label?: string;
  field?: string;
  severity: "error" | "warning";
  message: string;
}
export interface Parsed<T> { data: T[]; issues: RowIssue[]; format: Format; rows: number }
export const errorsOf = (i: RowIssue[]) => i.filter((x) => x.severity === "error");

export const normHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// ── reading ─────────────────────────────────────────────────────────────────

const cell = (v: unknown): string => (v instanceof Date ? toISO(v) : v === null || v === undefined ? "" : String(v).trim());

/** First non-empty row is the header; every cell becomes a trimmed string (dates → ISO). */
export function tabularFromRows(rows: unknown[][]): Tabular {
  const at = rows.findIndex((r) => r.some((c) => cell(c) !== ""));
  if (at < 0) return { headers: [], rows: [] };
  const headers = rows[at].map(cell);
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(at + 1)) {
    if (!r.some((c) => cell(c) !== "")) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) rec[h] = cell(r[i]); });
    out.push(rec);
  }
  return { headers: headers.filter(Boolean), rows: out };
}

export function tabularFromCsv(text: string): Tabular {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return { headers: res.meta.fields ?? [], rows: res.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)]))) };
}

/** A JSON array of flat objects is also a table (so profiles can be uploaded as JSON). */
export function tabularFromJson(value: unknown): Tabular | null {
  const arr = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value as Record<string, unknown>).find(Array.isArray) : null;
  if (!Array.isArray(arr) || !arr.length || !arr.every((x) => x && typeof x === "object" && !Array.isArray(x))) return null;
  const headers = [...new Set(arr.flatMap((o) => Object.keys(o as object)))];
  return { headers, rows: arr.map((o) => Object.fromEntries(headers.map((h) => [h, cell((o as Record<string, unknown>)[h])]))) };
}

/** Read an uploaded file in the browser. Excel support is loaded on demand. */
export async function loadFile(file: File): Promise<Loaded> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    return { name: file.name, format: "xlsx", tabular: tabularFromRows((await readSheet(file)) as unknown[][]) };
  }
  if (ext === "xls") throw new Error("Old .xls files aren't supported — save the sheet as .xlsx or .csv");
  const text = await file.text();
  return loadText(file.name, text);
}

/** Same as loadFile for text content (also used for the built-in samples and in tests). */
export function loadText(name: string, text: string): Loaded {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") {
    let json: unknown;
    try { json = JSON.parse(text); } catch (e) { throw new Error(`${name} isn't valid JSON: ${(e as Error).message}`); }
    return { name, format: "json", json, tabular: tabularFromJson(json) ?? undefined };
  }
  if (ext === "md" || ext === "markdown" || ext === "txt") return { name, format: "markdown", text };
  return { name, format: "csv", tabular: tabularFromCsv(text), text };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
/** The nearest known value to a typo, if there is a plausible one. */
export function closest(value: string, options: string[]): string | undefined {
  const v = value.toLowerCase();
  const best = options.map((o) => ({ o, d: levenshtein(v, o.toLowerCase()) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d <= Math.max(2, Math.floor(v.length / 3)) ? best.o : undefined;
}
const list = (v: string | undefined) => (v ?? "").split(/[|;,]/).map((s) => s.trim()).filter(Boolean);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── 1. employee profiles ────────────────────────────────────────────────────

const PROFILE_REQUIRED: { key: string; label: string; aliases: string[] }[] = [
  { key: "name", label: "name", aliases: ["full_name", "name", "candidate_name", "employee_name", "candidate"] },
  { key: "role", label: "role", aliases: ["role", "title", "job_title", "designation", "position"] },
  { key: "grade", label: "grade", aliases: ["grade", "band", "job_grade", "grade_code", "level", "seniority"] },
  { key: "department", label: "department", aliases: ["department", "dept", "team", "function"] },
  { key: "location", label: "location", aliases: ["location", "office", "city", "work_location", "base_location"] },
  { key: "manager", label: "manager", aliases: ["manager", "reporting_manager", "hiring_manager"] },
  { key: "start", label: "joining date", aliases: ["start_date", "joining_date", "doj", "date_of_joining", "join_date"] },
];
const EXTRA = { email: ["email", "work_email", "personal_email", "email_address"], dob: ["dob", "date_of_birth", "birth_date"], type: ["emp_type", "employment_type", "type", "worker_type", "contract_type"] };

export interface ProfileResult extends Parsed<Person> { ats: ParsedAts | null; rejected: number }

/**
 * Validate and import new-joiner profiles. Mandatory columns, strict dates, and references to
 * departments and managers are checked row by row; rows with an error are rejected, the rest are imported.
 */
export function parseProfiles(loaded: Loaded, dir: Directory, idStart = 0): ProfileResult {
  const issues: RowIssue[] = [];
  const empty = (): ProfileResult => ({ data: [], issues, format: loaded.format, rows: 0, ats: null, rejected: 0 });
  const t = loaded.tabular;
  if (!t || !t.rows.length) { issues.push({ row: 0, severity: "error", message: "No employee rows found. Expected a table (CSV, Excel) or a JSON array of objects." }); return empty(); }

  // alias priority wins over column order: a real "grade" column beats a "level" column that happens to come first
  const find = (aliases: string[]) => {
    for (const a of aliases) { const h = t.headers.find((x) => normHeader(x) === a); if (h) return h; }
    return undefined;
  };
  const col: Record<string, string | undefined> = {};
  const missing: string[] = [];
  for (const r of PROFILE_REQUIRED) { col[r.key] = find(r.aliases); if (!col[r.key]) missing.push(r.label); }
  col.email = find(EXTRA.email); col.dob = find(EXTRA.dob); col.type = find(EXTRA.type);
  if (missing.length) {
    issues.push({ row: 0, severity: "error", message: `Missing mandatory column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Found: ${t.headers.join(", ")}` });
    return { ...empty(), rows: t.rows.length, rejected: t.rows.length };
  }
  if (!col.email) issues.push({ row: 0, severity: "warning", message: "No email column — reminders and document requests can't be emailed to joiners." });

  const depts = dir.departments;
  const mgrs = dir.managers.map((m) => m.name);
  const seen = new Map<string, number>();
  const valid: Record<string, string>[] = [];
  const today = todayISO();

  t.rows.forEach((row, idx) => {
    const n = idx + 1;
    const g = (k: string) => (col[k] ? (row[col[k]!] ?? "").trim() : "");
    const label = g("name") || `row ${n}`;
    const add = (severity: RowIssue["severity"], field: string, message: string) => issues.push({ row: n, label, field, severity, message });
    const before = errorsOf(issues).length;

    for (const r of PROFILE_REQUIRED) if (!g(r.key)) add("error", r.label, `${r.label[0].toUpperCase()}${r.label.slice(1)} is required`);

    const email = g("email");
    if (email && !EMAIL.test(email)) add("error", "email", `"${email}" isn't a valid email address`);
    if (email && EMAIL.test(email)) {
      const k = email.toLowerCase();
      if (seen.has(k)) add("error", "email", `Duplicate of row ${seen.get(k)} (${email})`); else seen.set(k, n);
    }

    const start = g("start");
    if (start) {
      const iso = parseDateISO(start);
      if (!iso) add("error", "joining date", `"${start}" isn't a valid date — use YYYY-MM-DD or DD/MM/YYYY`);
      else {
        const d = daysBetween(today, iso);
        if (d < -90) add("warning", "joining date", `Joining date ${iso} is ${-d} days in the past`);
        if (d > 365) add("warning", "joining date", `Joining date ${iso} is more than a year away`);
      }
    }
    const dob = g("dob");
    if (dob) {
      const iso = parseDateISO(dob);
      if (!iso) add("error", "date of birth", `"${dob}" isn't a valid date — use YYYY-MM-DD or DD/MM/YYYY`);
      else { const age = daysBetween(iso, today) / 365.25; if (age < 16 || age > 75) add("warning", "date of birth", `Date of birth ${iso} implies an age of ${Math.round(age)}`); }
    }

    const dept = g("department");
    if (dept && !depts.some((d) => d.toLowerCase() === dept.toLowerCase())) {
      const hint = closest(dept, depts);
      add("error", "department", `Unknown department "${dept}"${hint ? ` — did you mean ${hint}?` : ""} (known: ${depts.join(", ")})`);
    }
    const mgr = g("manager");
    if (mgr && !mgrs.some((m) => m.toLowerCase() === mgr.toLowerCase())) {
      const hint = closest(mgr, mgrs);
      add("error", "manager", `Manager "${mgr}" isn't in the directory${hint ? ` — did you mean ${hint}?` : ""}`);
    }
    const loc = g("location");
    if (loc && !isKnownLocation(loc)) {
      const hint = closest(loc, KNOWN_LOCATIONS);
      add("warning", "location", `Unknown office "${loc}"${hint ? ` (did you mean ${hint}?)` : ""} — treated as an Indian office`);
    }

    if (errorsOf(issues).length === before) valid.push(row);
  });

  const ats = valid.length ? parseAtsRows(t.headers, valid, idStart) : null;
  return { data: ats?.people ?? [], issues, format: loaded.format, rows: t.rows.length, ats, rejected: t.rows.length - valid.length };
}

// ── 2. requirements ─────────────────────────────────────────────────────────

const KINDS: ItemKind[] = ["document", "activity", "record", "provision", "policy", "approval"];
const OWNERS: OwnerFn[] = ["Employee", "HR", "IT", "Facilities", "Compliance", "Manager", "Dept Head"];
const DOC_TYPES: DocTypeId[] = ["id_proof", "address_proof", "education_cert", "prev_employment", "pan_card", "us_work_auth"];
const LEVELS: Level[] = ["Intern", "Associate", "Mid", "Senior", "Leader"];
const TYPES = ["Full-time", "Part-time", "Intern"] as const;

/** Rows from a table or JSON → requirements. Flat (snake_case columns) and nested (`when` object) JSON both work. */
export function parseRequirements(loaded: Loaded, knownPolicies: string[] = []): Parsed<Requirement> {
  const issues: RowIssue[] = [];
  const raws: Record<string, unknown>[] =
    loaded.format === "json" && Array.isArray(loaded.json) ? (loaded.json as Record<string, unknown>[]) : (loaded.tabular?.rows ?? []);
  if (!raws.length) return { data: [], issues: [{ row: 0, severity: "error", message: "No requirement rows found." }], format: loaded.format, rows: 0 };

  const out: Requirement[] = [];
  const ids = new Set<string>();
  raws.forEach((raw, idx) => {
    const n = idx + 1;
    const r: Record<string, unknown> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normHeader(k.replace(/([a-z])([A-Z])/g, "$1_$2")), v]));
    const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : r[k] === undefined || r[k] === null ? "" : String(r[k]));
    const lst = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : list(s(k)));
    const id = s("id");
    const label = id || `row ${n}`;
    const add = (severity: RowIssue["severity"], field: string, message: string) => issues.push({ row: n, label, field, severity, message });
    const before = errorsOf(issues).length;

    if (!id) add("error", "id", "id is required");
    else if (ids.has(id)) add("error", "id", `Duplicate requirement id ${id}`);
    if (!s("item")) add("error", "item", "item (the checklist text) is required");
    const kind = s("kind") as ItemKind;
    if (!KINDS.includes(kind)) add("error", "kind", `kind must be one of ${KINDS.join(", ")}`);
    const owner = OWNERS.find((o) => o.toLowerCase() === s("owner").toLowerCase());
    if (!owner) add("error", "owner", `owner must be one of ${OWNERS.join(", ")}`);
    const off = Number(s("due_offset") !== "" ? s("due_offset") : s("dueoffset"));
    if (s("due_offset") === "" || !Number.isInteger(off)) add("error", "due_offset", "due_offset must be a whole number of days relative to the joining date (negative = before)");
    const docType = s("doc_type");
    if (docType && !DOC_TYPES.includes(docType as DocTypeId)) add("error", "doc_type", `doc_type must be one of ${DOC_TYPES.join(", ")}`);
    if (kind === "document" && !docType) add("warning", "doc_type", "Document items should name a doc_type so uploads can be validated");

    // conditions: nested `when` (JSON) or flat columns
    const when = (r.when && typeof r.when === "object" ? (r.when as Record<string, unknown>) : {}) as Record<string, unknown>;
    const wl = (k: string, flat: string) => (Array.isArray(when[k]) ? (when[k] as unknown[]).map(String) : lst(flat));
    const cond: Condition = {};
    const departments = wl("departments", "departments"); if (departments.length) cond.departments = departments;
    const locations = wl("locations", "locations"); if (locations.length) cond.locations = locations;
    const countries = wl("countries", "countries").map((c) => c.toUpperCase()); if (countries.length) cond.countries = countries as Country[];
    const roles = wl("roles", "roles"); if (roles.length) cond.roles = roles;
    const grades = wl("grades", "grades"); if (grades.length) cond.grades = grades as Level[];
    const types = wl("types", "types"); if (types.length) cond.types = types as (typeof TYPES)[number][];
    for (const g of cond.grades ?? []) if (!LEVELS.includes(g)) add("error", "grades", `Unknown grade band "${g}" (use ${LEVELS.join(", ")})`);
    for (const c of cond.countries ?? []) if (c !== "IN" && c !== "US") add("error", "countries", `Unknown country "${c}" (use IN or US)`);
    for (const t of cond.types ?? []) if (!(TYPES as readonly string[]).includes(t)) add("error", "types", `Unknown employment type "${t}" (use ${TYPES.join(", ")})`);

    const policy = s("policy");
    const byCountry: Partial<Record<Country, string>> = {};
    const nested = r.policy_by_country && typeof r.policy_by_country === "object" ? (r.policy_by_country as Record<string, string>) : {};
    if (nested.IN || s("policy_in")) byCountry.IN = nested.IN || s("policy_in");
    if (nested.US || s("policy_us")) byCountry.US = nested.US || s("policy_us");
    for (const p of [policy, ...Object.values(byCountry)]) if (p && knownPolicies.length && !knownPolicies.includes(p)) add("warning", "policy", `Policy ${p} isn't in the loaded policy documents`);

    if (errorsOf(issues).length === before && owner) {
      ids.add(id);
      out.push({ id, item: s("item"), kind, owner, dueOffset: off, when: cond, dependsOn: lst("depends_on").length ? lst("depends_on") : undefined, policy: policy || undefined, policyByCountry: Object.keys(byCountry).length ? byCountry : undefined, docType: (docType || undefined) as DocTypeId | undefined, because: s("because") || `${s("item")} is required by rule ${id}` });
    }
  });

  // dependencies must point at real rules, and must not form a loop
  const byId = new Map(out.map((r) => [r.id, r]));
  for (const r of out) for (const d of r.dependsOn ?? []) if (!byId.has(d)) issues.push({ row: raws.findIndex((x) => String((x as Record<string, unknown>).id ?? (x as Record<string, unknown>)["ID"]) === r.id) + 1, label: r.id, field: "depends_on", severity: "error", message: `${r.id} depends on unknown requirement ${d}` });
  const bad = new Set(issues.filter((i) => i.field === "depends_on" && i.severity === "error").map((i) => i.label));
  // a rule is in a loop if it can reach itself through its dependencies (checked per rule, so order doesn't matter)
  const reachesItself = (start: string): boolean => {
    const stack = [...(byId.get(start)?.dependsOn ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === start) return true;
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      stack.push(...(byId.get(id)?.dependsOn ?? []));
    }
    return false;
  };
  for (const r of out) if (reachesItself(r.id)) { issues.push({ row: 0, label: r.id, field: "depends_on", severity: "error", message: `${r.id} is part of a dependency loop` }); bad.add(r.id); }
  return { data: out.filter((r) => !bad.has(r.id)), issues, format: loaded.format, rows: raws.length };
}

// ── 3. policies ─────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Markdown / text policy: "# Title" is the policy, each "## Heading" a section. Optional front matter: id, version, countries. */
export function policyFromMarkdown(name: string, text: string): Policy {
  let body = text;
  const meta: Record<string, string> = {};
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) { body = text.slice(fm[0].length); for (const line of fm[1].split("\n")) { const m = line.match(/^(\w+):\s*(.*)$/); if (m) meta[m[1].toLowerCase()] = m[2].trim(); } }
  const lines = body.split("\n");
  const title = (lines.find((l) => /^#\s+/.test(l)) ?? "").replace(/^#\s+/, "").trim() || name.replace(/\.[^.]+$/, "");
  const sections: PolicySection[] = [];
  let cur: { heading: string; text: string[] } | null = null;
  for (const l of lines) {
    const h = l.match(/^##\s+(.*)$/);
    if (h) { if (cur) sections.push({ id: `§${sections.length + 1}`, heading: cur.heading, text: cur.text.join(" ").trim() }); cur = { heading: h[1].trim(), text: [] }; }
    else if (cur && !/^#\s+/.test(l) && l.trim()) cur.text.push(l.trim());
  }
  if (cur) sections.push({ id: `§${sections.length + 1}`, heading: cur.heading, text: cur.text.join(" ").trim() });
  const countries = list(meta.countries).map((c) => c.toUpperCase()).filter((c) => c === "IN" || c === "US") as Country[];
  return { id: meta.id || slug(name.replace(/\.[^.]+$/, "")).toUpperCase(), title, version: meta.version || "v1", appliesTo: countries.length ? { countries } : {}, sections: sections.filter((s) => s.text) };
}

/** Policies from JSON (Policy[]), a CSV with one row per section, or markdown text. */
export function parsePolicies(loaded: Loaded): Parsed<Policy> {
  const issues: RowIssue[] = [];
  let pols: Policy[] = [];
  if (loaded.format === "markdown") pols = [policyFromMarkdown(loaded.name, loaded.text ?? "")];
  else if (loaded.format === "json" && Array.isArray(loaded.json)) pols = loaded.json as Policy[];
  else if (loaded.tabular) {
    const byId = new Map<string, Policy>();
    loaded.tabular.rows.forEach((raw, i) => {
      const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normHeader(k), v]));
      const id = r.policy_id || r.id;
      if (!id || !r.text) { issues.push({ row: i + 1, severity: "error", message: "Each row needs policy_id and text" }); return; }
      const p = byId.get(id) ?? { id, title: r.title || id, version: r.version || "v1", appliesTo: {}, sections: [] };
      const c = list(r.countries).map((x) => x.toUpperCase()).filter((x) => x === "IN" || x === "US") as Country[];
      if (c.length) p.appliesTo = { countries: c };
      p.sections.push({ id: r.section_id || `§${p.sections.length + 1}`, heading: r.heading || "", text: r.text });
      byId.set(id, p);
    });
    pols = [...byId.values()];
  }
  const out: Policy[] = [];
  pols.forEach((p, i) => {
    if (!p || typeof p.id !== "string" || !p.id || !Array.isArray(p.sections) || !p.sections.length) { issues.push({ row: i + 1, severity: "error", message: "A policy needs an id and at least one section with text" }); return; }
    const secs = p.sections.filter((s) => s && typeof s.text === "string" && s.text.trim());
    if (!secs.length) { issues.push({ row: i + 1, label: p.id, severity: "error", message: "Every section is empty" }); return; }
    out.push({ id: p.id, title: p.title || p.id, version: p.version || "v1", appliesTo: p.appliesTo ?? {}, sections: secs.map((s, k) => ({ id: s.id || `§${k + 1}`, heading: s.heading || "", text: s.text.trim() })) });
  });
  if (!out.length && !issues.length) issues.push({ row: 0, severity: "error", message: "No policy content found." });
  return { data: out, issues, format: loaded.format, rows: pols.length };
}

// ── 4. owners & directory ───────────────────────────────────────────────────

const DIR_FNS: DirFn[] = ["HR", "IT", "Facilities", "Compliance", "Dept Head"];

/** JSON {owners, managers, departments} or a CSV with a `type` column (owner | manager). */
export function parseDirectory(loaded: Loaded): Parsed<Directory> {
  const issues: RowIssue[] = [];
  const owners: OwnerRow[] = [];
  const managers: ManagerRow[] = [];
  const departments = new Set<string>();
  const addOwner = (n: number, r: Record<string, unknown>) => {
    const fn = DIR_FNS.find((f) => f.toLowerCase() === String(r.fn ?? r.function ?? "").toLowerCase());
    const name = String(r.name ?? "").trim(), email = String(r.email ?? "").trim();
    const dep = String(r.department ?? "*").trim() || "*", loc = String(r.location ?? "*").trim() || "*";
    if (!fn) { issues.push({ row: n, field: "fn", severity: "error", message: `fn must be one of ${DIR_FNS.join(", ")}` }); return; }
    if (!name) { issues.push({ row: n, field: "name", severity: "error", message: "name is required" }); return; }
    if (!EMAIL.test(email)) { issues.push({ row: n, label: name, field: "email", severity: "error", message: `"${email}" isn't a valid email address` }); return; }
    owners.push({ fn, department: dep, location: loc, name, email });
    if (dep !== "*") departments.add(dep);
  };
  const addManager = (n: number, r: Record<string, unknown>) => {
    const name = String(r.name ?? "").trim(), email = String(r.email ?? "").trim(), department = String(r.department ?? "").trim();
    if (!name || !EMAIL.test(email)) { issues.push({ row: n, label: name, severity: "error", message: "A manager needs a name and a valid email" }); return; }
    managers.push({ name, email, department });
    if (department) departments.add(department);
  };

  if (loaded.format === "json" && loaded.json && typeof loaded.json === "object" && !Array.isArray(loaded.json)) {
    const j = loaded.json as { owners?: Record<string, unknown>[]; managers?: Record<string, unknown>[]; departments?: string[] };
    (j.owners ?? []).forEach((r, i) => addOwner(i + 1, r));
    (j.managers ?? []).forEach((r, i) => addManager(i + 1, r));
    (j.departments ?? []).forEach((d) => departments.add(String(d)));
  } else if (loaded.tabular) {
    loaded.tabular.rows.forEach((raw, i) => {
      const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normHeader(k), v]));
      const type = String(r.type ?? (r.fn ? "owner" : "manager")).toLowerCase();
      if (type === "manager") addManager(i + 1, r); else addOwner(i + 1, r);
    });
  }
  if (!owners.length && !managers.length) issues.push({ row: 0, severity: "error", message: "No owners or managers found." });
  for (const need of ["HR", "IT"] as const) if (owners.length && !owners.some((o) => o.fn === need)) issues.push({ row: 0, severity: "warning", message: `No ${need} owner listed — ${need} tasks will have no named owner.` });
  const dir: Directory = { owners, managers, departments: [...departments] };
  return { data: [dir], issues, format: loaded.format, rows: owners.length + managers.length };
}
