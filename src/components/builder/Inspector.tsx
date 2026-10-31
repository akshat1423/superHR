"use client";
import { useMemo } from "react";
import { OWNERS, PERMS, VERIFIERS, type Owner } from "@/lib/catalog";
import { Glyph } from "@/components/ui/Glyph";
import { fmtDay, type Reminder } from "@/lib/workflow";
import { useBuilder } from "@/store/builder";
import { cn } from "@/lib/utils";
import { useReadOnly } from "./useReadOnly";

const REMINDERS: [Reminder, string][] = [["none", "No reminders"], ["due", "On due date only"], ["daily", "Daily until done"], ["ladder", "Escalation ladder"]];

export function Inspector() {
  const nodes = useBuilder((s) => s.nodes);
  const selectedId = useBuilder((s) => s.selectedId);
  const node = nodes.find((n) => n.id === selectedId);
  const readOnly = useReadOnly();
  return (
    <aside className="sj-panel">
      <div className="sj-scroll p-4">
        {/* a disabled fieldset turns off every input and button inside it */}
        <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">{node ? <StepEditor id={node.id} /> : <Summary />}</fieldset>
      </div>
    </aside>
  );
}

function Summary() {
  const nodes = useBuilder((s) => s.nodes);
  const stats = useMemo(() => {
    const steps = nodes.map((n) => n.data);
    const owners: Record<string, number> = {};
    steps.forEach((s) => (owners[s.owner] = (owners[s.owner] ?? 0) + 1));
    return { apps: steps.filter((s) => s.perm), gates: steps.filter((s) => s.ver.length).length, owners };
  }, [nodes]);
  return (
    <>
      <h2 className="text-xl font-extrabold tracking-[-.03em]">Overview</h2>
      <div className="mb-1 mt-3 grid grid-cols-3 gap-2 text-center">
        {[[nodes.length, "steps"], [stats.apps.length, "apps"], [stats.gates, "approvals"]].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-[#fffdf7] py-2.5">
            <b className="block text-[22px] leading-none tracking-[-.03em]">{v}</b>
            <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{l}</span>
          </div>
        ))}
      </div>
      <div className="sj-eyebrow">Who does the work</div>
      <div className="flex flex-wrap gap-1.5">{Object.entries(stats.owners).map(([r, c]) => <span key={r} className="sj-chip">{r} · {c}</span>)}</div>
      <div className="sj-eyebrow">App access</div>
      {stats.apps.map((a, i) => (
        <div key={i} className="flex items-center gap-2.5 border-b border-dashed border-line py-1.5 text-[13px]">
          <Glyph k={a.key} size={24} />{a.title}
          <span className={cn("ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px]", a.perm === "Admin" ? "border-ink bg-ink text-white" : "border-line text-[#4b4338]")}>{a.perm}</span>
        </div>
      ))}
      <p className="mt-4 text-xs leading-relaxed text-mute">Click a step to edit it. Hover a line and press <b className="text-ink">+</b> to insert a block between two steps.</p>
    </>
  );
}

function StepEditor({ id }: { id: string }) {
  const node = useBuilder((s) => s.nodes.find((n) => n.id === id))!;
  const update = useBuilder((s) => s.updateStep);
  const del = useBuilder((s) => s.deleteStep);
  const d = node.data;
  const toggleVer = (r: Owner) => update(id, { ver: d.ver.includes(r) ? d.ver.filter((x) => x !== r) : [...d.ver, r] });
  return (
    <>
      <div className="flex items-center gap-3">
        <Glyph k={d.key} size={38} />
        <div className="min-w-0">
          <input className="w-full bg-transparent text-[17px] font-extrabold tracking-[-.02em] outline-none" value={d.title} onChange={(e) => update(id, { title: e.target.value })} />
          <small className="block font-mono text-[10.5px] text-mute">{fmtDay(d.day)}{d.day !== 0 && ` · ${Math.abs(d.day)}d ${d.day > 0 ? "after" : "before"} joining`}</small>
        </div>
      </div>
      <div className="sj-eyebrow">Fires on (day offset)</div>
      <input className="sj-input" type="number" value={d.day} onChange={(e) => update(id, { day: parseInt(e.target.value) || 0 })} />
      <div className="sj-eyebrow">Owner</div>
      <div className="flex flex-wrap gap-1.5">{OWNERS.map((r) => <button key={r} className={cn("sj-chip", d.owner === r && "on")} onClick={() => update(id, { owner: r })}>{r}</button>)}</div>
      {d.perm && (
        <>
          <div className="sj-eyebrow">Permission in this app</div>
          <div className="flex gap-1.5">{PERMS.map((r) => <button key={r} className={cn("sj-chip", d.perm === r && "on")} onClick={() => update(id, { perm: r })}>{r}</button>)}</div>
        </>
      )}
      <div className="sj-eyebrow">Must be verified by</div>
      <div className="flex flex-wrap gap-1.5">{VERIFIERS.map((r) => <button key={r} className={cn("sj-chip amb", d.ver.includes(r) && "on")} onClick={() => toggleVer(r)}>{r}</button>)}</div>
      <div className="sj-eyebrow">Reminders</div>
      <select className="sj-input" value={d.rem} onChange={(e) => update(id, { rem: e.target.value as Reminder })}>
        {REMINDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className="mt-5 w-full rounded-[10px] border border-line py-2.5 text-sm text-bad hover:bg-[#f6d6d2]" onClick={() => del(id)}>Delete step</button>
    </>
  );
}
