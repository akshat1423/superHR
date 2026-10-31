"use client";
import { useMemo, useState } from "react";
import { errorsOf, parseDirectory, parsePolicies, parseRequirements, type RowIssue } from "@/lib/onboarding/datasets";
import type { Condition, Directory, DirFn, DocTypeId, ItemKind, OwnerFn, OwnerRow, Policy, Requirement } from "@/lib/onboarding/types";
import { LEVELS, TYPES } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { IssueList } from "./IssueList";

const KINDS: ItemKind[] = ["document", "activity", "record", "provision", "policy", "approval"];
const OWNER_FNS: OwnerFn[] = ["Employee", "HR", "IT", "Facilities", "Compliance", "Manager", "Dept Head"];
const DIR_FNS: DirFn[] = ["HR", "IT", "Facilities", "Compliance", "Dept Head"];
const DOC_TYPES: DocTypeId[] = ["id_proof", "address_proof", "education_cert", "prev_employment", "pan_card", "us_work_auth"];
const INPUT = "mt-1 block w-full rounded-lg border border-line bg-[#fffdf7] px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink";
const LABEL = "block font-mono text-[10px] uppercase tracking-[.08em] text-mute";
const BTN = "rounded-lg border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]";

export function Modal({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className="paper-card flex max-h-[88vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[24px] bg-paper2 shadow-[0_30px_80px_rgba(0,0,0,.4)]">
        <div className="flex items-baseline gap-3 border-b border-line px-6 py-4"><h2 className="text-[20px] font-extrabold tracking-[-.03em]">{title}</h2>{sub && <span className="eyebrow !text-[10px]">{sub}</span>}<span className="flex-1" /><button onClick={onClose} aria-label="Close" className="text-[20px] text-mute hover:text-ink">×</button></div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>
        <div className="flex items-center gap-3 border-t border-line px-6 py-3">{footer}</div>
      </div>
    </div>
  );
}

/** Toggle buttons for picking several values from a short list. */
function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {options.map((o) => { const on = value.includes(o); return <button type="button" key={o} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={cn("rounded-full border px-2.5 py-1 text-[11.5px]", on ? "border-ink bg-ink text-white" : "border-line bg-[#fffdf7] text-[#4b4338] hover:border-ink")}>{o}</button>; })}
    </div>
  );
}

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Footer({ issues, onSave, onCancel, label, canSave }: { issues: RowIssue[]; onSave: () => void; onCancel: () => void; label: string; canSave: boolean }) {
  const errs = errorsOf(issues).length, warns = issues.length - errs;
  return (
    <>
      <div className="min-w-0 flex-1 font-mono text-[11px]">{errs ? <span className="text-bad">{errs} problem{errs > 1 ? "s" : ""} to fix before saving</span> : <span className="text-ok">✓ valid</span>}{warns > 0 && <span className="ml-3 text-[#8a6200]">{warns} warning{warns > 1 ? "s" : ""}</span>}</div>
      <button onClick={onCancel} className={BTN}>Cancel</button>
      <button disabled={!canSave} onClick={onSave} className="rounded-lg border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-white disabled:opacity-40">{label}</button>
    </>
  );
}

// ── requirements ────────────────────────────────────────────────────────────
const blankRule = (n: number): Requirement => ({ id: `R-NEW-${n}`, item: "", kind: "activity", owner: "HR", dueOffset: 0, when: {}, because: "" });

