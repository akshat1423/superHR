"use client";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/tracker/Avatar";
import { useUser } from "@/components/shell/AuthProvider";
import { canRetryService } from "@/lib/auth/policy";
import { fmtStamp } from "@/lib/provision";
import { SERVICES } from "@/lib/services";
import { useProvisioning } from "@/store/provisioning";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { TaskDetail } from "./TaskDetail";
import { type ScopedRow } from "./useScopedRun";

/** Every failed service in scope, grouped by root cause, with the evidence and a retry button. */
export function AgentFailures({ rows }: { rows: ScopedRow[] }) {
  const user = useUser();
  const retry = useProvisioning((s) => s.retry);
  const [open, setOpen] = useState<string | null>(null);
  const [cause, setCause] = useState<string>("all");

  const failures = useMemo(
    () => rows.flatMap((r) => r.pr.tasks.map((t, si) => ({ r, t, si })).filter((x) => x.t.status === "failed" && x.t.failure))
      .sort((a, b) => b.t.failure!.at - a.t.failure!.at),
    [rows],
  );
  const skipped = rows.reduce((n, r) => n + r.pr.tasks.filter((t) => t.status === "skipped").length, 0);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of failures) m.set(f.t.failure!.title, (m.get(f.t.failure!.title) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [failures]);

  const shown = failures.filter((f) => cause === "all" || f.t.failure!.title === cause);
  const retryable = failures.filter((f) => f.t.failure!.retryable && canRetryService(user, f.r.person));
  const key = (f: (typeof failures)[number]) => `${f.r.person.id}:${f.si}`;

  const retryAll = () => {
    retryable.forEach((f) => retry(f.r.person.id, SERVICES[f.si].id, user.name));
    toast(`Retrying ${retryable.length} service${retryable.length === 1 ? "" : "s"} that are safe to retry as-is`);
  };

  if (failures.length === 0) {
    return (
      <div className="paper-card rounded-[22px] bg-paper2 px-8 py-14 text-center">
        <div className="text-3xl">✓</div>
        <b className="mt-2 block text-[20px] tracking-[-.03em]">No failed services</b>
        <p className="mt-1 text-[13px] text-mute">Everything in your scope either completed or is waiting on a candidate.{skipped ? ` ${skipped} skipped.` : ""}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="eyebrow !tracking-[.12em]">Root causes</span>
        <button onClick={() => setCause("all")} className={cn("rounded-full border px-3 py-1 font-mono text-[11px]", cause === "all" ? "border-ink bg-ink text-white" : "border-line text-[#4b4338]")}>All <b className="opacity-60">{failures.length}</b></button>
        {groups.map(([title, n]) => (
          <button key={title} onClick={() => setCause(title)} className={cn("rounded-full border px-3 py-1 font-mono text-[11px]", cause === title ? "border-ink bg-ink text-white" : "border-[#e9a39c] text-bad")}>{title} <b className="opacity-60">×{n}</b></button>
        ))}
        <span className="flex-1" />
        {skipped > 0 && <span className="font-mono text-[10.5px] text-mute">{skipped} more skipped because an earlier service failed</span>}
        {retryable.length > 0 && (
          <button onClick={retryAll} className="rounded-xl border border-white/60 bg-[#f7f3ea] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] shadow-[0_2px_0_#b9ae96]">Retry all safe ones ({retryable.length})</button>
        )}
      </div>

      <div className="space-y-2.5">
        {shown.map((f) => {
          const k = key(f);
          const isOpen = open === k;
          const fl = f.t.failure!;
          return (
            <div key={k} className="paper-card overflow-hidden rounded-2xl bg-paper2 ring-1 ring-bad/30">
              <button onClick={() => setOpen(isOpen ? null : k)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left">
                <span className="h-9 w-9 flex-none overflow-hidden rounded-xl bg-[#f1e6e4]"><Avatar person={f.r.person} /></span>
                <div className="min-w-0 flex-1">
                  <b className="text-[14px] tracking-[-.01em]">{f.r.person.name}</b>
                  <small className="block font-mono text-[10.5px] text-mute">{SERVICES[f.si].name} · {SERVICES[f.si].id} · {fmtStamp(fl.at)}</small>
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <span className="rounded-md bg-bad px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">{fl.code}</span>{" "}
                  <b className="text-[13px] text-[#8c1b14]">{fl.title}</b>
                  <small className="block truncate font-mono text-[10.5px] text-mute">{fl.retryable ? "safe to retry as-is" : "needs a fix first"}</small>
                </div>
                <span className="text-mute">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && <div className="border-t border-dashed border-line bg-[#fffdf7] px-4 py-3.5"><TaskDetail person={f.r.person} pr={f.r.pr} si={f.si} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
