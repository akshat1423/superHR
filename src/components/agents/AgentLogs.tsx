"use client";
import { useEffect, useMemo, useState } from "react";
import type { StoredEvent } from "@/lib/agentEvents";
import { SERVICES, serviceIndex } from "@/lib/services";
import { fmtStamp, type LogKind } from "@/lib/provision";
import { useProvisioning } from "@/store/provisioning";
import { cn } from "@/lib/utils";
import { FailureCard } from "./FailureCard";
import { TaskDetail } from "./TaskDetail";
import { useStoredEvents } from "./useStoredEvents";
import { useScopedRun, type ScopedRow } from "./useScopedRun";

const LEVELS: { k: LogKind; label: string; cls: string }[] = [
  { k: "info", label: "INFO", cls: "bg-[#e3dcc8] text-[#5b5244]" },
  { k: "ok", label: "OK", cls: "bg-[#dbeadf] text-[#1d5234]" },
  { k: "warn", label: "WARN", cls: "bg-[#fbefcf] text-[#8a6200]" },
  { k: "error", label: "ERROR", cls: "bg-[#f6d6d2] text-[#8c1b14]" },
];
const PAGE = 100;
const MAX = 300;

/** One display row, whether it came from Supabase or from this browser session. */
type Row = StoredEvent & { key: string };

