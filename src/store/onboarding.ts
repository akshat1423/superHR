import { create } from "zustand";
import { browserStorage } from "@/lib/storage";
import { createJSONStorage, persist } from "zustand/middleware";
import { daysBetween, todayISO } from "@/lib/dates";
import type { Person } from "@/lib/people";
import { describeRecalculation, diffContext, recalculate, type Change, type Recalculation } from "@/lib/onboarding/change";
import { DOC_TYPES, checkFile, emptyDocument, statusAfterValidation, validateDocument } from "@/lib/onboarding/documents";
import type { ProcessResult } from "@/lib/onboarding/docService";
import { SAMPLE_DIRECTORY } from "@/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "@/lib/onboarding/policies";
import { DEFAULT_REQUIREMENTS, ctxOf, generateChecklist } from "@/lib/onboarding/rules";
import { seedProgress } from "@/lib/onboarding/seed";
import { advance } from "@/lib/onboarding/status";
import type { AuditEntry, ChecklistItem, Directory, DocStatus, DocumentRecord, Extracted, Issue, Policy, Requirement } from "@/lib/onboarding/types";
import { usePeople, type PersonPatch } from "./people";
import { useProvisioning } from "./provisioning";

export interface DatasetInfo { source: string; count: number; at: string }
export interface Upload { fileName: string; size: number; extraction: "text" | "ai" | "none"; extracted?: Extracted }

interface OnboardingState {
  requirements: Requirement[];
  policies: Policy[];
  directory: Directory;
  info: { requirements: DatasetInfo; policies: DatasetInfo; owners: DatasetInfo };
  items: Record<string, ChecklistItem[]>;
  docs: Record<string, DocumentRecord>;
  audit: AuditEntry[];
  ticketSeq: number;

  /** build a checklist for anyone who doesn't have one yet, and forget people who are gone */
  ensure: (people: Person[]) => void;
  /** a new batch was imported: fresh checklists for everyone in it */
  importPeople: (people: Person[], actor: string) => void;
  setRequirements: (reqs: Requirement[], source: string, actor: string) => { employees: number; added: number; removed: number };
  setPolicies: (pols: Policy[], source: string, mode: "replace" | "add", actor: string) => void;
  setDirectory: (dir: Directory, source: string, actor: string) => void;

  markSubmitted: (personId: string, itemId: string, fileName: string, size: number, actor: string) => void;
  /** record an upload; `decided` is the document service's verdict (without it the same checks run locally) */
  submitDocument: (personId: string, itemId: string, up: Upload, actor: string, decided?: ProcessResult) => { status: DocStatus; issues: Issue[]; accepted: boolean };
  /** apply the document service's decision to uploads that were left at "Under Review" although they could be read */
  settleReviews: () => number;
  reviewDocument: (personId: string, itemId: string, decision: "accept" | "correct", note: string, actor: string) => void;
  completeItem: (personId: string, itemId: string, actor: string) => { ok: boolean; reason?: string };
  acknowledge: (personId: string, itemId: string, actor: string) => void;
  updateEmployee: (personId: string, patch: PersonPatch, actor: string) => { changes: Change[]; lines: string[]; result: Recalculation } | null;
  log: (personId: string, actor: string, action: string, detail?: string) => void;
}

let seq = 0;
const stamp = () => new Date().toISOString();
const aid = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;
const info = (source: string, count: number): DatasetInfo => ({ source, count, at: stamp() });
const empId = (p: Person) => `EMP-2026-${p.no.padStart(4, "0")}`;
const person = (id: string) => usePeople.getState().people.find((p) => p.id === id);

/** Fresh checklist for one person (seeded progress only for the built-in sample batch). */
function buildFor(p: Person, reqs: Requirement[], dir: Directory, seed: boolean, nextTicket: (pre: string) => string) {
  let items = generateChecklist(ctxOf(p), reqs, dir);
  let docs: Record<string, DocumentRecord> = {};
  if (seed) { const s = seedProgress(p, items); items = s.items; docs = s.docs; }
  const adv = advance(items, todayISO(), empId(p), nextTicket);
  return { items: adv.items, docs, events: adv.events };
}

