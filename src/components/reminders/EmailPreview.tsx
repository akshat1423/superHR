"use client";
import { useEffect, useState } from "react";
import type { Draft } from "@/lib/email";
import { LADDER_LABEL } from "@/lib/email";
import { cn } from "@/lib/utils";

/** What the recipient will actually receive: headers, the rendered HTML (sandboxed), and the plain-text part. */
export function EmailPreview({ draft, note, onClose, onSend, sendLabel = "Send email", sending }: {
  draft: Draft;
  note?: string;
  onClose: () => void;
  onSend?: () => void;
  sendLabel?: string;
  sending?: boolean;
}) {
  const [view, setView] = useState<"html" | "text">("html");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-[#17130e]/45 p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="paper-card flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-[22px] bg-paper2 shadow-[0_30px_70px_rgba(40,30,10,.4)]">
        <div className="border-b border-dashed border-line px-5 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-0.5 text-[12.5px]">
              <div><span className="inline-block w-14 font-mono text-[10.5px] uppercase tracking-[.08em] text-mute">From</span>superjoin &lt;reminders@acme.com&gt;</div>
              <div><span className="inline-block w-14 font-mono text-[10.5px] uppercase tracking-[.08em] text-mute">To</span><b>{draft.to.name}</b> &lt;{draft.to.email}&gt; <span className="font-mono text-[10px] text-mute">· {draft.to.label}</span></div>
              <div className="pt-1 text-[15px] font-bold tracking-[-.01em]">{draft.subject}</div>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 font-mono text-[11px]">esc</button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-[#4b4338]">ladder: {LADDER_LABEL[draft.level]}</span>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-[#4b4338]">{draft.kind}</span>
            <span className="flex-1" />
            {(["html", "text"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-2 py-0.5 font-mono text-[10px] uppercase", view === v ? "bg-ink text-white" : "text-mute")}>{v}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-[#e8e0cf]">
          {view === "html" ? (
            <iframe title="Email preview" sandbox="" srcDoc={draft.html} className="h-[400px] w-full border-0" />
          ) : (
            <pre className="h-[400px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[12px] leading-relaxed text-[#3d362b]">{draft.text}</pre>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-dashed border-line px-5 py-3">
          <span className="min-w-0 flex-1 font-mono text-[10.5px] text-mute">{note ?? "Sent from the reminder service — recipients can reply to HR Operations."}</span>
          <button onClick={onClose} className="rounded-xl border border-white/60 bg-[#f7f3ea] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] shadow-[0_2px_0_#b9ae96]">Close</button>
          {onSend && (
            <button disabled={sending} onClick={onSend} className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] text-white shadow-[0_2px_0_#8d3a1b] disabled:opacity-60">
              {sending ? "Sending…" : sendLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
