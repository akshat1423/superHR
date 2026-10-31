import type { Country } from "../geo";
import type { EmpType, Level } from "../workflow";

/** Who is responsible for a checklist item. Resolved to a named person through the owner directory. */
export type OwnerFn = "Employee" | "HR" | "IT" | "Facilities" | "Compliance" | "Manager" | "Dept Head";
export type ItemKind = "document" | "activity" | "record" | "provision" | "policy" | "approval";
export type DocTypeId = "id_proof" | "address_proof" | "education_cert" | "prev_employment" | "pan_card" | "us_work_auth";

/** Which employees a requirement applies to. Every condition that is set must match. */
export interface Condition {
  departments?: string[];
  locations?: string[];
  countries?: Country[];
  /** matched as a case-insensitive substring of the job title */
  roles?: string[];
  grades?: Level[];
  types?: EmpType[];
}

/** One onboarding requirement: the data the checklist is generated from. */
export interface Requirement {
  id: string;
  item: string;
  kind: ItemKind;
  owner: OwnerFn;
  /** due date = joining date + this many days (negative = before joining) */
  dueOffset: number;
  when: Condition;
  /** other requirement ids that must be completed first (ignored when they don't apply to the employee) */
  dependsOn?: string[];
  policy?: string;
  policyByCountry?: Partial<Record<Country, string>>;
  docType?: DocTypeId;
  /** plain-English reason this item exists; shown to the employee and HR */
  because: string;
}

export interface Contact { name: string; email: string }

export type ItemStatus = "pending" | "requested" | "completed";
export interface ChecklistItem {
  id: string;
  personId: string;
  ruleId: string;
  item: string;
  kind: ItemKind;
  ownerFn: OwnerFn;
  owner: Contact;
  dueDate: string;
  /** ids of items that must complete first */
  dependsOn: string[];
  policy?: string;
  docType?: DocTypeId;
  status: ItemStatus;
  completedAt?: string;
  /** service-desk ticket raised by the agent for provisioning items */
  ticket?: string;
  /** why this item is on the checklist: the rule and the facts that matched */
  reason: string;
}

/** What a viewer sees: derived from status, dependencies, due date and document review. */
export type ItemState = "completed" | "pending" | "blocked" | "overdue";

// ── policies ────────────────────────────────────────────────────────────────
export interface PolicySection { id: string; heading: string; text: string }
export interface Policy {
  id: string;
  title: string;
  version: string;
  appliesTo: { countries?: Country[]; departments?: string[]; locations?: string[]; grades?: Level[] };
  sections: PolicySection[];
}

// ── owner directory ─────────────────────────────────────────────────────────
export type DirFn = "HR" | "IT" | "Facilities" | "Compliance" | "Dept Head";
export interface OwnerRow {
  fn: DirFn;
  /** "*" = any department */
  department: string;
  /** a city, a country code (IN / US) or "*" */
  location: string;
  name: string;
  email: string;
}
export interface ManagerRow { name: string; email: string; department: string }
export interface Directory { owners: OwnerRow[]; managers: ManagerRow[]; departments: string[] }

// ── documents ───────────────────────────────────────────────────────────────
/** The five statuses a required document can have. */
export type DocStatus = "Not Submitted" | "Submitted" | "Under Review" | "Accepted" | "Correction Requested";
export const DOC_STATUSES: DocStatus[] = ["Not Submitted", "Submitted", "Under Review", "Accepted", "Correction Requested"];

export interface Issue {
  severity: "error" | "warning";
  code: string;
  field?: string;
  message: string;
  expected?: string;
  found?: string;
}

export interface Extracted {
  docKind?: string;
  name?: string;
  dob?: string;
  idNumber?: string;
  address?: string;
  issueDate?: string;
  expiryDate?: string;
  degree?: string;
  institution?: string;
  year?: string;
  employer?: string;
  lastWorkingDate?: string;
}

export interface DocumentRecord {
  id: string;
  personId: string;
  itemId: string;
  docType: DocTypeId;
  status: DocStatus;
  fileName?: string;
  fileSize?: number;
  uploadedAt?: string;
  /** how the values were read: from the file's text, by AI, or not at all */
  extraction?: "text" | "ai" | "none";
  extracted?: Extracted;
  issues: Issue[];
  reviewerNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** number of times the employee has re-submitted after a correction request */
  attempts: number;
  /** how the document service handled the last upload: what it did, step by step, and who decided */
  processing?: { traceId: string; mode: "text" | "ai" | "manual"; steps: { label: string; ok: boolean; ms: number; detail: string }[]; at: string };
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  personId: string;
  action: string;
  detail?: string;
}
