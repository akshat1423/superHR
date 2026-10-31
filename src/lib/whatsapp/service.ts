import { randomInt, randomUUID } from "node:crypto";
import { MAX_QUESTION, type Answer, type AssistantInput } from "../onboarding/assistant";
import { SAMPLE_POLICIES } from "../onboarding/policies";
import { isLive, oneLine, type Sender, type SendResult, type WaConfig } from "./graph";
import type { WaStore } from "./store";
import { CODE_ALPHABET, type Inbound, type Outbound, type WaContact, type WaRequest } from "./types";

/** Everything the service needs, passed in so the same code runs in a route, in the simulator and in tests. */
export interface Deps {
  store: WaStore;
  /** delivers to WhatsApp (or pretends, in the sandbox) */
  send: Sender;
  /** the grounded assistant; the route passes the Claude-backed one when a key is set */
  answer: (input: AssistantInput) => Promise<Answer>;
  cfg: WaConfig;
  now?: () => Date;
}

const nowOf = (d: Deps) => (d.now ? d.now() : new Date());
const HOUR = 3_600_000;
export const WINDOW_MS = 24 * HOUR;
export const REQUEST_TTL_MS = 72 * HOUR;
export const INVITE_TTL_MS = 7 * 24 * HOUR;
/** inbound messages one number may send per hour before we stop spending on them */
export const MAX_IN_PER_HOUR = 30;

const code = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const mode = (d: Deps) => (isLive(d.cfg) ? "live" : "sandbox") as "live" | "sandbox";
const first = (n: string) => n.split(" ")[0];

// ── sending ─────────────────────────────────────────────────────────────────

const summary = (m: Outbound) => (m.type === "buttons" ? `${m.body}\n[${m.buttons.map((b) => b.title).join(" · ")}]` : m.type === "template" ? `[template ${m.name}] ${m.bodyParams.join(" | ")}` : m.body);

/** Record and send one message to a number that has just written to us (so the 24-hour window is open). */
export async function reply(d: Deps, phone: string, msg: Outbound, kind: string, meta: Record<string, unknown> = {}): Promise<SendResult> {
  const r = await d.send(phone, msg);
  await d.store.logMessage({
    at: nowOf(d).toISOString(), direction: "out", phone, kind, body: summary(msg), waId: r.ok ? r.waId : undefined, status: r.ok ? "sent" : "failed", mode: r.mode,
    meta: { ...meta, ...(msg.type === "buttons" ? { buttons: msg.buttons } : {}), ...(r.ok ? {} : { error: r.error }) },
  });
  return r;
}

export type Delivery = (SendResult & { via: "message" | "template" }) | { ok: false; error: string; mode: "sandbox" | "live"; via: "blocked" };

const windowOpen = (c: WaContact, d: Deps) => !!c.lastInboundAt && nowOf(d).getTime() - Date.parse(c.lastInboundAt) < WINDOW_MS;

/**
 * Start a conversation with someone who has joined. WhatsApp only allows free-form messages within 24 hours of the person's
 * last message; outside that window the message has to be an approved template (named in WHATSAPP_TEMPLATE_NOTIFY /
 * WHATSAPP_TEMPLATE_APPROVAL), otherwise it is not sent and we say why.
 */
