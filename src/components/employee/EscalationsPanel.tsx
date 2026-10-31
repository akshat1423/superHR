"use client";
import { useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { canNudge } from "@/lib/auth/policy";
import { draftEscalation, type Escalation } from "@/lib/onboarding/escalate";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { useOnboarding } from "@/store/onboarding";
import { useOutbox } from "@/store/outbox";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

/**
 * Scenario 5: items that are overdue and holding other things up are escalated to the right person: the owner's
 * department head or the HR owner depending on who owns the item and how late it is. Sending is one click and audited.
 */
export function EscalationsPanel({ view, compact }: { view: EmployeeView; compact?: boolean }) {
  const user = useUser();
  const send = useOutbox((s) => s.send);
  const log = useOnboarding((s) => s.log);
  const [sent, setSent] = useState<Record<string, string>>({});
  const list = view.escalations;
  if (!list.length) return compact ? null : <p className="eyebrow">Nothing to escalate — no overdue item is holding anything up.</p>;

  const go = async (e: Escalation) => {
    const st = await send(draftEscalation(view.ctx, e), user.name);
    setSent((s) => ({ ...s, [e.itemId]: st }));
    log(view.person.id, user.name, "Escalated", `${e.reason} (${st === "sent" ? "email delivered to provider" : st === "preview" ? "email drafted, preview mode" : "email failed"})`);
    toast(st === "failed" ? "Sending failed" : `Escalated to ${e.target.contact.name}`);
  };

  return (
    <div className="space-y-2.5">
      {list.map((e) => (
        <div key={e.itemId} className={cn("paper-card rounded-2xl border-l-[5px] bg-paper2 p-3.5", e.level === 2 ? "border-l-bad" : "border-l-warn")}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[13.5px]">{e.item}</b>
            <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">{e.daysLate}d overdue</span>
            <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[9.5px]">rung {e.level}</span>
            <span className="ml-auto text-[12px]">→ <b>{e.target.contact.name}</b> <span className="text-mute">({e.target.role})</span></span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-[#4b4338]">{e.reason}</p>
          {canNudge(user) && (
            <div className="mt-2 flex items-center gap-2">
              <button disabled={!!sent[e.itemId]} onClick={() => void go(e)} className="rounded-lg bg-ink px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white disabled:opacity-50">{sent[e.itemId] ? (sent[e.itemId] === "sent" ? "Escalated ✓" : sent[e.itemId] === "preview" ? "Drafted ✓ (preview)" : "Failed") : `Escalate to ${e.target.contact.name.split(" ")[0]}`}</button>
              <span className="font-mono text-[10px] text-mute">{e.target.contact.email}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
