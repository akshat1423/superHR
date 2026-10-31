"use client";
import { canRetryService, canSeeFailureDetail } from "@/lib/auth/policy";
import type { Person } from "@/lib/people";
import { fmtStamp, phaseLabel, type PersonRun } from "@/lib/provision";
import { SERVICES } from "@/lib/services";
import { useProvisioning } from "@/store/provisioning";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/shell/AuthProvider";
import { STATUS_LABEL, STATUS_TEXT } from "./TaskChip";

/**
 * Everything one service did (or failed to do) for one person: the API calls in order, the artifact it
 * produced, and — when it failed — the root cause, the evidence, how to fix it, and a retry button.
 * `simple` is the new joiner's view: plain language, no system detail.
 */
export function TaskDetail({ person, pr, si, simple }: { person: Person; pr: PersonRun; si: number; simple?: boolean }) {
  const user = useUser();
  const retry = useProvisioning((s) => s.retry);
  const t = pr.tasks[si];
  const sv = SERVICES[si];
  const detailed = !simple && canSeeFailureDetail(user);

  if (simple) {
    return (
      <div className="text-[12.5px] text-[#4b4338]">
        {t.status === "done" && <>Done — {t.detail}</>}
        {t.status === "waiting" && <>This is waiting on you: <b>{t.detail}</b>.</>}
        {t.status === "failed" && <>We hit a problem on our side. The HR team has been told and will sort it out — you don’t need to do anything.</>}
        {t.status === "skipped" && <>On hold until an earlier step is sorted out.</>}
        {(t.status === "queued" || t.status === "running" || t.status === "retry") && <>In progress…</>}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-mute">
        <span className={cn("font-semibold uppercase tracking-[.1em]", STATUS_TEXT[t.status])}>{STATUS_LABEL[t.status]}</span>
        {t.traceId && <span>trace {t.traceId}</span>}
        {t.attempts > 0 && <span>attempt {t.attempts}</span>}
        {t.startedAt !== null && <span>started {fmtStamp(t.startedAt)}</span>}
        {t.finishedAt !== null && <span>finished {fmtStamp(t.finishedAt)}</span>}
      </div>

      {/* what the agent did, call by call */}
      <div>
        <div className="eyebrow mb-1.5 !text-[10px]">What the agent did</div>
        {t.actions.length === 0 && <div className="text-mute">{t.status === "skipped" || t.status === "waiting" ? t.detail : "Nothing yet — waiting its turn."}</div>}
        <ol className="space-y-1.5">
          {t.actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className={cn("mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-[9px] font-bold text-white", a.status === "ok" ? "bg-ok" : a.status === "failed" ? "bg-bad" : "animate-pulse bg-acc")}>
                {a.status === "ok" ? "✓" : a.status === "failed" ? "✕" : "…"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a.label}{a.ms !== null && <span className="ml-2 font-mono text-[10px] font-normal text-mute">{a.ms} ms</span>}</div>
                <code className="block truncate font-mono text-[10.5px] text-[#6b6252]">{a.call}</code>
                {a.note && <div className={cn("font-mono text-[10.5px]", a.status === "failed" ? "text-bad" : "text-[#a8620f]")}>{a.note}</div>}
              </div>
            </li>
          ))}
          {t.status === "running" && <li className="pl-6 font-mono text-[10.5px] text-acc">{phaseLabel(si, t)}…</li>}
        </ol>
      </div>

      {t.status === "done" && <div className="rounded-lg bg-[#e6f1e9] px-3 py-2 text-[#1d5234]"><b>Result:</b> {t.detail}</div>}
      {t.status === "waiting" && <div className="rounded-lg bg-[#fbefcf] px-3 py-2 text-[#8a6200]"><b>Paused:</b> {t.detail}. The rest of this person’s onboarding continues; this resumes when the missing data arrives.</div>}
      {t.status === "skipped" && <div className="rounded-lg bg-[#eee8d8] px-3 py-2 text-[#5b5244]"><b>Skipped:</b> {t.detail}. It will run automatically once that is fixed.</div>}

      {/* why it failed */}
      {t.status === "failed" && t.failure && detailed && (
        <div className="overflow-hidden rounded-xl border border-bad/50 bg-[#fdf0ee]">
          <div className="flex items-center gap-2 border-b border-bad/30 bg-[#f6d6d2] px-3 py-2">
            <span className="rounded-md bg-bad px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">{t.failure.code}</span>
            <b className="text-[13px] text-[#8c1b14]">{t.failure.title}</b>
            <span className="ml-auto font-mono text-[10px] text-[#8c1b14]">at “{t.failure.action}”</span>
          </div>
          <div className="space-y-2.5 px-3 py-2.5">
            <div><div className="eyebrow !text-[9.5px]">Why it failed</div><p className="text-[#3d362b]">{t.failure.cause}</p></div>
            <div>
              <div className="eyebrow !text-[9.5px]">Evidence</div>
              <pre className="overflow-auto rounded-lg bg-[#fffdf7] p-2.5 font-mono text-[10.5px] leading-[1.55] text-[#3d362b]">{t.failure.evidence}</pre>
            </div>
            <div><div className="eyebrow !text-[9.5px]">How to fix</div><p className="text-[#3d362b]">{t.failure.fix}</p></div>
            <div className="flex items-center gap-3">
              {canRetryService(user, person) ? (
                <button
                  className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] text-white shadow-[0_2px_0_#8d3a1b]"
                  onClick={() => { retry(person.id, sv.id, user.name); toast(`Retrying ${sv.name} for ${person.name.split(" ")[0]}`); }}
                >
                  {t.failure.retryable ? "Retry now" : "I’ve fixed it — retry"}
                </button>
              ) : (
                <span className="font-mono text-[10.5px] text-mute">Only HR or the department head can retry this.</span>
              )}
              <span className="font-mono text-[10px] text-mute">{t.failure.retryable ? "Safe to retry as-is" : "Needs a change before retrying"}</span>
            </div>
          </div>
        </div>
      )}
      {t.status === "failed" && !detailed && <div className="rounded-lg bg-[#fdf0ee] px-3 py-2 text-[#8c1b14]">Something went wrong in this step. The team has been notified.</div>}

      {t.failedAttempts.length > 0 && t.status !== "failed" && detailed && (
        <div>
          <div className="eyebrow mb-1 !text-[10px]">Earlier attempts</div>
          {t.failedAttempts.map((f, i) => (
            <div key={i} className="font-mono text-[10.5px] text-[#8c1b14]">✕ {fmtStamp(f.at)} · {f.code} {f.title} <span className="text-mute">({f.traceId})</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