export async function deliver(d: Deps, c: WaContact, msg: Exclude<Outbound, { type: "template" }>, kind: string, meta: Record<string, unknown> = {}): Promise<Delivery> {
  if (c.status !== "active" || !c.phone) return { ok: false, mode: mode(d), via: "blocked", error: c.status === "opted_out" ? `${first(c.name)} has opted out of WhatsApp messages` : `${first(c.name)} hasn't joined WhatsApp yet` };
  if (windowOpen(c, d)) return { ...(await reply(d, c.phone, msg, kind, meta)), via: "message" };
  const tpl = msg.type === "buttons" ? d.cfg.templates.approval : d.cfg.templates.notify;
  const name = tpl ?? (isLive(d.cfg) ? undefined : msg.type === "buttons" ? "superjoin_approval" : "superjoin_notify");
  if (!name) {
    const why = `It's more than 24 hours since ${first(c.name)} last wrote, so WhatsApp only allows an approved template, and ${msg.type === "buttons" ? "WHATSAPP_TEMPLATE_APPROVAL" : "WHATSAPP_TEMPLATE_NOTIFY"} isn't set`;
    await d.store.logMessage({ at: nowOf(d).toISOString(), direction: "out", phone: c.phone, kind, body: summary(msg), status: "blocked", mode: mode(d), meta: { ...meta, error: why } });
    return { ok: false, mode: mode(d), via: "blocked", error: why };
  }
  const tmsg: Outbound = { type: "template", name, lang: d.cfg.lang, bodyParams: [oneLine(msg.body)], ...(msg.type === "buttons" ? { buttonPayloads: msg.buttons.map((b) => b.id) } : {}) };
  return { ...(await reply(d, c.phone, tmsg, kind, { ...meta, ...(msg.type === "buttons" ? { buttons: msg.buttons } : {}), template: name })), via: "template" };
}

/** A plain notification (a reminder, an escalation, a correction request). */
export const notify = (d: Deps, c: WaContact, title: string, body: string, meta: Record<string, unknown> = {}) =>
  deliver(d, c, { type: "text", body: `*${title}*\n${body}` }, "notify", meta);

// ── invites (a number is proven by the person writing from it, never typed in) ──

export async function invite(d: Deps, input: { kind: WaContact["kind"]; name: string; email?: string; personId?: string; dept?: string; manager?: string; createdBy: string }): Promise<WaContact> {
  const existing = input.kind === "joiner" && input.personId ? await d.store.contactByPerson(input.personId) : input.email ? await d.store.contactByEmailAny(input.email) : null;
  const now = nowOf(d);
  const base: WaContact = existing ?? { id: `wc_${randomUUID().slice(0, 12)}`, kind: input.kind, name: input.name, status: "invited", createdBy: input.createdBy, createdAt: now.toISOString() };
  // someone who has already joined keeps their number; a new code is for a new number (or a re-send)
  const c: WaContact = { ...base, name: input.name, email: input.email ?? base.email, personId: input.personId ?? base.personId, dept: input.dept ?? base.dept, manager: input.manager ?? base.manager, inviteCode: code(6), inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString() };
  if (c.status === "opted_out") c.status = c.phone ? "opted_out" : "invited";
  await d.store.saveContact(c);
  return c;
}

export const joinLink = (cfg: WaConfig, inviteCode: string) => (cfg.displayNumber ? `https://wa.me/${cfg.displayNumber}?text=${encodeURIComponent(`JOIN ${inviteCode}`)}` : null);

// ── approvals ───────────────────────────────────────────────────────────────

export const approvalMessage = (r: WaRequest): Exclude<Outbound, { type: "template" }> => ({
  type: "buttons",
  body: `*${r.title}*\n${r.body}\n\nTap a button, or reply APPROVE ${r.code} / REJECT ${r.code}.`,
  buttons: [{ id: `apr:${r.id}:y`, title: "Approve" }, { id: `apr:${r.id}:n`, title: "Reject" }],
});

export type ApprovalResult = { ok: true; request: WaRequest; delivery: Delivery; duplicate?: boolean } | { ok: false; reason: "not_linked" | "send_failed"; detail: string; request?: WaRequest };