export function RulesEditor({ initial, policyIds, departments, onSave, onClose }: { initial: Requirement[]; policyIds: string[]; departments: string[]; onSave: (r: Requirement[]) => void; onClose: () => void }) {
  const [rules, setRules] = useState<Requirement[]>(initial);
  const [sel, setSel] = useState(0);
  const parsed = useMemo(() => parseRequirements({ name: "editor", format: "json", json: rules }, policyIds), [rules, policyIds]);
  const r = rules[sel];
  const patch = (p: Partial<Requirement>) => setRules((all) => all.map((x, i) => (i === sel ? { ...x, ...p } : x)));
  const when = (p: Partial<Condition>) => patch({ when: Object.fromEntries(Object.entries({ ...r.when, ...p }).filter(([, v]) => !Array.isArray(v) || v.length)) as Condition });
  const mine = (id: string) => parsed.issues.filter((i) => i.label === id);

  return (
    <Modal title="Onboarding requirements" sub="each rule becomes a checklist item for everyone it applies to" onClose={onClose}
      footer={<Footer issues={parsed.issues} canSave={!errorsOf(parsed.issues).length && rules.length > 0} label="Save & recalculate checklists" onCancel={onClose} onSave={() => onSave(parsed.data)} />}>
      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        <div>
          <button onClick={() => { setRules((a) => [...a, blankRule(a.length + 1)]); setSel(rules.length); }} className={cn(BTN, "mb-2 w-full")}>+ New rule</button>
          <ul className="max-h-[52vh] space-y-1 overflow-auto pr-1">
            {rules.map((x, i) => (
              <li key={i}><button onClick={() => setSel(i)} className={cn("w-full rounded-lg border px-2.5 py-1.5 text-left text-[12px]", i === sel ? "border-ink bg-ink text-white" : "border-line bg-[#fffdf7] hover:border-ink")}>
                <span className="block truncate font-semibold">{x.item || "(untitled)"}</span>
                <span className={cn("font-mono text-[10px]", i === sel ? "text-white/70" : "text-mute")}>{x.id} · {x.owner} · {x.dueOffset >= 0 ? `+${x.dueOffset}` : x.dueOffset}d{mine(x.id).some((m) => m.severity === "error") ? " · ✕" : ""}</span>
              </button></li>
            ))}
          </ul>
        </div>
        {r && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className={LABEL}>Rule id<input value={r.id} onChange={(e) => patch({ id: e.target.value.trim() })} className={INPUT} /></label>
              <label className={LABEL}>Checklist item<input value={r.item} onChange={(e) => patch({ item: e.target.value })} placeholder="e.g. Upload your government photo ID" className={INPUT} /></label>
              <label className={LABEL}>Kind<select value={r.kind} onChange={(e) => patch({ kind: e.target.value as ItemKind })} className={INPUT}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className={LABEL}>Owner<select value={r.owner} onChange={(e) => patch({ owner: e.target.value as OwnerFn })} className={INPUT}>{OWNER_FNS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className={LABEL}>Due, days from joining<input type="number" step={1} value={r.dueOffset} onChange={(e) => patch({ dueOffset: Math.trunc(Number(e.target.value)) })} className={INPUT} /><span className="normal-case tracking-normal">−5 = five days before joining · 0 = on the day · 30 = a month after</span></label>
              <label className={LABEL}>Linked policy<select value={r.policy ?? ""} onChange={(e) => patch({ policy: e.target.value || undefined })} className={INPUT}><option value="">None</option>{policyIds.map((p) => <option key={p}>{p}</option>)}</select></label>
              {r.kind === "document" && <label className={LABEL}>Document type<select value={r.docType ?? ""} onChange={(e) => patch({ docType: (e.target.value || undefined) as DocTypeId | undefined })} className={INPUT}><option value="">Choose…</option>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>}
            </div>
            <label className={LABEL}>Why this item exists (shown to the employee and HR)<textarea value={r.because} onChange={(e) => patch({ because: e.target.value })} rows={2} className={INPUT} /></label>

            <div className="rounded-xl border border-line bg-[#fffdf7] p-3">
              <div className="eyebrow !text-[10px]">applies to — leave a row empty for “everyone”</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
                <div><span className={LABEL}>Departments</span><Chips options={departments} value={r.when.departments ?? []} onChange={(v) => when({ departments: v })} /></div>
                <div><span className={LABEL}>Countries</span><Chips options={["IN", "US"] as const} value={r.when.countries ?? []} onChange={(v) => when({ countries: v })} /></div>
                <div><span className={LABEL}>Levels</span><Chips options={LEVELS} value={r.when.grades ?? []} onChange={(v) => when({ grades: v })} /></div>
                <div><span className={LABEL}>Employment type</span><Chips options={TYPES} value={r.when.types ?? []} onChange={(v) => when({ types: v })} /></div>
                <label className={LABEL}>Cities (comma separated)<input value={(r.when.locations ?? []).join(", ")} onChange={(e) => when({ locations: csv(e.target.value) })} className={INPUT} /></label>
                <label className={LABEL}>Job titles containing<input value={(r.when.roles ?? []).join(", ")} onChange={(e) => when({ roles: csv(e.target.value) })} className={INPUT} /></label>
              </div>
            </div>

            <div><span className={LABEL}>Must wait for</span><Chips options={rules.map((x) => x.id).filter((id) => id !== r.id)} value={r.dependsOn ?? []} onChange={(v) => patch({ dependsOn: v.length ? v : undefined })} /></div>
            <div className="flex justify-end"><button onClick={() => { setRules((a) => a.filter((_, i) => i !== sel)); setSel(Math.max(0, sel - 1)); }} className={cn(BTN, "hover:!bg-[#f6d6d2]")}>Delete this rule</button></div>
            {mine(r.id).length > 0 && <IssueList issues={mine(r.id)} max={6} />}
          </div>
        )}
      </div>
      {parsed.issues.filter((i) => !i.label || !rules.some((x) => x.id === i.label)).length > 0 && <div className="mt-4"><IssueList issues={parsed.issues.filter((i) => !i.label || !rules.some((x) => x.id === i.label))} max={6} /></div>}
    </Modal>
  );
}