/** The raw stream every agent writes: stored in Supabase, filtered on the server for your role. */
export function AgentLogs({ rows, agent, setAgent }: { rows: ScopedRow[]; agent: string; setAgent: (id: string) => void }) {
  const { events: sessionEvents, personName } = useScopedRun();
  const { batchId, sync, stored: savedCount } = useProvisioning();
  const [levels, setLevels] = useState<Set<LogKind>>(new Set(["info", "ok", "warn", "error"]));
  const [person, setPerson] = useState("all");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [batch, setBatch] = useState("latest");
  const [live, setLive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const remote = useStoredEvents({ batch, service: agent === "all" ? "" : agent, kinds: [...levels], person: person === "all" ? "" : person, q: dq, limit }, live);
  const d = remote.data;
  const mode: "stored" | "session" = d && d.configured && !d.setupRequired ? "stored" : "session";

  const list: Row[] = useMemo(() => {
    if (mode === "stored") return (d?.events ?? []).map((e) => ({ ...e, key: `${d?.batch}:${e.seq}` }));
    const needle = dq.toLowerCase();
    return sessionEvents
      .filter((e) => levels.has(e.kind) && (agent === "all" || e.service === agent) && (person === "all" || e.personId === person) &&
        (!needle || `${e.text} ${e.call ?? ""} ${e.traceId ?? ""} ${personName(e.personId)}`.toLowerCase().includes(needle)))
      .reverse()
      .map((e) => ({ key: `s:${e.seq}`, seq: e.seq, tick: e.t, personId: e.personId, personName: personName(e.personId), dept: "", service: e.service, kind: e.kind, text: e.text, call: e.call, traceId: e.traceId, ms: e.ms, meta: e.meta }));
  }, [mode, d, sessionEvents, levels, agent, person, dq, personName]);

  const total = mode === "stored" ? (d?.total ?? 0) : list.length;
  const shown = mode === "stored" ? list : list.slice(0, limit);
  const toggle = (k: LogKind) => { setLevels((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); setLimit(PAGE); };
  const rowOf = (id: string) => rows.find((r) => r.person.id === id);
  /** the in-memory task state belongs to the batch this browser is running */
  const canDrill = mode === "session" || d?.batch === batchId;

  return (
    <div>
      <StorageBanner resp={d} error={remote.error} sync={sync} savedCount={savedCount} />

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search message, API call, trace id, person…" className="sj-input !w-[300px]" />
        {mode === "stored" && d && d.batches.length > 0 && (
          <select value={batch} onChange={(e) => { setBatch(e.target.value); setLimit(PAGE); }} className="sj-input !w-auto">
            <option value="latest">Latest batch</option>
            {d.batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.people} people · {b.startedBy}</option>)}
          </select>
        )}
        <select value={agent} onChange={(e) => { setAgent(e.target.value); setLimit(PAGE); }} className="sj-input !w-auto">
          <option value="all">All agents</option>
          <option value="queue">scheduler</option>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        <select value={person} onChange={(e) => { setPerson(e.target.value); setLimit(PAGE); }} className="sj-input !w-auto">
          <option value="all">Everyone</option>
          {rows.map((r) => <option key={r.person.id} value={r.person.id}>{r.person.name}</option>)}
        </select>
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button key={l.k} onClick={() => toggle(l.k)} className={cn("rounded-md px-2 py-1 font-mono text-[10px] font-bold", levels.has(l.k) ? l.cls : "bg-transparent text-[#b5ab96] line-through")}>{l.label}</button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-3 font-mono text-[10.5px] text-mute">
          {total.toLocaleString()} events
          {mode === "stored" && (
            <button onClick={() => setLive((v) => !v)} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1", live ? "border-[#b8d6c1] text-ok" : "border-line")}>
              <i className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse bg-ok" : "bg-[#b5ab96]")} />{live ? "live" : "paused"}
            </button>
          )}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-[#fffdf7] font-mono text-[11.5px]">
        <div className="grid grid-cols-[84px_62px_120px_130px_1fr] gap-2 border-b border-line bg-[#e9e1cd] px-3 py-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#4b4338]">
          <span>time</span><span>level</span><span>agent</span><span>person</span><span>message</span>
        </div>
        {remote.loading && !d && <div className="px-3 py-8 text-center text-mute">Loading logs…</div>}
        {!(remote.loading && !d) && shown.length === 0 && (
          <div className="px-3 py-8 text-center text-mute">
            {mode === "stored" && !d?.batch ? <>No batches stored yet. Run <code>npm run db:seed</code> to load the sample history, or start a bulk upload.</> : "No events match these filters."}
          </div>
        )}
        {shown.map((e) => {
          const lv = LEVELS.find((l) => l.k === e.kind)!;
          const isOpen = open === e.key;
          const r = canDrill ? rowOf(e.personId) : undefined;
          const si = e.service === "queue" ? -1 : serviceIndex(e.service);
          const failure = e.meta && typeof e.meta === "object" ? (e.meta as { failure?: Record<string, unknown> }).failure : undefined;
          return (
            <div key={e.key} className={cn("border-b border-[#eee6d3] last:border-0", e.kind === "error" && "bg-[#fdf0ee]")}>
              <button onClick={() => setOpen(isOpen ? null : e.key)} className="grid w-full grid-cols-[84px_62px_120px_130px_1fr] items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[#f4efe3]">
                <span className="text-mute">{fmtStamp(e.tick)}</span>
                <span><b className={cn("rounded px-1.5 py-0.5 text-[9.5px]", lv.cls)}>{lv.label}</b></span>
                <span className="truncate text-[#4b4338]">{e.service === "queue" ? "scheduler" : e.service}</span>
                <span className="truncate">{e.personName}</span>
                <span className={cn("truncate", e.kind === "error" ? "text-bad" : e.kind === "warn" ? "text-[#8a6200]" : "text-ink")}>{e.text}</span>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-dashed border-line bg-[#faf6ea] px-3 py-3">
                  <div className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    {e.call && <><span className="text-mute">call</span><code>{e.call}</code></>}
                    {e.traceId && <><span className="text-mute">trace</span><button className="text-left underline" onClick={() => { setQ(e.traceId!); setDq(e.traceId!); setOpen(null); }}>{e.traceId} — show only this trace</button></>}
                    {e.ms !== undefined && <><span className="text-mute">latency</span><span>{e.ms} ms</span></>}
                    {e.at && <><span className="text-mute">stored at</span><span>{new Date(e.at).toLocaleString("en-GB")}</span></>}
                    {e.dept && <><span className="text-mute">department</span><span>{e.dept}</span></>}
                    <span className="text-mute">event</span><span>#{e.seq}</span>
                  </div>
                  {failure && <FailureCard failure={failure} />}
                  {!failure && r && si >= 0 && <div className="rounded-xl border border-line bg-[#fffdf7] p-3 font-sans"><TaskDetail person={r.person} pr={r.pr} si={si} /></div>}
                </div>
              )}
            </div>
          );
        })}
        {total > shown.length && limit < MAX && (
          <button onClick={() => setLimit((l) => Math.min(MAX, l + PAGE))} className="w-full border-t border-line py-2.5 text-[11px] uppercase tracking-[.1em] text-mute hover:bg-[#f4efe3]">Show {Math.min(PAGE, total - shown.length)} more</button>
        )}
        {total > shown.length && limit >= MAX && <div className="border-t border-line py-2.5 text-center text-[11px] text-mute">Showing the newest {MAX} — narrow the filters to see older events.</div>}
      </div>
    </div>
  );
}

function StorageBanner({ resp, error, sync, savedCount }: {
  resp: ReturnType<typeof useStoredEvents>["data"];
  error: string | null;
  sync: string;
  savedCount: number;
}) {
  if (error && !resp) return <Banner tone="bad"><b>Couldn’t load stored logs.</b> {error}. Showing this session’s logs only.</Banner>;
  if (!resp) return <Banner tone="mute">Connecting to Supabase…</Banner>;
  if (!resp.configured) return <Banner tone="warn"><b>Supabase isn’t configured.</b> Showing this session’s logs only — nothing is saved. Set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and <code>SUPABASE_APP_KEY</code> in <code>.env.local</code>.</Banner>;
  if (resp.setupRequired) return <Banner tone="warn"><b>Connected to Supabase, but the tables don’t exist yet.</b> Run <code>npm run db:sql</code> and paste the output into the Supabase SQL editor. Until then logs live in memory only.</Banner>;
  return (
    <Banner tone="ok">
      <b>Stored in Supabase</b> · batch <code>{resp.batch ?? "—"}</code> · {resp.total.toLocaleString()} events
      {sync === "ok" && savedCount > 0 ? <> · this session saved {savedCount.toLocaleString()}</> : null}
      {sync === "error" ? <> · <span className="text-bad">last save failed, retrying</span></> : null}
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "bad" | "mute"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border px-4 py-2.5 text-[12.5px] [&_code]:font-mono [&_code]:text-[11.5px]",
      tone === "ok" ? "border-[#b8d6c1] bg-[#eef4ea] text-[#1d5234]" : tone === "warn" ? "border-[#e6c978] bg-[#fbf3dc] text-[#7a5a00]" : tone === "bad" ? "border-bad/40 bg-[#fdf0ee] text-[#8c1b14]" : "border-line bg-[#f4efe3] text-mute")}>
      {children}
    </div>
  );
}
