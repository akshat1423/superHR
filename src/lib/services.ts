import { fmtDate, missingFields, type Person } from "./people";
import { flatSteps } from "./workflow";

export interface ServiceDef {
  id: string;
  mono: string;
  name: string;
  creates: string;
  /** log line when the service handles a person */
  line: (p: Person) => string;
  /** returns a reason when the service can only partially run for this person */
  waits: (p: Person) => string | null;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
const gap = (p: Person, ...keys: string[]) =>
  keys.filter((k) => (p.fields as Record<string, string>)[k] === "missing");

export const SERVICES: ServiceDef[] = [
  { id: "identity-svc", mono: "Id", name: "Email & SSO", creates: "Google Workspace mailbox, Okta user",
    line: (p) => `${slug(p.name)}@acme.com created`, waits: () => null },
  { id: "access-svc", mono: "Ac", name: "App access & credentials", creates: "Slack, GitHub, Jira, Claude… at the persona’s permission level",
    line: (p) => `${flatSteps(p.persona).filter((s) => s.perm).length} apps provisioned (${p.persona.level === "Leader" ? "Admin" : p.persona.level === "Intern" ? "Read" : "Member"})`, waits: () => null },
  { id: "payroll-svc", mono: "Pr", name: "Payroll & statutory", creates: "payroll record, PF/UAN, insurance enrolment",
    line: () => "payroll record staged", waits: (p) => { const g = gap(p, "PAN", "Bank a/c"); return g.length ? `waiting: ${g.join(", ")}` : null; } },
  { id: "bgv-svc", mono: "Bg", name: "Background verification", creates: "education / employment / address checks",
    line: () => "BGV case opened with vendor", waits: (p) => { const g = gap(p, "Address"); return g.length ? "waiting: address" : null; } },
  { id: "letter-svc", mono: "Ol", name: "Offer letter & e-sign", creates: "renders offer PDF, sends e-sign link",
    line: () => "offer letter rendered · e-sign link sent", waits: () => null },
  { id: "idcard-svc", mono: "Id", name: "ID card", creates: "queues print job with photo + QR",
    line: () => "print job queued", waits: (p) => (gap(p, "Photo").length ? "waiting: photo" : null) },
  { id: "facility-svc", mono: "Fc", name: "Premises & desk", creates: "building access, desk, parking",
    line: (p) => `access pass scheduled for ${fmtDate(p.day)}`, waits: () => null },
  { id: "agenda-svc", mono: "D1", name: "Day-1 agenda & buddy", creates: "builds agenda, assigns buddy, drafts intro post",
    line: (p) => `agenda sent to ${p.manager.split(" ")[0]}`, waits: () => null },
  { id: "collect-svc", mono: "Dc", name: "Document collection", creates: "magic link for missing docs & fields",
    line: (p) => `${missingFields(p).length} field(s) requested via link`, waits: (p) => { const n = missingFields(p).length; return n ? `sent: ${n} missing` : null; } },
  { id: "reminder-svc", mono: "Rm", name: "Reminders & escalations", creates: "schedules every T+N nudge in the workflow",
    line: (p) => `${flatSteps(p.persona).length} reminders scheduled`, waits: () => null },
];