// ── policies ────────────────────────────────────────────────────────────────
const blankPolicy = (n: number): Policy => ({ id: `POL-NEW-${n}`, title: "", version: "v1", appliesTo: {}, sections: [{ id: "§1", heading: "", text: "" }] });

export function PoliciesEditor({ initial, departments, onSave, onClose }: { initial: Policy[]; departments: string[]; onSave: (p: Policy[]) => void; onClose: () => void }) {
  const [pols, setPols] = useState<Policy[]>(initial);
  const [sel, setSel] = useState(0);
  const parsed = useMemo(() => parsePolicies({ name: "editor", format: "json", json: pols }), [pols]);
  const dupIds = pols.length !== new Set(pols.map((p) => p.id)).size;
  const issues: RowIssue[] = dupIds ? [...parsed.issues, { row: 0, severity: "error", message: "Two policies share the same id" }] : parsed.issues;
  const p = pols[sel];
  const patch = (x: Partial<Policy>) => setPols((all) => all.map((y, i) => (i === sel ? { ...y, ...x } : y)));
  const sec = (k: number, x: Partial<Policy["sections"][number]>) => patch({ sections: p.sections.map((s, i) => (i === k ? { ...s, ...x } : s)) });
  const applies = (x: Partial<Policy["appliesTo"]>) => patch({ appliesTo: Object.fromEntries(Object.entries({ ...p.appliesTo, ...x }).filter(([, v]) => !Array.isArray(v) || v.length)) });

  return (
    <Modal title="Policy documents" sub="the approved text the assistant may answer from" onClose={onClose}
      footer={<Footer issues={issues} canSave={!errorsOf(issues).length && pols.length > 0} label="Save policies" onCancel={onClose} onSave={() => onSave(parsed.data)} />}>
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <div>
          <button onClick={() => { setPols((a) => [...a, blankPolicy(a.length + 1)]); setSel(pols.length); }} className={cn(BTN, "mb-2 w-full")}>+ New policy</button>
          <ul className="max-h-[52vh] space-y-1 overflow-auto pr-1">
            {pols.map((x, i) => <li key={i}><button onClick={() => setSel(i)} className={cn("w-full rounded-lg border px-2.5 py-1.5 text-left text-[12px]", i === sel ? "border-ink bg-ink text-white" : "border-line bg-[#fffdf7] hover:border-ink")}><span className="block truncate font-semibold">{x.title || "(untitled)"}</span><span className={cn("font-mono text-[10px]", i === sel ? "text-white/70" : "text-mute")}>{x.id} · {x.sections.length} section{x.sections.length === 1 ? "" : "s"}</span></button></li>)}
          </ul>
        </div>
        {p && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_2fr_90px] gap-3">
              <label className={LABEL}>Policy id<input value={p.id} onChange={(e) => patch({ id: e.target.value.trim() })} className={INPUT} /></label>
              <label className={LABEL}>Title<input value={p.title} onChange={(e) => patch({ title: e.target.value })} className={INPUT} /></label>
              <label className={LABEL}>Version<input value={p.version} onChange={(e) => patch({ version: e.target.value })} className={INPUT} /></label>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-[#fffdf7] p-3">
              <div><span className={LABEL}>Countries (empty = all)</span><Chips options={["IN", "US"] as const} value={p.appliesTo.countries ?? []} onChange={(v) => applies({ countries: v })} /></div>
              <div><span className={LABEL}>Departments (empty = all)</span><Chips options={departments} value={p.appliesTo.departments ?? []} onChange={(v) => applies({ departments: v })} /></div>
            </div>
            {p.sections.map((s, k) => (
              <div key={k} className="rounded-xl border border-line bg-[#fffdf7] p-3">
                <div className="grid grid-cols-[80px_1fr_auto] items-end gap-3">
                  <label className={LABEL}>Section<input value={s.id} onChange={(e) => sec(k, { id: e.target.value })} className={INPUT} /></label>
                  <label className={LABEL}>Heading<input value={s.heading} onChange={(e) => sec(k, { heading: e.target.value })} className={INPUT} /></label>
                  <button disabled={p.sections.length < 2} onClick={() => patch({ sections: p.sections.filter((_, i) => i !== k) })} className={cn(BTN, "mb-0.5 hover:!bg-[#f6d6d2] disabled:opacity-40")}>Remove</button>
                </div>
                <label className={cn(LABEL, "mt-2")}>Text<textarea value={s.text} onChange={(e) => sec(k, { text: e.target.value })} rows={3} className={INPUT} /></label>
              </div>
            ))}
            <div className="flex justify-between">
              <button onClick={() => patch({ sections: [...p.sections, { id: `§${p.sections.length + 1}`, heading: "", text: "" }] })} className={BTN}>+ Add section</button>
              <button onClick={() => { setPols((a) => a.filter((_, i) => i !== sel)); setSel(Math.max(0, sel - 1)); }} className={cn(BTN, "hover:!bg-[#f6d6d2]")}>Delete this policy</button>
            </div>
          </div>
        )}
      </div>
      {issues.length > 0 && <div className="mt-4"><IssueList issues={issues} max={6} /></div>}
    </Modal>
  );
}

