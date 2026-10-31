import { create } from "zustand";
import type { Person } from "@/lib/people";
import { fastForward, hasActivity, initRun, retryTask, stepRun, type Run } from "@/lib/provision";
import { usePeople } from "./people";

export type Speed = "1" | "4" | "10";

interface ProvisioningState {
  /** the people this run was started for (agents work from this snapshot) */
  batch: Person[];
  run: Run;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  /** begin a fresh live run (after a CSV ingest) */
  start: (people: Person[]) => void;
  tick: (n: number) => void;
  retry: (personId: string, svcId: string, by: string) => void;
}

const seedPeople = usePeople.getState().people;

export const useProvisioning = create<ProvisioningState>((set, get) => ({
  batch: seedPeople,
  // The sample batch has already been provisioned, so the logs and failures pages have real history.
  run: fastForward(initRun(seedPeople), seedPeople),
  speed: "1",
  setSpeed: (speed) => set({ speed }),
  start: (people) => set({ batch: people, run: initRun(people) }),
  tick: (n) => {
    const { run, batch } = get();
    if (!hasActivity(run)) return;
    let next = run;
    for (let i = 0; i < n; i++) next = stepRun(next, batch);
    set({ run: next });
  },
  retry: (personId, svcId, by) => set((s) => ({ run: retryTask(s.run, personId, svcId, by) })),
}));
