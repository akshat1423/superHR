"use client";
import { useState } from "react";
import type { Person } from "@/lib/people";
import { SERVICES } from "@/lib/services";
import type { PersonRun } from "@/lib/provision";
import { cn } from "@/lib/utils";
import { SIMPLE_LABEL, STATUS_LABEL, STATUS_TEXT, TaskChip } from "./TaskChip";
import { TaskDetail } from "./TaskDetail";

/** The ten services for one person; click any to see what it did or why it failed. */
export function ServiceList({ person, pr, simple, initialOpen }: { person: Person; pr: PersonRun; simple?: boolean; initialOpen?: number | null }) {
  const firstProblem = pr.tasks.findIndex((t) => t.status === "failed");
  const [open, setOpen] = useState<number | null>(initialOpen ?? (simple ? null : firstProblem >= 0 ? firstProblem : null));
  return (
    <div>
      {pr.tasks.map((t, i) => {
        const isOpen = open === i;
        return (
          <div key={SERVICES[i].id} className={cn("border-b border-dashed border-line last:border-0", t.status === "failed" && !simple && "bg-[#fdf0ee]/60")}>
            <button onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center gap-2.5 py-2 text-left">
              <TaskChip t={t} i={i} size={28} simple={simple} />
              <div className="min-w-0 flex-1">
                <b className="text-[13px]">{SERVICES[i].name}</b>
                <small className="block truncate font-mono text-[10.5px] text-mute">
                  {simple
                    ? (t.status === "done" || t.status === "waiting") && t.detail ? t.detail : SERVICES[i].creates
                    : t.status === "failed" && t.failure ? `${t.failure.code} ${t.failure.title}` : t.detail || SERVICES[i].creates}
                </small>
              </div>
              <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[.08em]", STATUS_TEXT[t.status])}>{(simple ? SIMPLE_LABEL : STATUS_LABEL)[t.status]}</span>
              <span className="text-mute">{isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && <div className="pb-3 pl-[38px]"><TaskDetail person={person} pr={pr} si={i} simple={simple} /></div>}
          </div>
        );
      })}
    </div>
  );
}
