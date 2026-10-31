import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { browserStorage } from "@/lib/storage";
import { SEED_BATCH_ID } from "@/lib/agentEvents";
import type { Person } from "@/lib/people";
import { applyAction, applyExecution, cancelRun, claimExecutions, fastForward, hasActivity, initRun, reprovisionTask, restoreRevocations, retryTask, stepRun, type LedgerEntry, type ProvAction, type Run } from "@/lib/provision";
import { serviceIndex } from "@/lib/services";
import type { Execution } from "@/lib/serviceRuntime/types";
import { usePeople } from "./people";

export type Speed = "1" | "4" | "10";
/** Whether this browser's agent events are being saved to Supabase. */
export type SyncState = "idle" | "ok" | "not_configured" | "setup_required" | "error";

interface ProvisioningState {
  /** the people this run was started for (agents work from this snapshot) */
  batch: Person[];
  batchId: string;
  startedBy: string;
  run: Run;
  speed: Speed;
  /** highest event seq already saved (or known to be saved) in Supabase for this batch */
  flushedSeq: number;
  stored: number;
  sync: SyncState;
  /** revocations per person: the part of the run that is saved across reloads */
  ledger: Record<string, LedgerEntry>;
  /** put saved revocations back onto the run after a reload */
  restoreLedger: () => void;
  setSpeed: (s: Speed) => void;
  /** begin a fresh live run (after a CSV ingest) */
  start: (people: Person[], by: string) => void;
  /** start provisioning for people added to the existing batch, as a new run that keeps everyone else's history */
  append: (people: Person[], by: string) => void;
  tick: (n: number) => void;
  /** the person's details changed: later service calls must use the new ones */
  syncPerson: (p: Person) => void;
  /** run a revoked or failed service again from the start */
  reprovision: (personId: string, svcId: string, by: string) => void;
  /** stop the person's onboarding: cancel what has not started; returns the services to deprovision (dependents first) */
  cancel: (personId: string, by: string, reason: string) => string[];
  /** record what the server did for a deprovision, update or single-app grant */
  applyAct: (personId: string, a: ProvAction & { by: string }, ex: Execution | null) => void;
  retry: (personId: string, svcId: string, by: string) => void;
  /** server calls the engine is waiting to make (each is returned once) */
  claim: () => { personId: string; service: string; attempt: number; retry: boolean; person: Person }[];
  /** the server answered (or could not) for one service */
  apply: (personId: string, service: string, ex: Execution | null, why?: string) => void;
  markFlushed: (seq: number, count: number) => void;
  setSync: (s: SyncState) => void;
}

const seedPeople = usePeople.getState().people;
const seedRun = fastForward(initRun(seedPeople), seedPeople);

export const useProvisioning = create<ProvisioningState>()(persist((set, get) => ({
  batch: seedPeople,
  batchId: SEED_BATCH_ID,
  startedBy: "seed",
  // The sample batch has already been provisioned, so the logs and failures pages have real history.
  run: seedRun,
  speed: "1",
  flushedSeq: seedRun.seq,
  stored: 0,
  sync: "idle",
  ledger: {},
  restoreLedger: () => set((s) => {
    const gone = new Set(usePeople.getState().people.filter((p) => p.terminated).map((p) => p.id));
    let run = s.run;
    for (const id of new Set([...Object.keys(s.ledger), ...gone])) run = restoreRevocations(run, id, s.ledger[id], gone.has(id));
    return { run };
  }),
  setSpeed: (speed) => set({ speed }),
  start: (people, by) =>
    set({ batch: people, run: initRun(people, true), batchId: `b-${Date.now().toString(36)}`, startedBy: by, flushedSeq: 0, stored: 0, sync: "idle" }),
  append: (people, by) =>
    set((s) => {
      const fresh = initRun(people, true);
      // a new batch id, and only events from here on are streamed to it (earlier ones are already stored)
      return { batch: [...s.batch, ...people], run: { ...s.run, remote: true, people: [...s.run.people, ...fresh.people] }, batchId: `b-${Date.now().toString(36)}`, startedBy: by, flushedSeq: s.run.seq, stored: 0, sync: "idle" };
    }),
  tick: (n) => {
    const { run, batch } = get();
    if (!hasActivity(run)) return;
    let next = run;
    for (let i = 0; i < n; i++) next = stepRun(next, batch);
    set({ run: next });
  },
  retry: (personId, svcId, by) => set((s) => ({ run: retryTask(s.run, personId, svcId, by) })),
  syncPerson: (p) => set((s) => (s.batch.some((x) => x.id === p.id) ? { batch: s.batch.map((x) => (x.id === p.id ? p : x)) } : {})),
  reprovision: (personId, svcId, by) => set((s) => {
    const e = s.ledger[personId];
    const led = e ? { ...s.ledger, [personId]: { services: Object.fromEntries(Object.entries(e.services).filter(([k]) => k !== svcId)), objects: Object.fromEntries(Object.entries(e.objects).filter(([k]) => k !== svcId)) } } : s.ledger;
    return { run: reprovisionTask(s.run, personId, svcId, by), ledger: led };
  }),
  cancel: (personId, by, reason) => {
    const out = cancelRun(get().run, personId, by, reason);
    set({ run: out.run });
    return out.revoke;
  },
  applyAct: (personId, a, ex) => set((s) => {
    const run = applyAction(s.run, personId, a, ex);
    if (a.kind === "update") return { run };
    // remember what is revoked, so it survives a reload
    const t = run.people.find((r) => r.personId === personId)?.tasks[serviceIndex(a.service)];
    const cur = s.ledger[personId] ?? { services: {}, objects: {} };
    const services = { ...cur.services }, objects = { ...cur.objects };
    if (t?.revocation) services[a.service] = t.revocation; else delete services[a.service];
    if (t?.revokedObjects && Object.keys(t.revokedObjects).length) objects[a.service] = t.revokedObjects; else delete objects[a.service];
    return { run, ledger: { ...s.ledger, [personId]: { services, objects } } };
  }),
  claim: () => {
    const { run, jobs } = claimExecutions(get().run);
    if (!jobs.length) return [];
    set({ run });
    const byId = new Map(get().batch.map((p) => [p.id, p]));
    return jobs.flatMap((j) => { const person = byId.get(j.personId); return person ? [{ ...j, person }] : []; });
  },
  apply: (personId, service, ex, why) => set((s) => ({ run: applyExecution(s.run, personId, service, ex, why) })),
  markFlushed: (seq, count) => set((s) => ({ flushedSeq: Math.max(s.flushedSeq, seq), stored: s.stored + count, sync: "ok" })),
  setSync: (sync) => set({ sync }),
}), { name: "superjoin.provisioning", version: 1, storage: createJSONStorage(browserStorage), skipHydration: true, partialize: (s) => ({ ledger: s.ledger }) }));
