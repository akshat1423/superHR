"use client";
import { useOnboarding } from "@/store/onboarding";
import { cn } from "@/lib/utils";

/** Every action on this person's onboarding — who did what and when. The agent's own actions are marked. */
export function AuditLog({ personId }: { personId: string }) {
  const entries = useOnboarding((s) => s.audit).filter((a) => a.personId === personId);
  if (!entries.length) return <p className="eyebrow mt-6">No activity yet. Uploads, reviews, approvals and changes will appear here.</p>;
  return (
    <ol className="space-y-2">
      {entries.slice(0, 200).map((a) => (
        <li key={a.id} className="flex gap-3 rounded-xl border border-line bg-[#fffdf7] px-3.5 py-2.5">
          <span className={cn("mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full font-mono text-[9px] font-bold", a.actor === "Onboarding agent" ? "bg-[#2c4a85] text-white" : "bg-ink text-white")}>{a.actor === "Onboarding agent" ? "AI" : a.actor.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2"><b className="text-[13px]">{a.action}</b><span className="font-mono text-[10.5px] text-mute">{a.actor} · {new Date(a.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
            {a.detail && <p className="mt-0.5 whitespace-pre-line text-[12.5px] text-[#4b4338]">{a.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
