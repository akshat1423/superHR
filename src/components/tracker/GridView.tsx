"use client";
import { countStatus, type Person, type PersonStep } from "@/lib/people";
import { Avatar } from "./Avatar";

export function GridView({ rows, onOpen }: { rows: { person: Person; steps: PersonStep[] }[]; onOpen: (id: string) => void }) {
  return (
    <div className="mt-[26px] grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[18px] text-left">
      {rows.map(({ person, steps }) => {
        const c = countStatus(steps);
        const nx = steps.find((s) => s.status === "blocked") ?? steps.find((s) => s.status === "active");
        return (
          <button key={person.id} onClick={() => onOpen(person.id)} className="paper-dots rounded-[20px] p-3 text-left shadow-[0_10px_24px_rgba(107,90,58,.17),0_0_0_1px_rgba(255,255,255,.6)_inset] transition hover:-translate-y-1 hover:-rotate-[.6deg]">
            <div className="relative h-[120px] overflow-hidden rounded-xl bg-[#f1e6e4]">
              <span className="sj-nbadge">N° {person.no}</span>
              <Avatar person={person} />
            </div>
            <h4 className="mt-[9px] text-[19px] font-extrabold tracking-[-.03em]">{person.name}</h4>
            <div className="text-xs text-[#4b4338]">{person.role} · {person.persona.dept}</div>
            <div className="mt-2 flex gap-1.5 font-mono text-[10.5px] font-semibold">
              <span className="rounded-[7px] bg-[#dbeadf] px-[7px] py-0.5 text-[#1d5234]">✓ {c.done}</span>
              <span className="rounded-[7px] bg-[#f8e3d6] px-[7px] py-0.5 text-[#8a3615]">● {c.active}</span>
              <span className="rounded-[7px] bg-[#f6d6d2] px-[7px] py-0.5 text-[#8c1b14]">⛔ {c.blocked}</span>
              <span className="rounded-[7px] border border-dashed border-[#a99d86] px-[7px] py-0.5 text-[#6b6252]">◌ {c.scheduled}</span>
            </div>
            <div className="sj-punch mt-2.5 border-t border-line pt-2.5">{steps.map((s) => <i key={s.id} className={s.status} />)}</div>
            <div className="mt-[7px] font-mono text-[10px] text-mute">{nx ? `${nx.status === "blocked" ? "⛔" : "●"} ${nx.title}${nx.note ? ` — ${nx.note}` : ""}` : "all clear"}</div>
          </button>
        );
      })}
    </div>
  );
}
