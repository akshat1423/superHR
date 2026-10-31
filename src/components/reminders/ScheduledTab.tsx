"use client";
import { useMemo, useState } from "react";
import { Glyph } from "@/components/ui/Glyph";
import { fmtLong, LADDER_LABEL, scheduledEmails, type Draft, type Level } from "@/lib/email";
import type { Person, PersonStep } from "@/lib/people";
import { useOutbox } from "@/store/outbox";
import { cn } from "@/lib/utils";
import { EmailPreview } from "./EmailPreview";

const LEVEL_CLS = ["bg-[#e3dcc8] text-[#5b5244]", "bg-[#fbefcf] text-[#8a6200]", "bg-[#f8e3d6] text-[#8a3615]", "bg-[#f6d6d2] text-[#8c1b14]"];
const PAGE = 60;

/** Everything the reminder service has queued to send on its own, in date order. */
export function ScheduledTab({ rows }: { rows: { person: Person; steps: PersonStep[] }[] }) {
  const ladder = useOutbox((s) => s.ladder);
  const [level, setLevel] = useState<"all" | Level>("all");
  const [person, setPerson] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [preview, setPreview] = useState<Draft | null>(null);

  const all = useMemo(() => scheduledEmails(rows, ladder), [rows, ladder]);
  const list = all.filter((e) => (level === "all" || e.level === level) && (person === "all" || e.person.id === person));
  const stepKey = (e: (typeof all)[number]) => rows.find((r) => r.person.id === e.person.id)?.steps.find((s) => s.id === e.draft.stepId)?.key ?? "docs";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={level} onChange={(e) => { setLevel(e.target.value === "all" ? "all" : (Number(e.target.value) as Level)); setLimit(PAGE); }} className="sj-input !w-auto">
          <option value="all">All ladder rungs</option>
          {([0, 1, 2, 3] as Level[]).map((l) => <option key={l} value={l}>{LADDER_LABEL[l]}</option>)}
        </select>
        <select value={person} onChange={(e) => { setPerson(e.target.value); setLimit(PAGE); }} className="sj-input !w-auto">
          <option value="all">Everyone</option>
          {rows.map((r) => <option key={r.person.id} value={r.person.id}>{r.person.name}</option>)}
        </select>
        <span className="ml-auto font-mono text-[10.5px] text-mute">{list.length.toLocaleString()} emails queued · sends at 09:00</span>
      </div>

      {list.length === 0 && <p className="eyebrow mt-10">Nothing scheduled for these filters.</p>}
      {list.slice(0, limit).map((e, idx, shown) => {
        const header = idx === 0 || shown[idx - 1].inDays !== e.inDays;
        return (
          <div key={e.key}>
            {header && <div className="eyebrow mb-2 mt-4 !font-semibold !tracking-[.14em]">{e.inDays === 0 ? "Today" : e.inDays === 1 ? "Tomorrow" : fmtLong(e.inDays)}{e.inDays > 1 && ` · in ${e.inDays} days`}</div>}
            <button onClick={() => setPreview(e.draft)} className="paper-card mb-2 flex w-full items-center gap-3 rounded-xl bg-paper2 px-3.5 py-2.5 text-left hover:bg-[#f9f5ea]">
              <Glyph k={stepKey(e)} size={30} />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px] tracking-[-.01em]">{e.draft.subject}</b>
                <small className="block truncate font-mono text-[10.5px] text-mute">to {e.draft.to.name} &lt;{e.draft.to.email}&gt; · about {e.person.name}</small>
              </div>
              <span className={cn("rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold", LEVEL_CLS[e.level])}>{LADDER_LABEL[e.level]}</span>
            </button>
          </div>
        );
      })}
      {list.length > limit && <button onClick={() => setLimit((l) => l + PAGE)} className="mt-2 w-full rounded-xl border border-line py-2.5 font-mono text-[11px] uppercase tracking-[.1em] text-mute hover:bg-[#f4efe3]">Show {Math.min(PAGE, list.length - limit)} more</button>}
      {preview && <EmailPreview draft={preview} onClose={() => setPreview(null)} note="Queued — the reminder service sends this automatically if the step is still open." />}
    </>
  );
}
