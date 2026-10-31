import type { SupabaseClient } from "@supabase/supabase-js";
import type { WaContact, WaMessage, WaRequest } from "./types";

/**
 * Everything WhatsApp needs the server to remember: who has joined, what is waiting for an answer, and the message log.
 * (The onboarding data itself stays in the browser; the server holds only this and a snapshot for Q&A.)
 */
export interface WaStore {
  kind: "memory" | "supabase";
  contactByPhone(phone: string): Promise<WaContact | null>;
  /** the active contact with this email, if any */
  contactByEmail(email: string): Promise<WaContact | null>;
  /** the contact with this email in any state, preferring one that has joined (so inviting someone twice reuses them) */
  contactByEmailAny(email: string): Promise<WaContact | null>;
  contactByCode(code: string): Promise<WaContact | null>;
  contactByPerson(personId: string): Promise<WaContact | null>;
  contactById(id: string): Promise<WaContact | null>;
  saveContact(c: WaContact): Promise<void>;
  listContacts(): Promise<WaContact[]>;

  createRequest(r: WaRequest): Promise<void>;
  getRequest(id: string): Promise<WaRequest | null>;
  /** waiting for this number, not expired, newest first */
  pendingFor(phone: string, nowIso: string): Promise<WaRequest[]>;
  /** Atomic: succeeds only if the request is still pending, unexpired and was sent to this number. At most one caller wins. */
  decide(id: string, status: "approved" | "rejected", phone: string, nowIso: string): Promise<WaRequest | null>;
  /** a still-pending request stops being answerable (it timed out, or it could not be delivered) */
  expire(id: string): Promise<void>;
  decidedUnapplied(): Promise<WaRequest[]>;
  markApplied(ids: string[]): Promise<void>;
  listRequests(limit: number): Promise<WaRequest[]>;

  /** Records a message; returns false when a message with this WhatsApp id was already recorded (Meta retries deliveries). */
  logMessage(m: WaMessage): Promise<boolean>;
  recentMessages(limit: number, phone?: string): Promise<WaMessage[]>;
  countIn(phone: string, sinceIso: string): Promise<number>;
  lastOut(phone: string): Promise<string | null>;
}

/** The setup SQL has not been run. */
export class SetupRequired extends Error { constructor() { super("WhatsApp tables are missing: run the SQL from `npm run db:sql`"); } }

// ── in memory (local development and tests) ─────────────────────────────────
export function memoryStore(): WaStore {
  const contacts = new Map<string, WaContact>();
  const requests = new Map<string, WaRequest>();
  const messages: WaMessage[] = [];
  const seen = new Set<string>();
  let seq = 0;
  const all = () => [...contacts.values()];
  return {
    kind: "memory",
    async contactByPhone(p) { return all().find((c) => c.phone === p) ?? null; },
    async contactByEmail(e) { return all().filter((c) => c.status === "active" && c.email?.toLowerCase() === e.toLowerCase()).sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""))[0] ?? null; },
    async contactByEmailAny(e) { return all().filter((c) => c.email?.toLowerCase() === e.toLowerCase()).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.createdAt.localeCompare(a.createdAt))[0] ?? null; },
    async contactByCode(code) { return all().find((c) => c.inviteCode?.toUpperCase() === code.toUpperCase()) ?? null; },
    async contactByPerson(id) { return all().find((c) => c.personId === id && c.kind === "joiner") ?? null; },
    async contactById(id) { return contacts.get(id) ?? null; },
    async saveContact(c) {
      if (c.phone && all().some((o) => o.phone === c.phone && o.id !== c.id)) throw new Error("That number is already linked to someone else");
      contacts.set(c.id, structuredClone(c));
    },
    async listContacts() { return all().map((c) => structuredClone(c)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async createRequest(r) { requests.set(r.id, structuredClone(r)); },
    async getRequest(id) { const r = requests.get(id); return r ? structuredClone(r) : null; },
    async pendingFor(phone, now) { return [...requests.values()].filter((r) => r.toPhone === phone && r.status === "pending" && r.expiresAt > now).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => structuredClone(r)); },
    async decide(id, status, phone, now) {
      const r = requests.get(id);
      if (!r || r.status !== "pending" || r.toPhone !== phone || r.expiresAt <= now) return null;
      const next = { ...r, status, decidedAt: now, decidedByPhone: phone };
      requests.set(id, next);
      return structuredClone(next);
    },
    async expire(id) { const r = requests.get(id); if (r && r.status === "pending") requests.set(id, { ...r, status: "expired" }); },
    async decidedUnapplied() { return [...requests.values()].filter((r) => (r.status === "approved" || r.status === "rejected") && !r.applied).map((r) => structuredClone(r)); },
    async markApplied(ids) { for (const id of ids) { const r = requests.get(id); if (r) requests.set(id, { ...r, applied: true }); } },
    async listRequests(limit) { return [...requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((r) => structuredClone(r)); },
    async logMessage(m) {
      if (m.waId) { if (seen.has(m.waId)) return false; seen.add(m.waId); }
      messages.push({ ...structuredClone(m), id: ++seq });
      return true;
    },
    async recentMessages(limit, phone) { return messages.filter((m) => !phone || m.phone === phone).slice(-limit).reverse().map((m) => structuredClone(m)); },
    async countIn(phone, since) { return messages.filter((m) => m.direction === "in" && m.phone === phone && m.at >= since).length; },
    async lastOut(phone) { return [...messages].reverse().find((m) => m.direction === "out" && m.phone === phone)?.at ?? null; },
  };
}

