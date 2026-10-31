"use client";
import { useEffect } from "react";
import { canSeeAgentLogs } from "@/lib/auth/policy";
import type { IngestEvent } from "@/lib/agentEvents";
import { hasActivity } from "@/lib/provision";
import type { Execution } from "@/lib/serviceRuntime/types";
import { useProvisioning } from "@/store/provisioning";
import { useUserOrNull } from "./AuthProvider";

const CHUNK = 400;

/**
 * Runs in the background on every page and does two jobs:
 *  1. keeps the provisioning simulation ticking, so logs and failures fill in while you browse elsewhere;
 *  2. streams new agent events to Supabase (HR and department heads only), in idempotent chunks.
 * Renders nothing.
 */
export function ProvisionDriver() {
  const user = useUserOrNull();
  const active = useProvisioning((s) => hasActivity(s.run));
  const speed = useProvisioning((s) => s.speed);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => useProvisioning.getState().tick(Number(speed)), 250);
    return () => clearInterval(id);
  }, [active, speed]);

  // services run on the server: send each one the engine is waiting on, then hand the answer back to the engine
  const canRun = !!user && canSeeAgentLogs(user);
  useEffect(() => {
    if (!canRun) return;
    const send = async (j: ReturnType<ReturnType<typeof useProvisioning.getState>["claim"]>[number]) => {
      const s = useProvisioning.getState();
      try {
        const res = await fetch(`/api/services/${j.service}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person: j.person, attempt: j.attempt, retry: j.retry }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) { s.apply(j.personId, j.service, null, `HTTP ${res.status}`); return; }
        s.apply(j.personId, j.service, (await res.json()) as Execution);
      } catch {
        s.apply(j.personId, j.service, null, "no response");
      }
    };
    const id = setInterval(() => { for (const j of useProvisioning.getState().claim()) void send(j); }, 200);
    return () => clearInterval(id);
  }, [canRun]);

  const canStore = !!user && canSeeAgentLogs(user);
  const dept = user?.dept;
  useEffect(() => {
    if (!canStore) return;
    let busy = false;
    let nextTryAt = 0;

    const flush = async () => {
      if (busy || Date.now() < nextTryAt) return;
      const s = useProvisioning.getState();
      let fresh = s.run.events.filter((e) => e.seq > s.flushedSeq);
      if (!fresh.length) return;
      busy = true;
      try {
        const people = new Map(s.batch.map((p) => [p.id, p]));
        // a department head only ever writes their own department's events
        if (dept) fresh = fresh.filter((e) => people.get(e.personId)?.persona.dept === dept);
        const maxSeq = Math.max(...s.run.events.filter((e) => e.seq > s.flushedSeq).map((e) => e.seq));
        const chunk = fresh.slice(0, CHUNK);
        const events: IngestEvent[] = chunk.flatMap((e) => {
          const p = people.get(e.personId);
          return p ? [{ seq: e.seq, tick: e.t, personId: p.id, personName: p.name, dept: p.persona.dept, manager: p.manager, service: e.service, kind: e.kind, text: e.text, call: e.call, traceId: e.traceId, ms: e.ms, meta: e.meta }] : [];
        });
        if (!events.length) { s.markFlushed(maxSeq, 0); return; }
        const res = await fetch("/api/agent-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: { id: s.batchId, startedBy: s.startedBy, label: `${s.batch.length} people`, people: s.batch.length }, events }),
        });
        if (res.ok) {
          const lastSent = chunk[chunk.length - 1].seq;
          s.markFlushed(chunk.length === fresh.length ? maxSeq : lastSent, events.length);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        s.setSync(body.reason === "not_configured" ? "not_configured" : body.reason === "setup_required" ? "setup_required" : "error");
        nextTryAt = Date.now() + (res.status === 503 ? 20_000 : 10_000);
      } catch {
        useProvisioning.getState().setSync("error");
        nextTryAt = Date.now() + 10_000;
      } finally {
        busy = false;
      }
    };

    const id = setInterval(flush, 1500);
    return () => clearInterval(id);
  }, [canStore, dept]);

  return null;
}
