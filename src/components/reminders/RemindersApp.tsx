"use client";
import { useEffect, useMemo, useState } from "react";
import { Seg } from "@/components/ui/Seg";
import { useScopedPeople, useUser } from "@/components/shell/AuthProvider";
import { scopeLabel } from "@/lib/auth/policy";
import { LADDER_LABEL, type Level } from "@/lib/email";
import { deriveSteps } from "@/lib/people";
import { useOutbox } from "@/store/outbox";
import { cn } from "@/lib/utils";
import { OutboxTab } from "./OutboxTab";
import { QueueTab, type QueueItem } from "./QueueTab";
import { ScheduledTab } from "./ScheduledTab";

type Tab = "queue" | "scheduled" | "outbox";
const LADDER_WHEN = ["Due date", "+1 day overdue", "+3 days overdue", "+5 days overdue"];
const LAD_COLORS = ["bg-ink", "bg-warn", "bg-acc", "bg-bad"];

export function RemindersApp() {
  const user = useUser();
  const people = useScopedPeople();
  const { ladder, toggleRung, emails } = useOutbox();
  const [tab, setTab] = useState<Tab>("queue");
  const [provider, setProvider] = useState<{ configured: boolean; redirected: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/email/send").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setProvider(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => people.map((person) => ({ person, steps: deriveSteps(person) })), [people]);
  const items = useMemo(() => {
    const out: QueueItem[] = [];
    for (const { person, steps } of rows)
      for (const step of steps)
        if ((step.status === "blocked" || step.status === "active") && step.owner !== "Auto") out.push({ person, step, overdue: Math.max(0, person.day - step.day) });
    return out.sort((a, b) => Number(b.step.status === "blocked") - Number(a.step.status === "blocked") || b.overdue - a.overdue);
  }, [rows]);
  const scopeIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const outCount = emails.filter((e) => scopeIds.has(e.draft.personId)).length;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[1fr_380px] gap-[26px] px-8 pb-12 pt-1.5">
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="page-title">Email <i>reminders</i></h1>
              <div className="eyebrow mt-1">Generated from every open step · you see {scopeLabel(user)}</div>
            </div>
            <Seg<Tab> value={tab} onChange={setTab} options={[{ value: "queue", label: `Queue · ${items.length}` }, { value: "scheduled", label: "Scheduled" }, { value: "outbox", label: `Outbox · ${outCount}` }]} />
          </div>

          {provider && (
            <div className={cn("mt-3 rounded-xl border px-4 py-2.5 text-[12.5px]", provider.configured ? "border-[#b8d6c1] bg-[#eef4ea] text-[#1d5234]" : "border-[#e6c978] bg-[#fbf3dc] text-[#7a5a00]")}>
              {provider.configured
                ? <><b>Email delivery is live.</b>{provider.redirected ? " Test mode: every message is redirected to the test inbox." : ""}</>
                : <><b>Preview mode.</b> Emails are rendered and logged but not delivered — set <code className="font-mono">RESEND_API_KEY</code> and <code className="font-mono">EMAIL_FROM</code> on the server to send for real.</>}
            </div>
          )}

          <div className="mt-2">
            {tab === "queue" && <QueueTab items={items} />}
            {tab === "scheduled" && <div className="mt-3"><ScheduledTab rows={rows} /></div>}
            {tab === "outbox" && <div className="mt-4"><OutboxTab scopeIds={scopeIds} /></div>}
          </div>
        </div>

        <div className="paper-card h-fit rounded-[22px] bg-paper2 p-[22px] shadow-[0_14px_34px_rgba(107,90,58,.17)]">
          <h3 className="text-xl tracking-[-.03em]">Escalation ladder</h3>
          <div className="eyebrow mb-[18px] mt-1">Each rung is an email · switch rungs off to skip them</div>
          {LADDER_WHEN.map((when, i) => (
            <div key={when} className="relative pb-5 pl-[34px] last:pb-0">
              {i < 3 && <span className="absolute bottom-0 left-[11px] top-6 border-l-2 border-dashed border-[#b7ac94]" />}
              <span className={cn("absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] font-semibold text-white", LAD_COLORS[i])}>{i + 1}</span>
              <button
                aria-label={`toggle ${when}`}
                onClick={() => toggleRung(i as Level)}
                className={cn("relative float-right h-5 w-[34px] rounded-full transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-white after:transition-all", ladder[i] ? "bg-ok after:left-[17px]" : "bg-[#b7ac94]")}
              />
              <b className="text-sm">{when}</b> → {LADDER_LABEL[i as Level]}
              <small className="mb-1.5 mt-0.5 block font-mono text-[11px] text-mute">{["Email the person doing the work", "Email their manager (HR partner for candidates)", "Email the department head", "Email the HR head"][i]}</small>
            </div>
          ))}
          <div className="eyebrow mb-2.5 mt-4">Candidate emails</div>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {[["Magic link, no login", true], ["Reminder every 2 days", true], ["First nudge at T-7", false], ["Quiet hours 8p–9a", false]].map(([l, on]) => (
              <span key={l as string} className={cn("rounded-full border px-[13px] py-1.5", on ? "border-ink bg-ink text-white" : "border-line bg-[#f4efe3]/70 text-[#4b4338]")}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