/** Ask one person, on WhatsApp, to approve or reject one checklist item. */
export async function requestApproval(d: Deps, a: { personId: string; itemId: string; toEmail: string; title: string; body: string; dept?: string; manager?: string; createdBy: string }): Promise<ApprovalResult> {
  const c = await d.store.contactByEmail(a.toEmail);
  if (!c || !c.phone || c.status !== "active") return { ok: false, reason: "not_linked", detail: c?.status === "opted_out" ? `${c.name} has opted out of WhatsApp` : `${a.toEmail} hasn't joined WhatsApp yet. Invite them first.` };
  const now = nowOf(d);
  const open = (await d.store.pendingFor(c.phone, now.toISOString())).find((r) => r.personId === a.personId && r.itemId === a.itemId);
  if (open) return { ok: true, request: open, duplicate: true, delivery: { ok: true, mode: mode(d), waId: "", via: "message" } };
  const r: WaRequest = {
    id: `rq_${randomUUID().replace(/-/g, "").slice(0, 16)}`, code: code(4), personId: a.personId, itemId: a.itemId, dept: a.dept, manager: a.manager, toPhone: c.phone, toName: c.name,
    title: a.title.slice(0, 120), body: a.body.slice(0, 600), status: "pending", createdBy: a.createdBy, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(), applied: false,
  };
  await d.store.createRequest(r);
  const delivery = await deliver(d, c, approvalMessage(r), "approval", { requestId: r.id, code: r.code });
  if (!delivery.ok) { await d.store.expire(r.id); return { ok: false, reason: "send_failed", detail: delivery.error, request: { ...r, status: "expired" } }; }
  return { ok: true, request: r, delivery };
}

// ── inbound ─────────────────────────────────────────────────────────────────

const APPROVE = new Set(["APPROVE", "APPROVED", "YES", "Y", "OK", "ACCEPT"]);
const REJECT = new Set(["REJECT", "REJECTED", "NO", "N", "DECLINE", "DENY"]);
const STOP = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"]);
const EXIT = new Set(["EXIT", "LEAVE"]);

const helpText = (c: WaContact) => c.kind === "staff"
  ? `Hi ${first(c.name)}. I send you approval requests here. Tap Approve or Reject, or reply APPROVE or REJECT (add the code if several are waiting). Reply STOP to stop messages.`
  : `Hi ${first(c.name)}. Ask me anything about your onboarding or company policy (for example "what's left for me to do?" or "how long does background verification take?"). Reply STOP to stop messages.`;

function asInput(c: WaContact, question: string): AssistantInput | null {
  const s = c.snapshot;
  return s ? { question: question.slice(0, MAX_QUESTION), history: [], employee: s.employee, hr: s.hr, facts: s.facts, policies: s.policies ?? SAMPLE_POLICIES } : null;
}

const fmtAnswer = (a: Answer) => {
  const src = [...new Set(a.citations.filter((c) => c.kind === "policy").map((c) => c.id))];
  return (a.answer + (a.covered && src.length ? `\n\nSource: ${src.join(", ")}` : "")).slice(0, 1800);
};

/**
 * Act on one message that arrived from WhatsApp. A number we don't know gets no information; approvals can be answered only
 * by the number the request was sent to, once, before it expires; questions are answered from the asker's own record only.
 */
