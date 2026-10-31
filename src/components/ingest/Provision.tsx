"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/tracker/Avatar";
import { Seg } from "@/components/ui/Seg";
import { ServiceList } from "@/components/agents/ServiceList";
import { TaskChip } from "@/components/agents/TaskChip";
import { useUser } from "@/components/shell/AuthProvider";
import { canSeeAgentLogs } from "@/lib/auth/policy";
import type { Person } from "@/lib/people";
import { personaLabel } from "@/lib/workflow";
import { CONCURRENCY, allFinished, fmtClock, fmtStamp, phaseLabel, taskCounts, type LogEvent, type PersonRun } from "@/lib/provision";
import { SERVICES } from "@/lib/services";
import { useProvisioning, type Speed } from "@/store/provisioning";
import { cn } from "@/lib/utils";

/** Live view of the batch that was just uploaded — one row per person. State lives in the global store. */
export function Provision() {
  const user = useUser();
  const { batch: people, run, speed, setSpeed } = useProvisioning();
  const [open, setOpen] = useState<string | null>(people[0]?.id ?? null);
  const finished = allFinished(run);

  const stats = useMemo(() => {
    const done = run.people.filter((p) => p.state === "finished");
    return {
      queued: run.people.filter((p) => p.state === "queued").length,
      running: run.people.filter((p) => p.state === "running").length,
      done: done.length,
      needData: done.filter((p) => taskCounts(p).waiting > 0).length,
      failedServices: run.people.reduce((n, p) => n + taskCounts(p).failed, 0),
    };
  }, [run]);

  const eventsByPerson = useMemo(() => {
    const m: Record<string, LogEvent[]> = {};
    for (const e of run.events) (m[e.personId] ??= []).push(e);
    return m;
  }, [run.events]);

  let queuePos = 0;

  return (
    <div>
      <div className="paper-card mb-4 rounded-[20px] bg-paper2 p-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="eyebrow !text-[10px]">Elapsed</div>
            <b className="font-mono text-[28px] tracking-[-.02em]">{fmtClock(run.tick)}</b>
          </div>
          <div className="grid flex-1 grid-cols-5 gap-2.5">
            <Stat n={stats.queued} label="In queue" />
            <Stat n={stats.running} label={`In progress · ${CONCURRENCY} at a time`} accent />
            <Stat n={stats.done} label="Complete" ok />
            <Stat n={stats.needData} label="Need candidate data" warn />
            <Stat n={stats.failedServices} label="Failed services" bad />
          </div>
          <div className="text-right">
            <div className="eyebrow mb-1 !text-[10px]">Speed</div>
            <Seg<Speed> value={speed} onChange={setSpeed} options={[{ value: "1", label: "1×" }, { value: "4", label: "4×" }, { value: "10", label: "10×" }]} />
          </div>
        </div>
        <div className="mt-3.5 flex gap-[3px]" title="one tick per person">
          {run.people.map((r) => <i key={r.personId} className={cn("h-3.5 flex-1 rounded-sm transition-colors", batchTick(r))} />)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {SERVICES.map((sv, si) => {
            const done = run.people.filter((r) => r.tasks[si].status === "done").length;
            const paused = run.people.filter((r) => r.tasks[si].status === "waiting").length;
            const failed = run.people.filter((r) => r.tasks[si].status === "failed").length;
            return (
              <span key={sv.id} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-[#4b4338]">
                {sv.name} <b>{done}</b>/{people.length}
                {paused > 0 && <span className="ml-1 text-[#a8620f]">· {paused} paused</span>}
                {failed > 0 && <span className="ml-1 text-bad">· {failed} failed</span>}
              </span>
            );
          })}
        </div>
        <p className="mt-2.5 font-mono text-[10px] text-mute">Simulated run — the agents’ API calls, timings and failures are generated from each person’s data, not sent to real systems.</p>
      </div>

      <div className="space-y-2.5">
        {people.map((p, i) => {
          const r = run.people[i];
          if (r.state === "queued") queuePos++;
          return <PersonRow key={p.id} person={p} r={r} queuePos={r.state === "queued" ? queuePos : 0} tick={run.tick} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} events={eventsByPerson[p.id] ?? []} />;
        })}
      </div>

      {finished && (
        <div className="paper-card mt-4 flex items-center gap-[22px] rounded-[18px] bg-paper2 px-[22px] py-[18px]">
          <div>
            <b className="text-[22px] tracking-[-.03em]">{people.length} people provisioned in {fmtClock(run.tick)}</b><br />
            <span className="font-mono text-xs text-mute">
              {stats.needData} still need candidate data (magic links sent) · {stats.failedServices} service{stats.failedServices === 1 ? "" : "s"} failed.
            </span>
          </div>
          <span className="flex-1" />
          {stats.failedServices > 0 && canSeeAgentLogs(user) && (
            <Link href="/agents?tab=failures" className="rounded-xl border border-white/60 bg-[#f7f3ea] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] shadow-[0_2px_0_#b9ae96]">See why they failed</Link>
          )}
          <Link href="/tracker" className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] text-white shadow-[0_3px_0_#8d3a1b]">Open tracker →</Link>
        </div>
      )}
    </div>
  );
}

const batchTick = (r: PersonRun) =>
  r.state === "queued" ? "bg-[#ddd5c1]"
  : r.state === "running" ? "animate-pulse bg-acc"
  : r.tasks.some((t) => t.status === "failed") ? "bg-bad"
  : r.tasks.some((t) => t.status === "waiting") ? "bg-warn" : "bg-ok";

function Stat({ n, label, accent, ok, warn, bad }: { n: number; label: string; accent?: boolean; ok?: boolean; warn?: boolean; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-[#fffdf7] px-3.5 py-2.5">
      <b className={cn("block text-[24px] leading-none tracking-[-.03em]", accent && "text-acc", ok && "text-ok", warn && "text-[#a8620f]", bad && "text-bad")}>{n}</b>
      <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{label}</span>
    </div>
  );
}

function PersonRow({ person, r, queuePos, tick, open, onToggle, events }: {
  person: Person; r: PersonRun; queuePos: number; tick: number; open: boolean; onToggle: () => void; events: LogEvent[];
}) {
  const running = r.tasks.map((t, i) => (t.status === "running" || t.status === "retry" ? i : -1)).filter((i) => i >= 0);
  const c = taskCounts(r);

  let status: React.ReactNode;
  if (r.state === "queued") status = <span className="text-mute">Queued · #{queuePos} in line</span>;
  else if (r.state === "finished")
    status = c.failed
      ? <span className="text-bad">Finished in {fmtClock(r.finishedAt! - r.startedAt!)} · {c.failed} failed{c.skipped ? `, ${c.skipped} skipped` : ""}</span>
      : c.waiting
        ? <span className="text-[#a8620f]">Done in {fmtClock(r.finishedAt! - r.startedAt!)} · {c.waiting} paused, needs data</span>
        : <span className="text-ok">Done in {fmtClock(r.finishedAt! - r.startedAt!)} · all {c.done} services</span>;
  else {
    const i = running[0];
    status = i === undefined
      ? <span className="text-mute">Waiting on dependencies…</span>
      : <span className="text-acc">{SERVICES[i].name}: {r.tasks[i].status === "retry" ? "retrying after error" : phaseLabel(i, r.tasks[i])}{running.length > 1 ? ` +${running.length - 1}` : ""}</span>;
  }

  return (
    <div className={cn("paper-card rounded-2xl bg-paper2 transition", r.state === "running" && "ring-1 ring-acc/60", r.state === "queued" && "opacity-70", r.state === "finished" && c.failed > 0 && "ring-1 ring-bad/40")}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-4 py-3 text-left">
        <div className="flex w-[230px] flex-none items-center gap-3">
          <span className="h-10 w-10 flex-none overflow-hidden rounded-xl bg-[#f1e6e4]"><Avatar person={person} /></span>
          <div className="min-w-0">
            <b className="block truncate text-[14px] tracking-[-.01em]">{person.name}</b>
            <small className="block truncate font-mono text-[10px] text-mute">{personaLabel(person.persona)}</small>
          </div>
        </div>
        <div className="flex flex-none gap-1.5">{r.tasks.map((t, i) => <TaskChip key={SERVICES[i].id} t={t} i={i} />)}</div>
        <div className="min-w-0 flex-1 text-right font-mono text-[11px]">
          <div className="truncate">{status}</div>
          {r.state === "running" && <small className="text-mute">{fmtClock(tick - r.startedAt!)} running</small>}
        </div>
        <span className="text-mute">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-6 border-t border-dashed border-line px-4 pb-4 pt-3">
          <div>
            <div className="eyebrow mb-1 !text-[10px]">Services · click one to see what it did</div>
            <ServiceList person={person} pr={r} />
          </div>
          <div>
            <div className="eyebrow mb-2 !text-[10px]">Activity</div>
            <div className="max-h-[360px] overflow-auto font-mono text-[11px] leading-[1.7]">
              {events.length === 0 && <span className="text-mute">Not started yet — {r.state === "queued" ? "waiting for a free worker." : ""}</span>}
              {events.map((e) => (
                <div key={e.seq} className={cn(e.kind === "error" ? "text-bad" : e.kind === "warn" ? "text-[#a8620f]" : e.kind === "ok" ? "text-ok" : "text-[#4b4338]")}>
                  <span className="text-mute">{fmtStamp(e.t)}</span> {e.service === "queue" ? "·" : e.service.replace("-svc", "")} — {e.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
