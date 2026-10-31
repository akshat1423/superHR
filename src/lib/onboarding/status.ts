import type { ChecklistItem, DocumentRecord, ItemState, OwnerFn } from "./types";

type Docs = Record<string, DocumentRecord | undefined>;

/**
 * State of every item as a viewer sees it:
 *  - completed  done
 *  - blocked    cannot move: a document needs correction, or something it waits for is late/blocked
 *  - overdue    past its due date with nothing in front of it
 *  - pending    on track
 */
export function deriveStates(items: ChecklistItem[], docs: Docs, today: string): Record<string, ItemState> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const memo = new Map<string, ItemState>();

  const state = (i: ChecklistItem): ItemState => {
    const cached = memo.get(i.id);
    if (cached) return cached;
    memo.set(i.id, "pending"); // guards against a dependency cycle in user-supplied rules
    let s: ItemState;
    if (i.status === "completed") s = "completed";
    else if (docs[i.id]?.status === "Correction Requested") s = "blocked";
    else {
      const open = i.dependsOn.map((d) => byId.get(d)).filter((d): d is ChecklistItem => !!d && d.status !== "completed");
      const upstreamProblem = open.some((d) => { const ds = state(d); return ds === "blocked" || ds === "overdue"; });
      s = upstreamProblem ? "blocked" : i.dueDate < today ? "overdue" : "pending";
    }
    memo.set(i.id, s);
    return s;
  };

  const out: Record<string, ItemState> = {};
  for (const i of items) out[i.id] = state(i);
  return out;
}

/** The unfinished upstream items that are holding this one up (for "waiting on…" messages). */
export function blockers(item: ChecklistItem, items: ChecklistItem[], states: Record<string, ItemState>, docs: Docs): ChecklistItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  if (docs[item.id]?.status === "Correction Requested") return [];
  return item.dependsOn
    .map((d) => byId.get(d))
    .filter((d): d is ChecklistItem => !!d && d.status !== "completed" && (states[d.id] === "blocked" || states[d.id] === "overdue"));
}

export interface Summary {
  total: number;
  completed: number;
  pending: number;
  blocked: number;
  overdue: number;
  /** items due on or before the joining date, and how many of those are done: the readiness measure */
  beforeJoining: { done: number; total: number };
}

export function summarize(items: ChecklistItem[], states: Record<string, ItemState>, startDate: string): Summary {
  const s: Summary = { total: items.length, completed: 0, pending: 0, blocked: 0, overdue: 0, beforeJoining: { done: 0, total: 0 } };
  for (const i of items) {
    s[states[i.id]]++;
    if (i.dueDate <= startDate) { s.beforeJoining.total++; if (i.status === "completed") s.beforeJoining.done++; }
  }
  return s;
}

/** True when everything due before the joining date is done: the employee can start fully prepared. */
export const isReady = (s: Summary) => s.beforeJoining.total > 0 && s.beforeJoining.done === s.beforeJoining.total;

// ── automation ───────────────────────────────────────────────────────────────

export interface AutoEvent { itemId: string; action: string; detail: string }

const PREFIX: Partial<Record<OwnerFn, string>> = { IT: "IT", Facilities: "FAC", HR: "HR", Compliance: "CMP" };

/**
 * The agent's own actions. As soon as everything an item waits for is complete, the agent
 *  - creates and populates the HR record (kind "record"), and
 *  - raises the provisioning request with the owning team (kind "provision"), returning a ticket number.
 * Runs to a fixed point, so completing a document can cascade record → laptop → access in one go.
 */
export function advance(
  items: ChecklistItem[],
  now: string,
  employeeId: string,
  nextTicket: (prefix: string) => string,
): { items: ChecklistItem[]; events: AutoEvent[] } {
  const next = items.map((i) => ({ ...i }));
  const events: AutoEvent[] = [];
  const done = new Set(next.filter((i) => i.status === "completed").map((i) => i.id));

  let changed = true;
  while (changed) {
    changed = false;
    for (const i of next) {
      if (i.status !== "pending" || !i.dependsOn.every((d) => done.has(d))) continue;
      if (i.kind === "record") {
        i.status = "completed";
        i.completedAt = now;
        done.add(i.id);
        events.push({ itemId: i.id, action: "HR record created", detail: `Employee ${employeeId} created and populated from the approved documents` });
        changed = true;
      } else if (i.kind === "provision") {
        i.status = "requested";
        i.ticket = nextTicket(PREFIX[i.ownerFn] ?? "REQ");
        events.push({ itemId: i.id, action: "Provisioning requested", detail: `${i.item} requested from ${i.owner.name} (${i.ownerFn}), ticket ${i.ticket}` });
        changed = true;
      }
    }
  }
  return { items: next, events };
}
