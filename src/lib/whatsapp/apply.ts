import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";

/** An answer someone gave on WhatsApp, as the server reports it. */
export interface Decision { id: string; personId: string; itemId: string; status: "approved" | "rejected"; title: string; decidedBy: string }

/**
 * Apply answers given on WhatsApp to the checklist held in this browser. Returns the ids to acknowledge (so no other
 * browser repeats them) and a line to show for each. A decision about someone this browser doesn't hold is left alone, for
 * a browser that does. Approving completes the item as the approver (with "via WhatsApp" on the audit trail); if something
 * it waits on isn't done yet it says so in the audit trail instead; rejecting never completes anything.
 */
export function applyDecisions(decisions: Decision[]): { ack: string[]; notes: string[] } {
  const ack: string[] = [], notes: string[] = [];
  for (const d of decisions) {
    const store = useOnboarding.getState();
    const item = store.items[d.personId]?.find((i) => i.id === d.itemId);
    if (!usePeople.getState().people.some((p) => p.id === d.personId) || !item) continue;
    const actor = `${d.decidedBy} (via WhatsApp)`;
    if (item.status === "completed") { ack.push(d.id); continue; }
    if (d.status === "approved") {
      const r = store.completeItem(d.personId, d.itemId, actor);
      if (!r.ok) store.log(d.personId, actor, "Approved on WhatsApp, not completed", `${item.item}: ${r.reason ?? "can't be completed yet"}`);
      notes.push(r.ok ? `${d.decidedBy} approved "${d.title}" on WhatsApp` : `${d.decidedBy} approved "${d.title}", but it can't be completed yet: ${r.reason}`);
    } else {
      store.log(d.personId, actor, "Rejected on WhatsApp", item.item);
      notes.push(`${d.decidedBy} rejected "${d.title}" on WhatsApp`);
    }
    ack.push(d.id);
  }
  return { ack, notes };
}
