import { fmtDate, missingFields, type Person } from "./people";
import { flatSteps } from "./workflow";
import { hash01 } from "./utils";

/** One API call an agent makes while doing its job. */
export interface Phase { label: string; call: string }

/** A way a service can fail, written the way an on-call engineer would want to read it. */
export interface Failure {
  code: string;
  title: string;
  cause: (p: Person) => string;
  /** the request/response that proves it */
  evidence: (p: Person) => string;
  fix: string;
  /** can a plain retry succeed without anyone changing something first? */
  retryable: boolean;
  /** which phase fails (index into `phases`) */
  phase: number;
}

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
  /** the API calls it makes, in order */
  phases: Phase[];
  failures: Failure[];
  /** concrete result shown once the service finishes for a person */
  artifact: (p: Person) => string;
  /** returns a reason when the service can only partially complete for this person (needs the candidate) */
  waits: (p: Person) => string | null;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
const email = (p: Person) => `${slug(p.name)}@acme.com`;
const gap = (p: Person, ...keys: string[]) => keys.filter((k) => (p.fields as Record<string, string>)[k] === "missing");
const num = (p: Person, salt: string, base: number, span: number) => base + Math.floor(hash01(p.id + salt) * span);
const apps = (p: Person) => flatSteps(p.persona).filter((s) => s.perm);
const first = (p: Person) => p.name.split(" ")[0];

