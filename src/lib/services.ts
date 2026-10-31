import { fmtDate, missingFields, type Person } from "./people";
import { flatSteps } from "./workflow";
import { hash01 } from "./utils";

export interface ServiceDef {
  id: string;
  /** generic icon name (see components/ui/icons.ts) */
  icon: string;
  name: string;
  /** what this service creates (shown on hover) */
  creates: string;
  /** other services that must finish first; "all" = runs last */
  deps: string[] | "all";
  /** realistic duration range in seconds */
  secs: [number, number];
  /** what the service is doing while it runs, in order */
  phases: string[];
  /** concrete result shown once the service finishes for a person */
  artifact: (p: Person) => string;
  /** returns a reason when the service can only partially complete for this person */
  waits: (p: Person) => string | null;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
const gap = (p: Person, ...keys: string[]) => keys.filter((k) => (p.fields as Record<string, string>)[k] === "missing");
const num = (p: Person, salt: string, base: number, span: number) => base + Math.floor(hash01(p.id + salt) * span);
const apps = (p: Person) => flatSteps(p.persona).filter((s) => s.perm);

export const SERVICES: ServiceDef[] = [
  { id: "identity-svc", icon: "UserRoundCheck", name: "Email & SSO", creates: "Google Workspace mailbox, Okta user", deps: [], secs: [5, 9],
    phases: ["creating mailbox", "creating SSO user", "enforcing MFA"],
    artifact: (p) => `${slug(p.name)}@acme.com`, waits: () => null },
  { id: "letter-svc", icon: "FileSignature", name: "Offer letter & e-sign", creates: "renders the offer PDF and sends the e-sign link", deps: [], secs: [3, 6],
    phases: ["rendering offer PDF", "sending e-sign link"],
    artifact: (p) => `Offer_${p.name.split(" ")[0]}.pdf sent`, waits: () => null },
  { id: "access-svc", icon: "KeyRound", name: "App access & credentials", creates: "Slack, GitHub, Jira, Claude… at the persona’s permission level", deps: ["identity-svc"], secs: [7, 13],
    phases: ["assigning licences", "adding to groups", "setting permission levels"],
    artifact: (p) => `${apps(p).length} apps · ${apps(p).slice(0, 3).map((a) => a.title).join(", ")}…`, waits: () => null },
  { id: "bgv-svc", icon: "ShieldCheck", name: "Background verification", creates: "education / employment / address checks", deps: ["letter-svc"], secs: [3, 6],
    phases: ["creating vendor case", "submitting documents"],
    artifact: (p) => `case BGV-${num(p, "bgv", 20000, 9000)} opened`, waits: (p) => (gap(p, "Address").length ? "needs address" : null) },
  { id: "payroll-svc", icon: "Wallet", name: "Payroll & statutory", creates: "payroll record, PF/UAN, insurance enrolment", deps: [], secs: [4, 8],
    phases: ["creating payroll record", "registering PF / UAN", "enrolling insurance"],
    artifact: (p) => `record PR-${num(p, "pr", 4000, 5000)} staged`, waits: (p) => { const g = gap(p, "PAN", "Bank a/c"); return g.length ? `needs ${g.join(" + ")}` : null; } },
  { id: "idcard-svc", icon: "IdCard", name: "ID card", creates: "queues the print job with photo and QR", deps: [], secs: [2, 4],
    phases: ["composing card", "queueing print job"],
    artifact: (p) => `print job #${num(p, "id", 300, 600)} queued`, waits: (p) => (gap(p, "Photo").length ? "needs photo" : null) },
  { id: "facility-svc", icon: "Building2", name: "Premises & desk", creates: "building access, desk, parking", deps: ["idcard-svc"], secs: [2, 3],
    phases: ["reserving desk", "scheduling access pass"],
    artifact: (p) => `pass valid from ${fmtDate(p.day)}`, waits: () => null },
  { id: "agenda-svc", icon: "CalendarDays", name: "Day-1 agenda & buddy", creates: "builds the agenda, assigns a buddy, drafts the intro post", deps: ["identity-svc"], secs: [2, 4],
    phases: ["building agenda", "assigning buddy"],
    artifact: (p) => `agenda sent to ${p.manager.split(" ")[0]}`, waits: () => null },
  { id: "collect-svc", icon: "FileUp", name: "Document collection", creates: "magic link for missing documents and fields", deps: [], secs: [1, 2],
    phases: ["building checklist", "sending magic link"],
    artifact: (p) => { const n = missingFields(p).length; return n ? `link sent · ${n} item${n > 1 ? "s" : ""} outstanding` : "nothing to collect"; },
    waits: (p) => { const n = missingFields(p).length; return n ? `${n} item${n > 1 ? "s" : ""} outstanding` : null; } },
  { id: "reminder-svc", icon: "BellRing", name: "Reminders & escalations", creates: "schedules every T+N nudge in the workflow", deps: "all", secs: [2, 3],
    phases: ["scheduling nudges", "arming escalation ladder"],
    artifact: (p) => `${flatSteps(p.persona).length} reminders scheduled`, waits: () => null },
];
