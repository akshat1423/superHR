import { addDays, daysBetween, parseDateISO, todayISO, fmtHuman } from "../dates";
import type { DocStatus, DocTypeId, DocumentRecord, Extracted, Issue } from "./types";
import type { EmployeeCtx } from "./rules";

export interface DocTypeDef {
  id: DocTypeId;
  label: string;
  /** what the employee can upload, in plain words */
  hint: string;
  /** fields that must be readable on the document */
  required: (keyof Extracted)[];
  /** acceptable kinds of document (matched against what the document says it is); empty = anything */
  kinds: string[];
  /** does an expiry date apply? */
  expires: boolean;
}

const FIELD_LABEL: Record<keyof Extracted, string> = {
  docKind: "document type", name: "name", dob: "date of birth", idNumber: "ID number", address: "address", issueDate: "issue date",
  expiryDate: "expiry date", degree: "degree", institution: "institution", year: "year of passing", employer: "employer", lastWorkingDate: "last working day",
};

export const DOC_TYPES: Record<DocTypeId, DocTypeDef> = {
  id_proof: { id: "id_proof", label: "Government photo ID", hint: "Passport, Aadhaar, driving licence or state ID", required: ["name", "dob", "idNumber"], expires: true,
    kinds: ["passport", "aadhaar", "driving licence", "driving license", "driver's license", "driver's licence", "voter id", "state id", "permanent resident card"] },
  address_proof: { id: "address_proof", label: "Proof of address", hint: "Utility bill, bank statement or rental agreement from the last 3 months", required: ["name", "address", "issueDate"], expires: false,
    kinds: ["utility bill", "electricity bill", "gas bill", "water bill", "bank statement", "rental agreement", "lease agreement", "lease"] },
  education_cert: { id: "education_cert", label: "Education certificate", hint: "Degree or provisional certificate for your highest qualification", required: ["name", "degree", "institution", "year"], expires: false,
    kinds: ["degree certificate", "provisional certificate", "marksheet", "diploma", "transcript", "degree"] },
  prev_employment: { id: "prev_employment", label: "Relieving / experience letter", hint: "Letter from your last employer", required: ["name", "employer", "lastWorkingDate"], expires: false,
    kinds: ["relieving letter", "experience letter", "service certificate", "employment letter"] },
  pan_card: { id: "pan_card", label: "PAN card", hint: "Permanent Account Number card", required: ["name", "idNumber"], expires: false, kinds: ["pan card", "pan"] },
  us_work_auth: { id: "us_work_auth", label: "Work-authorisation document (Form I-9)", hint: "List A document, or a List B and a List C document", required: ["name", "idNumber"], expires: true,
    kinds: ["passport", "permanent resident card", "employment authorization document", "driver's license", "driver's licence", "social security card"] },
};

export const ALLOWED_EXT = ["pdf", "png", "jpg", "jpeg", "txt", "json"];
export const TEXT_EXT = ["txt", "json"];
export const MAX_BYTES = 5 * 1024 * 1024;
export const extOf = (name: string) => (name.toLowerCase().split(".").pop() ?? "");

/** Checks on the file itself, before anything is read: type, size, empty. */
export function checkFile(name: string, size: number): Issue[] {
  const out: Issue[] = [];
  const ext = extOf(name);
  if (!ALLOWED_EXT.includes(ext)) out.push({ severity: "error", code: "FILE_TYPE", field: "file", message: `.${ext || "?"} files aren't accepted. Please upload a PDF, JPG or PNG (a .txt or .json copy also works for the demo).`, found: `.${ext}`, expected: "PDF, JPG, PNG" });
  if (size === 0) out.push({ severity: "error", code: "FILE_EMPTY", field: "file", message: "The file is empty. Please upload the scanned document." });
  if (size > MAX_BYTES) out.push({ severity: "error", code: "FILE_SIZE", field: "file", message: `The file is ${(size / 1_048_576).toFixed(1)} MB; the limit is 5 MB. Please upload a smaller scan.`, found: `${(size / 1_048_576).toFixed(1)} MB`, expected: "≤ 5 MB" });
  return out;
}

// ── extraction (text and JSON documents) ────────────────────────────────────