// ── owners & directory ──────────────────────────────────────────────────────
export function OwnersEditor({ initial, onSave, onClose }: { initial: Directory; onSave: (d: Directory) => void; onClose: () => void }) {
  const [d, setD] = useState<Directory>(initial);
  const parsed = useMemo(() => parseDirectory({ name: "editor", format: "json", json: d }), [d]);
  const dir = parsed.data[0];
  const setOwner = (i: number, x: Partial<OwnerRow>) => setD((s) => ({ ...s, owners: s.owners.map((o, k) => (k === i ? { ...o, ...x } : o)) }));
  const setMgr = (i: number, x: Partial<Directory["managers"][number]>) => setD((s) => ({ ...s, managers: s.managers.map((m, k) => (k === i ? { ...m, ...x } : m)) }));
  const [newDept, setNewDept] = useState("");
  const cell = "w-full rounded-md border border-line bg-[#fffdf7] px-2 py-1 text-[12px] outline-none focus:border-ink";

  return (
    <Modal title="Owners & directory" sub="who owns which tasks, and who people can report to" onClose={onClose}
      footer={<Footer issues={parsed.issues} canSave={!errorsOf(parsed.issues).length} label="Save & update owners" onCancel={onClose} onSave={() => onSave(dir)} />}>
      <div className="mb-5">
        <div className="eyebrow !text-[10px]">departments</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {d.departments.map((x) => <span key={x} className="flex items-center gap-1 rounded-full border border-line bg-[#fffdf7] py-1 pl-2.5 pr-1.5 text-[12px]">{x}<button aria-label={`Remove ${x}`} onClick={() => setD((s) => ({ ...s, departments: s.departments.filter((y) => y !== x) }))} className="text-mute hover:text-bad">×</button></span>)}
          <form onSubmit={(e) => { e.preventDefault(); const v = newDept.trim(); if (v && !d.departments.includes(v)) setD((s) => ({ ...s, departments: [...s.departments, v] })); setNewDept(""); }}>
            <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="+ add department" className="w-36 rounded-full border border-dashed border-[#b7ac94] bg-transparent px-3 py-1 text-[12px] outline-none focus:border-ink" />
          </form>
        </div>
      </div>

      <div className="mb-2 flex items-center"><div className="eyebrow !text-[10px]">task owners</div><span className="flex-1" /><button onClick={() => setD((s) => ({ ...s, owners: [...s.owners, { fn: "HR", department: "*", location: "*", name: "", email: "" }] }))} className={BTN}>+ Add owner</button></div>
      <table className="mb-6 w-full border-collapse text-left">
        <thead><tr>{["Function", "Department", "Location (city, IN/US or *)", "Name", "Email", ""].map((h) => <th key={h} className="px-1 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[.08em] text-mute">{h}</th>)}</tr></thead>
        <tbody>
          {d.owners.map((o, i) => (
            <tr key={i}>
              <td className="p-1"><select value={o.fn} onChange={(e) => setOwner(i, { fn: e.target.value as DirFn })} className={cell}>{DIR_FNS.map((f) => <option key={f}>{f}</option>)}</select></td>
              <td className="p-1"><select value={o.department} onChange={(e) => setOwner(i, { department: e.target.value })} className={cell}><option value="*">Any</option>{d.departments.map((x) => <option key={x}>{x}</option>)}</select></td>
              <td className="p-1"><input value={o.location} onChange={(e) => setOwner(i, { location: e.target.value })} className={cell} /></td>
              <td className="p-1"><input value={o.name} onChange={(e) => setOwner(i, { name: e.target.value })} className={cell} /></td>
              <td className="p-1"><input value={o.email} onChange={(e) => setOwner(i, { email: e.target.value })} className={cell} /></td>
              <td className="p-1"><button aria-label="Remove owner" onClick={() => setD((s) => ({ ...s, owners: s.owners.filter((_, k) => k !== i) }))} className="px-1 text-mute hover:text-bad">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-2 flex items-center"><div className="eyebrow !text-[10px]">managers people can report to</div><span className="flex-1" /><button onClick={() => setD((s) => ({ ...s, managers: [...s.managers, { name: "", email: "", department: s.departments[0] ?? "" }] }))} className={BTN}>+ Add manager</button></div>
      <table className="w-full border-collapse text-left">
        <thead><tr>{["Name", "Email", "Department", ""].map((h) => <th key={h} className="px-1 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[.08em] text-mute">{h}</th>)}</tr></thead>
        <tbody>
          {d.managers.map((m, i) => (
            <tr key={i}>
              <td className="p-1"><input value={m.name} onChange={(e) => setMgr(i, { name: e.target.value })} className={cell} /></td>
              <td className="p-1"><input value={m.email} onChange={(e) => setMgr(i, { email: e.target.value })} className={cell} /></td>
              <td className="p-1"><select value={m.department} onChange={(e) => setMgr(i, { department: e.target.value })} className={cell}>{d.departments.map((x) => <option key={x}>{x}</option>)}</select></td>
              <td className="p-1"><button aria-label="Remove manager" onClick={() => setD((s) => ({ ...s, managers: s.managers.filter((_, k) => k !== i) }))} className="px-1 text-mute hover:text-bad">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {parsed.issues.length > 0 && <div className="mt-4"><IssueList issues={parsed.issues} max={6} /></div>}
    </Modal>
  );
}
