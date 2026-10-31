"use client";
import { useMemo, useState } from "react";
import { SERVICES, serviceIndex } from "@/lib/services";
import { fmtStamp, type LogKind } from "@/lib/provision";
import { cn } from "@/lib/utils";
import { TaskDetail } from "./TaskDetail";
import { useScopedRun, type ScopedRow } from "./useScopedRun";

const LEVELS: { k: LogKind; label: string; cls: string }[] = [
  { k: "info", label: "INFO", cls: "bg-[#e3dcc8] text-[#5b5244]" },
  { k: "ok", label: "OK", cls: "bg-[#dbeadf] text-[#1d5234]" },
  { k: "warn", label: "WARN", cls: "bg-[#fbefcf] text-[#8a6200]" },
  { k: "error", label: "ERROR", cls: "bg-[#f6d6d2] text-[#8c1b14]" },
];
const PAGE = 300;

/** The raw stream every agent writes: filter by agent, level, person, trace or text. */
export function AgentLogs({ rows, agent, setAgent }: { rows: ScopedRow[]; agent: string; setAgent: (id: string) => void }) {
  const { events, personName } = useScopedRun();
  const [levels, setLevels] = useState<Set<LogKind>>(new Set(["info", "ok", "warn", "error"]));
  const [person, setPerson] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = events.filter((e) =>
      levels.has(e.kind) &&
      (agent === "all" || e.service === agent) &&
      (person === "all" || e.personId === person) &&
      (!needle || `${e.text} ${e.call ?? ""} ${e.traceId ?? ""} ${personName(e.personId)}`.toLowerCase().includes(needle)));
    return out.reverse();
  }, [events, levels, agent, person, q, personName]);

  const toggle = (k: LogKind) => setLevels((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const rowOf = (id: string) => rows.find((r) => r.person.id === id);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message, API call, trace id, person…" className="sj-input !w-[320px]" />
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className="sj-input !w-auto">
          <option value="all">All agents</option>
          <option value="queue">scheduler</option>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="sj-input !w-auto">
          <option value="all">Everyone</option>
          {rows.map((r) => <option key={r.person.id} value={r.person.id}>{r.person.name}</option>)}
        </select>
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button key={l.k} onClick={() => toggle(l.k)} className={cn("rounded-md px-2 py-1 font-mono text-[10px] font-bold", levels.has(l.k) ? l.cls : "bg-transparent text-[#b5ab96] line-through")}>{l.label}</button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10.5px] text-mute">{filtered.length.toLocaleString()} events</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-[#fffdf7] font-mono text-[11.5px]">
        <div className="grid grid-cols-[84px_62px_120px_130px_1fr] gap-2 border-b border-line bg-[#e9e1cd] px-3 py-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#4b4338]">
          <span>time</span><span>level</span><span>agent</span><span>person</span><span>message</span>
        </div>
        {filtered.length === 0 && <div className="px-3 py-8 text-center text-mute">No events match these filters.</div>}
        {filtered.slice(0, limit).map((e) => {
          const lv = LEVELS.find((l) => l.k === e.kind)!;
          const isOpen = open === e.seq;
          const r = rowOf(e.personId);
          const si = e.service === "queue" ? -1 : serviceIndex(e.service);
          return (
            <div key={e.seq} className={cn("border-b border-[#eee6d3] last:border-0", e.kind === "error" && "bg-[#fdf0ee]")}>
              <button onClick={() => setOpen(isOpen ? null : e.seq)} className="grid w-full grid-cols-[84px_62px_120px_130px_1fr] items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[#f4efe3]">
                <span className="text-mute">{fmtStamp(e.t)}</span>
                <span><b className={cn("rounded px-1.5 py-0.5 text-[9.5px]", lv.cls)}>{lv.label}</b></span>
                <span className="truncate text-[#4b4338]">{e.service === "queue" ? "scheduler" : e.service}</span>
                <span className="truncate">{personName(e.personId)}</span>
                <span className={cn("truncate", e.kind === "error" ? "text-bad" : e.kind === "warn" ? "text-[#8a6200]" : "text-ink")}>{e.text}</span>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-dashed border-line bg-[#faf6ea] px-3 py-3">
                  <div className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    {e.call && <><span className="text-mute">call</span><code>{e.call}</code></>}
                    {e.traceId && <><span className="text-mute">trace</span><button className="text-left underline" onClick={() => { setQ(e.traceId!); setOpen(null); }}>{e.traceId} — show only this trace</button></>}
                    {e.ms !== undefined && <><span className="text-mute">latency</span><span>{e.ms} ms</span></>}
                    <span className="text-mute">event</span><span>#{e.seq}</span>
                  </div>
                  {r && si >= 0 && <div className="rounded-xl border border-line bg-[#fffdf7] p-3 font-sans"><TaskDetail person={r.person} pr={r.pr} si={si} /></div>}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + PAGE)} className="w-full border-t border-line py-2.5 text-[11px] uppercase tracking-[.1em] text-mute hover:bg-[#f4efe3]">Show {Math.min(PAGE, filtered.length - limit)} more</button>
        )}
      </div>
    </div>
  );
}