export async function handleInbound(d: Deps, msg: Inbound): Promise<void> {
  const now = nowOf(d), iso = now.toISOString();
  const text = (msg.text ?? "").trim();
  const fresh = await d.store.logMessage({ at: iso, direction: "in", phone: msg.from, kind: msg.type, body: (text || msg.buttonTitle || `[${msg.type}]`).slice(0, 1000), waId: msg.id, mode: mode(d), meta: msg.buttonId ? { buttonId: msg.buttonId } : undefined });
  if (!fresh) return; // Meta delivers the same message more than once; act on it once

  let c = await d.store.contactByPhone(msg.from);
  if (c) { c = { ...c, lastInboundAt: iso }; await d.store.saveContact(c); }
  const say = (body: string, kind = "reply", meta?: Record<string, unknown>) => reply(d, msg.from, { type: "text", body }, kind, meta);
  const words = text.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const head = words[0] ?? "";

  // opting out and back in always works, for anyone
  if (STOP.has(head) && words.length === 1) {
    if (c && c.status === "active") { await d.store.saveContact({ ...c, status: "opted_out" }); await say("You won't get any more messages from us. Reply START any time to turn them back on."); }
    else await say("You're not receiving messages from us.");
    return;
  }
  if (head === "START" && words.length === 1 && c?.status === "opted_out") { await d.store.saveContact({ ...c, status: "active" }); await say(`Welcome back${c ? `, ${first(c.name)}` : ""}. Messages are on again.`); return; }

  // EXIT / LEAVE: hand this number back. (STOP only mutes us; this forgets the number, so on a number shared with another app
  // that app handles the messages again, the way chatflow's sandbox exit code ends a session.)
  if (c?.status === "active" && ((EXIT.has(head) && words.length === 1) || (d.cfg.exitCode && text === d.cfg.exitCode))) {
    for (const r of await d.store.pendingFor(c.phone!, iso)) await d.store.expire(r.id);
    await d.store.saveContact({ ...c, phone: undefined, snapshot: undefined, status: "invited", inviteCode: undefined, inviteExpiresAt: undefined, joinedAt: undefined, lastInboundAt: undefined });
    await say("You've left onboarding chat. Anything else you send is no longer handled here. To come back, send JOIN and a new code from HR, or from the footer of the superjoin site.", "leave");
    return;
  }

  // JOIN <code>: the way a number becomes linked, proven by it being the one that writes
  if (head === "JOIN") {
    if (c?.status === "active") { await say(`You're already connected as ${c.name}.`); return; }
    const inv = words[1] ? await d.store.contactByCode(words[1]) : null;
    if (!inv || inv.status !== "invited" || !inv.inviteExpiresAt || Date.parse(inv.inviteExpiresAt) <= now.getTime()) { await say("That code isn't valid or has expired. Ask HR for a new link."); return; }
    try { await d.store.saveContact({ ...inv, phone: msg.from, status: "active", joinedAt: iso, lastInboundAt: iso, inviteCode: undefined, inviteExpiresAt: undefined }); }
    catch { await say("That number is already connected to someone else. Ask HR for help."); return; }
    await say(inv.kind === "staff"
      ? `Hi ${first(inv.name)}, you're connected. I'll send approval requests here. Tap Approve or Reject (or reply APPROVE / REJECT). Reply HELP any time, STOP to stop.`
      : `Hi ${first(inv.name)}, welcome! You're connected to your onboarding. Ask me anything about it or about company policy. Reply HELP any time, STOP to stop.`, "join");
    return;
  }

  // anyone else we don't know (or who has opted out) gets nothing personal, and at most one reply an hour
  if (!c || c.status !== "active") {
    const last = await d.store.lastOut(msg.from);
    if (!last || now.getTime() - Date.parse(last) > HOUR)
      await say(c?.status === "opted_out" ? "You've turned messages off. Reply START to turn them back on." : "This number isn't connected to an onboarding account. To connect, open the link HR sent you, or sign in to superjoin and scan the QR code at the bottom of the page. Either one sends a message that starts with JOIN.");
    return;
  }

  // a button tap (or a template's quick reply)
  if (msg.type === "button") {
    const m = /^apr:([A-Za-z0-9_]+):(y|n)$/.exec(msg.buttonId ?? "");
    if (!m) { await say("That button is no longer valid."); return; }
    await decideAndReply(d, c, m[1], m[2] === "y" ? "approved" : "rejected", iso, say);
    return;
  }
  if (msg.type === "unsupported") { await say("I can only read text messages and button taps."); return; }

  if (head === "HELP") { await say(helpText(c), "help"); return; }

  // typed approvals (staff only), for when the buttons don't show
  if (c.kind === "staff") {
    const yes = APPROVE.has(head), no = REJECT.has(head);
    if (yes || no) {
      const pending = await d.store.pendingFor(c.phone!, iso);
      const wanted = words[1];
      const pick = wanted ? pending.find((r) => r.code === wanted) : pending.length === 1 ? pending[0] : undefined;
      if (pending.length === 0) { await say("Nothing is waiting for your answer right now."); return; }
      if (!pick) {
        await say(wanted ? `No waiting request has the code ${wanted}.` : `${pending.length} requests are waiting. Reply ${yes ? "APPROVE" : "REJECT"} and the code:\n${pending.slice(0, 5).map((r) => `• ${r.code}: ${r.title}`).join("\n")}`);
        return;
      }
      await decideAndReply(d, c, pick.id, yes ? "approved" : "rejected", iso, say);
      return;
    }
    await say(helpText(c), "help");
    return;
  }

  // a joiner's question, answered from their own record and the approved policies
  const input = asInput(c, text);
  if (!input) { await say("I don't have your onboarding details yet. Please ask HR to refresh them, then try again."); return; }
  if (!text) { await say(helpText(c), "help"); return; }
  const since = new Date(now.getTime() - HOUR).toISOString();
  const sentThisHour = await d.store.countIn(msg.from, since);
  if (sentThisHour > MAX_IN_PER_HOUR) {
    // say so once, at the moment the cap is crossed; after that, silence costs nothing
    if (sentThisHour === MAX_IN_PER_HOUR + 1) await say("You're sending a lot of messages, so I'm pausing for a while. Please try again in an hour.");
    return;
  }
  let a: Answer;
  try { a = await d.answer(input); } catch { await say(`I couldn't look that up just now. Please ask ${input.hr.name} (${input.hr.email}).`); return; }
  await say(fmtAnswer(a), "answer", { covered: a.covered, mode: a.mode });
}

