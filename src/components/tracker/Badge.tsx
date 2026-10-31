"use client";
import { useState } from "react";
import { fmtDate, healthOf, type Person, type PersonStep } from "@/lib/people";
import { fmtDay, personaLabel } from "@/lib/workflow";
import { Avatar } from "./Avatar";

const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);

export function Badge({ person, steps, buddy }: { person: Person; steps: PersonStep[]; buddy: string }) {
  const [flip, setFlip] = useState(false);
  const [first, ...rest] = person.name.split(" ");
  const health = healthOf(steps);
  const crew: [string, string][] = [["Manager", person.manager], ["HR partner", "Priya Nair"], ["IT owner", "Karan Shah"], ["Buddy", buddy]];
  return (
    <div className="sj-bw">
      <div className="sj-layer sj-l4" /><div className="sj-layer sj-l3" /><div className="sj-layer sj-l2" /><div className="sj-layer sj-l1" />
      <div className="sj-strap"><span>SUPERJOIN · ONBOARDING · SUPERJOIN ·</span></div>
      <div className={`sj-badge ${flip ? "flip" : ""}`} onClick={() => setFlip((f) => !f)} title="click to flip">
        <div className="sj-face">
          <div className="sj-slot" />
          <div className="sj-photo"><span className="sj-nbadge">N° {person.no}</span><Avatar person={person} large /></div>
          <div className="mt-3 flex items-start justify-between">
            <h2 className="text-[38px] font-extrabold leading-[.98] tracking-[-.045em]">{first}<br />{rest.join(" ")}</h2>
            <div className={`sj-sdot ${health}`}><i /></div>
          </div>
          <div className="mt-2 text-[16.5px] font-medium text-[#2b261f]">{person.role}</div>
          <div className="mt-2 flex items-center gap-2 text-[13.5px] text-[#4b4338]">
            <span className="grid h-5 w-5 place-items-center rounded-[7px] bg-[#ecd9d2] text-[10px] font-bold">{person.persona.dept[0]}</span>
            {person.persona.dept} · {person.persona.type}
            <span className="ml-auto font-mono text-[10px] tracking-[.06em] text-mute">{personaLabel(person.persona)}</span>
          </div>
          <div className="mt-[11px] border-t border-line pt-[11px]">
            <div className="sj-punch">{steps.map((s) => <i key={s.id} className={s.status} title={s.title} />)}</div>
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10.5px] text-mute">
            <span>{person.day < 0 ? `Joins in ${-person.day} days` : person.day === 0 ? "Joins today" : `Day ${person.day}`}</span>
            <span>{fmtDate(person.day)} / BLR</span>
          </div>
        </div>
        <div className="sj-face back">
          <div className="sj-slot" />
          <h3 className="eyebrow mb-2.5 mt-1.5 !font-semibold !tracking-[.14em]">Who is on the hook</h3>
          {crew.map(([r, n]) => (
            <div key={r} className="flex items-center gap-2.5 border-b border-dashed border-line py-2 text-[13.5px]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-white">{initials(n)}</span>
              <b>{n}</b><small className="ml-auto font-mono text-[10.5px] text-mute">{r}</small>
            </div>
          ))}
          <h3 className="eyebrow mb-2.5 mt-[18px] !font-semibold !tracking-[.14em]">Workflow</h3>
          {[
            [`${personaLabel(person.persona)} v14`, "open ↗"],
            ["Waiting on candidate", `${steps.filter((s) => s.owner === "Candidate" && s.status !== "done").length} items`],
            ["Approvals pending", `${steps.filter((s) => s.ver.length && s.status !== "done").length}`],
            ["School", person.school || "—"],
            ["Next step", (() => { const n = steps.find((s) => s.status === "scheduled"); return n ? fmtDay(n.day) : "—"; })()],
          ].map(([a, b]) => (
            <div key={a} className="flex items-center gap-2.5 border-b border-dashed border-line py-2 text-[13.5px]"><b>{a}</b><small className="ml-auto font-mono text-[10.5px] text-mute">{b}</small></div>
          ))}
        </div>
      </div>
    </div>
  );
}