const KEYS: Record<keyof Extracted, string[]> = {
  docKind: ["document type", "document", "doc type", "type", "kind"],
  name: ["name", "full name", "holder", "holder name", "candidate name", "employee name", "student name", "account holder", "customer name", "surname and given names"],
  dob: ["dob", "date of birth", "birth date", "born"],
  idNumber: ["id number", "passport no", "passport number", "licence no", "license no", "licence number", "license number", "aadhaar number", "document number", "pan", "pan number", "ssn", "number", "card number", "id no"],
  address: ["address", "residential address", "service address", "billing address", "property address"],
  issueDate: ["issue date", "date of issue", "issued on", "issued", "statement date", "bill date", "invoice date", "agreement date", "date"],
  expiryDate: ["expiry date", "date of expiry", "valid until", "valid till", "expires", "expiry", "expiration date"],
  degree: ["degree", "qualification", "programme", "program"],
  institution: ["institution", "university", "college", "school", "issued by"],
  year: ["year", "year of passing", "graduation year", "passing year"],
  employer: ["employer", "company", "organisation", "organization", "employer name"],
  lastWorkingDate: ["last working day", "last working date", "relieving date", "date of relieving", "last day of employment", "last day"],
};
const KEY_TO_FIELD = new Map<string, keyof Extracted>();
for (const f of Object.keys(KEYS) as (keyof Extracted)[]) for (const k of KEYS[f]) if (!KEY_TO_FIELD.has(k)) KEY_TO_FIELD.set(k, f);

const DATE_FIELDS: (keyof Extracted)[] = ["dob", "issueDate", "expiryDate", "lastWorkingDate"];
const norm = (k: string) => k.toLowerCase().replace(/[_\-]+/g, " ").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();

/** Read "Field: value" lines (or a flat JSON object) into the fields we validate. Dates become ISO; unreadable dates are kept as text. */
export function extractFromText(content: string, fileName = ""): Extracted {
  const pairs: [string, string][] = [];
  if (extOf(fileName) === "json" || content.trim().startsWith("{")) {
    try { for (const [k, v] of Object.entries(JSON.parse(content) as Record<string, unknown>)) if (v !== null && typeof v !== "object") pairs.push([norm(k), String(v)]); } catch { /* fall through to line parsing */ }
  }
  if (!pairs.length) for (const line of content.split(/\r?\n/)) { const m = line.match(/^\s*([^:=]{2,40})\s*[:=]\s*(.+?)\s*$/); if (m) pairs.push([norm(m[1]), m[2]]); }
  const out: Extracted = {};
  for (const [k, v] of pairs) {
    const f = KEY_TO_FIELD.get(k);
    if (!f || out[f] !== undefined) continue;
    out[f] = DATE_FIELDS.includes(f) ? (parseDateISO(v) ?? v) : v.trim();
  }
  return out;
}

// ── comparison helpers ──────────────────────────────────────────────────────

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(mr|mrs|ms|miss|dr|shri|smt|sri)\b\.?/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const tokenMatch = (a: string, b: string) => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)) || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

/**
 * Compare a name on a document with the profile.
 *  exact    same words in any order, ignoring case, accents and titles
 *  close    one name is the other plus a middle name/initial, or differs by a typo — worth a human look
 *  mismatch different person
 */
export function compareNames(onDoc: string, onProfile: string): "exact" | "close" | "mismatch" {
  const a = strip(onDoc).split(" ").filter(Boolean), b = strip(onProfile).split(" ").filter(Boolean);
  if (!a.length || !b.length) return "mismatch";
  if (a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ")) return "exact";
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  const allMatch = short.every((t) => { const i = long.findIndex((u, k) => !used.has(k) && tokenMatch(t, u)); if (i < 0) return false; used.add(i); return true; });
  // at least a first and a last name must line up, so "Sharma" alone is not a match for "Riya Sharma"
  return allMatch && short.length >= 2 ? "close" : "mismatch";
}

const fmt = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? fmtHuman(iso) : (iso ?? "—"));

// ── validation ──────────────────────────────────────────────────────────────

