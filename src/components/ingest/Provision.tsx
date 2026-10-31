"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/Glyph";
import type { Person } from "@/lib/people";
import { SERVICES } from "@/lib/services";
import { cn } from "@/lib/utils";

const SEGMENTS = (n: number) => Math.min(n, 24);

interface Sim { tick: number; prog: number[]; warn: boolean[][]; logs: { t: string; w?: boolean }[]; warns: number; done: number }

function step(s: Sim, people: Person[]): Sim {
  const n = people.length;
  const per = Math.ceil(n / 12);
  const tick = s.tick + 1;
  const prog = [...s.prog];
  const warn = s.warn.map((w) => [...w]);
  const logs = [...s.logs];
  let warns = s.warns;
  let done = s.done;
  SERVICES.forEach((sv, si) => {
    if (tick < si * 3 || prog[si] >= n || tick % 2) return;
    for (let k = 0; k < per && prog[si] < n; k++) {
      const i = prog[si]++;
      const p = people[i];
      const w = sv.waits(p);
      if (w) { warns++; warn[si][Math.floor((i * SEGMENTS(n)) / n)] = true; }
      if (n <= 40) logs.push({ t: `[${sv.id}] ${p.name.split(" ")[0].padEnd(8)} ${w ? "⚠ " + w : sv.line(p)}`, w: !!w });
    }
    if (prog[si] >= n) done++;
  });
  return { tick, prog, warn, logs: logs.slice(-300), warns, done };
}

export function Provision({ people }: { people: Person[] }) {
  const n = people.length;
  const seg = SEGMENTS(n);
  const [sim, setSim] = useState<Sim>(() => ({
    tick: 0, prog: SERVICES.map(() => 0), warn: SERVICES.map(() => Array(seg).fill(false)),
    logs: [{ t: `$ superjoin ingest --batch ats-upload --rows ${n}` }], warns: 0, done: 0,
  }));
  const finished = sim.done === SERVICES.length;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setSim((s) => step(s, people)), 90);
    return () => clearInterval(id);
  }, [people, finished]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [sim.logs.length]);

  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-5">
      <div className="paper-card sticky top-0 rounded-[22px] bg-paper2 p-[18px]">
        <h4 className="eyebrow !text-[10px] !tracking-[.14em]">ATS batch</h4>
        <b className="my-1 block text-[30px] tracking-[-.04em]">{n}</b>
        <span className="font-mono text-[11px] text-mute">people · {n} workflows</span>
        <div className="mt-2.5 grid grid-cols-4 gap-1">{people.slice(0, 32).map((p) => <i key={p.id} className="h-4 rounded-[3px] bg-acc" />)}</div>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-3.5">
          {SERVICES.map((sv, si) => {
            const state = sim.prog[si] >= n ? "fin" : sim.tick >= si * 3 ? "run" : "queued";
            const filled = Math.floor((sim.prog[si] * seg) / n);
            return (
              <div key={sv.id} className={cn("rounded-[18px] border bg-paper2 px-4 py-3.5 shadow-[0_8px_20px_rgba(107,90,58,.15)] transition", state === "run" ? "border-acc" : state === "fin" ? "border-[#b8d6c1] bg-[#eef4ea]" : "border-transparent")}>
                <div className="flex items-center gap-2.5">
                  <Mono text={sv.mono} size={30} />
                  <div><b className="text-[15px] tracking-[-.02em]">{sv.name}</b><small className="block font-mono text-[10px] text-mute">{sv.id}</small></div>
                  <span className={cn("ml-auto font-mono text-[10px] font-semibold tracking-[.08em]", state === "run" ? "text-acc" : state === "fin" ? "text-ok" : "text-mute")}>{state === "fin" ? "DONE" : state === "run" ? "RUNNING" : "QUEUED"}</span>
                </div>
                <div className="my-2 font-mono text-[10.5px] text-[#6b6252]">↳ {sv.creates}</div>
                <div className="flex gap-[3px]">
                  {Array.from({ length: seg }, (_, j) => (
                    <i key={j} className={cn("h-[18px] flex-1 rounded-[3px] transition-colors", j < filled ? (sim.warn[si][j] ? "bg-warn" : "bg-ok") : j === filled && state === "run" ? "animate-pulse bg-acc" : "bg-[#ddd5c1]")} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={logRef} className="mt-[18px] h-[170px] overflow-auto rounded-2xl border border-line bg-[#fffdf7] px-4 py-3.5 font-mono text-[11px] leading-[1.65] text-[#3d362b]">
          {sim.logs.map((l, i) => <div key={i} className={l.w ? "text-[#a8620f]" : l.t.startsWith("$") ? "text-mute" : ""}>{l.t}</div>)}
        </div>
        {finished && (
          <div className="paper-card mt-4 flex items-center gap-[22px] rounded-[18px] bg-paper2 px-[22px] py-[18px]">
            <div>
              <b className="text-[22px] tracking-[-.03em]">{n} workflows spun up · {SERVICES.length} services done</b><br />
              <span className="font-mono text-xs text-mute">{sim.warns} items waiting on candidate data — magic links sent. Blocked steps now show in the tracker.</span>
            </div>
            <span className="flex-1" />
            <Link href="/tracker" className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] text-white shadow-[0_3px_0_#8d3a1b]">Open tracker →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