// ── Supabase ────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : undefined);
const toContact = (r: Row): WaContact => ({
  id: r.id as string, kind: r.kind as WaContact["kind"], personId: s(r.person_id), name: r.name as string, email: s(r.email), dept: s(r.dept), manager: s(r.manager),
  phone: s(r.phone), status: r.status as WaContact["status"], inviteCode: s(r.invite_code), inviteExpiresAt: s(r.invite_expires_at),
  snapshot: (r.snapshot as WaContact["snapshot"]) ?? undefined, lastInboundAt: s(r.last_inbound_at), joinedAt: s(r.joined_at), createdBy: r.created_by as string, createdAt: r.created_at as string,
});
const fromContact = (c: WaContact): Row => ({
  id: c.id, kind: c.kind, person_id: c.personId ?? null, name: c.name, email: c.email ?? null, dept: c.dept ?? null, manager: c.manager ?? null, phone: c.phone ?? null, status: c.status,
  invite_code: c.inviteCode ?? null, invite_expires_at: c.inviteExpiresAt ?? null, snapshot: c.snapshot ?? null, last_inbound_at: c.lastInboundAt ?? null, joined_at: c.joinedAt ?? null, created_by: c.createdBy, created_at: c.createdAt,
});
const toRequest = (r: Row): WaRequest => ({
  id: r.id as string, code: r.code as string, personId: r.person_id as string, itemId: r.item_id as string, dept: s(r.dept), manager: s(r.manager), toPhone: r.to_phone as string, toName: r.to_name as string,
  title: r.title as string, body: r.body as string, status: r.status as WaRequest["status"], createdBy: r.created_by as string, createdAt: r.created_at as string, expiresAt: r.expires_at as string,
  decidedAt: s(r.decided_at), decidedByPhone: s(r.decided_by_phone), applied: !!r.applied,
});
const fromRequest = (r: WaRequest): Row => ({
  id: r.id, code: r.code, person_id: r.personId, item_id: r.itemId, dept: r.dept ?? null, manager: r.manager ?? null, to_phone: r.toPhone, to_name: r.toName, title: r.title, body: r.body, status: r.status,
  created_by: r.createdBy, created_at: r.createdAt, expires_at: r.expiresAt, applied: r.applied,
});
const toMessage = (r: Row): WaMessage => ({ id: r.id as number, at: r.at as string, direction: r.direction as "in" | "out", phone: r.phone as string, kind: r.kind as string, body: r.body as string, waId: s(r.wa_id), status: s(r.status), mode: r.mode as WaMessage["mode"], meta: (r.meta as Record<string, unknown>) ?? undefined });

