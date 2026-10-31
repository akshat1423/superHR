import type { Person } from "../people";
import { flatSteps } from "../workflow";
import { hash01 } from "../utils";

/**
 * What each provisioning service sends and what a healthy system answers, call by call. One entry per service;
 * `phases[i]` lines up with `SERVICES[...].phases[i]`. The runner uses `body` for the request and, in sandbox
 * mode, `ok` for the response. In live mode the real system's answer is used instead.
 */
export interface PhaseImpl {
  body: (p: Person) => unknown;
  ok: (p: Person, id: string) => unknown;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
const mail = (p: Person) => `${slug(p.name)}@acme.com`;
const handle = (p: Person) => slug(p.name).replace(".", "-");
const names = (p: Person) => ({ givenName: p.name.split(" ")[0], familyName: p.name.split(" ").slice(1).join(" ") });
const apps = (p: Person) => flatSteps(p.persona).filter((s) => s.perm);
const n = (p: Person, salt: string, base: number, span: number) => base + Math.floor(hash01(p.id + salt) * span);

export const HANDLERS: Record<string, PhaseImpl[]> = {
  "identity-svc": [
    { body: (p) => ({ primaryEmail: mail(p), name: names(p), orgUnitPath: `/${p.persona.dept}`, changePasswordAtNextLogin: true }), ok: (p, id) => ({ kind: "admin#directory#user", id, primaryEmail: mail(p) }) },
    { body: (p) => ({ profile: { login: mail(p), email: mail(p), firstName: names(p).givenName, lastName: names(p).familyName, department: p.persona.dept } }), ok: (p, id) => ({ id, status: "PROVISIONED", profile: { login: mail(p) } }) },
    { body: () => ({ factorType: "token:software:totp", provider: "OKTA" }), ok: (_p, id) => ({ id, status: "PENDING_ACTIVATION", factorType: "token:software:totp" }) },
  ],
  "letter-svc": [
    { body: (p) => ({ template: "offer_fulltime_v7", candidate: p.name, role: p.role, startDate: p.startDate, level: p.persona.level }), ok: (p, id) => ({ documentId: id, pages: 3, filename: `Offer_${p.name.split(" ")[0]}.pdf` }) },
    { body: (p) => ({ documentId: "{documentId}", signer: { name: p.name, email: p.email || mail(p) }, expiresInDays: 7 }), ok: (_p, id) => ({ envelopeId: id, status: "sent" }) },
  ],
  "access-svc": [
    { body: (p) => ({ email: mail(p), channels: [p.persona.dept.toLowerCase(), "general", "new-joiners"] }), ok: (_p, id) => ({ ok: true, invite_id: id }) },
    { body: (p) => ({ role: "member", teams: [`${p.persona.dept.toLowerCase()}-all`], username: handle(p) }), ok: () => ({ state: "pending", role: "member" }) },
    { body: (p) => ({ groups: [`${p.persona.dept.toLowerCase()}-all`], apps: apps(p).map((a) => ({ app: a.title, level: a.perm })) }), ok: (p) => ({ assigned: apps(p).length }) },
  ],
  "bgv-svc": [
    { body: (p) => ({ candidate: p.name, dob: p.dob ?? null, checks: ["education", "employment", "address"], package: p.persona.level === "Leader" ? "senior" : "standard" }), ok: (p, id) => ({ caseId: id, status: "created", etaDays: n(p, "eta", 5, 3) }) },
    { body: (p) => ({ documents: ["id_proof", "education", "address_proof"], candidate: p.name }), ok: () => ({ accepted: 3, status: "in_progress" }) },
  ],
  "payroll-svc": [
    { body: (p) => ({ employee: p.name, grade: p.grade, department: p.persona.dept, joinDate: p.startDate, location: p.location }), ok: (_p, id) => ({ employeeId: `EMP-${id.slice(-5)}`, status: "created" }) },
    { body: (p) => ({ employee: p.name, uanLookup: true }), ok: (p) => ({ uan: String(n(p, "uan", 100000000000, 899999999999)), registered: true }) },
    { body: (p) => ({ employee: p.name, plan: p.persona.level === "Intern" ? "basic" : "group-health-plus", dependents: 0 }), ok: (_p, id) => ({ policyNo: `GHP-${id.slice(-6)}`, enrolled: true }) },
  ],
  "idcard-svc": [
    { body: (p) => ({ name: p.name, role: p.role, employeeNo: p.no, photo: p.photoUrl ? "provided" : "missing", qr: `https://acme.com/e/${p.no}` }), ok: (_p, id) => ({ artworkId: id, format: "CR80" }) },
    { body: () => ({ artworkId: "{artworkId}", copies: 1, printer: "hq-front-desk" }), ok: (_p, id) => ({ jobId: id, state: "queued" }) },
  ],
  "facility-svc": [
    { body: (p) => ({ employee: p.name, floor: n(p, "floor", 2, 5), team: p.persona.dept, from: p.startDate }), ok: (p) => ({ desk: `${n(p, "floor", 2, 5)}-${n(p, "desk", 10, 80)}`, status: "reserved" }) },
    { body: (p) => ({ employee: p.name, validFrom: p.startDate, zones: ["lobby", p.persona.dept.toLowerCase()] }), ok: (_p, id) => ({ passId: id, status: "scheduled" }) },
  ],
  "agenda-svc": [
    { body: (p) => ({ summary: `Welcome ${p.name.split(" ")[0]} — day 1`, start: `${p.startDate}T09:30:00+05:30`, attendees: [{ email: mail(p) }, { displayName: p.manager }] }), ok: (_p, id) => ({ kind: "calendar#event", id, status: "confirmed" }) },
    { body: (p) => ({ newJoiner: p.name, department: p.persona.dept, level: p.persona.level }), ok: (p) => ({ buddy: { name: "Assigned from the department pool", department: p.persona.dept }, notified: true }) },
  ],
  "collect-svc": [
    { body: (p) => ({ candidate: p.name, country: p.location, requested: Object.entries(p.fields).filter(([, v]) => v === "missing").map(([k]) => k) }), ok: (_p, id) => ({ checklistId: id }) },
    { body: (p) => ({ to: p.email || mail(p), ttlHours: 72 }), ok: (_p, id) => ({ linkId: id, delivered: true }) },
  ],
  "reminder-svc": [
    { body: (p) => ({ person: p.name, offsets: flatSteps(p.persona).map((s) => s.day) }), ok: (p, id) => ({ scheduleId: id, count: flatSteps(p.persona).length }) },
    { body: (p) => ({ person: p.name, ladder: ["owner", "manager", "hr"], afterDays: [1, 3, 5] }), ok: (_p, id) => ({ ladderId: id, armed: true }) },
  ],
};
