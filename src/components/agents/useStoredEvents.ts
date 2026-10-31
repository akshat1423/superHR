"use client";
import { useEffect, useState } from "react";
import type { EventsResponse } from "@/lib/agentEvents";
import type { LogKind } from "@/lib/provision";

export interface StoredQuery { batch: string; service: string; kinds: LogKind[]; person: string; q: string; limit: number }

interface State { data: EventsResponse | null; error: string | null; loading: boolean; updatedAt: number }

/**
 * Agent events from Supabase via the session-checked route (which applies the role's scope server-side).
 * Re-fetches whenever the filters change and, while `live`, every few seconds so a running batch streams in.
 */
export function useStoredEvents(query: StoredQuery, live: boolean): State {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true, updatedAt: 0 });
  const key = JSON.stringify(query);

  useEffect(() => {
    let alive = true;
    const q: StoredQuery = JSON.parse(key);
    const load = async () => {
      const qs = new URLSearchParams({ batch: q.batch, limit: String(q.limit) });
      if (q.service) qs.set("service", q.service);
      if (q.person) qs.set("person", q.person);
      if (q.q) qs.set("q", q.q);
      if (q.kinds.length && q.kinds.length < 4) qs.set("kind", q.kinds.join(","));
      try {
        const res = await fetch(`/api/agent-events?${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 403 ? "Your role can't read agent logs" : `Request failed (${res.status})`);
        const data = (await res.json()) as EventsResponse;
        if (alive) setState({ data, error: null, loading: false, updatedAt: Date.now() });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Network error", loading: false }));
      }
    };
    void load();
    const timer = live ? setInterval(load, 4000) : undefined;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [key, live]);

  return state;
}
