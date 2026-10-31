import { create } from "zustand";
import { browserStorage } from "@/lib/storage";
import { createJSONStorage, persist } from "zustand/middleware";
import { parseAts } from "@/lib/csv";
import { daysSinceJoining } from "@/lib/dates";
import { SAMPLE_CSV } from "@/lib/sample";
import type { FieldKey, Person, Status } from "@/lib/people";
import type { Dept, EmpType, Level } from "@/lib/workflow";

/** What HR can change on an existing employee. Everything here can alter their checklist. */
export interface PersonPatch {
  role?: string;
  grade?: string;
  level?: Level;
  department?: Dept;
  location?: string;
  type?: EmpType;
  startDate?: string;
  manager?: string;
}

interface PeopleState {
  people: Person[];
  sent: Record<string, true>;
  /** true for the built-in sample batch (only that gets seeded progress) */
  isSample: boolean;
  /** replace the batch (after a CSV ingest) */
  loadBatch: (people: Person[]) => void;
  /** add joiners to the existing batch (an ATS sync, or one added by hand) */
  addPeople: (added: Person[]) => void;
  /** mark onboarding terminated (or reinstated with `null`) */
  setTerminated: (personId: string, t: Person["terminated"] | null) => void;
  setStepStatus: (personId: string, stepId: string, status: Status) => void;
  /** missing → requested (magic link sent) → submitted by candidate */
  advanceField: (personId: string, field: FieldKey) => void;
  /** the new joiner provides a field themselves (any state → filled by candidate) */
  submitField: (personId: string, field: FieldKey) => void;
  markSent: (key: string) => void;
  updatePerson: (personId: string, patch: PersonPatch) => void;
}

const patchOne = (people: Person[], id: string, fn: (p: Person) => Person) => people.map((p) => (p.id === id ? fn(p) : p));

export const usePeople = create<PeopleState>()(
  persist(
    (set) => ({
      people: parseAts(SAMPLE_CSV).people,
      sent: {},
      isSample: true,
      loadBatch: (people) => set({ people, sent: {}, isSample: false }),
      addPeople: (added) => set((s) => ({ people: [...s.people, ...added], isSample: false })),
      setTerminated: (pid, t) => set((s) => ({ people: patchOne(s.people, pid, (p) => { const { terminated: _drop, ...rest } = p; void _drop; return t ? { ...rest, terminated: t } : rest; }) })),
      setStepStatus: (pid, sid, status) =>
        set((s) => ({ people: patchOne(s.people, pid, (p) => ({ ...p, manual: { ...p.manual, [sid]: status } })) })),
      advanceField: (pid, field) =>
        set((s) => ({
          people: patchOne(s.people, pid, (p) => {
            const cur = p.fields[field];
            const next = cur === "missing" ? "req" : cur === "req" ? "cand" : cur;
            return { ...p, fields: { ...p.fields, [field]: next } };
          }),
        })),
      submitField: (pid, field) =>
        set((s) => ({ people: patchOne(s.people, pid, (p) => ({ ...p, fields: { ...p.fields, [field]: "cand" } })) })),
      markSent: (key) => set((s) => ({ sent: { ...s.sent, [key]: true } })),
      updatePerson: (pid, patch) =>
        set((s) => ({
          people: patchOne(s.people, pid, (p) => {
            const startDate = patch.startDate ?? p.startDate;
            return {
              ...p,
              role: patch.role ?? p.role,
              grade: patch.grade ?? p.grade,
              location: patch.location ?? p.location,
              manager: patch.manager ?? p.manager,
              startDate,
              day: daysSinceJoining(startDate),
              persona: { type: patch.type ?? p.persona.type, dept: patch.department ?? p.persona.dept, level: patch.level ?? p.persona.level },
            };
          }),
        })),
    }),
    {
      name: "superjoin.people",
      version: 1,
      storage: createJSONStorage(browserStorage),
      // Restoring is done on the client after hydration (see <Hydrate />) so the server and first client render agree.
      skipHydration: true,
      partialize: (s) => ({ people: s.people, sent: s.sent, isSample: s.isSample }),
    },
  ),
);
