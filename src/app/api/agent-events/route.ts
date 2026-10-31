import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { canSeeAgentLogs } from "@/lib/auth/policy";
import { BATCH_ID, parseIngest, type BatchInfo, type EventsResponse, type StoredEvent } from "@/lib/agentEvents";
import { isMissingTable, supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { LogKind } from "@/lib/provision";

const KINDS = new Set(["info", "ok", "warn", "error"]);
const NOT_CONFIGURED: EventsResponse = { configured: false, setupRequired: false, batch: null, batches: [], events: [], total: 0 };
const NEEDS_SETUP: EventsResponse = { configured: true, setupRequired: true, batch: null, batches: [], events: [], total: 0 };

/**
 * Read stored agent logs. HR sees everything; a department head sees only their department's events
 * (the filter is applied here, on the server, from the verified session — never from a query parameter).
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canSeeAgentLogs(user)) return new Response(null, { status: 403 });
  if (!supabaseConfigured()) return NextResponse.json(NOT_CONFIGURED);
  const db = supabaseServer()!;

  const p = new URL(req.url).searchParams;
  const limit = Math.min(300, Math.max(1, Number(p.get("limit")) || 100));
  const before = Number(p.get("before")) || 0;
  const kinds = (p.get("kind") ?? "").split(",").filter((k) => KINDS.has(k));
  const service = p.get("service") ?? "";
  const person = p.get("person") ?? "";
  // strip characters that would change the meaning of a PostgREST filter expression
  const q = (p.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

  const bres = await db.from("agent_batches").select("id,started_at,started_by,label,people").order("started_at", { ascending: false }).limit(20);
  if (bres.error) {
    if (isMissingTable(bres.error)) return NextResponse.json(NEEDS_SETUP);
    return NextResponse.json({ error: "Could not read batches", code: bres.error.code }, { status: 502 });
  }
  const batches: BatchInfo[] = (bres.data ?? []).map((b) => ({ id: b.id, startedAt: b.started_at, startedBy: b.started_by, label: b.label, people: b.people }));

  const requested = p.get("batch") ?? "latest";
  const batch = requested === "latest" ? (batches[0]?.id ?? null) : BATCH_ID.test(requested) ? requested : null;
  if (!batch) return NextResponse.json({ ...NOT_CONFIGURED, configured: true, batches });

  let query = db
    .from("agent_events")
    .select("seq,tick,occurred_at,person_id,person_name,dept,service,kind,message,call,trace_id,ms,meta", { count: "exact" })
    .eq("batch_id", batch)
    .order("seq", { ascending: false })
    .limit(limit);
  if (user.role === "dept_head") query = query.eq("dept", user.dept ?? "__none__");
  if (before) query = query.lt("seq", before);
  if (kinds.length) query = query.in("kind", kinds);
  if (service) query = query.eq("service", service);
  if (person) query = query.eq("person_id", person);
  if (q) query = query.or(`message.ilike.%${q}%,person_name.ilike.%${q}%,call.ilike.%${q}%,trace_id.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    if (isMissingTable(error)) return NextResponse.json(NEEDS_SETUP);
    return NextResponse.json({ error: "Could not read events", code: error.code }, { status: 502 });
  }
  const events: StoredEvent[] = (data ?? []).map((r) => ({
    seq: r.seq, tick: r.tick, at: r.occurred_at, personId: r.person_id, personName: r.person_name, dept: r.dept,
    service: r.service, kind: r.kind as LogKind, text: r.message, call: r.call ?? undefined, traceId: r.trace_id ?? undefined,
    ms: r.ms ?? undefined, meta: (r.meta as Record<string, unknown> | null) ?? undefined,
  }));
  return NextResponse.json({ configured: true, setupRequired: false, batch, batches, events, total: count ?? events.length } satisfies EventsResponse);
}

/**
 * Append events. Allowed for roles that can see agent logs; a department head can only write events for
 * their own department. Idempotent: re-sending the same (batch, seq) is ignored, so retries are safe.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canSeeAgentLogs(user)) return new Response(null, { status: 403 });

  const parsed = parseIngest(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { batch, events } = parsed.value;
  if (user.role === "dept_head" && events.some((e) => e.dept !== user.dept)) return new Response(null, { status: 403 });

  if (!supabaseConfigured()) return NextResponse.json({ stored: false, reason: "not_configured" }, { status: 503 });
  const db = supabaseServer()!;

  const b = await db.from("agent_batches").upsert({ id: batch.id, started_by: batch.startedBy, label: batch.label, people: batch.people }, { onConflict: "id", ignoreDuplicates: true });
  if (b.error) {
    if (isMissingTable(b.error)) return NextResponse.json({ stored: false, reason: "setup_required" }, { status: 503 });
    return NextResponse.json({ stored: false, reason: "batch_failed", code: b.error.code }, { status: 502 });
  }
  const rows = events.map((e) => ({
    batch_id: batch.id, seq: e.seq, tick: e.tick, person_id: e.personId, person_name: e.personName, dept: e.dept, manager: e.manager,
    service: e.service, kind: e.kind, message: e.text, call: e.call ?? null, trace_id: e.traceId ?? null, ms: e.ms ?? null, meta: e.meta ?? null,
  }));
  const r = await db.from("agent_events").upsert(rows, { onConflict: "batch_id,seq", ignoreDuplicates: true });
  if (r.error) return NextResponse.json({ stored: false, reason: "insert_failed", code: r.error.code }, { status: 502 });
  return NextResponse.json({ stored: true, count: rows.length });
}
