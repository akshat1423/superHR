"use client";
import { useMemo, useState } from "react";
import { Glyph } from "@/components/ui/Glyph";
import { deriveSteps, type Person, type PersonStep } from "@/lib/people";
import { fmtDay, personaLabel } from "@/lib/workflow";
import { usePeople } from "@/store/people";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

interface Item { person: Person; step: PersonStep; overdue: number }

const channels = (owner: string) => (owner === "Candidate" ? ["WhatsApp", "Email"] : owner === "IT" || owner === "Manager" ? ["Slack"] : ["Email", "Slack"]);
const LADDER = [
  ["Due date", "Nudge the owner", "Slack DM · or WhatsApp for candidates"],
  ["+1 day overdue", "Owner + their manager", "Slack thread · email"],
  ["+3 days overdue", "Department Head", "Email · adds to weekly digest"],
  ["+5 days overdue", "HR Head + auto-ticket", "Creates Jira / HRMS ticket"],
];
const LAD_COLORS = ["bg-ink", "bg-warn", "bg-acc", "bg-bad"];

export function RemindersApp() {
  const people = usePeople((s) => s.people);
  const sent = usePeople((s) => s.sent);
  const markSent = usePeople((s) => s.markSent);
  const [ladder, setLadder] = useState([true, true, true, true]);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const person of people)
      for (const step of deriveSteps(person))
        if ((step.status === "blocked" || step.status === "active") && step.owner !== "Auto")
          out.push({ person, step, overdue: Math.max(0, person.day - step.day) });
    return out.sort((a, b) => Number(b.step.status === "blocked") - Number(a.step.status === "blocked") || b.overdue - a.overdue);
  }, [people]);

  const late = items.filter((i) => i.step.status === "blocked" || i.overdue > 1);
  const soon = items.filter((i) => !(i.step.status === "blocked" || i.overdue > 1));

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[1fr_400px] gap-[26px] px-8 pb-12 pt-1.5">
        <div>
          <h1 className="page-title">Reminder <i>queue</i></h1>
          <div className="eyebrow mt-1">Generated from every open stamp · escalates up the ladder automatically</div>
          <Group title="Overdue / blocked" items={late} sent={sent} onSend={markSent} />
          <Group title="Due today & tomorrow" items={soon} sent={sent} onSend={markSent} />
          {!items.length && <p className="eyebrow mt-10">Nothing open — every stamp is done 🎉</p>}
        </div>
        <div className="paper-card h-fit rounded-[22px] bg-paper2 p-[22px] shadow-[0_14px_34px_rgba(107,90,58,.17)]">
          <h3 className="text-xl tracking-[-.03em]">Escalation ladder</h3>
          <div className="eyebrow mb-[18px] mt-1">Default for every step · override per block in the builder</div>
          {LADDER.map(([when, who, how], i) => (
            <div key={when} className="relative pb-5 pl-[34px] last:pb-0">
              {i < LADDER.length - 1 && <span className="absolute bottom-0 left-[11px] top-6 border-l-2 border-dashed border-[#b7ac94]" />}
              <span className={cn("absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] font-semibold text-white", LAD_COLORS[i])}>{i + 1}</span>
              <button
                aria-label={`toggle ${when}`}
                onClick={() => setLadder((l) => l.map((v, j) => (j === i ? !v : v)))}
                className={cn("relative float-right h-5 w-[34px] rounded-full transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-white after:transition-all", ladder[i] ? "bg-ok after:left-[17px]" : "bg-[#b7ac94]")}
              />
              <b className="text-sm">{when}</b> → {who}
              <small className="mb-1.5 mt-0.5 block font-mono text-[11px] text-mute">{how}</small>
            </div>
          ))}
          <div className="eyebrow mb-2.5 mt-4">Candidate nudges</div>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {[["WhatsApp every 2d", true], ["Email on T-7", false], ["Magic link, no login", false], ["Quiet hours 8p–9a", false]].map(([l, on]) => (
              <span key={l as string} className={cn("rounded-full border px-[13px] py-1.5", on ? "border-ink bg-ink text-white" : "border-line bg-[#f4efe3]/70 text-[#4b4338]")}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ title, items, sent, onSend }: { title: string; items: Item[]; sent: Record<string, true>; onSend: (k: string) => void }) {
  if (!items.length) return null;
  return (
    <>
      <div className="eyebrow mb-2.5 mt-5 !font-semibold !tracking-[.14em]">{title} · {items.length}</div>
      {items.slice(0, 8).map(({ person, step, overdue }) => {
        const key = `${person.id}:${step.id}`;
        const isSent = !!sent[key];
        const late = step.status === "blocked" || overdue > 2;
        return (
          <div key={key} className={cn("paper-card mb-2.5 flex items-center gap-3.5 rounded-2xl border-l-[5px] bg-paper2 px-4 py-3", isSent ? "border-l-ok opacity-55" : late ? "border-l-bad" : "border-l-acc")}>
            <Glyph k={step.key} size={34} />
            <div className="min-w-0 flex-1">
              <b className="text-sm tracking-[-.01em]">{step.owner === "Candidate" ? person.name.split(" ")[0] : step.owner}: {step.title}</b>
              <small className="mt-0.5 block font-mono text-[10.5px] text-mute">for {person.name} · {personaLabel(person.persona)} · {overdue ? `${overdue}d overdue` : `due ${fmtDay(step.day)}`}{step.note ? ` · ${step.note}` : ""}</small>
            </div>
            <span className="inline-flex gap-1">{channels(step.owner).map((c) => <span key={c} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-[#6b6252]">{c}</span>)}</span>
            <button className="rounded-[9px] border border-line bg-white/50 px-2.5 py-[7px] font-mono text-[10.5px] uppercase tracking-[.08em]" onClick={() => toast("Snoozed 1 day · ladder paused")}>Snooze</button>
            <button className="rounded-[9px] border border-ink bg-ink px-2.5 py-[7px] font-mono text-[10.5px] uppercase tracking-[.08em] text-white" onClick={() => { onSend(key); toast(`Reminder sent via ${channels(step.owner).join(" + ")}`); }}>{isSent ? "Sent ✓" : "Send now"}</button>
          </div>
        );
      })}
    </>
  );
}
