"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/tracker/Avatar";
import { daysBetween, fmtHuman, todayISO } from "@/lib/dates";
import type { Person } from "@/lib/people";
import { DEPTS } from "@/lib/workflow";
import { usePortfolio, type EmployeeView } from "@/hooks/useEmployeeView";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "overdue" | "blocked" | "pending" | "complete" | "notready" | "ready" | "terminated";
type SortKey = "joining" | "name" | "overdue" | "open";

const STRIP: Record<string, string> = { completed: "done", pending: "scheduled", blocked: "blocked", overdue: "active" };

const when = (iso: string) => { const d = daysBetween(todayISO(), iso); return d > 0 ? `in ${d}d` : d === 0 ? "today" : `${-d}d ago`; };

function matches(v: EmployeeView, f: { q: string; dept: string; loc: string; status: StatusFilter; from: string; to: string }) {
  const p = v.person;
  if (f.q && !`${p.name} ${p.role} ${p.persona.dept} ${p.location} ${p.manager}`.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.dept !== "all" && p.persona.dept !== f.dept) return false;
  if (f.loc !== "all" && p.location !== f.loc) return false;
  if (f.from && p.startDate < f.from) return false;
  if (f.to && p.startDate > f.to) return false;
  // terminated people appear only under their own filter, so they never count towards readiness or chase lists
  if ((f.status === "terminated") !== !!p.terminated) return false;
  const s = v.summary;
  switch (f.status) {
    case "overdue": return s.overdue > 0;
    case "blocked": return s.blocked > 0;
    case "pending": return s.pending > 0;
    case "complete": return s.completed === s.total;
    case "ready": return v.ready;
    case "notready": return !v.ready;
    default: return true;
  }
}

