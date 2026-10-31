"use client";
import { useRouter } from "next/navigation";
import { Glyph } from "@/components/ui/Glyph";
import { countStatus, missingFields, visibleFields, type FieldKey, type Person, type PersonStep, type Status } from "@/lib/people";
import { PHASES, fmtDay, phaseOf } from "@/lib/workflow";
import { usePeople } from "@/store/people";
import { useBuilder } from "@/store/builder";
import { toast } from "@/store/toast";

const NEXT: Record<Status, Status> = { scheduled: "active", active: "done", done: "scheduled", blocked: "active" };

export function Journey({ person, steps }: { person: Person; steps: PersonStep[] }) {
  const router = useRouter();
  const setStepStatus = usePeople((s) => s.setStepStatus);
  const advanceField = usePeople((s) => s.advanceField);
  const loadPersona = useBuilder((s) => s.loadPersona);
  const c = countStatus(steps);
  const next = steps.filter((s) => s.status === "scheduled").sort((a, b) => a.day - b.day)[0];
  const missing = missingFields(person);

  const onField = (k: FieldKey) => {
    const cur = person.fields[k];
    if (cur === "missing") toast(`Magic link sent to ${person.name.split(" ")[0]} (WhatsApp + email) for “${k}”`);
    else if (cur === "req") toast(`${person.name.split(" ")[0]} submitted “${k}” — dependent steps unblocked`);
    else return;
    advanceField(person.id, k);
  };

  return (
    <div className="paper-card rounded-[22px] bg-paper2 px-6 py-[22px] shadow-[0_14px_34px_rgba(107,90,58,.17)]">
      <div className="mb-1.5 flex items-start justify-between">
        <div>
          <h3 className="text-[22px] tracking-[-.03em]">Onboarding journey</h3>
          <small className="eyebrow mt-0.5 block !text-[10.5px] !tracking-[.1em]">{person.persona.type} · {person.persona.dept} · {person.persona.level} workflow · {steps.length} stamps</small>
        </div>
        <button className="rounded-[10px] border border-white/60 bg-[#f7f3ea] px-3 py-[9px] font-mono text-[11px] uppercase tracking-[.12em] shadow-[0_2px_0_#b9ae96]" onClick={() => { loadPersona(person.persona); router.push("/builder"); }}>
          Open workflow ↗
        </button>
      </div>

      <div className="mb-1 mt-3 flex gap-2">
        {([["done", "stamped", "#dbeadf", "#b8d6c1"], ["active", "in progress", "#f5dccf", "#e6b9a3"], ["blocked", "blocked", "#f4d0cc", "#e4a8a1"], ["scheduled", "scheduled", "transparent", "#cfc6b2"]] as const).map(([k, l, bg, bd]) => (
          <div key={k} className="flex-1 rounded-xl border px-[11px] py-[9px]" style={{ background: bg, borderColor: bd, borderStyle: k === "scheduled" ? "dashed" : "solid" }}>
            <b className="block text-[22px] leading-none tracking-[-.03em]">{c[k]}</b>
            <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{l}</span>
          </div>
        ))}
      </div>
      {next && <div className="eyebrow mt-2 !text-[10px] !tracking-[.14em]" style={{ color: "#b5ab96" }}>Next up: {next.title} · {fmtDay(next.day)}</div>}

      {PHASES.map((ph) => {
        const items = steps.filter((s) => phaseOf(s.day) === ph.name);
        if (!items.length) return null;
        return (
          <div key={ph.name} className="grid grid-cols-[104px_1fr] gap-3 border-t border-dashed border-line py-3">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[.1em]">
              {ph.name}<small className="mt-0.5 block font-normal normal-case tracking-[.04em] text-mute">{ph.sub}</small>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {items.map((s) => (
                <span key={s.id} className={`sj-st ${s.status}`} onClick={() => setStepStatus(person.id, s.id, NEXT[s.status])}>
                  <Glyph k={s.key} size={20} />{s.title}<em>{fmtDay(s.day)}</em>
                  <span className="tip">{s.owner}{s.perm ? ` · ${s.perm}` : ""}{s.note ? ` · ${s.note}` : ""} — click to advance</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-3.5 border-t border-dashed border-line pt-3.5">
        <h4 className="eyebrow mb-2.5 flex justify-between !text-[10.5px] !font-semibold !tracking-[.14em]">
          <span>Data check · CSV vs missing</span>
          <span style={{ color: missing.length ? "var(--color-bad)" : "var(--color-ok)" }}>{missing.length ? `${missing.length} to collect` : "complete ✓"}</span>
        </h4>
        <div className="mb-2.5 flex gap-3.5 font-mono text-[10px] text-mute">
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ink" />from ATS CSV</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok" />filled by candidate</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-warn" />requested</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-dashed border-bad" />missing</span>
        </div>
        {visibleFields(person).map((k) => {
          const st = person.fields[k] ?? "missing";
          return (
            <span key={k} className={`sj-fd ${st}`} onClick={() => onField(k)}>
              {st === "ats" ? "● " : st === "cand" ? "✓ " : st === "req" ? "⏳ " : "＋ "}{k}{st === "missing" ? " · request" : st === "req" ? " · awaiting" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
