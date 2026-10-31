"use client";
import { useMemo } from "react";
import { inScope } from "@/lib/auth/policy";
import type { Person } from "@/lib/people";
import type { LogEvent, PersonRun } from "@/lib/provision";
import { useProvisioning } from "@/store/provisioning";
import { useUser } from "@/components/shell/AuthProvider";

export interface ScopedRow { person: Person; pr: PersonRun }

/** The provisioning run, restricted to the people the signed-in user is allowed to see. */
export function useScopedRun() {
  const user = useUser();
  const { batch, run } = useProvisioning();
  return useMemo(() => {
    const byId = new Map(batch.map((p) => [p.id, p]));
    const rows: ScopedRow[] = [];
    for (const pr of run.people) {
      const person = byId.get(pr.personId);
      if (person && inScope(user, person)) rows.push({ person, pr });
    }
    const allowed = new Set(rows.map((r) => r.person.id));
    const events: LogEvent[] = run.events.filter((e) => allowed.has(e.personId));
    return { rows, events, tick: run.tick, personName: (id: string) => byId.get(id)?.name ?? id, personOf: (id: string) => byId.get(id) };
  }, [batch, run, user]);
}
