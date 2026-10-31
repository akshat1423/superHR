"use client";
import { DEPTS, LEVELS, TYPES, fmtDay, lvlName, personaLabel, type Persona } from "@/lib/workflow";
import { Button } from "@/components/ui/Button";
import { useUser } from "@/components/shell/AuthProvider";
import { canPublish } from "@/lib/auth/policy";
import { useBuilder } from "@/store/builder";
import { toast } from "@/store/toast";
import { useReadOnly, useReadOnlyReason } from "./useReadOnly";

/** One quiet row: who this workflow is for, how big it is, and save/publish (if your role allows). */
export function TopBar() {
  const user = useUser();
  const persona = useBuilder((s) => s.persona);
  const nodes = useBuilder((s) => s.nodes);
  const load = useBuilder((s) => s.loadPersona);
  const requestView = useBuilder((s) => s.requestView);
  const readOnly = useReadOnly();
  const reason = useReadOnlyReason();
  const days = nodes.map((n) => n.data.day);
  const apps = nodes.filter((n) => n.data.perm).length;

  const change = (k: keyof Persona, v: string) => {
    const p = { ...persona, [k]: v } as Persona;
    if (p.type === "Intern") p.level = "Intern";
    else if (p.level === "Intern") p.level = "Mid";
    load(p);
    toast(`Loaded ${personaLabel(p)} template`);
  };
  const levels = persona.type === "Intern" ? (["Intern"] as const) : LEVELS.slice(1);

  return (
    <div className="col-span-3 flex items-center gap-2.5">
      <Select label="Type" value={persona.type} options={TYPES.map((t) => [t, t])} onChange={(v) => change("type", v)} />
      <Select label="Department" value={persona.dept} options={DEPTS.map((d) => [d, d])} onChange={(v) => change("dept", v)} />
      <Select label="Level" value={persona.level} options={levels.map((l) => [l, lvlName(l, persona.dept)])} onChange={(v) => change("level", v)} />
      <span className="eyebrow ml-2">{nodes.length} steps · {fmtDay(Math.min(...days))} → {fmtDay(Math.max(...days))}</span>
      <span className="flex-1" />
      <div className="inline-flex gap-0.5 rounded-xl bg-[#d9d1bd] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,.18)]" role="group" aria-label="View">
        {([["start", "Start"], ["fit", "Whole flow"], ["apps", `Apps · ${apps}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => requestView(k)} className="rounded-[9px] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] text-[#6b6252] transition-colors hover:bg-ink hover:text-white">
            {label}
          </button>
        ))}
      </div>
      {readOnly ? (
        <span title={reason} className="flex items-center gap-1.5 rounded-xl border border-line bg-[#fffdf7] px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[.1em] text-[#4b4338]">🔒 View only</span>
      ) : (
        <>
          <span className="eyebrow">v14 · draft</span>
          <Button onClick={() => toast("Saved as draft v14 — HR and the department head can both see it")}>Save</Button>
          {canPublish(user)
            ? <Button accent onClick={() => toast("Published — new joiners now get v14")}>Publish</Button>
            : <Button accent onClick={() => toast("Submitted to HR for review and publishing")}>Submit to HR</Button>}
        </>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <div className="sj-select">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
