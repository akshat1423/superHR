import { addDays } from "../dates";
import { COUNTRY_NAME, countryOf, type Country } from "../geo";
import type { Person } from "../people";
import type { EmpType, Level } from "../workflow";
import { resolveOwner } from "./owners";
import type { ChecklistItem, Condition, Directory, Requirement } from "./types";

/** The facts about an employee that requirements are evaluated against. */
export interface EmployeeCtx {
  id: string;
  name: string;
  email: string;
  role: string;
  grade: string;
  level: Level;
  department: string;
  location: string;
  country: Country;
  type: EmpType;
  manager: string;
  startDate: string;
  dob?: string;
  address?: string;
}

export const ctxOf = (p: Person): EmployeeCtx => ({
  id: p.id, name: p.name, email: p.email, role: p.role, grade: p.grade, level: p.persona.level, department: p.persona.dept,
  location: p.location, country: countryOf(p.location), type: p.persona.type, manager: p.manager, startDate: p.startDate,
  dob: p.dob, address: p.address,
});

const EXPERIENCED: Level[] = ["Mid", "Senior", "Leader"];
const DEGREE: Level[] = ["Associate", "Mid", "Senior", "Leader"];

/**
 * The default onboarding requirements. This is data, not code: upload your own requirements file on the
 * Ingest page to replace it. Each rule says who it applies to, who owns it, when it is due and what it waits for.
 */
