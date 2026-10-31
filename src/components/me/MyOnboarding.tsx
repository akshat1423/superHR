"use client";
import { useMemo } from "react";
import "@/components/tracker/tracker.css";
import { Badge } from "@/components/tracker/Badge";
import { ServiceList } from "@/components/agents/ServiceList";
import { Glyph } from "@/components/ui/Glyph";
import { useScopedPeople } from "@/components/shell/AuthProvider";
import { countStatus, deriveSteps, fmtDate, missingFields, visibleFields, type FieldKey } from "@/lib/people";
import { PHASES, fmtDay, phaseOf } from "@/lib/workflow";
import { usePeople } from "@/store/people";
import { useProvisioning } from "@/store/provisioning";
import { toast } from "@/store/toast";

const HINT: Partial<Record<FieldKey, string>> = {
  PAN: "Upload a photo of your PAN card",
  Aadhaar: "Upload your Aadhaar (front and back)",
  "Bank a/c": "Add your bank account details or a cancelled cheque",
  Photo: "Upload a clear passport-style photo for your ID card",
  Address: "Confirm your current address",
  "Emergency contact": "Tell us who to call in an emergency",
  Education: "Upload your highest degree certificate",
  "Prev. employer": "Add your previous employer and relieving letter",
  DOB: "Confirm your date of birth",
  Phone: "Add a phone number we can reach you on",
  Email: "Add a personal email",
  Name: "Confirm your full name",
};

/** The new joiner's own page: only their data, what is waiting on them, and plain-language progress. */
export function MyOnboarding() {
  const person = useScopedPeople()[0];
  const submit = usePeople((s) => s.submitField);
  const pr = useProvisioning((s) => (person ? s.run.people.find((r) => r.personId === person.id) : undefined));
  const steps = useMemo(() => (person ? deriveSteps(person) : []), [person]);

  if (!person) {
    return (
      <div className="grid h-full place-items-center px-8">
        <div className="paper-card max-w-[480px] rounded-[22px] bg-paper2 p-8 text-center">
          <b className="text-[20px]">We couldn’t find your onboarding record</b>
          <p className="mt-2 text-[13px] text-mute">Your email isn’t in the latest HR upload. Please contact your HR partner.</p>
        </div>
      </div>
    );
  }

  const first = person.name.split(" ")[0];
  const c = countStatus(steps);
  const total = steps.length;
  const todo = visibleFields(person).filter((k) => person.fields[k] === "missing" || person.fields[k] === "req");
  const candidateSteps = steps.filter((s) => s.owner === "Candidate" && s.status !== "done");
  const until = -person.day;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-20 pt-1.5">
        <h1 className="page-title">Welcome, <i>{first}</i></h1>
        <div className="eyebrow mt-1">
          {person.role} · {person.persona.dept} · {person.day < 0 ? `you join in ${until} day${until === 1 ? "" : "s"}` : person.day === 0 ? "you join today" : `day ${person.day}`} · {fmtDate(person.day)}
        </div>

        <div className="mt-6 grid grid-cols-[400px_1fr] items-start gap-14">
          <div><Badge person={person} steps={steps} buddy="Assigned on day 1" /></div>

          <div className="space-y-4">
            <section className="paper-card rounded-[22px] bg-paper2 p-5">
              <h2 className="text-[19px] font-extrabold tracking-[-.03em]">Waiting on you</h2>
              {todo.length === 0 && candidateSteps.length === 0 ? (
                <p className="mt-2 text-[13.5px] text-[#1d5234]">✓ You’re all set — there’s nothing we need from you right now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-dashed divide-line">
                  {todo.map((k) => (
                    <li key={k} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#e0b455] bg-[#fbefcf] text-[#8a6200]">!</span>
                      <div className="flex-1">
                        <b className="text-[13.5px]">{k}</b>
                        <small className="block text-[12px] text-mute">{person.fields[k] === "req" ? "We’ve emailed you a link — or add it here. " : ""}{HINT[k] ?? `Please provide your ${k}`}</small>
                      </div>
                      <button
                        onClick={() => { submit(person.id, k); toast(`Thanks — we’ve got your ${k}`); }}
                        className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] text-white shadow-[0_2px_0_#8d3a1b]"
                      >
                        Provide
                      </button>
                    </li>
                  ))}
                  {candidateSteps.filter((s) => !["docs"].includes(s.key)).slice(0, 4).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <Glyph k={s.key} size={32} tone="acc" />
                      <div className="flex-1"><b className="text-[13.5px]">{s.title}</b><small className="block text-[12px] text-mute">Due {fmtDay(s.day)}</small></div>
                      <span className="font-mono text-[10.5px] uppercase tracking-[.08em] text-mute">{s.status === "scheduled" ? "coming up" : "to do"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {missingFields(person).length > 0 && <p className="mt-2 font-mono text-[10.5px] text-mute">{missingFields(person).length} item{missingFields(person).length === 1 ? "" : "s"} outstanding — payroll and your ID card can’t be finished without them.</p>}
            </section>

            <section className="paper-card rounded-[22px] bg-paper2 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[19px] font-extrabold tracking-[-.03em]">Your first weeks</h2>
                <span className="font-mono text-[10.5px] text-mute">{c.done} of {total} done</span>
              </div>
              {PHASES.map((ph) => {
                const items = steps.filter((s) => phaseOf(s.day) === ph.name);
                if (!items.length) return null;
                return (
                  <div key={ph.name} className="grid grid-cols-[96px_1fr] gap-3 border-t border-dashed border-line py-3 first:mt-2">
                    <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[.1em]">{ph.name}<small className="mt-0.5 block font-normal normal-case text-mute">{ph.sub}</small></div>
                    <div className="flex flex-wrap gap-[7px]">
                      {items.map((s) => (
                        <span key={s.id} className={`sj-st ${s.status === "blocked" ? "active" : s.status}`} style={{ cursor: "default" }}>
                          <Glyph k={s.key} size={20} />{s.title}<em>{fmtDay(s.day)}</em>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {pr && (
              <section className="paper-card rounded-[22px] bg-paper2 p-5">
                <h2 className="text-[19px] font-extrabold tracking-[-.03em]">What we’re setting up for you</h2>
                <p className="mb-1 mt-0.5 text-[12.5px] text-mute">Email, app access, payroll and more — here’s where each one stands.</p>
                <ServiceList person={person} pr={pr} simple />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
