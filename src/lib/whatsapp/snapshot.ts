import type { Person } from "../people";
import { toFacts } from "../onboarding/assistant";
import { resolveOwner } from "../onboarding/owners";
import { SAMPLE_POLICIES } from "../onboarding/policies";
import { ctxOf } from "../onboarding/rules";
import { deriveStates } from "../onboarding/status";
import type { ChecklistItem, Directory, DocumentRecord, Policy } from "../onboarding/types";
import type { Snapshot } from "./types";

const sameAsBuiltIn = (p: Policy[]) => p.length === SAMPLE_POLICIES.length && p.every((x, i) => x.id === SAMPLE_POLICIES[i].id && x.version === SAMPLE_POLICIES[i].version && x.sections.length === SAMPLE_POLICIES[i].sections.length);

/**
 * What the WhatsApp assistant may know about one joiner: their details, who their HR contact is, and each checklist line
 * (what, when, who owns it, its state and why). The policies are included only when the organisation has changed them.
 */
export function buildSnapshot(person: Person, data: { items: ChecklistItem[]; docs: Record<string, DocumentRecord | undefined>; policies: Policy[]; directory: Directory }, today: string): Snapshot {
  const c = ctxOf(person);
  const states = deriveStates(data.items, data.docs, today);
  const hr = resolveOwner("HR", { name: c.name, email: c.email, department: c.department, location: c.location, manager: c.manager }, data.directory);
  return {
    employee: { name: c.name, role: c.role, department: c.department, location: c.location, country: c.country, grade: c.grade, level: c.level, startDate: c.startDate, manager: c.manager },
    hr: { name: hr.name, email: hr.email },
    facts: toFacts(data.items, states, data.docs).slice(0, 80),
    ...(sameAsBuiltIn(data.policies) ? {} : { policies: data.policies.slice(0, 60) }),
    updatedAt: new Date().toISOString(),
  };
}
