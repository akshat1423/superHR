import { DEMO_TODAY, missingFields, type Person, type PersonStep } from "./people";
import type { Dept } from "./workflow";

/** 0 = nudge the owner · 1 = their manager · 2 = department head · 3 = HR head */
export type Level = 0 | 1 | 2 | 3;
/** days after the due date that each ladder rung fires */
export const LADDER_OFFSETS: Record<Level, number> = { 0: 0, 1: 1, 2: 3, 3: 5 };
export const LADDER_LABEL: Record<Level, string> = { 0: "Owner", 1: "Owner + manager", 2: "Department head", 3: "HR head" };

const DEPT_HEAD: Record<Dept, string> = { Engineering: "Vikram Singh", Finance: "Neha Kapoor", Product: "Isha Menon", Business: "Rahul Jain", People: "Priya Nair" };
const HR_HEAD = "Priya Nair";

const slug = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
export const emailOf = (name: string) => `${slug(name)}@acme.com`;

export interface Recipient { name: string; email: string; label: string }

export interface Draft {
  kind: "candidate" | "nudge" | "escalation";
  level: Level;
  to: Recipient;
  subject: string;
  text: string;
  html: string;
  personId: string;
  stepId: string;
  stepTitle: string;
}

function recipientFor(person: Person, step: PersonStep, level: Level): Recipient {
  if (level === 3) return { name: HR_HEAD, email: emailOf(HR_HEAD), label: "HR head" };
  if (level === 2) { const n = DEPT_HEAD[person.persona.dept]; return { name: n, email: emailOf(n), label: `Head of ${person.persona.dept}` }; }
  if (level === 1) {
    if (step.owner === "Candidate") return { name: "Priya Nair", email: emailOf("Priya Nair"), label: "HR partner" };
    return { name: person.manager, email: emailOf(person.manager), label: "Manager" };
  }
  switch (step.owner) {
    case "Candidate": return { name: person.name, email: person.email || emailOf(person.name), label: "New joiner" };
    case "Manager": return { name: person.manager, email: emailOf(person.manager), label: "Manager" };
    case "IT": return { name: "IT Helpdesk", email: "it-helpdesk@acme.com", label: "IT" };
    case "Finance": return { name: "Finance Ops", email: "finance-ops@acme.com", label: "Finance" };
    case "Security": return { name: "Security Team", email: "security@acme.com", label: "Security" };
    case "Facilities": return { name: "Facilities", email: "facilities@acme.com", label: "Facilities" };
    case "Dept Head": { const n = DEPT_HEAD[person.persona.dept]; return { name: n, email: emailOf(n), label: `Head of ${person.persona.dept}` }; }
    default: return { name: "HR Operations", email: "hr-ops@acme.com", label: "HR" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Paper-coloured HTML email: renders the same in the preview iframe and in a real inbox. */
function wrap(title: string, paragraphs: string[], bullets: string[], cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#e8e0cf;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#17130e">
<table role="presentation" align="center" width="560" style="max-width:560px;width:100%;background:#f4efe3;border-radius:16px;border:1px solid #d8cfba"><tr><td style="padding:28px 30px">
<div style="font-size:22px;font-weight:800;letter-spacing:-.03em">super<i style="font-family:Georgia,serif;font-weight:400">join</i></div>
<h1 style="font-size:20px;margin:22px 0 10px;letter-spacing:-.02em">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${p}</p>`).join("")}
${bullets.length ? `<ul style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.7">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
<a href="${cta.url}" style="display:inline-block;background:#c4572f;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 18px;border-radius:10px">${esc(cta.label)}</a>
<p style="font-size:11px;color:#8a8070;margin:22px 0 0">Sent automatically by superjoin onboarding reminders.</p>
</td></tr></table></body></html>`;
}

const plain = (lines: string[]) => lines.join("\n");

/** Build the email for one overdue/open step at one rung of the escalation ladder. */
export function draftReminder(person: Person, step: PersonStep, overdue: number, level: Level = 0): Draft {
  const to = recipientFor(person, step, level);
  const first = to.name.split(" ")[0];
  const joiner = person.name.split(" ")[0];
  const toCandidate = step.owner === "Candidate" && level === 0;
  const d = Math.abs(step.day);
  const when = step.day === 0 ? "on the joining day" : step.day < 0 ? `${d} day${d > 1 ? "s" : ""} before ${toCandidate ? "you join" : `${joiner} joins`}` : `${d} day${d > 1 ? "s" : ""} after ${toCandidate ? "you join" : `${joiner} joined`}`;
  const due = overdue > 0 ? `${overdue} day${overdue > 1 ? "s" : ""} overdue` : `due ${when}`;
  const who = person.name;
  const link = `https://onboard.acme.com/${step.owner === "Candidate" && level === 0 ? "m/" + person.id : "tracker/" + person.id}`;

  if (step.owner === "Candidate" && level === 0) {
    const todo = missingFields(person).map((f) => f.toString());
    const subject = `Quick action needed before you join Acme: ${step.title}`;
    const paras = [`Hi ${first},`, `We're getting everything ready for your first day, and one thing is waiting on you: <b>${esc(step.title)}</b> (${due}).`, todo.length ? "Here's what we still need from you:" : "It only takes a minute — no login needed."];
    return { kind: "candidate", level, to, subject, personId: person.id, stepId: step.id, stepTitle: step.title,
      text: plain([`Hi ${first},`, "", `We're getting everything ready for your first day, and one thing is waiting on you: ${step.title} (${due}).`, ...(todo.length ? ["", "Still needed:", ...todo.map((t) => ` - ${t}`)] : []), "", `Open your secure link: ${link}`]),
      html: wrap(`One thing is waiting on you`, paras, todo, { label: "Complete it now", url: link }) };
  }

  if (level === 0) {
    const subject = `Reminder: ${step.title} for ${who} is ${due}`;
    const note = step.note ? ` Status: ${esc(step.note)}.` : "";
    return { kind: "nudge", level, to, subject, personId: person.id, stepId: step.id, stepTitle: step.title,
      text: plain([`Hi ${first},`, "", `${step.title} for ${who} (${person.role}, ${person.persona.dept}) is ${due}.${step.note ? ` Status: ${step.note}.` : ""}`, "", `Open it: ${link}`]),
      html: wrap(`${step.title} is ${due}`, [`Hi ${esc(first)},`, `<b>${esc(step.title)}</b> for <b>${esc(who)}</b> (${esc(person.role)}, ${esc(person.persona.dept)}) is ${due}.${note}`], [], { label: "Open in superjoin", url: link }) };
  }

  const subject = `Escalation: ${step.title} for ${who} is ${due}`;
  const ownerLine = `It's assigned to <b>${esc(step.owner)}</b> and hasn't been completed after ${esc(LADDER_LABEL[(level - 1) as Level].toLowerCase())} reminders.`;
  return { kind: "escalation", level, to, subject, personId: person.id, stepId: step.id, stepTitle: step.title,
    text: plain([`Hi ${first},`, "", `Escalating: ${step.title} for ${who} is ${due}. Assigned to ${step.owner}; earlier reminders went unanswered.${step.note ? ` Status: ${step.note}.` : ""}`, "", `Open it: ${link}`]),
    html: wrap(`Escalation: ${step.title}`, [`Hi ${esc(first)},`, `<b>${esc(step.title)}</b> for <b>${esc(who)}</b> is ${due}. ${ownerLine}${step.note ? ` Status: ${esc(step.note)}.` : ""}`], [], { label: "Review and unblock", url: link }) };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Tue 3 Nov" for a date `inDays` after the demo "today". */
export function fmtLong(inDays: number): string {
  const d = new Date(DEMO_TODAY.getTime() + inDays * 86_400_000);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

export interface ScheduledEmail { key: string; inDays: number; level: Level; draft: Draft; person: Person }
export type LadderRules = [boolean, boolean, boolean, boolean];

/**
 * Emails the reminder service has queued for the future: for every open step with reminders on, one
 * per enabled ladder rung that has not fired yet (rungs already due appear in the queue / outbox instead).
 */
export function scheduledEmails(items: { person: Person; steps: PersonStep[] }[], rules: LadderRules): ScheduledEmail[] {
  const out: ScheduledEmail[] = [];
  for (const { person, steps } of items) {
    for (const s of steps) {
      if (s.status === "done" || s.rem === "none" || s.owner === "Auto") continue;
      const levels: Level[] = s.rem === "ladder" ? [0, 1, 2, 3] : [0];
      for (const lv of levels) {
        if (!rules[lv]) continue;
        const inDays = s.day - person.day + LADDER_OFFSETS[lv];
        if (inDays < 0) continue;
        out.push({ key: `${person.id}:${s.id}:${lv}`, inDays, level: lv, person, draft: draftReminder(person, s, 0, lv) });
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.level - b.level);
}