/** Validate what was read from a document against the document type and the employee's profile. */
export function validateDocument(def: DocTypeDef, x: Extracted, e: EmployeeCtx): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, message: string, extra: Partial<Issue> = {}) => out.push({ severity: "error", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<Issue> = {}) => out.push({ severity: "warning", code, message, ...extra });
  const today = todayISO();

  for (const f of def.required) if (!x[f]) err("MISSING_FIELD", `We couldn't find the ${FIELD_LABEL[f]} on this document. Please upload a complete, legible copy.`, { field: f });
  if (def.kinds.length && x.docKind && !def.kinds.some((k) => x.docKind!.toLowerCase().includes(k)))
    err("WRONG_DOCUMENT_TYPE", `This looks like a "${x.docKind}", but we need ${def.hint.toLowerCase()}.`, { field: "docKind", found: x.docKind, expected: def.kinds.slice(0, 4).join(", ") });

  if (x.name) {
    const c = compareNames(x.name, e.name);
    if (c === "mismatch") err("NAME_MISMATCH", `The name on the document ("${x.name}") doesn't match your profile ("${e.name}"). Please upload a document showing your name exactly as on your offer letter.`, { field: "name", found: x.name, expected: e.name });
    else if (c === "close") warn("NAME_CLOSE", `The name on the document ("${x.name}") differs slightly from your profile ("${e.name}"). HR will confirm it's you.`, { field: "name", found: x.name, expected: e.name });
  }

  if (x.dob) {
    const d = parseDateISO(x.dob);
    if (!d) err("UNREADABLE_DATE", `We couldn't read the date of birth ("${x.dob}"). Please upload a clearer copy.`, { field: "dob", found: x.dob });
    else if (e.dob && d !== e.dob) err("DOB_MISMATCH", `The date of birth on the document (${fmt(d)}) doesn't match your profile (${fmt(e.dob)}).`, { field: "dob", found: d, expected: e.dob });
    else if (!e.dob) warn("NO_PROFILE_DOB", "Your profile has no date of birth to compare with, so HR will check it manually.", { field: "dob" });
  }

  if (def.expires && x.expiryDate) {
    const exp = parseDateISO(x.expiryDate);
    if (!exp) err("UNREADABLE_DATE", `We couldn't read the expiry date ("${x.expiryDate}"). Please upload a clearer copy.`, { field: "expiryDate", found: x.expiryDate });
    else if (exp < today) err("EXPIRED", `This document expired on ${fmt(exp)}. Please upload one that is still valid.`, { field: "expiryDate", found: exp, expected: `after ${fmt(today)}` });
    else if (exp < e.startDate) err("EXPIRES_BEFORE_JOINING", `This document expires on ${fmt(exp)}, before your joining date (${fmt(e.startDate)}). Please upload one that is valid on your joining date.`, { field: "expiryDate", found: exp, expected: `on or after ${fmt(e.startDate)}` });
    else if (daysBetween(e.startDate, exp) < 180) warn("EXPIRES_SOON", `This document expires on ${fmt(exp)}, within 6 months of joining. Consider renewing it.`, { field: "expiryDate", found: exp });
  }

  if (def.id === "address_proof") {
    const issued = x.issueDate ? parseDateISO(x.issueDate) : null;
    if (x.issueDate && !issued) err("UNREADABLE_DATE", `We couldn't read the date on this proof of address ("${x.issueDate}").`, { field: "issueDate", found: x.issueDate });
    else if (issued && issued < addDays(e.startDate, -90)) err("STALE_DOCUMENT", `This proof of address is dated ${fmt(issued)}, which is more than 3 months before your joining date. Please upload a more recent one.`, { field: "issueDate", found: issued, expected: `on or after ${fmt(addDays(e.startDate, -90))}` });
    else if (issued && issued > today) warn("FUTURE_DATE", `This proof of address is dated in the future (${fmt(issued)}).`, { field: "issueDate", found: issued });
    if (x.address && e.location !== "Unspecified" && !x.address.toLowerCase().includes(e.location.toLowerCase().slice(0, 5)))
      warn("ADDRESS_LOCATION", `The address doesn't mention ${e.location}. HR will check it.`, { field: "address", found: x.address });
  }

  if (def.id === "pan_card" && x.idNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(x.idNumber.trim().toUpperCase()))
    err("INVALID_FORMAT", `"${x.idNumber}" isn't a valid PAN. A PAN has 5 letters, 4 digits and 1 letter (for example ABCDE1234F).`, { field: "idNumber", found: x.idNumber, expected: "AAAAA9999A" });

  if (def.id === "education_cert" && x.year) {
    const y = Number(x.year);
    if (!Number.isInteger(y) || y < 1960) err("UNREADABLE_DATE", `We couldn't read the year of passing ("${x.year}").`, { field: "year", found: x.year });
    else if (y > Number(e.startDate.slice(0, 4))) err("FUTURE_DATE", `The year of passing (${y}) is after your joining year. If you haven't graduated yet, please check with HR.`, { field: "year", found: String(y) });
  }

  if (def.id === "prev_employment" && x.lastWorkingDate) {
    const d = parseDateISO(x.lastWorkingDate);
    if (d && d > e.startDate) err("DATE_ORDER", `Your last working day at the previous employer (${fmt(d)}) is after your joining date (${fmt(e.startDate)}).`, { field: "lastWorkingDate", found: d, expected: `on or before ${fmt(e.startDate)}` });
  }
  return out;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");

/** What a validated upload becomes: errors send it back to the employee with the reasons, otherwise it is accepted. */
export const statusAfterValidation = (issues: Issue[]): DocStatus => (hasErrors(issues) ? "Correction Requested" : "Accepted");

export function emptyDocument(personId: string, itemId: string, docType: DocTypeId): DocumentRecord {
  return { id: `doc:${itemId}`, personId, itemId, docType, status: "Not Submitted", issues: [], attempts: 0 };
}

// ── sample documents (so the flow can be tried without real scans) ──────────

export type SampleVariant = "valid" | "wrongName" | "expired" | "staleAddress" | "wrongDob" | "wrongKind" | "badPan" | "missingField";

/** A synthetic text document for this employee. Variants are deliberately flawed to demonstrate each check. */
export function makeSampleDocument(type: DocTypeId, e: EmployeeCtx, variant: SampleVariant = "valid"): { fileName: string; content: string } {
  const name = variant === "wrongName" ? `${e.name.split(" ")[0] === "Riya" ? "Priyanka" : "Priya"} ${e.name.split(" ").slice(-1)[0]}` : e.name;
  const dob = variant === "wrongDob" ? "1990-01-01" : (e.dob ?? "1995-06-15");
  const address = e.address ?? `12 Main Street, ${e.location}`;
  const L: string[] = [];
  const kind = (k: string) => L.push(`Document Type: ${variant === "wrongKind" ? "Library Membership Card" : k}`);
  switch (type) {
    case "id_proof": {
      const us = e.country === "US";
      kind(us ? "Passport" : "Passport"); L.push(`Name: ${name}`); if (variant !== "missingField") L.push(`Date of Birth: ${dob}`);
      L.push(`Passport Number: ${us ? "A12345678" : "K1234567"}`, `Date of Issue: 2021-04-02`, `Date of Expiry: ${variant === "expired" ? "2025-03-01" : "2031-04-01"}`); break;
    }
    case "address_proof":
      kind("Electricity Bill"); L.push(`Name: ${name}`, `Address: ${address}`, `Bill Date: ${variant === "staleAddress" ? "2026-03-04" : addDays(e.startDate, -20)}`); break;
    case "education_cert":
      kind("Degree Certificate"); L.push(`Name: ${name}`, `Degree: ${e.level === "Intern" ? "B.Tech (pursuing)" : "Bachelor of Technology"}`, `University: State Technical University`, `Year of Passing: 2019`); break;
    case "prev_employment":
      kind("Relieving Letter"); L.push(`Name: ${name}`, `Employer: Previous Employer Pvt Ltd`, `Last Working Day: ${addDays(e.startDate, -21)}`); break;
    case "pan_card":
      kind("PAN Card"); L.push(`Name: ${name}`, `PAN Number: ${variant === "badPan" ? "ABCDE12345" : "ABCPS1234F"}`); break;
    case "us_work_auth":
      kind("Passport"); L.push(`Name: ${name}`, `Document Number: A12345678`, `Date of Expiry: ${variant === "expired" ? "2025-03-01" : "2031-04-01"}`); break;
  }
  const slug = e.name.toLowerCase().replace(/[^a-z]+/g, "-");
  return { fileName: `${type}-${slug}${variant === "valid" ? "" : "-" + variant}.txt`, content: L.join("\n") + "\n" };
}