export const DEFAULT_REQUIREMENTS: Requirement[] = [
  // documents the employee submits
  { id: "R-DOC-ID", item: "Government photo ID", kind: "document", owner: "Employee", dueOffset: -7, when: {}, docType: "id_proof", policyByCountry: { IN: "POL-01", US: "POL-02" },
    because: "Identity must be verified for every new joiner before joining" },
  { id: "R-DOC-ADDR", item: "Proof of address (last 3 months)", kind: "document", owner: "Employee", dueOffset: -7, when: {}, docType: "address_proof", policyByCountry: { IN: "POL-01", US: "POL-02" },
    because: "Current address is needed for the HR record and background verification" },
  { id: "R-DOC-PAN", item: "PAN card", kind: "document", owner: "Employee", dueOffset: -7, when: { countries: ["IN"] }, docType: "pan_card", policy: "POL-03",
    because: "A PAN is mandatory for payroll in India" },
  { id: "R-DOC-EDU", item: "Education certificate (highest qualification)", kind: "document", owner: "Employee", dueOffset: -7, when: { grades: DEGREE }, docType: "education_cert", policyByCountry: { IN: "POL-01", US: "POL-02" },
    because: "Roles above internship specify a minimum qualification that must be verified" },
  { id: "R-DOC-PREV", item: "Relieving / experience letter", kind: "document", owner: "Employee", dueOffset: -5, when: { grades: EXPERIENCED, countries: ["IN"] }, docType: "prev_employment", policy: "POL-01",
    because: "Experienced hires must evidence their last employment" },
  { id: "R-DOC-I9", item: "Form I-9 work-authorisation document", kind: "document", owner: "Employee", dueOffset: -3, when: { countries: ["US"] }, docType: "us_work_auth", policy: "POL-02",
    because: "U.S. employers must verify work authorisation for every hire" },
  { id: "R-INT-AGREE", item: "Internship agreement signed", kind: "activity", owner: "HR", dueOffset: -5, when: { types: ["Intern"] }, policy: "POL-01",
    because: "Interns sign an internship agreement instead of submitting education and employment documents" },

  // compliance and records
  { id: "R-BGV", item: "Background verification", kind: "activity", owner: "Compliance", dueOffset: -3, when: {}, dependsOn: ["R-DOC-ID", "R-DOC-ADDR"], policy: "POL-04",
    because: "Background verification is required before system access is granted" },
  { id: "R-REC", item: "HR employee record created", kind: "record", owner: "HR", dueOffset: -3, when: {}, dependsOn: ["R-DOC-ID", "R-DOC-ADDR", "R-DOC-PAN", "R-DOC-EDU", "R-DOC-I9", "R-INT-AGREE"], policyByCountry: { IN: "POL-03", US: "POL-02" },
    because: "The HR record is created once the required identity, address and qualification documents are accepted" },

  // provisioning, requested by the agent once the record exists
  { id: "R-APP-EXEC", item: "Executive laptop approval", kind: "approval", owner: "Dept Head", dueOffset: -4, when: { grades: ["Leader"] }, dependsOn: ["R-REC"], policy: "POL-05",
    because: "Leader-grade employees receive an executive laptop that needs their department head's approval" },
  { id: "R-IT-MAIL", item: "Email account", kind: "provision", owner: "IT", dueOffset: -2, when: {}, dependsOn: ["R-REC"], policy: "POL-05",
    because: "An email account is requested after the HR record is created" },
  { id: "R-IT-LAP", item: "Laptop", kind: "provision", owner: "IT", dueOffset: -2, when: {}, dependsOn: ["R-REC", "R-APP-EXEC"], policy: "POL-05",
    because: "A laptop is requested after the HR record is created" },
  { id: "R-FAC-BADGE", item: "ID card and building access", kind: "provision", owner: "Facilities", dueOffset: -2, when: {}, dependsOn: ["R-REC"], policy: "POL-10",
    because: "Facilities issue an ID card and building access once the HR record exists" },
  { id: "R-FAC-DESK", item: "Desk allocation", kind: "provision", owner: "Facilities", dueOffset: -1, when: {}, dependsOn: ["R-REC"], policy: "POL-10",
    because: "A desk is allocated the day before the employee joins" },

  // policies
  { id: "R-POL-INFOSEC", item: "Information security acknowledgement", kind: "policy", owner: "Employee", dueOffset: -1, when: {}, policy: "POL-06",
    because: "Required before access to production systems" },
  { id: "R-POL-CODE", item: "Code of Conduct acknowledgement", kind: "policy", owner: "Employee", dueOffset: 0, when: {}, policy: "POL-07",
    because: "Every new joiner acknowledges the Code of Conduct by their first day" },
  { id: "R-POL-POSH", item: "POSH awareness acknowledgement", kind: "policy", owner: "Employee", dueOffset: 3, when: { countries: ["IN"] }, policy: "POL-08",
    because: "The POSH Act requires awareness and acknowledgement within 3 days for employees in India" },
  { id: "R-POL-HARASS", item: "Anti-harassment policy acknowledgement", kind: "policy", owner: "Employee", dueOffset: 0, when: { countries: ["US"] }, policy: "POL-09",
    because: "U.S. employees acknowledge the anti-harassment policy during onboarding" },

  // role-specific access (needs BGV, email and the security acknowledgement)
  { id: "R-ACC-ENG", item: "Engineering tool access (source control, Jira, cloud)", kind: "provision", owner: "IT", dueOffset: 0, when: { departments: ["Engineering"] }, dependsOn: ["R-BGV", "R-IT-MAIL", "R-POL-INFOSEC"], policy: "POL-06",
    because: "Engineers need development tools; production access needs BGV clearance, an email account and the security acknowledgement" },
  { id: "R-APP-FIN", item: "Finance ledger access approval", kind: "approval", owner: "Dept Head", dueOffset: -1, when: { departments: ["Finance"], grades: ["Senior", "Leader"] }, dependsOn: ["R-REC"], policy: "POL-06",
    because: "Senior finance roles need the Finance Head's approval for ledger access" },
  { id: "R-ACC-FIN", item: "Finance system access (ledger, expense tools)", kind: "provision", owner: "IT", dueOffset: 0, when: { departments: ["Finance"] }, dependsOn: ["R-BGV", "R-IT-MAIL", "R-POL-INFOSEC", "R-APP-FIN"], policy: "POL-06",
    because: "Finance staff need ledger and expense systems after BGV clearance and the security acknowledgement" },
  { id: "R-ACC-PROD", item: "Product tool access (design, roadmap, analytics)", kind: "provision", owner: "IT", dueOffset: 0, when: { departments: ["Product"] }, dependsOn: ["R-BGV", "R-IT-MAIL"], policy: "POL-06",
    because: "Product roles need design and roadmap tools after BGV clearance" },
  { id: "R-ACC-BIZ", item: "Sales and CRM access", kind: "provision", owner: "IT", dueOffset: 0, when: { departments: ["Business"] }, dependsOn: ["R-BGV", "R-IT-MAIL"], policy: "POL-06",
    because: "Business roles need CRM access after BGV clearance" },
  { id: "R-ACC-PPL", item: "HR systems access", kind: "provision", owner: "IT", dueOffset: 0, when: { departments: ["People"] }, dependsOn: ["R-BGV", "R-IT-MAIL", "R-POL-INFOSEC"], policy: "POL-06",
    because: "People-team roles handle personal data and need HR systems after BGV clearance and the security acknowledgement" },

  // people & first days
  { id: "R-MGR-D1", item: "Day-1 agenda and buddy", kind: "activity", owner: "Manager", dueOffset: -1, when: {}, policy: "POL-10",
    because: "Managers send the day-1 agenda and assign a buddy the day before" },
  { id: "R-INT-MENTOR", item: "Mentor assigned", kind: "activity", owner: "Manager", dueOffset: -2, when: { types: ["Intern"] }, policy: "POL-10",
    because: "Every intern is assigned a mentor before they start" },
  { id: "R-PT-SCHED", item: "Weekly schedule agreed", kind: "activity", owner: "Manager", dueOffset: -2, when: { types: ["Part-time"] }, policy: "POL-10",
    because: "Part-time employees agree their weekly schedule with their manager before joining" },
  { id: "R-TRAIN-ORI", item: "Company orientation", kind: "activity", owner: "HR", dueOffset: 0, when: {}, policy: "POL-10",
    because: "HR runs orientation for every new joiner on the first day" },
  { id: "R-TRAIN-SEC", item: "Secure-coding training", kind: "activity", owner: "Manager", dueOffset: 7, when: { departments: ["Engineering"] }, policy: "POL-06",
    because: "Engineers complete secure-coding training in their first 7 days" },
];

