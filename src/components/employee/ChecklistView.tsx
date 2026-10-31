"use client";
import { useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { fmtHuman } from "@/lib/dates";
import { blockers } from "@/lib/onboarding/status";
import type { ChecklistItem } from "@/lib/onboarding/types";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { useOnboarding } from "@/store/onboarding";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { DocBadge, StateBadge } from "./badges";
import { PolicyModal } from "./PolicyModal";

const KIND: Record<string, string> = { document: "Document", activity: "Activity", record: "HR record", provision: "Provisioning", policy: "Policy", approval: "Approval" };

/**
 * The full checklist for one person: every item with its owner, due date, state, what it is waiting on, and the
 * rule that put it there. `mode="self"` is the new joiner's own view (acknowledge policies, upload documents).
 */
export function ChecklistView({ view, mode, onUpload }: { view: EmployeeView; mode: "staff" | "self"; onUpload?: (itemId: string) => void }) {
  const user = useUser();
  const { completeItem, acknowledge } = useOnboarding();
  const [open, setOpen] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{ id: string; section?: string } | null>(null);
  const { items, states, docs, summary, person } = view;

  const canAct = (i: ChecklistItem) => mode === "staff" && (user.role === "hr" || user.role === "dept_head" || (user.role === "manager" && i.ownerFn === "Manager"));
  const canAsk = (i: ChecklistItem) => mode === "staff" && (user.role === "hr" || user.role === "dept_head") && (i.kind === "approval" || i.kind === "provision") && i.status !== "completed";
  const askWhatsApp = async (i: ChecklistItem) => {
    const res = await fetch("/api/whatsapp/requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: person.id, itemId: i.id, toEmail: i.owner.email, title: `${i.item}: ${person.name}`, body: `${person.name} (${person.role}, ${person.persona.dept}) joins on ${fmtHuman(person.startDate)}. ${i.reason}`, dept: person.persona.dept, manager: person.manager }),
    }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; via?: string; mode?: string; reason?: string; detail?: string; setupRequired?: boolean } | null;
    if (!res || !d) { toast("Couldn't reach the server"); return; }
    if (res.status === 503) { toast("WhatsApp isn't set up on the server yet (run the SQL first)"); return; }
    if (d.ok) toast(d.duplicate ? `Already asked ${i.owner.name.split(" ")[0]}: waiting for their answer` : `Asked ${i.owner.name.split(" ")[0]} on WhatsApp${d.mode === "sandbox" ? " (sandbox: not actually sent)" : d.via === "template" ? " (as a template message)" : ""}`);
    else toast(d.detail ?? "Couldn't ask on WhatsApp");
  };
  const act = (i: ChecklistItem) => {
    const r = completeItem(person.id, i.id, user.name);
    toast(r.ok ? `${i.item}: done` : (r.reason ?? "Can't complete this yet"));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([["completed", summary.completed], ["pending", summary.pending], ["blocked", summary.blocked], ["overdue", summary.overdue]] as const).map(([s, n]) => (
          <span key={s} className="flex items-center gap-2 rounded-xl border border-line bg-[#fffdf7] px-3 py-1.5"><StateBadge state={s} /><b className="text-[15px]">{n}</b></span>
        ))}
        <span className={cn("ml-auto rounded-xl border px-3 py-1.5 text-[12.5px]", view.ready ? "border-[#9fcfae] bg-[#eef4ea] text-[#1d5234]" : "border-[#e6c978] bg-[#fbf3dc] text-[#7a5a00]")}>
          {view.ready ? "✓ Ready for day one" : `${summary.beforeJoining.total - summary.beforeJoining.done} of ${summary.beforeJoining.total} pre-joining items still open`}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-[#fffdf7]">
        {items.map((i, idx) => {
          const st = states[i.id];
          const doc = docs[i.id];
          const waiting = blockers(i, items, states, docs);
          const crossing = idx > 0 && items[idx - 1].dueDate <= person.startDate && i.dueDate > person.startDate;
          return (
            <div key={i.id}>
              {(idx === 0 || crossing) && <div className="border-b border-line bg-[#e9e1cd] px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-[#4b4338]">{i.dueDate <= person.startDate ? `Before joining (${fmtHuman(person.startDate)})` : "After joining"}</div>}
              <div className={cn("grid grid-cols-[104px_1fr_150px_108px_150px] items-center gap-3 border-b border-[#eee6d3] px-4 py-2.5 last:border-0", st === "blocked" && "bg-[#fdf0ee]/50")}>
                <StateBadge state={st} />
                <div className="min-w-0">
                  <button className="text-left" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    <b className="text-[13.5px] tracking-[-.01em]">{i.item}</b>
                    <span className="ml-2 font-mono text-[10px] text-mute">{KIND[i.kind]}{i.ticket ? ` · ${i.ticket}` : ""}</span>
                  </button>
                  {waiting.length > 0 && <div className="font-mono text-[10.5px] text-bad">Waiting on: {waiting.map((w) => w.item).join(", ")}</div>}
                  {i.docType && <div className="mt-0.5"><DocBadge status={doc?.status ?? "Not Submitted"} /></div>}
                </div>
                <div className="min-w-0 text-[12px]"><div className="truncate font-semibold">{i.owner.name}</div><div className="font-mono text-[10px] text-mute">{i.ownerFn}</div></div>
                <div className="font-mono text-[11px]">{fmtHuman(i.dueDate)}</div>
                <div className="text-right">
                  {mode === "self" && i.kind === "policy" && i.status !== "completed" && <button className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white" onClick={() => { acknowledge(person.id, i.id, user.name); toast(`Acknowledged: ${i.item}`); }}>Acknowledge</button>}
                  {mode === "self" && i.kind === "document" && i.status !== "completed" && <button className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white" onClick={() => onUpload?.(i.id)}>{doc && doc.status !== "Not Submitted" ? "Re-upload" : "Upload"}</button>}
                  {mode === "staff" && i.kind === "document" && <button className="rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em]" onClick={() => onUpload?.(i.id)}>{doc && doc.status !== "Not Submitted" ? "Review" : "Open"}</button>}
                  {mode === "staff" && i.kind === "policy" && i.status !== "completed" && <span className="font-mono text-[10px] text-mute">awaiting employee</span>}
                  {mode === "staff" && i.kind === "record" && i.status !== "completed" && <span className="font-mono text-[10px] text-mute">created by agent</span>}
                  {canAct(i) && ["activity", "approval", "provision"].includes(i.kind) && i.status !== "completed" && (
                    <button disabled={waiting.length > 0 || (i.kind === "provision" && i.status === "pending")} className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white disabled:opacity-40" onClick={() => act(i)}>
                      {i.kind === "approval" ? "Approve" : i.kind === "provision" ? "Fulfilled" : "Mark done"}
                    </button>
                  )}
                  {canAsk(i) && <button disabled={waiting.length > 0} title={`Send ${i.owner.name.split(" ")[0]} an Approve / Reject request on WhatsApp`} className="mt-1 block w-full rounded-lg border border-[#5d9a73] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.08em] text-[#1d5234] hover:bg-[#dbeadf] disabled:opacity-40" onClick={() => void askWhatsApp(i)}>Ask on WhatsApp</button>}
                </div>
              </div>
              {open === i.id && (
                <div className="border-b border-[#eee6d3] bg-[#faf6ea] px-4 py-3 text-[12.5px] text-[#3d362b]">
                  <div className="eyebrow !text-[9.5px]">Why this is on the checklist</div>
                  <p className="mt-0.5">{i.reason}</p>
                  {i.policy && <button className="mt-2 rounded-full border border-line bg-[#fffdf7] px-3 py-1 font-mono text-[10.5px] hover:bg-[#ece4d0]" onClick={() => setPolicy({ id: i.policy! })}>📄 Read {i.policy}</button>}
                  {i.dependsOn.length > 0 && <p className="mt-2 font-mono text-[10.5px] text-mute">Needs first: {i.dependsOn.map((d) => items.find((x) => x.id === d)?.item).filter(Boolean).join("; ")}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {policy && <PolicyModal policyId={policy.id} section={policy.section} onClose={() => setPolicy(null)} />}
    </div>
  );
}
