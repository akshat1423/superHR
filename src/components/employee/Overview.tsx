"use client";
import { useMemo } from "react";
import { Badge } from "@/components/tracker/Badge";
import "@/components/tracker/tracker.css";
import { fmtHuman } from "@/lib/dates";
import { deriveSteps } from "@/lib/people";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { cn } from "@/lib/utils";
import { StateBadge } from "./badges";

const ORDER = { overdue: 0, blocked: 1, pending: 2, completed: 3 } as const;

/** The employee's ID badge next to what matters most right now: readiness, what's next, and who to ask. */
export function Overview({ view, mode, onOpen }: { view: EmployeeView; mode: "staff" | "self"; onOpen: () => void }) {
  const { person, items, states, summary, ready } = view;
  const steps = useMemo(() => deriveSteps(person), [person]);
  const total = items.length;
  const pct = total ? Math.round((summary.completed / total) * 100) : 0;
  const next = [...items]
    .filter((i) => states[i.id] !== "completed")
    .sort((a, b) => ORDER[states[a.id]] - ORDER[states[b.id]] || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);
  const contacts = [...new Map(items.filter((i) => states[i.id] !== "completed").map((i) => [i.owner.email, i.owner])).values()].slice(0, 5);

  return (
    <div className="grid items-start gap-12 text-left lg:grid-cols-[400px_1fr]">
      <div>
        <Badge person={person} steps={steps} buddy="Assigned on day one" />
        <div className="eyebrow mt-6 text-center !text-[10px] !tracking-[.14em]" style={{ color: "#b5ab96" }}>click the badge to flip</div>
      </div>

      <div className="min-w-0">
        <div className="paper-card rounded-[22px] bg-paper2 p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-extrabold tracking-[-.02em]">{ready ? "Ready for day one" : "Getting ready"}</h3>
            <span className="font-mono text-[11px] text-mute">{summary.completed} of {total} done</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e3dbc7]"><div className={cn("h-full rounded-full", ready ? "bg-ok" : "bg-acc")} style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-[12.5px] text-[#4b4338]">
            {ready ? "Everything required before the joining date is complete." : mode === "self" ? "Finish the items below before you join. Each one says who needs what from you." : `${summary.blocked} blocked · ${summary.overdue} overdue · ${summary.pending} pending`}
          </p>
        </div>

        <div className="paper-card mt-4 rounded-[22px] bg-paper2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-extrabold tracking-[-.02em]">{next.length ? "Needs attention" : "Nothing left to do"}</h3>
            <button onClick={onOpen} className="font-mono text-[10.5px] uppercase tracking-[.08em] text-mute underline hover:text-ink">Full checklist →</button>
          </div>
          <ul className="mt-2 divide-y divide-[#e0d8c5]">
            {next.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <StateBadge state={states[i.id]} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{i.item}</span>
                <span className="whitespace-nowrap font-mono text-[10.5px] text-mute">due {fmtHuman(i.dueDate)}</span>
              </li>
            ))}
          </ul>
        </div>

        {contacts.length > 0 && (
          <div className="paper-card mt-4 rounded-[22px] bg-paper2 p-5">
            <h3 className="text-[15px] font-extrabold tracking-[-.02em]">{mode === "self" ? "Who to ask" : "Owners of open items"}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {contacts.map((c) => <a key={c.email} href={`mailto:${c.email}`} className="rounded-full border border-line bg-[#fffdf7] px-3 py-1.5 font-mono text-[11px] text-[#4b4338] hover:border-ink">{c.name} · {c.email}</a>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
