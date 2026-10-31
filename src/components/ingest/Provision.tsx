"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/tracker/Avatar";
import { Seg } from "@/components/ui/Seg";
import { ICONS } from "@/components/ui/icons";
import type { Person } from "@/lib/people";
import { personaLabel } from "@/lib/workflow";
import {
  CONCURRENCY, allFinished, fmtClock, initRun, phaseLabel, stepRun,
  type LogEvent, type PersonRun, type Run, type Task,
} from "@/lib/provision";
import { SERVICES } from "@/lib/services";
import { cn } from "@/lib/utils";

type Speed = "1" | "4" | "10";

export function Provision({ people }: { people: Person[] }) {
  const [run, setRun] = useState<Run>(() => initRun(people));
  const [speed, setSpeed] = useState<Speed>("1");
  const [open, setOpen] = useState<string | null>(people[0]?.id ?? null);
  const finished = allFinished(run);

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      setRun((r) => {
        let next = r;
        for (let i = 0; i < Number(speed); i++) next = stepRun(next, people);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [people, speed, finished]);

  const stats = useMemo(() => {
    const queued = run.people.filter((p) => p.state === "queued").length;
    const running = run.people.filter((p) => p.state === "running").length;
    const done = run.people.filter((p) => p.state === "finished").length;
    const attention = run.people.filter((p) => p.state === "finished" && p.tasks.some((t) => t.status === "waiting")).length;
    return { queued, running, done, attention };
  }, [run]);

  const eventsByPerson = useMemo(() => {
    const m: Record<string, LogEvent[]> = {};
    for (const e of run.events) (m[e.personId] ??= []).push(e);
    return m;
  }, [run.events]);

  let queuePos = 0;

  return (
    <div>
      {/* batch header */}
      <div className="paper-card mb-4 rounded-[20px] bg-paper2 p-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="eyebrow !text-[10px]">Elapsed</div>
            <b className="font-mono text-[28px] tracking-[-.02em]">{fmtClock(run.tick)}</b>
          </div>
          <div className="grid flex-1 grid-cols-4 gap-2.5">
            <Stat n={stats.queued} label="In queue" />
            <Stat n={stats.running} label={`In progress · ${CONCURRENCY} at a time`} accent />
            <Stat n={stats.done} label="Complete" ok />
            <Stat n={stats.attention} label="Need candidate data" warn />
          </div>
          <div className="text-right">
            <div className="eyebrow mb-1 !text-[10px]">Speed</div>
            <Seg value={speed} onChange={setSpeed} options={[{ value: "1", label: "1×" }, { value: "4", label: "4×" }, { value: "10", label: "10×" }]} />
          </div>
        </div>
        {/* one tick per person: the whole batch at a glance */}
        <div className="mt-3.5 flex gap-[3px]" title="one tick per person">
          {run.people.map((r, i) => (
            <i key={people[i].id} className={cn("h-3.5 flex-1 rounded-sm transition-colors", batchTick(r))} />
          ))}
        </div>
        {/* per-service rollup */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SERVICES.map((sv, si) => {
            const done = run.people.filter((r) => r.tasks[si].status === "done").length;
            const paused = run.people.filter((r) => r.tasks[si].status === "waiting").length;
            return (
              <span key={sv.id} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-[#4b4338]">
                {sv.name} <b>{done}</b>/{people.length}{paused > 0 && <span className="ml-1 text-[#a8620f]">· {paused} paused</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* people */}
      <div className="space-y-2.5">
        {people.map((p, i) => {
          const r = run.people[i];
          if (r.state === "queued") queuePos++;
          return (
            <PersonRow
              key={p.id}
              person={p}
              r={r}
              queuePos={r.state === "queued" ? queuePos : 0}
              tick={run.tick}
              open={open === p.id}
              onToggle={() => setOpen(open === p.id ? null : p.id)}
              events={eventsByPerson[p.id] ?? []}
            />
          );
        })}
      </div>

      {finished && (
        <div className="paper-card mt-4 flex items-center gap-[22px] rounded-[18px] bg-paper2 px-[22px] py-[18px]">
          <div>
            <b className="text-[22px] tracking-[-.03em]">{people.length} people provisioned in {fmtClock(run.tick)}</b><br />
            <span className="font-mono text-xs text-mute">{stats.attention} still need candidate data — magic links are out. Their blocked steps show in the tracker.</span>
          </div>
          <span className="flex-1" />
          <Link href="/tracker" className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] text-white shadow-[0_3px_0_#8d3a1b]">Open tracker →</Link>
        </div>
      )}
    </div>
  );
}

const batchTick = (r: PersonRun) =>
  r.state === "queued" ? "bg-[#ddd5c1]"
  : r.state === "running" ? "animate-pulse bg-acc"
  : r.tasks.some((t) => t.status === "waiting") ? "bg-warn" : "bg-ok";

function Stat({ n, label, accent, ok, warn }: { n: number; label: string; accent?: boolean; ok?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-[#fffdf7] px-3.5 py-2.5">
      <b className={cn("block text-[24px] leading-none tracking-[-.03em]", accent && "text-acc", ok && "text-ok", warn && "text-[#a8620f]")}>{n}</b>
      <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{label}</span>
    </div>
  );
}

function PersonRow({ person, r, queuePos, tick, open, onToggle, events }: {
  person: Person; r: PersonRun; queuePos: number; tick: number; open: boolean; onToggle: () => void; events: LogEvent[];
}) {
  const running = r.tasks.map((t, i) => (t.status === "running" || t.status === "retry" ? i : -1)).filter((i) => i >= 0);
  const paused = r.tasks.filter((t) => t.status === "waiting").length;
  const doneCount = r.tasks.filter((t) => t.status === "done").length;

  let status: React.ReactNode;
  if (r.state === "queued") status = <span className="text-mute">Queued · #{queuePos} in line</span>;
  else if (r.state === "finished")
    status = paused
      ? <span className="text-[#a8620f]">Done in {fmtClock(r.finishedAt! - r.startedAt!)} · {paused} paused, needs data</span>
      : <span className="text-ok">Done in {fmtClock(r.finishedAt! - r.startedAt!)} · all {doneCount} services</span>;
  else {
    const i = running[0];
    status = i === undefined
      ? <span className="text-mute">Waiting on dependencies…</span>
      : <span className="text-acc">{SERVICES[i].name}: {r.tasks[i].status === "retry" ? "retrying after error" : phaseLabel(i, r.tasks[i])}{running.length > 1 ? ` +${running.length - 1}` : ""}</span>;
  }

  return (
    <div className={cn("paper-card rounded-2xl bg-paper2 transition", r.state === "running" && "ring-1 ring-acc/60", r.state === "queued" && "opacity-70")}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-4 py-3 text-left">
        <div className="flex w-[230px] flex-none items-center gap-3">
          <span className="h-10 w-10 flex-none overflow-hidden rounded-xl bg-[#f1e6e4]"><Avatar person={person} /></span>
          <div className="min-w-0">
            <b className="block truncate text-[14px] tracking-[-.01em]">{person.name}</b>
            <small className="block truncate font-mono text-[10px] text-mute">{personaLabel(person.persona)}</small>
          </div>
        </div>
        <div className="flex flex-none gap-1.5">
          {r.tasks.map((t, i) => <TaskChip key={SERVICES[i].id} t={t} i={i} />)}
        </div>
        <div className="min-w-0 flex-1 text-right font-mono text-[11px]">
          <div className="truncate">{status}</div>
          {r.state === "running" && <small className="text-mute">{fmtClock(tick - r.startedAt!)} running</small>}
        </div>
        <span className="text-mute">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-6 border-t border-dashed border-line px-4 pb-4 pt-3">
          <div>
            <div className="eyebrow mb-2 !text-[10px]">Services</div>
            {r.tasks.map((t, i) => (
              <div key={SERVICES[i].id} className="flex items-start gap-2.5 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-0">
                <TaskChip t={t} i={i} small />
                <div className="min-w-0 flex-1">
                  <b>{SERVICES[i].name}</b>
                  <small className="block truncate font-mono text-[10.5px] text-mute">
                    {t.status === "queued" ? `waiting${depText(i)}` : t.status === "running" ? `${phaseLabel(i, t)}… ${Math.round((t.progress / t.dur) * 100)}%` : t.status === "retry" ? "transient error — retrying" : t.detail}
                  </small>
                </div>
                <small className="font-mono text-[10px] text-mute">{t.finishedAt && t.startedAt ? `${((t.finishedAt - t.startedAt) / 4).toFixed(0)}s` : ""}</small>
              </div>
            ))}
          </div>
          <div>
            <div className="eyebrow mb-2 !text-[10px]">Activity</div>
            <div className="max-h-[300px] overflow-auto font-mono text-[11px] leading-[1.7]">
              {events.length === 0 && <span className="text-mute">Not started yet — {r.state === "queued" ? "waiting for a free worker." : ""}</span>}
              {events.map((e, i) => (
                <div key={i} className={cn(e.kind === "warn" ? "text-[#a8620f]" : e.kind === "ok" ? "text-ok" : "text-[#4b4338]")}>
                  <span className="text-mute">{fmtClock(e.t)}</span> {e.service === "queue" ? "·" : e.service.replace("-svc", "")} — {e.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const depText = (i: number) => {
  const d = SERVICES[i].deps;
  return d === "all" ? " for every other service" : d.length ? ` for ${d.map((id) => SERVICES.find((s) => s.id === id)?.name).join(", ")}` : "";
};

function TaskChip({ t, i, small }: { t: Task; i: number; small?: boolean }) {
  const sv = SERVICES[i];
  const Icon = ICONS[sv.icon] ?? ICONS.Box;
  const size = small ? 26 : 32;
  const tone =
    t.status === "done" ? "border-[#9fcfae] bg-[#dbeadf]"
    : t.status === "waiting" ? "border-[#e0b455] bg-[#fbefcf]"
    : t.status === "running" ? "border-acc bg-[#f8e3d6]"
    : t.status === "retry" ? "border-acc bg-[#fbefcf]"
    : "border-dashed border-[#c4b99f] bg-transparent opacity-60";
  return (
    <span title={`${sv.name} — ${t.status}${t.detail ? `: ${t.detail}` : ""}`} className={cn("relative inline-grid flex-none place-items-center overflow-visible rounded-[10px] border text-ink", tone, t.status === "running" && "animate-pulse")} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
      {t.status === "done" && <Badge cls="bg-ok">✓</Badge>}
      {t.status === "waiting" && <Badge cls="bg-warn">!</Badge>}
      {t.status === "retry" && <Badge cls="bg-acc">↻</Badge>}
      {t.status === "running" && <b className="absolute inset-x-1 bottom-0.5 h-[3px] overflow-hidden rounded-full bg-acc/20"><i className="block h-full bg-acc" style={{ width: `${(t.progress / t.dur) * 100}%` }} /></b>}
    </span>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <i className={cn("absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold not-italic text-white", cls)}>{children}</i>;
}

