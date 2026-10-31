"use client";
import { useMemo } from "react";
import { todayISO } from "@/lib/dates";
import type { Person } from "@/lib/people";
import { ctxOf, type EmployeeCtx } from "@/lib/onboarding/rules";
import { findEscalations, type Escalation } from "@/lib/onboarding/escalate";
import { deriveStates, isReady, summarize, type Summary } from "@/lib/onboarding/status";
import type { ChecklistItem, DocumentRecord, ItemState } from "@/lib/onboarding/types";
import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";

export interface EmployeeView {
  person: Person;
  ctx: EmployeeCtx;
  items: ChecklistItem[];
  docs: Record<string, DocumentRecord | undefined>;
  states: Record<string, ItemState>;
  summary: Summary;
  escalations: Escalation[];
  ready: boolean;
}

const view = (person: Person, items: ChecklistItem[], docs: Record<string, DocumentRecord | undefined>, directory: Parameters<typeof findEscalations>[4]): EmployeeView => {
  const ctx = ctxOf(person);
  const today = todayISO();
  const states = deriveStates(items, docs, today);
  const summary = summarize(items, states, person.startDate);
  return { person, ctx, items, docs, states, summary, escalations: person.terminated ? [] : findEscalations(items, states, docs, ctx, directory, today), ready: !person.terminated && isReady(summary) };
};

/** Everything the UI needs to show one employee: checklist, derived states, readiness and escalations. */
export function useEmployeeView(personId: string): EmployeeView | null {
  const person = usePeople((s) => s.people.find((p) => p.id === personId));
  const items = useOnboarding((s) => s.items[personId]);
  const docs = useOnboarding((s) => s.docs);
  const directory = useOnboarding((s) => s.directory);
  return useMemo(() => (person && items ? view(person, items, docs, directory) : null), [person, items, docs, directory]);
}

/** The same view for many people at once (the dashboard). */
export function usePortfolio(people: Person[]): EmployeeView[] {
  const allItems = useOnboarding((s) => s.items);
  const docs = useOnboarding((s) => s.docs);
  const directory = useOnboarding((s) => s.directory);
  return useMemo(() => people.flatMap((p) => (allItems[p.id] ? [view(p, allItems[p.id], docs, directory)] : [])), [people, allItems, docs, directory]);
}
