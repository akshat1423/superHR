/**
 * Writes the downloadable sample datasets to public/samples/:  npm run samples
 * (The Excel file is produced separately by scripts/make-xlsx.py — Python's openpyxl.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import { SAMPLE_CSV } from "../src/lib/sample";
import { DEFAULT_REQUIREMENTS } from "../src/lib/onboarding/rules";
import { SAMPLE_DIRECTORY } from "../src/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "../src/lib/onboarding/policies";
import { parseAts } from "../src/lib/csv";

const dir = new URL("../public/samples/", import.meta.url);
mkdirSync(dir, { recursive: true });
const out = (name: string, content: string) => writeFileSync(new URL(name, dir), content);

// employees
out("new-joiners.csv", SAMPLE_CSV);
const people = parseAts(SAMPLE_CSV).people;
out("new-joiners.json", JSON.stringify(Papa.parse<Record<string, string>>(SAMPLE_CSV, { header: true, skipEmptyLines: true }).data, null, 2));

// a deliberately broken file: every kind of error the validator catches
out("new-joiners-with-errors.csv", [
  "full_name,email,phone,role,department,emp_type,level,grade,location,start_date,manager,dob",
  "Anjali Verma,anjali.verma@gmail.com,+91 98100 22001,Backend Engineer,Engineering,Full-time,SDE-2,L4,Bengaluru,2026-11-10,Arjun Rao,1996-05-14",
  "Bad Date,bad.date@gmail.com,+91 98100 22002,Data Analyst,Finance,Full-time,Associate,L3,Mumbai,31/02/2026,Neha Kapoor,1999-01-20",
  "Wrong Dept,wrong.dept@gmail.com,+91 98100 22003,Growth Marketer,Marketing,Full-time,Mid,L4,Pune,2026-11-12,Rahul Jain,1997-07-07",
  "Ghost Manager,ghost.manager@gmail.com,+91 98100 22004,Designer,Product,Full-time,Mid,L4,Hyderabad,2026-11-12,Arjun Roa,1995-02-02",
  "No Grade,no.grade@gmail.com,+91 98100 22005,Support Engineer,Engineering,Full-time,Mid,,Chennai,2026-11-14,Arjun Rao,1998-03-03",
  "Dup Email,anjali.verma@gmail.com,+91 98100 22006,QA Engineer,Engineering,Full-time,SDE-1,L3,Pune,2026-11-14,Dev Patel,1999-09-09",
  "Odd Office,odd.office@gmail.com,+91 98100 22007,SRE,Engineering,Full-time,SDE-3,L5,Gotham,2026-11-16,Arjun Rao,1991-11-11",
  "",
].join("\n"));

// requirements (flat columns, one row per rule)
const cols = ["id", "item", "kind", "owner", "due_offset", "departments", "locations", "countries", "roles", "grades", "types", "depends_on", "policy", "policy_in", "policy_us", "doc_type", "because"];
const rows = DEFAULT_REQUIREMENTS.map((r) => ({
  id: r.id, item: r.item, kind: r.kind, owner: r.owner, due_offset: r.dueOffset,
  departments: (r.when.departments ?? []).join("|"), locations: (r.when.locations ?? []).join("|"), countries: (r.when.countries ?? []).join("|"),
  roles: (r.when.roles ?? []).join("|"), grades: (r.when.grades ?? []).join("|"), types: (r.when.types ?? []).join("|"),
  depends_on: (r.dependsOn ?? []).join("|"), policy: r.policy ?? "", policy_in: r.policyByCountry?.IN ?? "", policy_us: r.policyByCountry?.US ?? "",
  doc_type: r.docType ?? "", because: r.because,
}));
out("requirements.csv", Papa.unparse({ fields: cols, data: rows }));
out("requirements.json", JSON.stringify(DEFAULT_REQUIREMENTS, null, 2));

// policies
out("policies.json", JSON.stringify(SAMPLE_POLICIES, null, 2));
const flat = SAMPLE_POLICIES.flatMap((p) => p.sections.map((s) => ({ policy_id: p.id, title: p.title, version: p.version, countries: (p.appliesTo.countries ?? []).join("|"), section_id: s.id, heading: s.heading, text: s.text })));
out("policies.csv", Papa.unparse(flat));
out("policy-remote-work.md", `---
id: POL-12
version: v1.0
countries: IN|US
---
# Remote Work and Equipment Policy

## Eligibility
Employees may work remotely up to 2 days a week after completing their first 30 days. Fully remote arrangements need written approval from the department head and HR.

## Equipment
Remote employees receive a company laptop by courier. A one-time home-office allowance of 15,000 INR (or 200 USD in the United States) can be claimed within the first 60 days; receipts are required.
`);

// owners and directory
out("owners.json", JSON.stringify(SAMPLE_DIRECTORY, null, 2));
out("owners.csv", Papa.unparse({
  fields: ["type", "fn", "department", "location", "name", "email"],
  data: [...SAMPLE_DIRECTORY.owners.map((o) => ({ type: "owner", fn: o.fn, department: o.department, location: o.location, name: o.name, email: o.email })), ...SAMPLE_DIRECTORY.managers.map((m) => ({ type: "manager", fn: "", department: m.department, location: "", name: m.name, email: m.email }))],
}));

console.log(`wrote samples for ${people.length} people, ${DEFAULT_REQUIREMENTS.length} requirements, ${SAMPLE_POLICIES.length} policies to public/samples/`);
