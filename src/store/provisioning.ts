import { create } from "zustand";
import { SEED_BATCH_ID } from "@/lib/agentEvents";
import type { Person } from "@/lib/people";
import { applyExecution, claimExecutions, fastForward, hasActivity, initRun, retryTask, stepRun, type Run } from "@/lib/provision";
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
  setSpeed: (s: Speed) => void;
  /** begin a fresh live run (after a CSV ingest) */
  start: (people: Person[], by: string) => void;
  /** start provisioning for people added to the existing batch, as a new run that keeps everyone else's history */
  append: (people: Person[], by: string) => void;
  tick: (n: number) => void;
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

export const useProvisioning = create<ProvisioningState>((set, get) => ({
  batch: seedPeople,
  batchId: SEED_BATCH_ID,
  startedBy: "seed",
  // The sample batch has already been provisioned, so the logs and failures pages have real history.
  run: seedRun,
  speed: "1",
  flushedSeq: seedRun.seq,
  stored: 0,
  sync: "idle",
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
}));