// ── evaluation ──────────────────────────────────────────────────────────────

const lc = (s: string) => s.toLowerCase();
const list = (xs: string[]) => xs.join(" / ");

/** Does the condition match? Also returns the human-readable facts that made it match (or fail). */
export function matchCondition(c: Condition, e: EmployeeCtx): { ok: boolean; facts: string[] } {
  const facts: string[] = [];
  let ok = true;
  const check = (set: boolean, matched: boolean, text: string) => { if (set) { if (matched) facts.push(text); else ok = false; } };
  check(!!c.departments?.length, !!c.departments?.some((d) => lc(d) === lc(e.department)), `department is ${e.department} (rule covers ${list(c.departments ?? [])})`);
  check(!!c.locations?.length, !!c.locations?.some((l) => lc(l) === lc(e.location)), `location is ${e.location} (rule covers ${list(c.locations ?? [])})`);
  check(!!c.countries?.length, !!c.countries?.includes(e.country), `${e.location} is in ${COUNTRY_NAME[e.country]}`);
  check(!!c.roles?.length, !!c.roles?.some((r) => lc(e.role).includes(lc(r))), `job title "${e.role}" matches ${list(c.roles ?? [])}`);
  check(!!c.grades?.length, !!c.grades?.includes(e.level), `grade ${e.grade} falls in the ${e.level} band (rule covers ${list(c.grades ?? [])})`);
  check(!!c.types?.length, !!c.types?.includes(e.type), `employment type is ${e.type}`);
  return { ok, facts };
}

export const itemIdFor = (personId: string, ruleId: string) => `${personId}:${ruleId}`;

/**
 * Evaluate every requirement against one employee. The result is the employee's checklist; each item records
 * the rule that created it and a plain-English reason naming the facts that matched.
 */
export function generateChecklist(e: EmployeeCtx, rules: Requirement[], dir: Directory): ChecklistItem[] {
  const applicable = rules.map((r) => ({ r, m: matchCondition(r.when, e) })).filter((x) => x.m.ok);
  const ids = new Set(applicable.map((x) => x.r.id));
  const items = applicable.map(({ r, m }): ChecklistItem => ({
    id: itemIdFor(e.id, r.id),
    personId: e.id,
    ruleId: r.id,
    item: r.item,
    kind: r.kind,
    ownerFn: r.owner,
    owner: resolveOwner(r.owner, { name: e.name, email: e.email, department: e.department, location: e.location, manager: e.manager }, dir),
    dueDate: addDays(e.startDate, r.dueOffset),
    dependsOn: (r.dependsOn ?? []).filter((d) => ids.has(d)).map((d) => itemIdFor(e.id, d)),
    policy: r.policyByCountry?.[e.country] ?? r.policy,
    docType: r.docType,
    status: "pending",
    reason: `${r.because}. [${r.id}] ${m.facts.length ? `Applies because ${m.facts.join("; ")}.` : "Applies to every new joiner."}`,
  }));
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.ruleId.localeCompare(b.ruleId));
}
