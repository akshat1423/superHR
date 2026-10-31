"use client";
import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/tracker/Avatar";
import { Seg } from "@/components/ui/Seg";
import { useUser } from "@/components/shell/AuthProvider";
import { inScope } from "@/lib/auth/policy";
import { daysBetween, fmtHuman, todayISO } from "@/lib/dates";
import { useEmployeeView } from "@/hooks/useEmployeeView";
import { cn } from "@/lib/utils";
import { AssistantChat } from "./AssistantChat";
import { AuditLog } from "./AuditLog";
import { ChecklistView } from "./ChecklistView";
import { DocumentsPanel } from "./DocumentsPanel";
import { EscalationsPanel } from "./EscalationsPanel";
import { ProfileEditor } from "./ProfileEditor";

type Tab = "checklist" | "documents" | "profile" | "escalations" | "activity" | "assistant";

/**
 * One employee's whole onboarding: checklist (with the reason for every item), documents, profile changes,
 * escalations, activity and the assistant. `mode="self"` is the new joiner's own, narrower view.
 */
export function EmployeeRecord({ personId, mode }: { personId: string; mode: "staff" | "self" }) {
  const user = useUser();
  const view = useEmployeeView(personId);
  const [tab, setTab] = useState<Tab>("checklist");
  const [focus, setFocus] = useState<string | null>(null);

  if (!view) return <div className="grid h-full place-items-center px-8"><div className="paper-card max-w-[480px] rounded-[22px] bg-paper2 p-8 text-center"><b className="text-[20px]">Employee not found</b><p className="mt-2 text-[13px] text-mute">They may have been removed in a newer upload.</p><Link href="/tracker" className="mt-4 inline-block rounded-xl border border-line px-4 py-2 font-mono text-[11px] uppercase">Back to the dashboard</Link></div></div>;
  if (mode === "staff" && !inScope(user, view.person)) return <div className="grid h-full place-items-center px-8"><div className="paper-card max-w-[480px] rounded-[22px] bg-paper2 p-8 text-center"><b className="text-[20px]">Not in your scope</b><p className="mt-2 text-[13px] text-mute">You can only open people you manage or lead.</p><Link href="/tracker" className="mt-4 inline-block rounded-xl border border-line px-4 py-2 font-mono text-[11px] uppercase">Back to the dashboard</Link></div></div>;

  const { person, summary } = view;
  const d = daysBetween(todayISO(), person.startDate);
  const when = d > 0 ? `joins in ${d} day${d === 1 ? "" : "s"}` : d === 0 ? "joins today" : `joined ${-d} day${d === -1 ? "" : "s"} ago`;
  const tabs: { value: Tab; label: string }[] = mode === "self"
    ? [{ value: "checklist", label: "My checklist" }, { value: "documents", label: "My documents" }, { value: "assistant", label: "Ask a question" }]
    : [{ value: "checklist", label: "Checklist" }, { value: "documents", label: "Documents" }, { value: "profile", label: "Profile & changes" }, { value: "escalations", label: `Escalations${view.escalations.length ? ` · ${view.escalations.length}` : ""}` }, { value: "activity", label: "Activity" }, { value: "assistant", label: "Assistant" }];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-16 pt-1.5">
        {mode === "staff" && <Link href="/tracker" className="eyebrow !text-[10.5px] hover:text-ink">← Dashboard</Link>}
        <div className="mt-2 flex flex-wrap items-center gap-5">
          <span className="h-[72px] w-[72px] flex-none overflow-hidden rounded-2xl bg-[#f1e6e4]"><Avatar person={person} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="page-title !text-[30px]">{mode === "self" ? <>Welcome, <i>{person.name.split(" ")[0]}</i></> : person.name}</h1>
            <div className="eyebrow mt-1 !normal-case !tracking-[.04em]">
              {person.role} · {person.persona.dept} · {person.location} · grade {person.grade} · {person.persona.type} · reports to {person.manager}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-[#4b4338]">Joining {fmtHuman(person.startDate, true)} · {when}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["done", summary.completed, "text-ok"], ["pending", summary.pending, ""], ["blocked", summary.blocked, "text-bad"], ["overdue", summary.overdue, "text-[#a8620f]"]] as const).map(([l, n, c]) => (
              <div key={l} className="rounded-xl border border-line bg-[#fffdf7] px-3.5 py-2"><b className={cn("block text-[22px] leading-none tracking-[-.03em]", c)}>{n}</b><span className="font-mono text-[9px] uppercase tracking-[.1em] text-mute">{l}</span></div>
            ))}
          </div>
        </div>

        <div className="my-5"><Seg<Tab> value={tab} onChange={setTab} options={tabs} /></div>

        {tab === "checklist" && <ChecklistView view={view} mode={mode} onUpload={(id) => { setFocus(id); setTab("documents"); }} />}
        {tab === "documents" && <DocumentsPanel view={view} mode={mode} focusItemId={focus} />}
        {tab === "profile" && <ProfileEditor view={view} />}
        {tab === "escalations" && <EscalationsPanel view={view} />}
        {tab === "activity" && <div className="max-w-[760px]"><AuditLog personId={person.id} /></div>}
        {tab === "assistant" && <div className="max-w-[760px]"><AssistantChat view={view} /></div>}
      </div>
    </div>
  );
}
