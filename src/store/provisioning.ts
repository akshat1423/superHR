import { create } from "zustand";
import { SEED_BATCH_ID } from "@/lib/agentEvents";
import type { Person } from "@/lib/people";
import { fastForward, hasActivity, initRun, retryTask, stepRun, type Run } from "@/lib/provision";
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
  tick: (n: number) => void;
  retry: (personId: string, svcId: string, by: string) => void;
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
    set({ batch: people, run: initRun(people), batchId: `b-${Date.now().toString(36)}`, startedBy: by, flushedSeq: 0, stored: 0, sync: "idle" }),
  tick: (n) => {
    const { run, batch } = get();
    if (!hasActivity(run)) return;
    let next = run;
    for (let i = 0; i < n; i++) next = stepRun(next, batch);
    set({ run: next });
  },
  retry: (personId, svcId, by) => set((s) => ({ run: retryTask(s.run, personId, svcId, by) })),
  markFlushed: (seq, count) => set((s) => ({ flushedSeq: Math.max(s.flushedSeq, seq), stored: s.stored + count, sync: "ok" })),
  setSync: (sync) => set({ sync }),
}));