function initial() {
  const people = usePeople.getState().people;
  let ticket = 1000;
  const next = (pre: string) => `${pre}-${++ticket}`;
  const items: Record<string, ChecklistItem[]> = {};
  let docs: Record<string, DocumentRecord> = {};
  for (const p of people) { const b = buildFor(p, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY, true, next); items[p.id] = b.items; docs = { ...docs, ...b.docs }; }
  return { items, docs, ticketSeq: ticket };
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => {
      const base = initial();
      const nextTicketFrom = () => {
        let t = get().ticketSeq;
        return { next: (pre: string) => `${pre}-${++t}`, done: () => set({ ticketSeq: t }) };
      };
      const addAudit = (entries: Omit<AuditEntry, "id" | "at">[]) =>
        set((s) => ({ audit: [...entries.map((e) => ({ ...e, id: aid(), at: stamp() })), ...s.audit].slice(0, 3000) }));
      const lineage = (pid: string, itemId: string) => get().items[pid]?.find((i) => i.id === itemId);

      /** after any change: let the agent create the record / raise tickets for whatever just became unblocked */
      const cascade = (pid: string, items: ChecklistItem[], actor: string): ChecklistItem[] => {
        const p = person(pid);
        if (!p) return items;
        const t = nextTicketFrom();
        const adv = advance(items, stamp(), empId(p), t.next);
        t.done();
        if (adv.events.length) addAudit(adv.events.map((e) => ({ actor: "Onboarding agent", personId: pid, action: e.action, detail: e.detail })));
        void actor;
        return adv.items;
      };
      const setItems = (pid: string, items: ChecklistItem[]) => set((s) => ({ items: { ...s.items, [pid]: items } }));

      return {
        requirements: DEFAULT_REQUIREMENTS,
        policies: SAMPLE_POLICIES,
        directory: SAMPLE_DIRECTORY,
        info: { requirements: info("Built-in sample", DEFAULT_REQUIREMENTS.length), policies: info("Built-in sample", SAMPLE_POLICIES.length), owners: info("Built-in sample", SAMPLE_DIRECTORY.owners.length + SAMPLE_DIRECTORY.managers.length) },
        items: base.items,
        docs: base.docs,
        audit: [],
        ticketSeq: base.ticketSeq,

        ensure: (people) => {
          const s = get();
          const ids = new Set(people.map((p) => p.id));
          const items = Object.fromEntries(Object.entries(s.items).filter(([id]) => ids.has(id)));
          const t = nextTicketFrom();
          let docs = s.docs, changed = Object.keys(items).length !== Object.keys(s.items).length;
          const events: Omit<AuditEntry, "id" | "at">[] = [];
          for (const p of people) {
            if (items[p.id]) continue;
            const b = buildFor(p, s.requirements, s.directory, usePeople.getState().isSample, t.next);
            items[p.id] = b.items; docs = { ...docs, ...b.docs }; changed = true;
            events.push({ actor: "Onboarding agent", personId: p.id, action: "Checklist generated", detail: `${b.items.length} items from ${s.requirements.length} requirements` });
          }
          if (!changed) return;
          t.done();
          set({ items, docs });
          if (events.length) addAudit(events);
        },

        importPeople: (people, actor) => {
          const s = get();
          const t = nextTicketFrom();
          const items: Record<string, ChecklistItem[]> = {};
          const events: Omit<AuditEntry, "id" | "at">[] = [];
          for (const p of people) {
            const b = buildFor(p, s.requirements, s.directory, false, t.next);
            items[p.id] = b.items;
            events.push({ actor, personId: p.id, action: "Imported", detail: `${p.role}, ${p.persona.dept}, ${p.location}, joins ${p.startDate}` }, { actor: "Onboarding agent", personId: p.id, action: "Checklist generated", detail: `${b.items.length} items` });
          }
          t.done();
          set({ items, docs: {} });
          addAudit(events);
        },

        setRequirements: (reqs, source, actor) => {
          const s = get();
          let added = 0, removed = 0, employees = 0;
          const items = { ...s.items };
          let docs = { ...s.docs };
          const events: Omit<AuditEntry, "id" | "at">[] = [];
          for (const p of usePeople.getState().people) {
            const old = s.items[p.id] ?? [];
            const r = recalculate(ctxOf(p), old, reqs, s.directory);
            items[p.id] = cascade(p.id, r.items, actor);
            for (const x of r.removed) delete docs[x.id];
            added += r.added.length; removed += r.removed.length;
            if (r.added.length || r.removed.length || r.shifted.length || r.ownerChanged.length) { employees++; events.push({ actor, personId: p.id, action: "Checklist recalculated", detail: `New requirements "${source}": ${describeRecalculation([], r).join("; ")}` }); }
          }
          docs = { ...docs };
          set({ requirements: reqs, items, docs, info: { ...s.info, requirements: info(source, reqs.length) } });
          addAudit(events);
          return { employees, added, removed };
        },

        setPolicies: (pols, source, mode, actor) => {
          const s = get();
          const merged = mode === "replace" ? pols : [...s.policies.filter((p) => !pols.some((n) => n.id === p.id)), ...pols];
          set({ policies: merged, info: { ...s.info, policies: info(source, merged.length) } });
          void actor;
        },

        setDirectory: (dir, source, actor) => {
          const s = get();
          const items = { ...s.items };
          const events: Omit<AuditEntry, "id" | "at">[] = [];
          for (const p of usePeople.getState().people) {
            const r = recalculate(ctxOf(p), s.items[p.id] ?? [], s.requirements, dir);
            items[p.id] = r.items;
            if (r.ownerChanged.length) events.push({ actor, personId: p.id, action: "Owners updated", detail: r.ownerChanged.slice(0, 4).map((o) => `${o.item.item}: ${o.from.name} → ${o.to.name}`).join("; ") });
          }
          set({ directory: dir, items, info: { ...s.info, owners: info(source, dir.owners.length + dir.managers.length) } });
          addAudit(events);
        },

        markSubmitted: (pid, itemId, fileName, size, actor) => {
          const it = lineage(pid, itemId);
          if (!it?.docType) return;
          const prev = get().docs[itemId] ?? emptyDocument(pid, itemId, it.docType);
          set((s) => ({ docs: { ...s.docs, [itemId]: { ...prev, status: "Submitted", fileName, fileSize: size, uploadedAt: stamp(), attempts: prev.attempts + 1, issues: [] } } }));
          addAudit([{ actor, personId: pid, action: "Document submitted", detail: `${it.item}: ${fileName}` }]);
        },

        submitDocument: (pid, itemId, up, actor, decided) => {
          const it = lineage(pid, itemId);
          const p = person(pid);
          if (!it?.docType || !p) return { status: "Not Submitted", issues: [], accepted: false };
          const fileIssues = checkFile(up.fileName, up.size);
          if (fileIssues.some((i) => i.severity === "error")) {
            addAudit([{ actor, personId: pid, action: "Upload rejected", detail: `${it.item}: ${up.fileName} — ${fileIssues.map((i) => i.message).join(" ")}` }]);
            return { status: get().docs[itemId]?.status ?? "Not Submitted", issues: fileIssues, accepted: false };
          }
          const prev = get().docs[itemId] ?? emptyDocument(pid, itemId, it.docType);
          const attempts = prev.status === "Submitted" ? prev.attempts : prev.attempts + 1;
          let issues: Issue[]; let status: DocStatus;
          let processing: DocumentRecord["processing"];
          if (decided) {
            issues = decided.issues; status = decided.status;
            processing = { traceId: decided.traceId, mode: decided.mode, steps: decided.steps, at: stamp() };
          } else if (up.extraction === "none" || !up.extracted) {
            issues = [{ severity: "warning", code: "NOT_AUTO_VALIDATED", message: "This file couldn't be read automatically, so HR will check it by hand." }];
            status = "Under Review";
          } else {
            issues = validateDocument(DOC_TYPES[it.docType], up.extracted, ctxOf(p));
            status = statusAfterValidation(issues);
          }
          const rec: DocumentRecord = { ...prev, status, fileName: up.fileName, fileSize: up.size, uploadedAt: stamp(), extraction: up.extraction, extracted: up.extracted, issues, attempts, processing, reviewerNote: undefined, reviewedBy: undefined, reviewedAt: undefined };
          set((s) => ({ docs: { ...s.docs, [itemId]: rec } }));
          // a clean document completes its item (and anything waiting on it); a correction request takes a finished item back to pending
          if (status === "Accepted") setItems(pid, cascade(pid, get().items[pid].map((i) => (i.id === itemId ? { ...i, status: "completed" as const, completedAt: stamp() } : i)), "Document service"));
          else if (status === "Correction Requested" && it.status === "completed") setItems(pid, get().items[pid].map((i) => (i.id === itemId ? { ...i, status: "pending", completedAt: undefined } : i)));
          const errs = issues.filter((i) => i.severity === "error");
          const svc = decided ? `trace ${decided.traceId}` : "checked in this browser";
          addAudit([
            { actor, personId: pid, action: prev.status === "Not Submitted" || prev.attempts === 0 ? "Document submitted" : "Document re-submitted", detail: `${it.item}: ${up.fileName}` },
            { actor: "Document service", personId: pid, action: status === "Accepted" ? "Document accepted automatically" : status === "Correction Requested" ? "Validation failed → Correction Requested" : "Couldn't read it → Under Review", detail: `${errs.length ? errs.map((e) => e.message).join(" ") : issues.map((i) => i.message).join(" ") || "Name, dates and document type match the profile."} (${svc})` },
          ]);
          return { status, issues, accepted: status === "Accepted" };
        },

        settleReviews: () => {
          let n = 0;
          for (const [itemId, d] of Object.entries(get().docs)) {
            if (d.status !== "Under Review" || !d.extracted || d.reviewedBy) continue;
            const pid = d.personId, p = person(pid), it = lineage(pid, itemId);
            if (!p || !it?.docType) continue;
            const issues = validateDocument(DOC_TYPES[it.docType], d.extracted, ctxOf(p));
            const status = statusAfterValidation(issues);
            set((s) => ({ docs: { ...s.docs, [itemId]: { ...d, issues, status } } }));
            if (status === "Accepted") setItems(pid, cascade(pid, get().items[pid].map((i) => (i.id === itemId ? { ...i, status: "completed" as const, completedAt: stamp() } : i)), "Document service"));
            addAudit([{ actor: "Document service", personId: pid, action: status === "Accepted" ? "Document accepted automatically" : "Validation failed → Correction Requested", detail: `${it.item}: processed after an earlier upload had been left under review` }]);
            n++;
          }
          return n;
        },

        reviewDocument: (pid, itemId, decision, note, actor) => {
          const it = lineage(pid, itemId);
          const doc = get().docs[itemId];
          if (!it || !doc) return;
          const accept = decision === "accept";
          const overridden = accept && doc.issues.some((i) => i.severity === "error");
          set((s) => ({ docs: { ...s.docs, [itemId]: { ...doc, status: accept ? "Accepted" : "Correction Requested", reviewerNote: note || undefined, reviewedBy: actor, reviewedAt: stamp() } } }));
          const items = get().items[pid].map((i) => (i.id === itemId ? (accept ? { ...i, status: "completed" as const, completedAt: stamp() } : { ...i, status: "pending" as const, completedAt: undefined }) : i));
          setItems(pid, cascade(pid, items, actor));
          addAudit([{ actor, personId: pid, action: accept ? "Document accepted" : "Correction requested", detail: `${it.item}${note ? ` — ${note}` : ""}${overridden ? " (accepted despite validation errors)" : ""}` }]);
        },

        completeItem: (pid, itemId, actor) => {
          const list = get().items[pid] ?? [];
          const it = list.find((i) => i.id === itemId);
          if (!it) return { ok: false, reason: "Item not found" };
          if (it.kind === "document") return { ok: false, reason: "Documents are completed when HR accepts the upload." };
          if (it.status === "completed") return { ok: true };
          const waiting = it.dependsOn.map((d) => list.find((i) => i.id === d)).filter((d): d is ChecklistItem => !!d && d.status !== "completed");
          if (waiting.length) return { ok: false, reason: `Waiting on: ${waiting.map((w) => w.item).join(", ")}` };
          const items = list.map((i) => (i.id === itemId ? { ...i, status: "completed" as const, completedAt: stamp() } : i));
          setItems(pid, cascade(pid, items, actor));
          addAudit([{ actor, personId: pid, action: it.kind === "approval" ? "Approved" : it.kind === "provision" ? "Provisioning fulfilled" : "Completed", detail: `${it.item}${it.ticket ? ` (${it.ticket})` : ""}` }]);
          return { ok: true };
        },

        acknowledge: (pid, itemId, actor) => {
          const it = lineage(pid, itemId);
          if (!it || it.kind !== "policy" || it.status === "completed") return;
          const pol = get().policies.find((p) => p.id === it.policy);
          const items = get().items[pid].map((i) => (i.id === itemId ? { ...i, status: "completed" as const, completedAt: stamp() } : i));
          setItems(pid, cascade(pid, items, actor));
          addAudit([{ actor, personId: pid, action: "Policy acknowledged", detail: `${it.item}${pol ? ` — ${pol.id} ${pol.version}` : ""}` }]);
        },

        updateEmployee: (pid, patch, actor) => {
          const before = person(pid);
          if (!before) return null;
          const oldCtx = ctxOf(before);
          usePeople.getState().updatePerson(pid, patch);
          const after = person(pid)!;
          useProvisioning.getState().syncPerson(after);
          const newCtx = ctxOf(after);
          const changes = diffContext(oldCtx, newCtx);
          if (!changes.length) return null;
          const s = get();
          const result = recalculate(newCtx, s.items[pid] ?? [], s.requirements, s.directory);
          // documents for items that no longer apply go; documents still awaiting review are re-checked against the new facts
          const docs = { ...s.docs };
          for (const x of result.removed) delete docs[x.id];
          for (const i of result.items) {
            const d = docs[i.id];
            if (d && (d.status === "Under Review" || d.status === "Accepted") && !d.reviewedBy && d.extracted && i.docType) {
              const issues = validateDocument(DOC_TYPES[i.docType], d.extracted, newCtx);
              const status = statusAfterValidation(issues);
              docs[i.id] = { ...d, issues, status };
              // a document that was fine for the old facts but not the new ones goes back to the employee
              if (status === "Correction Requested" && i.status === "completed") result.items = result.items.map((x) => (x.id === i.id ? { ...x, status: "pending" as const, completedAt: undefined } : x));
            }
          }
          const items = cascade(pid, result.items, actor);
          set((st) => ({ items: { ...st.items, [pid]: items }, docs }));
          const lines = describeRecalculation(changes, result);
          addAudit([{ actor, personId: pid, action: "Employee updated → checklist recalculated", detail: lines.join("\n") }]);
          return { changes, lines, result };
        },

        log: (pid, actor, action, detail) => addAudit([{ actor, personId: pid, action, detail }]),
      };
    },
    {
      name: "superjoin.onboarding",
      version: 1,
      storage: createJSONStorage(browserStorage),
      skipHydration: true,
      partialize: (s) => ({ requirements: s.requirements, policies: s.policies, directory: s.directory, info: s.info, items: s.items, docs: s.docs, audit: s.audit, ticketSeq: s.ticketSeq }),
    },
  ),
);

/** Days until (negative: since) the joining date, for display. */
export const daysToJoin = (startDate: string) => daysBetween(todayISO(), startDate);
