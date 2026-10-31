import "server-only";
import { NextResponse } from "next/server";
import { aiConfigured, completeWithClaude } from "@/lib/ai";
import type { DemoUser } from "@/lib/auth/users";
import { answer } from "@/lib/onboarding/assistant";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import { defaultSender, isLive, sandboxSender, waConfig, type Sender } from "./graph";
import type { Deps } from "./service";
import { memoryStore, supabaseStore, SetupRequired, type WaStore } from "./store";
import type { WaContact, WaMessage, WaRequest } from "./types";

export { SetupRequired };

declare global { var __sjWaMemory: WaStore | undefined }

/**
 * Supabase when it is configured; otherwise a per-process memory store (fine for local development, not for production).
 * WHATSAPP_STORE=memory forces the memory store, for trying things locally before the SQL has been run.
 */
export function getStore(): WaStore {
  if (supabaseConfigured() && process.env.WHATSAPP_STORE !== "memory") return supabaseStore(supabaseServer()!);
  return (globalThis.__sjWaMemory ??= memoryStore());
}

/** The real thing: sends through WhatsApp when credentials are set, otherwise through the sandbox. */
export const liveDeps = (send: Sender = defaultSender()): Deps => ({ store: getStore(), send, cfg: waConfig(), answer: (i) => answer(i, aiConfigured() ? completeWithClaude : undefined) });
/** Never touches WhatsApp: for the simulator. */
export const simDeps = (): Deps => liveDeps(sandboxSender());

/** A route's catch-all: the missing-tables case is a clear 503 the UI can explain; anything else a plain 500 without internals. */
export const failed = (e: unknown) =>
  e instanceof SetupRequired ? NextResponse.json({ setupRequired: true, error: e.message }, { status: 503 }) : NextResponse.json({ error: e instanceof Error && /already linked/.test(e.message) ? e.message : "Something went wrong." }, { status: 500 });

export const mode = () => (isLive() ? "live" : "sandbox") as "live" | "sandbox";

/** May this user act for a person in this department, under this manager? (HR any; a head their department; a manager their reports.) */
export function canActFor(u: DemoUser, scope: { dept?: string; manager?: string }): boolean {
  if (u.role === "hr") return true;
  if (u.role === "dept_head") return !!scope.dept && scope.dept === u.dept;
  if (u.role === "manager") return !!scope.manager && scope.manager === u.name;
  return false;
}

export const maskPhone = (p?: string) => (p ? `••••${p.slice(-4)}` : undefined);
/** A contact as the browser sees it: never the number, never the snapshot, never the invite code of someone who has joined. */
export const publicContact = (c: WaContact) => ({ id: c.id, kind: c.kind, personId: c.personId, name: c.name, email: c.email, dept: c.dept, status: c.status, phone: maskPhone(c.phone), joinedAt: c.joinedAt, lastInboundAt: c.lastInboundAt, hasSnapshot: !!c.snapshot, snapshotAt: c.snapshot?.updatedAt, inviteCode: c.status === "invited" ? c.inviteCode : undefined, inviteExpiresAt: c.status === "invited" ? c.inviteExpiresAt : undefined });
export const publicMessage = (m: WaMessage) => ({ ...m, phone: maskPhone(m.phone) });
export const publicRequest = (r: WaRequest) => ({ id: r.id, code: r.code, personId: r.personId, itemId: r.itemId, dept: r.dept, toName: r.toName, title: r.title, status: r.status, createdAt: r.createdAt, expiresAt: r.expiresAt, decidedAt: r.decidedAt, applied: r.applied });