export const SERVICES: ServiceDef[] = [
  { id: "identity-svc", icon: "UserRoundCheck", name: "Email & SSO", creates: "Google Workspace mailbox, Okta user", deps: [], secs: [5, 9],
    phases: [
      { label: "Create Google Workspace mailbox", call: "POST admin.googleapis.com/admin/directory/v1/users" },
      { label: "Create Okta user", call: "POST acme.okta.com/api/v1/users?activate=true" },
      { label: "Enforce MFA enrolment", call: "POST acme.okta.com/api/v1/users/{id}/factors" },
    ],
    failures: [
      { code: "409", title: "Mailbox alias already exists", phase: 0, retryable: false,
        cause: (p) => `An archived account still owns ${email(p)}, and Google Directory rejects duplicate primary aliases.`,
        evidence: (p) => `POST /admin/directory/v1/users\n→ 409 Conflict\n{"error":{"message":"Entity already exists.","domain":"global","reason":"duplicate"}}\nprimaryEmail=${email(p)}`,
        fix: "Delete the stale account, or create the user with a different alias (e.g. first.last2@acme.com), then retry." },
      { code: "429", title: "Directory API rate limit hit", phase: 1, retryable: true,
        cause: () => "Bulk onboarding exceeded the Okta rate limit for user creation (50 req/min).",
        evidence: () => "POST /api/v1/users?activate=true\n→ 429 Too Many Requests\nx-rate-limit-remaining: 0\nx-rate-limit-reset: +34s",
        fix: "Wait for the rate-limit window to reset and retry — nothing needs to change." },
    ],
    artifact: (p) => email(p), waits: () => null },

  { id: "letter-svc", icon: "FileSignature", name: "Offer letter & e-sign", creates: "renders the offer PDF and sends the e-sign link", deps: [], secs: [3, 6],
    phases: [
      { label: "Render offer PDF", call: "POST letters.acme.internal/v1/render/offer" },
      { label: "Send e-sign link", call: "POST esign.acme.internal/v1/envelopes" },
    ],
    failures: [
      { code: "500", title: "Offer template variable missing", phase: 0, retryable: false,
        cause: (p) => `The offer template needs {{ctc}} and {{joining_bonus}} but the ATS export has no compensation columns for ${first(p)}.`,
        evidence: (p) => `POST /v1/render/offer\n→ 500 Internal Server Error\nTemplateError: undefined variable "ctc" in offer_fulltime_v7.html\ncandidate=${p.name}`,
        fix: "Add compensation to the candidate record (or set a default band for this level), then retry." },
    ],
    artifact: (p) => `Offer_${first(p)}.pdf sent`, waits: () => null },

  { id: "access-svc", icon: "KeyRound", name: "App access & credentials", creates: "Slack, GitHub, Jira, Claude… at the persona’s permission level", deps: ["identity-svc"], secs: [7, 13],
    phases: [
      { label: "Invite to Slack workspace", call: "POST slack.com/api/admin.users.invite" },
      { label: "Add to GitHub org and teams", call: "PUT api.github.com/orgs/acme/memberships/{user}" },
      { label: "Assign Okta app groups", call: "PUT acme.okta.com/api/v1/groups/{id}/users/{uid}" },
    ],
    failures: [
      { code: "403", title: "GitHub organisation is out of seats", phase: 1, retryable: false,
        cause: () => "The acme GitHub organisation is at 150 of 150 paid seats, so no new member can be added.",
        evidence: () => "PUT /orgs/acme/memberships/{user}\n→ 403 Forbidden\n{\"message\":\"Organization has no available seats\",\"documentation_url\":\"https://docs.github.com\"}",
        fix: "Buy more seats or remove an inactive member, then retry. Slack was already granted and will not be repeated." },
      { code: "404", title: "Okta group not found", phase: 2, retryable: false,
        cause: (p) => `The group "${p.persona.dept.toLowerCase()}-all" referenced by this persona's workflow no longer exists in Okta.`,
        evidence: (p) => `PUT /api/v1/groups/00g…/users/{uid}\n→ 404 Not Found\n{"errorCode":"E0000007","errorSummary":"Not found: Resource not found: ${p.persona.dept.toLowerCase()}-all (Group)"}`,
        fix: "Recreate the group or update the workflow's access list in the builder, then retry." },
    ],
    artifact: (p) => `${apps(p).length} apps · ${apps(p).slice(0, 3).map((a) => a.title).join(", ")}…`, waits: () => null },

  { id: "bgv-svc", icon: "ShieldCheck", name: "Background verification", creates: "education / employment / address checks", deps: ["letter-svc"], secs: [3, 6],
    phases: [
      { label: "Create vendor case", call: "POST api.bgv-vendor.com/v2/cases" },
      { label: "Submit candidate documents", call: "POST api.bgv-vendor.com/v2/cases/{id}/documents" },
    ],
    failures: [
      { code: "504", title: "Verification vendor timed out", phase: 0, retryable: true,
        cause: () => "The BGV vendor's API did not answer within 30s on three consecutive attempts.",
        evidence: () => "POST /v2/cases\n→ (no response) after 30000ms ×3\ntraceroute ok · vendor status page: degraded performance",
        fix: "Safe to retry once the vendor recovers; the case was never created so there is no duplicate risk." },
    ],
    artifact: (p) => `case BGV-${num(p, "bgv", 20000, 9000)} opened`, waits: (p) => (gap(p, "Address").length ? "needs address" : null) },

  { id: "payroll-svc", icon: "Wallet", name: "Payroll & statutory", creates: "payroll record, PF/UAN, insurance enrolment", deps: [], secs: [4, 8],
    phases: [
      { label: "Create payroll record", call: "POST payroll.acme.internal/v1/employees" },
      { label: "Register PF / UAN", call: "POST payroll.acme.internal/v1/statutory/pf" },
      { label: "Enrol in insurance", call: "POST payroll.acme.internal/v1/benefits/enrol" },
    ],
    failures: [
      { code: "422", title: "Bank IFSC code failed validation", phase: 0, retryable: false,
        cause: (p) => `The bank details for ${first(p)} contain an IFSC that doesn't match any branch (checksum failed).`,
        evidence: () => "POST /v1/employees\n→ 422 Unprocessable Entity\n{\"field\":\"bank.ifsc\",\"error\":\"unknown IFSC HDFC0000XYZ\"}",
        fix: "Ask the candidate to re-enter their bank details, then retry." },
      { code: "409", title: "Duplicate employee code", phase: 0, retryable: false,
        cause: () => "The next employee code in the sequence is already taken by a rehired former employee.",
        evidence: () => "POST /v1/employees\n→ 409 Conflict\n{\"error\":\"employee_code ACME-04127 already exists (status: exited)\"}",
        fix: "Reactivate the existing record or bump the sequence, then retry." },
    ],
    artifact: (p) => `record PR-${num(p, "pr", 4000, 5000)} staged`, waits: (p) => { const g = gap(p, "PAN", "Bank a/c"); return g.length ? `needs ${g.join(" + ")}` : null; } },

  { id: "idcard-svc", icon: "IdCard", name: "ID card", creates: "queues the print job with photo and QR", deps: [], secs: [2, 4],
    phases: [
      { label: "Compose card artwork", call: "POST cards.acme.internal/v1/compose" },
      { label: "Queue print job", call: "POST cards.acme.internal/v1/print" },
    ],
    failures: [
      { code: "422", title: "Photo too small for printing", phase: 0, retryable: false,
        cause: (p) => `${first(p)}'s photo is 120×120 px; the card printer needs at least 300×300.`,
        evidence: () => "POST /v1/compose\n→ 422 Unprocessable Entity\n{\"field\":\"photo\",\"error\":\"resolution 120x120 below minimum 300x300\"}",
        fix: "Request a higher-resolution photo from the candidate, then retry." },
    ],
    artifact: (p) => `print job #${num(p, "id", 300, 600)} queued`, waits: (p) => (gap(p, "Photo").length ? "needs photo" : null) },

  { id: "facility-svc", icon: "Building2", name: "Premises & desk", creates: "building access, desk, parking", deps: ["idcard-svc"], secs: [2, 3],
    phases: [
      { label: "Reserve desk", call: "POST facilities.acme.internal/v1/desks/reserve" },
      { label: "Schedule access pass", call: "POST facilities.acme.internal/v1/access/passes" },
    ],
    failures: [
      { code: "409", title: "No free desks on the floor", phase: 0, retryable: false,
        cause: (p) => `${p.persona.dept} on BLR-3 floor 4 is at capacity for the week ${first(p)} joins.`,
        evidence: () => "POST /v1/desks/reserve\n→ 409 Conflict\n{\"error\":\"no desk available\",\"floor\":\"BLR-3/4\",\"capacity\":\"92/92\"}",
        fix: "Assign a desk on another floor or approve a hot-desk, then retry." },
    ],
    artifact: (p) => `pass valid from ${fmtDate(p.day)}`, waits: () => null },

  { id: "agenda-svc", icon: "CalendarDays", name: "Day-1 agenda & buddy", creates: "builds the agenda, assigns a buddy, drafts the intro post", deps: ["identity-svc"], secs: [2, 4],
    phases: [
      { label: "Build day-1 agenda", call: "POST www.googleapis.com/calendar/v3/calendars/{manager}/events" },
      { label: "Assign buddy", call: "POST people.acme.internal/v1/buddies" },
    ],
    failures: [
      { code: "502", title: "Manager calendar unavailable", phase: 0, retryable: true,
        cause: (p) => `Google Calendar's free/busy lookup for ${p.manager} returned a bad gateway.`,
        evidence: (p) => `POST /calendar/v3/calendars/${slug(p.manager)}@acme.com/events\n→ 502 Bad Gateway`,
        fix: "Transient — retry in a minute." },
    ],
    artifact: (p) => `agenda sent to ${p.manager.split(" ")[0]}`, waits: () => null },

  { id: "collect-svc", icon: "FileUp", name: "Document collection", creates: "magic link for missing documents and fields", deps: [], secs: [1, 2],
    phases: [
      { label: "Build document checklist", call: "POST api.acme.internal/v1/checklists" },
      { label: "Send magic link", call: "POST api.acme.internal/v1/links" },
    ],
    failures: [
      { code: "400", title: "WhatsApp number not opted in", phase: 1, retryable: false,
        cause: (p) => `${first(p)} hasn't opted in to WhatsApp messages from acme, so the magic link couldn't be delivered there.`,
        evidence: () => "POST /v1/links\n→ 400 Bad Request\n{\"channel\":\"whatsapp\",\"error\":\"recipient has not opted in\"}",
        fix: "Send the link by email instead (one click on retry switches the channel)." },
    ],
    artifact: (p) => { const n = missingFields(p).length; return n ? `link sent · ${n} item${n > 1 ? "s" : ""} outstanding` : "nothing to collect"; },
    waits: (p) => { const n = missingFields(p).length; return n ? `${n} item${n > 1 ? "s" : ""} outstanding` : null; } },

  { id: "reminder-svc", icon: "BellRing", name: "Reminders & escalations", creates: "schedules every T+N nudge in the workflow", deps: "all", secs: [2, 3],
    phases: [
      { label: "Schedule nudges", call: "POST reminders.acme.internal/v1/schedules" },
      { label: "Arm escalation ladder", call: "POST reminders.acme.internal/v1/escalations" },
    ],
    failures: [
      { code: "550", title: "Recipient mailbox rejected the test email", phase: 0, retryable: true,
        cause: (p) => `The SMTP server rejected ${email(p)} — the mailbox was created seconds earlier and hasn't propagated yet.`,
        evidence: (p) => `RCPT TO:<${email(p)}>\n← 550 5.1.1 The email account that you tried to reach does not exist.`,
        fix: "Retry after a few minutes, once the mailbox has propagated." },
    ],
    artifact: (p) => `${flatSteps(p.persona).length} reminders scheduled`, waits: () => null },
];

export const serviceIndex = (id: string) => SERVICES.findIndex((s) => s.id === id);
