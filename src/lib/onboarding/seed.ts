import { todayISO } from "../dates";
import type { FieldKey, Person } from "../people";
import { hash01 } from "../utils";
import { emptyDocument } from "./documents";
import type { ChecklistItem, DocTypeId, DocumentRecord } from "./types";

/** Which piece of profile data a document item depends on: if the ATS never had it, the document can't have been verified. */
const NEEDS_FIELD: Partial<Record<DocTypeId, FieldKey>> = { address_proof: "Address", pan_card: "PAN", education_cert: "Education", prev_employment: "Prev. employer" };

/**
 * Plausible starting progress for sample employees, so the dashboard isn't 14 people at zero:
 * an item whose due date is well in the past is usually done, unless the data it needs is missing.
 * Deterministic (hash-based), and applied only to the built-in sample batch, never to uploaded people.
 */
export function seedProgress(person: Person, items: ChecklistItem[]): { items: ChecklistItem[]; docs: Record<string, DocumentRecord> } {
  const today = todayISO();
  const docs: Record<string, DocumentRecord> = {};
  const out = items.map((i) => {
    const needs = i.docType ? NEEDS_FIELD[i.docType] : undefined;
    const dataMissing = !!needs && person.fields[needs] === "missing";
    const lateEnough = i.dueDate < addDaysLocal(today, -3);
    const lucky = hash01(person.id + i.ruleId) < 0.85;
    // provisioning and records are raised by the agent, not completed by hand
    if (i.kind === "record" || i.kind === "provision") return i;
    if (i.kind === "document") {
      if (dataMissing || !lateEnough || !lucky) return i;
      docs[i.id] = { ...emptyDocument(person.id, i.id, i.docType!), status: "Accepted", fileName: `${i.docType}.pdf`, uploadedAt: i.dueDate, issues: [], reviewerNote: "Verified when the batch was imported", reviewedBy: "HR", attempts: 1 };
      return { ...i, status: "completed" as const, completedAt: i.dueDate };
    }
    return lateEnough && lucky ? { ...i, status: "completed" as const, completedAt: i.dueDate } : i;
  });
  return { items: out, docs };
}

const addDaysLocal = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
