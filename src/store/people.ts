import { create } from "zustand";
import { parseAts } from "@/lib/csv";
import { SAMPLE_CSV } from "@/lib/sample";
import type { FieldKey, Person, Status } from "@/lib/people";

interface PeopleState {
  people: Person[];
  sent: Record<string, true>;
  /** replace the batch (after a CSV ingest) */
  loadBatch: (people: Person[]) => void;
  setStepStatus: (personId: string, stepId: string, status: Status) => void;
  /** missing → requested (magic link sent) → submitted by candidate */
  advanceField: (personId: string, field: FieldKey) => void;
  markSent: (key: string) => void;
}

const patch = (people: Person[], id: string, fn: (p: Person) => Person) => people.map((p) => (p.id === id ? fn(p) : p));

export const usePeople = create<PeopleState>((set) => ({
  people: parseAts(SAMPLE_CSV).people,
  sent: {},
  loadBatch: (people) => set({ people, sent: {} }),
  setStepStatus: (pid, sid, status) =>
    set((s) => ({ people: patch(s.people, pid, (p) => ({ ...p, manual: { ...p.manual, [sid]: status } })) })),
  advanceField: (pid, field) =>
    set((s) => ({
      people: patch(s.people, pid, (p) => {
        const cur = p.fields[field];
        const next = cur === "missing" ? "req" : cur === "req" ? "cand" : cur;
        return { ...p, fields: { ...p.fields, [field]: next } };
      }),
    })),
  markSent: (key) => set((s) => ({ sent: { ...s.sent, [key]: true } })),
}));
