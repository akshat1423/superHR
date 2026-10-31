"use client";
import { useMemo } from "react";
import { ICONS } from "@/components/ui/icons";
import { SERVICES } from "@/lib/services";
import { TICKS_PER_SEC } from "@/lib/provision";
import { cn } from "@/lib/utils";
import { type ScopedRow } from "./useScopedRun";

const DOT: Record<string, string> = { done: "bg-ok", waiting: "bg-warn", failed: "bg-bad", skipped: "bg-[#b9ae96]", running: "animate-pulse bg-acc", retry: "animate-pulse bg-acc", queued: "bg-[#ddd5c1]" };

/** One card per agent: is it healthy, how often does it succeed, how long does it take, what broke last. */
export function AgentOverview({ rows, onOpenAgent }: { rows: ScopedRow[]; onOpenAgent: (id: string) => void }) {
  const stats = useMemo(
    () =>
      SERVICES.map((sv, si) => {
        const tasks = rows.map((r) => r.pr.tasks[si]);
        const count = (s: string) => tasks.filter((t) => t.status === s).length;
        const done = count("done"), failed = count("failed"), waiting = count("waiting"), skipped = count("skipped");
        const running = count("running") + count("retry");
        const finished = done + failed;
        const durations = tasks.filter((t) => t.status === "done" && t.startedAt !== null && t.finishedAt !== null).map((t) => (t.finishedAt! - t.startedAt!) / TICKS_PER_SEC);
        const lastFail = tasks.flatMap((t) => (t.failure ? [t.failure] : [])).sort((a, b) => b.at - a.at)[0];
        const retried = tasks.filter((t) => t.failedAttempts.length > 0 && t.status === "done").length;
        return {
          sv, si, done, failed, waiting, skipped, running,
          rate: finished ? Math.round((done / finished) * 100) : null,
          avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
          lastFail, retried, tasks,
        };
      }),
    [rows],
  );

  return (
    <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-3">
      {stats.map(({ sv, done, failed, waiting, skipped, running, rate, avg, lastFail, retried, tasks }) => {
        const Icon = ICONS[sv.icon] ?? ICONS.Box;
        const health = failed ? "bad" : waiting ? "warn" : "ok";
        return (
          <button key={sv.id} onClick={() => onOpenAgent(sv.id)} className={cn("paper-card rounded-[18px] bg-paper2 p-4 text-left shadow-[0_8px_20px_rgba(107,90,58,.13)] transition hover:-translate-y-0.5", failed > 0 && "ring-1 ring-bad/40")}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-[11px] border border-[#d8cfba] bg-[#ece4d0]"><Icon size={18} strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] tracking-[-.02em]">{sv.name}</b>
                <small className="font-mono text-[10px] text-mute">{sv.id}</small>
              </div>
              <span className={cn("flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.08em]", running ? "text-acc" : health === "bad" ? "text-bad" : health === "warn" ? "text-[#a8620f]" : "text-ok")}>
                <i className={cn("h-2 w-2 rounded-full", running ? "animate-pulse bg-acc" : health === "bad" ? "bg-bad" : health === "warn" ? "bg-warn" : "bg-ok")} />
                {running ? `Running ${running}` : health === "bad" ? "Degraded" : health === "warn" ? "Healthy · paused" : "Healthy"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {[["done", done, "text-ok"], ["paused", waiting, "text-[#a8620f]"], ["failed", failed, "text-bad"], ["skipped", skipped, "text-mute"]].map(([l, n, c]) => (
                <div key={l as string} className="rounded-lg border border-line bg-[#fffdf7] py-1.5">
                  <b className={cn("block text-[17px] leading-none", c as string)}>{n}</b>
                  <span className="font-mono text-[8.5px] uppercase tracking-[.1em] text-mute">{l}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-between font-mono text-[10.5px] text-[#4b4338]">
              <span>success <b>{rate === null ? "—" : `${rate}%`}</b></span>
              <span>avg <b>{avg === null ? "—" : `${avg.toFixed(1)}s`}</b></span>
              <span>self-healed <b>{retried}</b></span>
            </div>

            <div className="mt-2.5 flex gap-[3px]" title="one tick per person">
              {tasks.map((t, i) => <i key={i} className={cn("h-2.5 flex-1 rounded-sm", DOT[t.status])} />)}
            </div>
            <div className={cn("mt-2.5 truncate font-mono text-[10.5px]", lastFail ? "text-bad" : "text-mute")}>
              {lastFail ? `last error: ${lastFail.code} ${lastFail.title}` : "no errors"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
