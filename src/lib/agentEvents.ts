import type { LogKind } from "./provision";
import { DEPTS } from "./workflow";

/** An agent event as stored in (and read back from) Supabase. */
export interface StoredEvent {
  seq: number;
  tick: number;
  personId: string;
  personName: string;
  dept: string;
  service: string;
  kind: LogKind;
  text: string;
  call?: string;
  traceId?: string;
  ms?: number;
  meta?: Record<string, unknown>;
  /** wall-clock insert time, set by the database */
  at?: string;
}

export interface BatchInfo { id: string; startedAt: string; startedBy: string; label: string; people: number }

export interface EventsResponse {
  configured: boolean;
  /** the SQL in supabase/migrations has not been run yet */
  setupRequired: boolean;
  batch: string | null;
  batches: BatchInfo[];
  events: StoredEvent[];
  total: number;
}

export interface IngestEvent extends Omit<StoredEvent, "at"> { manager: string }
export interface IngestPayload {
  batch: { id: string; startedBy: string; label: string; people: number };
  events: IngestEvent[];
}

export const BATCH_ID = /^[A-Za-z0-9_-]{3,64}$/;
/** The sample batch's history is stored once by `npm run db:seed` under this id. */
export const SEED_BATCH_ID = "seed-sample";
export const MAX_EVENTS_PER_POST = 500;
const KINDS = new Set<string>(["info", "ok", "warn", "error"]);

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || v === null || (typeof v === "string" && v.length <= max);
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2_000_000_000;

/** Validates untrusted JSON from the browser. Everything is length-limited; nothing is trusted. */
export function parseIngest(body: unknown): { ok: true; value: IngestPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const { batch, events } = body as { batch?: Record<string, unknown>; events?: unknown };
  if (!batch || typeof batch.id !== "string" || !BATCH_ID.test(batch.id)) return { ok: false, error: "Invalid batch id" };
  if (!str(batch.startedBy, 80) || !optStr(batch.label, 120) || !int(batch.people)) return { ok: false, error: "Invalid batch" };
  if (!Array.isArray(events) || events.length === 0) return { ok: false, error: "No events" };
  if (events.length > MAX_EVENTS_PER_POST) return { ok: false, error: `At most ${MAX_EVENTS_PER_POST} events per request` };

  const out: IngestEvent[] = [];
  for (const raw of events) {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e !== "object") return { ok: false, error: "Invalid event" };
    if (!int(e.seq) || !int(e.tick)) return { ok: false, error: "Invalid seq/tick" };
    if (!str(e.personId, 40) || !str(e.personName, 80) || !str(e.manager, 80) || !str(e.service, 40) || !str(e.text, 600)) return { ok: false, error: "Invalid text field" };
    if (typeof e.dept !== "string" || !(DEPTS as readonly string[]).includes(e.dept)) return { ok: false, error: "Invalid department" };
    if (typeof e.kind !== "string" || !KINDS.has(e.kind)) return { ok: false, error: "Invalid kind" };
    if (!optStr(e.call, 240) || !optStr(e.traceId, 40)) return { ok: false, error: "Invalid call/trace" };
    if (e.ms !== undefined && e.ms !== null && !int(e.ms)) return { ok: false, error: "Invalid ms" };
    let meta: Record<string, unknown> | undefined;
    if (e.meta !== undefined && e.meta !== null) {
      if (typeof e.meta !== "object" || Array.isArray(e.meta) || JSON.stringify(e.meta).length > 8000) return { ok: false, error: "Invalid meta" };
      meta = e.meta as Record<string, unknown>;
    }
    out.push({
      seq: e.seq, tick: e.tick, personId: e.personId, personName: e.personName, dept: e.dept, manager: e.manager,
      service: e.service, kind: e.kind as LogKind, text: e.text,
      call: (e.call as string | undefined) || undefined, traceId: (e.traceId as string | undefined) || undefined,
      ms: (e.ms as number | undefined) ?? undefined, meta,
    });
  }
  return { ok: true, value: { batch: { id: batch.id, startedBy: batch.startedBy as string, label: (batch.label as string) ?? "", people: batch.people as number }, events: out } };
}