export function supabaseStore(db: SupabaseClient): WaStore {
  const fail = (e: { code?: string; message?: string } | null): never => {
    if (e && (e.code === "PGRST205" || e.code === "42P01")) throw new SetupRequired();
    throw new Error(e?.message ?? "Database error");
  };
  const one = async (q: PromiseLike<{ data: Row | null; error: { code?: string; message?: string } | null }>) => { const { data, error } = await q; if (error) fail(error); return data; };
  const many = async (q: PromiseLike<{ data: Row[] | null; error: { code?: string; message?: string } | null }>) => { const { data, error } = await q; if (error) fail(error); return data ?? []; };
  const C = () => db.from("wa_contacts"), R = () => db.from("wa_requests"), M = () => db.from("wa_messages");
  return {
    kind: "supabase",
    async contactByPhone(p) { const r = await one(C().select("*").eq("phone", p).maybeSingle()); return r ? toContact(r) : null; },
    async contactByEmail(e) { const r = await many(C().select("*").eq("status", "active").ilike("email", e).order("joined_at", { ascending: false }).limit(1)); return r[0] ? toContact(r[0]) : null; },
    async contactByEmailAny(e) { const r = await many(C().select("*").ilike("email", e).order("created_at", { ascending: false }).limit(10)); const rows = r.map(toContact); return rows.find((c) => c.status === "active") ?? rows[0] ?? null; },
    async contactByCode(code) { const r = await one(C().select("*").ilike("invite_code", code).maybeSingle()); return r ? toContact(r) : null; },
    async contactByPerson(id) { const r = await many(C().select("*").eq("person_id", id).eq("kind", "joiner").limit(1)); return r[0] ? toContact(r[0]) : null; },
    async contactById(id) { const r = await one(C().select("*").eq("id", id).maybeSingle()); return r ? toContact(r) : null; },
    async saveContact(c) {
      const { error } = await C().upsert(fromContact(c), { onConflict: "id" });
      if (error) { if (error.code === "23505") throw new Error("That number is already linked to someone else"); fail(error); }
    },
    async listContacts() { return (await many(C().select("*").order("created_at", { ascending: false }).limit(500))).map(toContact); },
    async createRequest(r) { const { error } = await R().insert(fromRequest(r)); if (error) fail(error); },
    async getRequest(id) { const r = await one(R().select("*").eq("id", id).maybeSingle()); return r ? toRequest(r) : null; },
    async pendingFor(phone, now) { return (await many(R().select("*").eq("to_phone", phone).eq("status", "pending").gt("expires_at", now).order("created_at", { ascending: false }))).map(toRequest); },
    async decide(id, status, phone, now) {
      // one conditional UPDATE: only the first of any number of concurrent taps changes the row
      const r = await many(R().update({ status, decided_at: now, decided_by_phone: phone }).eq("id", id).eq("status", "pending").eq("to_phone", phone).gt("expires_at", now).select("*"));
      return r[0] ? toRequest(r[0]) : null;
    },
    async expire(id) { const { error } = await R().update({ status: "expired" }).eq("id", id).eq("status", "pending"); if (error) fail(error); },
    async decidedUnapplied() { return (await many(R().select("*").in("status", ["approved", "rejected"]).eq("applied", false).order("decided_at", { ascending: true }).limit(200))).map(toRequest); },
    async markApplied(ids) { if (!ids.length) return; const { error } = await R().update({ applied: true }).in("id", ids); if (error) fail(error); },
    async listRequests(limit) { return (await many(R().select("*").order("created_at", { ascending: false }).limit(limit))).map(toRequest); },
    async logMessage(m) {
      const { error } = await M().insert({ at: m.at, direction: m.direction, phone: m.phone, kind: m.kind, body: m.body, wa_id: m.waId ?? null, status: m.status ?? null, mode: m.mode, meta: m.meta ?? null });
      if (error) { if (error.code === "23505") return false; fail(error); }
      return true;
    },
    async recentMessages(limit, phone) { let q = M().select("*").order("id", { ascending: false }).limit(limit); if (phone) q = q.eq("phone", phone); return (await many(q)).map(toMessage); },
    async countIn(phone, since) { const { count, error } = await M().select("id", { count: "exact", head: true }).eq("direction", "in").eq("phone", phone).gte("at", since); if (error) fail(error); return count ?? 0; },
    async lastOut(phone) { const r = await many(M().select("at").eq("direction", "out").eq("phone", phone).order("id", { ascending: false }).limit(1)); return (r[0]?.at as string) ?? null; },
  };
}
