import { cn } from "@/lib/utils";

interface FailureMeta { code?: string; title?: string; cause?: string; evidence?: string; fix?: string; retryable?: boolean; action?: string }

/** Read-only explanation of a failure, built from the `failure` stored on an error event — works for any batch. */
export function FailureCard({ failure }: { failure: FailureMeta }) {
  return (
    <div className="overflow-hidden rounded-xl border border-bad/50 bg-[#fdf0ee] font-sans">
      <div className="flex items-center gap-2 border-b border-bad/30 bg-[#f6d6d2] px-3 py-2">
        <span className="rounded-md bg-bad px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">{failure.code ?? "ERR"}</span>
        <b className="text-[13px] text-[#8c1b14]">{failure.title ?? "Failed"}</b>
        {failure.action && <span className="ml-auto font-mono text-[10px] text-[#8c1b14]">at “{failure.action}”</span>}
      </div>
      <div className="space-y-2.5 px-3 py-2.5 text-[12.5px]">
        {failure.cause && <div><div className="eyebrow !text-[9.5px]">Why it failed</div><p className="text-[#3d362b]">{failure.cause}</p></div>}
        {failure.evidence && (
          <div>
            <div className="eyebrow !text-[9.5px]">Evidence</div>
            <pre className="overflow-auto rounded-lg bg-[#fffdf7] p-2.5 font-mono text-[10.5px] leading-[1.55] text-[#3d362b]">{failure.evidence}</pre>
          </div>
        )}
        {failure.fix && <div><div className="eyebrow !text-[9.5px]">How to fix</div><p className="text-[#3d362b]">{failure.fix}</p></div>}
        {failure.retryable !== undefined && (
          <span className={cn("font-mono text-[10px]", failure.retryable ? "text-ok" : "text-mute")}>{failure.retryable ? "Safe to retry as-is" : "Needs a change before retrying"}</span>
        )}
      </div>
    </div>
  );
}