async function decideAndReply(d: Deps, c: WaContact, requestId: string, status: "approved" | "rejected", iso: string, say: (b: string, k?: string, m?: Record<string, unknown>) => Promise<unknown>) {
  const won = await d.store.decide(requestId, status, c.phone!, iso);
  if (won) { await say(`Recorded: you ${status === "approved" ? "approved" : "rejected"} "${won.title}". Thank you.`, "decision", { requestId, status }); return; }
  const r = await d.store.getRequest(requestId);
  if (!r) await say("That request no longer exists.");
  // never reveal anything about a request that was sent to someone else
  else if (r.toPhone !== c.phone) await say("That request wasn't sent to you.", "denied", { requestId, spoofed: true });
  else if (r.status === "pending") { await d.store.expire(r.id); await say("That request has expired. Ask HR to send it again."); }
  else if (r.status === "expired") await say("That request has expired. Ask HR to send it again.");
  else await say(`That was already answered (${r.status}).`);
}

/**
 * Should a webhook that shares this number with another app hand a message to us? Yes when the sender is someone we know
 * (joined, or opted out and able to send START), or the message is JOIN with a valid, unexpired invite code of ours.
 * Read-only: it does not use the code up. Anything else belongs to the other app.
 */
export async function routeCheck(d: Pick<Deps, "store" | "now">, phone: string, text?: string): Promise<{ handle: boolean; reason: "active" | "opted_out" | "join" | "none" }> {
  const c = await d.store.contactByPhone(phone);
  if (c?.status === "active") return { handle: true, reason: "active" };
  if (c?.status === "opted_out") return { handle: true, reason: "opted_out" };
  const m = /^\s*join\s+([a-z0-9]{4,12})\s*$/i.exec(text ?? "");
  const inv = m ? await d.store.contactByCode(m[1]) : null;
  const now = d.now ? d.now() : new Date();
  if (inv && inv.status === "invited" && inv.inviteExpiresAt && Date.parse(inv.inviteExpiresAt) > now.getTime()) return { handle: true, reason: "join" };
  return { handle: false, reason: "none" };
}
