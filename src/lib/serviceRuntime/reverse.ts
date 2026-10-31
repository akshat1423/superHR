import type { Person } from "../people";
import { flatSteps } from "../workflow";
import { hash01 } from "../utils";

/**
 * The reverse and the follow-up operations of each provisioning service: what `deprovision` and `update` call.
 * One call per entry, in order. `apps` lists the applications a person's workflow grants (what access can toggle).
 */
export interface Spec {
  label: string;
  call: string;
  body: (p: Person, object?: string) => unknown;
  ok: (p: Person, id: string, object?: string) => unknown;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
const mail = (p: Person) => `${slug(p.name)}@acme.com`;
const who = (p: Person) => ({ employee: p.name, email: mail(p), department: p.persona.dept });
const done = (what: string) => (_p: Person, id: string) => ({ ok: true, id, [what]: true });

/** The applications granted by this person's workflow, by name. */
export const appsOf = (p: Person): string[] => [...new Set(flatSteps(p.persona).filter((s) => s.perm).map((s) => s.title))];

const isSlack = (a: string) => /slack/i.test(a);
const isGitHub = (a: string) => /github/i.test(a);

/** Take one application away from one person: the call depends on which system the application lives in. */
export const revokeApp = (app: string): Spec => isSlack(app)
  ? { label: "Remove from Slack workspace", call: "POST slack.com/api/admin.users.remove", body: (p) => ({ email: mail(p), reason: "access revoked" }), ok: () => ({ ok: true }) }
  : isGitHub(app)
    ? { label: "Remove from GitHub org and teams", call: "DELETE api.github.com/orgs/acme/memberships/{user}", body: (p) => ({ username: slug(p.name).replace(".", "-") }), ok: () => ({}) }
    : { label: `Unassign ${app}`, call: "DELETE acme.okta.com/api/v1/apps/{appId}/users/{uid}", body: (p) => ({ app, user: mail(p) }), ok: () => ({ unassigned: true }) };

/** Give one application to one person. */
export const grantApp = (app: string): Spec => isSlack(app)
  ? { label: "Invite to Slack workspace", call: "POST slack.com/api/admin.users.invite", body: (p) => ({ email: mail(p) }), ok: (_p, id) => ({ ok: true, invite_id: id }) }
  : isGitHub(app)
    ? { label: "Add to GitHub org and teams", call: "PUT api.github.com/orgs/acme/memberships/{user}", body: (p) => ({ role: "member", teams: [`${p.persona.dept.toLowerCase()}-all`] }), ok: () => ({ state: "pending", role: "member" }) }
    : { label: `Assign ${app}`, call: "PUT acme.okta.com/api/v1/apps/{appId}/users/{uid}", body: (p) => ({ app, user: mail(p) }), ok: () => ({ assigned: true }) };

export const REVOKE: Record<string, Spec[]> = {
  "identity-svc": [
    { label: "Suspend Okta user", call: "POST acme.okta.com/api/v1/users/{id}/lifecycle/suspend", body: (p) => who(p), ok: (_p, id) => ({ id, status: "SUSPENDED" }) },
    { label: "Revoke sessions and MFA factors", call: "DELETE acme.okta.com/api/v1/users/{id}/sessions", body: (p) => who(p), ok: () => ({}) },
    { label: "Suspend Google Workspace mailbox", call: "PUT admin.googleapis.com/admin/directory/v1/users/{id}", body: (p) => ({ primaryEmail: mail(p), suspended: true }), ok: (p) => ({ primaryEmail: mail(p), suspended: true }) },
  ],
  "letter-svc": [
    { label: "Void the e-sign envelope", call: "PUT esign.acme.internal/v1/envelopes/{id}/void", body: (p) => ({ reason: "onboarding closed", signer: p.name }), ok: (_p, id) => ({ envelopeId: id, status: "voided" }) },
    { label: "Withdraw the offer letter", call: "POST letters.acme.internal/v1/offers/{id}/withdraw", body: (p) => ({ candidate: p.name }), ok: done("withdrawn") },
  ],
  "access-svc": [
    { label: "Remove from Slack workspace", call: "POST slack.com/api/admin.users.remove", body: (p) => ({ email: mail(p) }), ok: () => ({ ok: true }) },
    { label: "Remove from GitHub org and teams", call: "DELETE api.github.com/orgs/acme/memberships/{user}", body: (p) => ({ username: slug(p.name).replace(".", "-") }), ok: () => ({}) },
    { label: "Unassign Okta app groups", call: "DELETE acme.okta.com/api/v1/groups/{id}/users/{uid}", body: (p) => ({ groups: [`${p.persona.dept.toLowerCase()}-all`], apps: appsOf(p) }), ok: (p) => ({ unassigned: appsOf(p).length }) },
  ],
  "bgv-svc": [
    { label: "Cancel the vendor case", call: "POST api.bgv-vendor.com/v2/cases/{id}/cancel", body: (p) => ({ candidate: p.name, reason: "onboarding closed" }), ok: (_p, id) => ({ caseId: id, status: "cancelled" }) },
  ],
  "payroll-svc": [
    { label: "Cancel the payroll record", call: "DELETE payroll.acme.internal/v1/employees/{id}", body: (p) => ({ employee: p.name }), ok: () => ({ cancelled: true }) },
    { label: "Withdraw the PF / UAN registration", call: "DELETE payroll.acme.internal/v1/statutory/pf", body: (p) => ({ employee: p.name }), ok: () => ({ withdrawn: true }) },
    { label: "Cancel the insurance enrolment", call: "DELETE payroll.acme.internal/v1/benefits/enrol", body: (p) => ({ employee: p.name }), ok: () => ({ cancelled: true }) },
  ],
  "idcard-svc": [
    { label: "Cancel the print job", call: "DELETE cards.acme.internal/v1/print/{id}", body: (p) => ({ employeeNo: p.no }), ok: () => ({ cancelled: true }) },
    { label: "Deactivate the card", call: "POST cards.acme.internal/v1/deactivate", body: (p) => ({ employeeNo: p.no }), ok: done("deactivated") },
  ],
  "facility-svc": [
    { label: "Release the desk", call: "DELETE facilities.acme.internal/v1/desks/{id}", body: (p) => ({ employee: p.name }), ok: () => ({ released: true }) },
    { label: "Revoke the access pass", call: "DELETE facilities.acme.internal/v1/access/passes/{id}", body: (p) => ({ employee: p.name }), ok: () => ({ revoked: true }) },
  ],
  "agenda-svc": [
    { label: "Cancel the day-1 events", call: "DELETE www.googleapis.com/calendar/v3/calendars/{manager}/events/{id}", body: (p) => ({ manager: p.manager, newJoiner: p.name }), ok: () => ({}) },
    { label: "Unassign the buddy", call: "DELETE people.acme.internal/v1/buddies/{id}", body: (p) => ({ newJoiner: p.name }), ok: () => ({ unassigned: true }) },
  ],
  "collect-svc": [
    { label: "Expire the magic link", call: "DELETE api.acme.internal/v1/links/{id}", body: (p) => ({ candidate: p.name }), ok: () => ({ expired: true }) },
  ],
  "reminder-svc": [
    { label: "Cancel scheduled nudges and escalations", call: "DELETE reminders.acme.internal/v1/schedules/{id}", body: (p) => ({ person: p.name }), ok: (_p, id) => ({ scheduleId: id, cancelled: true }) },
  ],
};

/** What each service does when a detail of the person changes (joining date, role, department, location, manager). */
export const UPDATE: Record<string, Spec[]> = {
  "identity-svc": [{ label: "Update directory attributes", call: "PATCH acme.okta.com/api/v1/users/{id}", body: (p) => ({ profile: { title: p.role, department: p.persona.dept, manager: p.manager, city: p.location } }), ok: (_p, id) => ({ id, updated: true }) }],
  "letter-svc": [
    { label: "Re-render the offer with the new terms", call: "POST letters.acme.internal/v1/render/offer", body: (p) => ({ candidate: p.name, role: p.role, startDate: p.startDate, level: p.persona.level, supersedes: "previous version" }), ok: (_p, id) => ({ documentId: id, version: 2 }) },
    { label: "Replace the e-sign envelope", call: "POST esign.acme.internal/v1/envelopes", body: (p) => ({ signer: { name: p.name, email: p.email || mail(p) }, voidsPrevious: true }), ok: (_p, id) => ({ envelopeId: id, status: "sent" }) },
  ],
  "bgv-svc": [{ label: "Update the vendor case", call: "PATCH api.bgv-vendor.com/v2/cases/{id}", body: (p) => ({ candidate: p.name, role: p.role, startDate: p.startDate }), ok: (_p, id) => ({ caseId: id, updated: true }) }],
  "payroll-svc": [{ label: "Update the payroll record", call: "PATCH payroll.acme.internal/v1/employees/{id}", body: (p) => ({ employee: p.name, grade: p.grade, department: p.persona.dept, joinDate: p.startDate, location: p.location, band: p.persona.level }), ok: (_p, id) => ({ employeeId: `EMP-${id.slice(-5)}`, updated: true }) }],
  "idcard-svc": [{ label: "Reissue the card artwork", call: "POST cards.acme.internal/v1/compose", body: (p) => ({ name: p.name, role: p.role, employeeNo: p.no, office: p.location }), ok: (_p, id) => ({ artworkId: id, reissued: true }) }],
  "facility-svc": [{ label: "Move the desk and access pass", call: "PATCH facilities.acme.internal/v1/desks/{id}", body: (p) => ({ employee: p.name, office: p.location, team: p.persona.dept, from: p.startDate }), ok: (p) => ({ desk: `${2 + Math.floor(hash01(p.id + "floor") * 5)}-${10 + Math.floor(hash01(p.id + "desk2") * 80)}`, moved: true }) }],
  "agenda-svc": [{ label: "Reschedule the day-1 events", call: "PATCH www.googleapis.com/calendar/v3/calendars/{manager}/events/{id}", body: (p) => ({ start: `${p.startDate}T09:30:00+05:30`, attendees: [{ email: mail(p) }, { displayName: p.manager }] }), ok: (_p, id) => ({ id, status: "confirmed", rescheduled: true }) }],
  "collect-svc": [{ label: "Refresh the document checklist", call: "PATCH api.acme.internal/v1/checklists/{id}", body: (p) => ({ candidate: p.name, country: p.location }), ok: (_p, id) => ({ checklistId: id, refreshed: true }) }],
  "reminder-svc": [{ label: "Reschedule nudges", call: "PUT reminders.acme.internal/v1/schedules/{id}", body: (p) => ({ person: p.name, startDate: p.startDate }), ok: (_p, id) => ({ scheduleId: id, rescheduled: true }) }],
};
