"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PACKS } from "@/lib/catalog";
import { Glyph } from "@/components/ui/Glyph";
import { Seg } from "@/components/ui/Seg";
import { LEVELS, TIMELINE_BREAKS, flatSteps, personaLabel, type Dept, type EmpType, type Level, type Persona } from "@/lib/workflow";
import { cn, hash01 } from "@/lib/utils";
import { useBuilder } from "@/store/builder";
import { useUser } from "@/components/shell/AuthProvider";
import { canEditWorkflow, visibleDepartments } from "@/lib/auth/policy";
import { usePeople } from "@/store/people";

const HEADS: Record<Dept, string> = { Engineering: "Vikram", Finance: "Neha", Product: "Isha", Business: "Rahul", People: "Priya" };
const LEVEL_SUB: Record<Level, string> = { Intern: "stipend · conversion", Associate: "SDE-1 · Analyst", Mid: "SDE-2", Senior: "SDE-3 · Sr.", Leader: "Director+" };

export function LibraryApp() {
  const router = useRouter();
  const user = useUser();
  const loadPersona = useBuilder((s) => s.loadPersona);
  const people = usePeople((s) => s.people);
  const depts = useMemo(() => visibleDepartments(user, people), [user, people]);
  const [type, setType] = useState<EmpType>("Full-time");
  const levels: Level[] = type === "Intern" ? ["Intern"] : LEVELS.slice(1);

  const cards = useMemo(
    () =>
      depts.map((dept) => {
        const base = flatSteps({ type, dept, level: type === "Intern" ? "Intern" : "Mid" }).length;
        return {
          dept,
          cells: levels.map((level) => {
            const persona: Persona = { type, dept, level };
            const steps = flatSteps(persona);
            const buckets = TIMELINE_BREAKS.slice(0, -1).map((_, i) =>
              steps.filter((s) => s.day > (i ? TIMELINE_BREAKS[i] : -99) && s.day <= TIMELINE_BREAKS[i + 1]).length);
            return {
              persona,
              total: steps.length,
              apps: steps.filter((s) => s.perm).length,
              gates: steps.filter((s) => s.ver.length).length,
              delta: steps.length - base,
              buckets,
              editor: ["Priya (HR)", "Sam (HR)", `${HEADS[dept]} (${dept} head)`][Math.floor(hash01(dept + level + type) * 3)],
              ago: Math.floor(hash01(level + dept) * 20) + 1,
            };
          }),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, depts],
  );

  const open = (p: Persona) => { loadPersona(p); router.push("/builder"); };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_310px] gap-7 px-8 pb-10 pt-1.5">
        <div>
          <h1 className="page-title">Workflow <i>library</i></h1>
          <div className="eyebrow mb-4 mt-1">{depts.length === 1 ? `${depts[0]} workflows` : "Every persona = type × department × level"} · click a card to open it in the builder</div>
          <Seg className="mb-[18px]" value={type} onChange={setType} options={(["Full-time", "Part-time", "Intern"] as const).map((t) => ({ value: t, label: t }))} />
          {depts.length === 0 && <p className="paper-card rounded-2xl bg-paper2 p-5 text-[13px] text-[#4b4338]">There are no workflows to show yet: you can see the workflows of the departments your people are in, and you have nobody in onboarding.</p>}
          <div className="grid gap-3" style={{ gridTemplateColumns: `130px repeat(${levels.length}, 1fr)` }}>
            <div />
            {levels.map((l) => (
              <div key={l} className="eyebrow px-1 !text-[10.5px]">
                <b className="block !text-[11.5px] text-ink">{l}</b>{LEVEL_SUB[l]}
              </div>
            ))}
            {cards.map((row) => (
              <Row key={row.dept} dept={row.dept}>
                {row.cells.map((c) => {
                  const mx = Math.max(...c.buckets, 1);
                  return (
                    <button key={c.persona.level} onClick={() => open(c.persona)} className="paper-dots paper-card group relative rounded-2xl p-3 text-left transition hover:-translate-y-[3px] hover:-rotate-[.4deg] hover:shadow-[0_14px_26px_rgba(107,90,58,.25)]">
                      {c.delta !== 0 && (
                        <span className={cn("absolute right-2.5 top-2.5 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white", c.delta > 0 ? "bg-acc" : "bg-ok")}>
                          {c.delta > 0 ? "+" : ""}{c.delta} vs Mid
                        </span>
                      )}
                      <div className="font-mono text-[9.5px] tracking-[.1em] text-mute">{personaLabel(c.persona)}</div>
                      <div className="mt-1 text-[30px] font-extrabold leading-[1.1] tracking-[-.04em]">{c.total}<small className="ml-1 font-mono text-[10px] font-medium tracking-[.1em] text-mute">STEPS</small></div>
                      <div className="mb-2 mt-0.5 font-mono text-[10.5px] text-[#6b6252]">{c.apps} apps · {c.gates} approvals</div>
                      <div className="flex h-6 items-end gap-0.5">
                        {c.buckets.map((v, i) => <i key={i} className="flex-1 rounded-t-sm bg-ink" style={{ height: `${Math.max(8, (v / mx) * 100)}%` }} />)}
                      </div>
                      <div className="mt-2 flex justify-between font-mono text-[9.5px] text-mute"><span>{c.editor}</span><span>{canEditWorkflow(user, c.persona) ? `${c.ago}d ago` : "🔒 view only"}</span></div>
                      <span className="mt-2 hidden font-mono text-[10px] uppercase tracking-[.1em] text-acc group-hover:block">open in builder ↗</span>
                    </button>
                  );
                })}
              </Row>
            ))}
          </div>
        </div>

        <div>
          <Card title="Block packs · reusable">
            {PACKS.map((p) => (
              <div key={p.name} className="flex items-center gap-2 border-b border-dashed border-line py-2 text-[13px] font-semibold last:border-0">
                {p.name}
                <span className="ml-auto flex">{p.keys.slice(0, 5).map((k) => <Glyph key={k} k={k} size={20} className="-ml-1 border-2 border-paper2" />)}</span>
              </div>
            ))}
            <div className="pt-2 text-[13px] font-semibold text-acc">＋ New pack from selection</div>
          </Card>
          <Card title="Who can edit what">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead><tr className="text-mute"><th className="py-1.5 text-left font-normal" /><th>View</th><th>Edit</th><th>Publish</th></tr></thead>
              <tbody>
                {[["HR", "●", "● all", "●"], ["Dept Head", "●", "own dept", "→ HR"], ["IT / Finance", "●", "suggest", "–"]].map((r) => (
                  <tr key={r[0]} className="border-t border-dashed border-line">
                    <td className="py-1.5 font-sans text-[12.5px] font-semibold">{r[0]}</td>
                    {r.slice(1).map((c, i) => <td key={i} className="text-center">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Recent edits">
            {([
              ["Arjun added", "Datadog", "to Eng · SDE-3", "2d ago · v14 · waiting HR publish", "Engineering"],
              ["Priya moved", "Health insurance", "T+5 → T+2", "5d ago · all Full-time", "*"],
              ["Neha added approval gate for", "Corporate card", "", "1w ago · Finance", "Finance"],
              ["Sam created", "Intern · Product", "from clone", "2w ago", "Product"],
            ] as const).filter((e) => e[4] === "*" || (depts as readonly string[]).includes(e[4])).map(([a, b, c, d]) => (
              <div key={b} className="border-b border-dashed border-line py-[7px] text-[12.5px] last:border-0">
                {a} <b>{b}</b> {c}
                <small className="block font-mono text-[10px] text-mute">{d}</small>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ dept, children }: { dept: Dept; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center text-[15px] font-bold tracking-[-.02em]">
        <div>{dept}<small className="block font-mono text-[10px] font-normal tracking-[.06em] text-mute">Head: {HEADS[dept]}</small></div>
      </div>
      {children}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="paper-card mb-4 rounded-2xl bg-paper2 p-3.5">
      <h4 className="eyebrow mb-2.5 !text-[10.5px] !font-semibold !tracking-[.14em]">{title}</h4>
      {children}
    </div>
  );
}