/** The progress dashboard: filter by joining date, department, location and status; open anyone to see their full checklist. */
export function ProgressTable({ people }: { people: Person[] }) {
  const views = usePortfolio(people);
  const [f, setF] = useState({ q: "", dept: "all", loc: "all", status: "all" as StatusFilter, from: "", to: "" });
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "joining", dir: 1 });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const locations = useMemo(() => [...new Set(people.map((p) => p.location))].sort(), [people]);
  const rows = useMemo(() => {
    const out = views.filter((v) => matches(v, f));
    const key = (v: EmployeeView) => (sort.k === "joining" ? v.person.startDate : sort.k === "name" ? v.person.name : sort.k === "overdue" ? -(v.summary.overdue * 100 + v.summary.blocked) : -(v.summary.total - v.summary.completed));
    return out.sort((a, b) => (key(a) < key(b) ? -sort.dir : key(a) > key(b) ? sort.dir : 0));
  }, [views, f, sort]);

  const tot = rows.reduce((a, v) => ({ completed: a.completed + v.summary.completed, pending: a.pending + v.summary.pending, blocked: a.blocked + v.summary.blocked, overdue: a.overdue + v.summary.overdue, ready: a.ready + (v.ready ? 1 : 0), esc: a.esc + v.escalations.length }), { completed: 0, pending: 0, blocked: 0, overdue: 0, ready: 0, esc: 0 });
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={cn("px-3 py-2.5 text-left", cls)}><button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] hover:text-ink">{label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button></th>
  );

  const sel = "sj-input !w-auto !py-2";
  return (
    <div className="text-left">
      <div className="grid grid-cols-6 gap-3">
        {([["People", rows.length, ""], ["Completed", tot.completed, "text-ok"], ["Pending", tot.pending, ""], ["Blocked", tot.blocked, "text-bad"], ["Overdue", tot.overdue, "text-[#a8620f]"], ["Ready for day one", `${tot.ready}/${rows.length}`, "text-ok"]] as const).map(([l, n, c]) => (
          <div key={l} className="paper-card rounded-2xl bg-paper2 px-4 py-3"><b className={cn("block text-[28px] leading-none tracking-[-.04em]", c)}>{n}</b><span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{l}</span></div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search name, role, manager…" className="sj-input !w-[240px] !py-2" />
        <select value={f.dept} onChange={(e) => set("dept", e.target.value)} className={sel}><option value="all">All departments</option>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={f.loc} onChange={(e) => set("loc", e.target.value)} className={sel}><option value="all">All locations</option>{locations.map((l) => <option key={l}>{l}</option>)}</select>
        <select value={f.status} onChange={(e) => set("status", e.target.value as StatusFilter)} className={sel}>
          <option value="all">Any status (active)</option><option value="overdue">Has overdue tasks</option><option value="blocked">Has blocked tasks</option><option value="pending">Has pending tasks</option>
          <option value="notready">Not ready for day one</option><option value="ready">Ready for day one</option><option value="complete">Fully complete</option><option value="terminated">Terminated</option>
        </select>
        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.08em] text-mute">Joining <input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className={sel} /> – <input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className={sel} /></label>
        {(f.q || f.dept !== "all" || f.loc !== "all" || f.status !== "all" || f.from || f.to) && <button onClick={() => setF({ q: "", dept: "all", loc: "all", status: "all", from: "", to: "" })} className="rounded-lg border border-line px-3 py-2 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">Clear</button>}
        <span className="ml-auto font-mono text-[10.5px] text-mute">{rows.length} of {views.length}{tot.esc > 0 && <> · <b className="text-bad">{tot.esc} escalation{tot.esc === 1 ? "" : "s"}</b></>}</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-[#fffdf7]">
        <table className="w-full min-w-[1000px] border-collapse text-[12.5px]">
          <thead className="bg-[#e9e1cd] text-[#4b4338]">
            <tr>{th("name", "Employee")}<th className="px-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[.08em]">Dept · location</th>{th("joining", "Joining")}<th className="px-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[.08em]">Checklist (each tick is one item)</th>{th("overdue", "Tasks")}<th className="px-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[.08em]">Next due</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-mute">No one matches these filters.</td></tr>}
            {rows.map((v) => {
              const next = v.items.filter((i) => i.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
              const s = v.summary;
              return (
                <tr key={v.person.id} className="border-t border-[#eee6d3] hover:bg-[#faf6ea]">
                  <td className="px-3 py-2.5">
                    <Link href={`/employees/${v.person.id}`} className="flex items-center gap-2.5">
                      <span className="h-9 w-9 flex-none overflow-hidden rounded-lg bg-[#f1e6e4]"><Avatar person={v.person} /></span>
                      <span><b className="block text-[13px] tracking-[-.01em]">{v.person.name}</b><small className="font-mono text-[10px] text-mute">{v.person.role}</small></span>
                    </Link>
                  </td>
                  <td className="px-3"><div className="text-[12px]">{v.person.persona.dept}</div><div className="font-mono text-[10px] text-mute">{v.person.location}</div></td>
                  <td className="whitespace-nowrap px-3"><div className="font-mono text-[11.5px]">{fmtHuman(v.person.startDate)}</div><div className="font-mono text-[10px] text-mute">{when(v.person.startDate)}</div></td>
                  <td className="px-3"><div className="sj-punch w-[230px]">{v.items.map((i) => <i key={i.id} className={STRIP[v.states[i.id]]} title={`${i.item} — ${v.states[i.id]}`} />)}</div></td>
                  <td className="whitespace-nowrap px-3 font-mono text-[11px]">
                    <span className="text-ok">✓{s.completed}</span> <span className="text-[#4b4338]">●{s.pending}</span> <span className="text-bad">⛔{s.blocked}</span> <span className="text-[#a8620f]">⏰{s.overdue}</span>
                  </td>
                  <td className="max-w-[220px] px-3"><div className="truncate text-[12px]">{next ? next.item : <span className="text-ok">all done</span>}</div>{next && <div className="font-mono text-[10px] text-mute">{fmtHuman(next.dueDate)} · {next.owner.name}</div>}</td>
                  <td className="px-3 text-right">{v.person.terminated ? <span title={`${v.person.terminated.reason} · ${v.person.terminated.by}`} className="rounded-md border border-[#e9a39c] bg-[#fdf0ee] px-2 py-0.5 font-mono text-[9.5px] font-semibold text-bad">TERMINATED</span> : <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[9.5px] font-semibold", v.ready ? "border-[#9fcfae] bg-[#eef4ea] text-[#1d5234]" : "border-[#e6c978] bg-[#fbf3dc] text-[#7a5a00]")}>{v.ready ? "READY" : "NOT READY"}</span>}{v.escalations.length > 0 && <span className="ml-1.5 rounded-md bg-bad px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white" title="Open escalations">{v.escalations.length}↑</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] text-mute">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok" />completed</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-dashed border-[#a99d86]" />pending</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-bad" />blocked</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-acc" />overdue</span>
      </div>
    </div>
  );
}
