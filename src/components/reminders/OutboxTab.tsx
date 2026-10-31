"use client";
import { useState } from "react";
import { LADDER_LABEL } from "@/lib/email";
import { useOutbox, type MailStatus, type OutEmail } from "@/store/outbox";
import { cn } from "@/lib/utils";
import { EmailPreview } from "./EmailPreview";

const STATUS: Record<MailStatus, { label: string; cls: string }> = {
  sending: { label: "Sending…", cls: "bg-[#e3dcc8] text-[#5b5244]" },
  sent: { label: "Delivered to provider", cls: "bg-[#dbeadf] text-[#1d5234]" },
  preview: { label: "Preview only · not delivered", cls: "bg-[#fbefcf] text-[#8a6200]" },
  failed: { label: "Failed", cls: "bg-[#f6d6d2] text-[#8c1b14]" },
};

/** Emails sent from this dashboard, newest first, each with its true delivery status. */
export function OutboxTab({ scopeIds }: { scopeIds: Set<string> }) {
  const all = useOutbox((s) => s.emails);
  const [open, setOpen] = useState<OutEmail | null>(null);
  const emails = all.filter((e) => scopeIds.has(e.draft.personId));

  if (emails.length === 0) return <p className="eyebrow mt-10 !leading-relaxed">Nothing sent yet. Send a reminder from the Queue tab and it will appear here with its delivery status.</p>;
  return (
    <>
      {emails.map((e) => (
        <button key={e.id} onClick={() => setOpen(e)} className="paper-card mb-2 flex w-full items-center gap-3 rounded-xl bg-paper2 px-3.5 py-2.5 text-left hover:bg-[#f9f5ea]">
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[13px] tracking-[-.01em]">{e.draft.subject}</b>
            <small className="block truncate font-mono text-[10.5px] text-mute">to {e.draft.to.name} &lt;{e.draft.to.email}&gt; · {LADDER_LABEL[e.draft.level]} · by {e.by} · {e.at}</small>
          </div>
          <span className={cn("rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold", STATUS[e.status].cls)}>{STATUS[e.status].label}</span>
        </button>
      ))}
      {open && <EmailPreview draft={open.draft} note={open.note ?? STATUS[open.status].label} onClose={() => setOpen(null)} />}
    </>
  );
}
