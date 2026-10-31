"use client";
import { DEPTS, LEVELS, TYPES, fmtDay, lvlName, personaLabel, type Persona } from "@/lib/workflow";
import { Button } from "@/components/ui/Button";
import { useBuilder } from "@/store/builder";
import { toast } from "@/store/toast";

/** One quiet row: who this workflow is for, how big it is, and save/publish. */
export function TopBar() {
  const persona = useBuilder((s) => s.persona);
  const nodes = useBuilder((s) => s.nodes);
  const load = useBuilder((s) => s.loadPersona);
  const days = nodes.map((n) => n.data.day);

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
      <span className="eyebrow">v14 · draft</span>
      <Button onClick={() => toast("Saved as draft v14 — HR and the department head can both see it")}>Save</Button>
      <Button accent onClick={() => toast("Sent to HR to publish")}>Publish</Button>
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
