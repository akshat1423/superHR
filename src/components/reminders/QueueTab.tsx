"use client";
import { useState } from "react";
import { Glyph } from "@/components/ui/Glyph";
import { useUser } from "@/components/shell/AuthProvider";
import { draftReminder, LADDER_LABEL, type Draft, type Level } from "@/lib/email";
import type { Person, PersonStep } from "@/lib/people";
import { fmtDay, personaLabel } from "@/lib/workflow";
import { draftKey, useOutbox } from "@/store/outbox";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { EmailPreview } from "./EmailPreview";

export interface QueueItem { person: Person; step: PersonStep; overdue: number }

/** Rung of the escalation ladder this item has reached, skipping rungs HR has switched off. */
function currentLevel(overdue: number, rules: boolean[]): Level {
  let lv: Level = overdue >= 5 ? 3 : overdue >= 3 ? 2 : overdue >= 1 ? 1 : 0;
  while (lv > 0 && !rules[lv]) lv = (lv - 1) as Level;
  return lv;
}

export function QueueTab({ items }: { items: QueueItem[] }) {
  const user = useUser();
  const { emails, send, ladder } = useOutbox();
  const [preview, setPreview] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const late = items.filter((i) => i.step.status === "blocked" || i.overdue > 1);
  const soon = items.filter((i) => !(i.step.status === "blocked" || i.overdue > 1));

  const doSend = async (d: Draft) => {
    const k = draftKey(d);
    setBusy(k);
    const st = await send(d, user.name);
    setBusy(null);
    setPreview(null);
    toast(st === "sent" ? `Email sent to ${d.to.name}` : st === "preview" ? `Rendered for ${d.to.name} — preview mode, nothing delivered` : "Sending failed — see the Outbox tab");
  };

  const group = (title: string, list: QueueItem[]) =>
    list.length === 0 ? null : (
      <>
        <div className="eyebrow mb-2.5 mt-5 !font-semibold !tracking-[.14em]">{title} · {list.length}</div>
        {list.slice(0, 8).map(({ person, step, overdue }) => {
          const draft = draftReminder(person, step, overdue, currentLevel(overdue, ladder));
          const key = draftKey(draft);
          const out = emails.find((e) => e.key === key);
          const severe = step.status === "blocked" || overdue > 2;
          return (
            <div key={`${person.id}:${step.id}`} className={cn("paper-card mb-2.5 flex items-center gap-3.5 rounded-2xl border-l-[5px] bg-paper2 px-4 py-3", out && out.status !== "failed" ? "border-l-ok opacity-60" : severe ? "border-l-bad" : "border-l-acc")}>
              <Glyph k={step.key} size={36} />
              <div className="min-w-0 flex-1">
                <b className="text-sm tracking-[-.01em]">{step.owner === "Candidate" ? person.name.split(" ")[0] : step.owner}: {step.title}</b>
                <small className="mt-0.5 block font-mono text-[10.5px] text-mute">
                  for {person.name} · {personaLabel(person.persona)} · {overdue ? `${overdue}d overdue` : `due ${fmtDay(step.day)}`}{step.note ? ` · ${step.note}` : ""}
                </small>
                <small className="mt-0.5 block truncate font-mono text-[10.5px] text-[#4b4338]">✉ {draft.to.name} &lt;{draft.to.email}&gt; · {LADDER_LABEL[draft.level]}</small>
              </div>
              <button className="rounded-[9px] border border-line bg-white/50 px-2.5 py-[7px] font-mono text-[10.5px] uppercase tracking-[.08em]" onClick={() => setPreview(draft)}>Preview</button>
              <button
                disabled={busy === key || (!!out && out.status !== "failed")}
                className="rounded-[9px] border border-ink bg-ink px-2.5 py-[7px] font-mono text-[10.5px] uppercase tracking-[.08em] text-white disabled:opacity-70"
                onClick={() => doSend(draft)}
              >
                {busy === key || out?.status === "sending" ? "Sending…" : out?.status === "sent" ? "Sent ✓" : out?.status === "preview" ? "Previewed ✓" : out?.status === "failed" ? "Retry" : "Send email"}
              </button>
            </div>
          );
        })}
        {list.length > 8 && <div className="mb-2 font-mono text-[10.5px] text-mute">+{list.length - 8} more not shown</div>}
      </>
    );

  return (
    <>
      {group("Overdue / blocked", late)}
      {group("Due today & tomorrow", soon)}
      {items.length === 0 && <p className="eyebrow mt-10">Nothing open in your scope — every step is done 🎉</p>}
      {preview && (
        <EmailPreview
          draft={preview}
          onClose={() => setPreview(null)}
          onSend={() => doSend(preview)}
          sending={busy === draftKey(preview)}
        />
      )}
    </>
  );
}
