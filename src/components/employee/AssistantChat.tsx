"use client";
import { useEffect, useRef, useState } from "react";
import { resolveOwner } from "@/lib/onboarding/owners";
import { toFacts, type Answer, type Source } from "@/lib/onboarding/assistant";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { useOnboarding } from "@/store/onboarding";
import { cn } from "@/lib/utils";
import { PolicyModal } from "./PolicyModal";

interface Msg { role: "user" | "assistant"; text: string; answer?: Answer }

const SUGGESTED = [
  "Which documents do I need to submit before my joining date?",
  "What is still pending on my checklist?",
  "What time should I arrive on my first day?",
  "How long does background verification take?",
  "When will I get my laptop?",
  "How many days of leave do I get?",
];

/**
 * Ask onboarding questions in plain language. Answers use only the approved policies that apply to this person's
 * country and role plus their own checklist, cite their sources, and say so when something isn't covered.
 */
export function AssistantChat({ view }: { view: EmployeeView }) {
  const { policies, directory } = useOnboarding();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<{ ai: boolean; model: string | null } | null>(null);
  const [open, setOpen] = useState<{ id: string; section?: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/assistant").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setAi(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text }]);
    const e = view.ctx;
    const hr = resolveOwner("HR", { name: e.name, email: e.email, department: e.department, location: e.location, manager: e.manager }, directory);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text, history,
          employee: { name: e.name, role: e.role, department: e.department, location: e.location, country: e.country, grade: e.grade, level: e.level, startDate: e.startDate, manager: e.manager },
          hr, facts: toFacts(view.items, view.states, view.docs), policies,
        }),
      });
      const data = (await res.json()) as Answer & { error?: string };
      if (!res.ok) setMsgs((m) => [...m, { role: "assistant", text: data.error ?? "Something went wrong — please try again." }]);
      else setMsgs((m) => [...m, { role: "assistant", text: data.answer, answer: data }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "I couldn't reach the server. Please try again." }]);
    } finally { setBusy(false); }
  };

  const cite = (s: Source) => {
    if (s.kind === "policy") { const [id, section] = s.id.split(" "); setOpen({ id, section }); }
  };

  return (
    <div className="paper-card flex h-[560px] flex-col rounded-2xl bg-paper2">
      <div className="flex items-center gap-2 border-b border-dashed border-line px-4 py-2.5">
        <b className="text-[14px]">Onboarding assistant</b>
        <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9.5px]", ai?.ai ? "border-[#9fcfae] bg-[#eef4ea] text-[#1d5234]" : "border-[#e6c978] bg-[#fbf3dc] text-[#7a5a00]")}>{ai === null ? "…" : ai.ai ? `AI · ${ai.model}` : "AI off · quotes approved text"}</span>
        <span className="ml-auto font-mono text-[10px] text-mute">answers only from approved policy + your checklist</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
        {msgs.length === 0 && (
          <div>
            <p className="text-[13px] text-[#4b4338]">Ask about documents, deadlines, your first day, IT, leave or policies. I’ll only answer from approved material for <b>{view.ctx.location}</b> and say so when I can’t.</p>
            <div className="mt-3 flex flex-wrap gap-2">{SUGGESTED.map((s) => <button key={s} onClick={() => void ask(s)} className="rounded-full border border-line bg-[#fffdf7] px-3 py-1.5 text-left text-[12px] hover:bg-[#ece4d0]">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed", m.role === "user" ? "bg-ink text-white" : m.answer && !m.answer.covered ? "border border-[#e6c978] bg-[#fbf3dc] text-[#5a4300]" : "border border-line bg-[#fffdf7]")}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.answer && (
                <div className="mt-2 border-t border-dashed border-line pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-mute">{m.answer.mode === "ai" ? "AI answer" : "quoted"} ·</span>
                    {m.answer.citations.length === 0 && <span className="font-mono text-[10px] text-mute">no sources — not covered</span>}
                    {m.answer.citations.map((c) => (
                      <button key={c.id} title={c.text} onClick={() => cite(c)} className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px]", c.kind === "policy" ? "border-[#c9d3e6] bg-[#e8eef9] text-[#2c4a85] hover:bg-[#d9e3f6]" : "border-line bg-[#f4efe3] text-[#4b4338]")}>{c.kind === "policy" ? `📄 ${c.id}` : `✓ ${c.id}`}</button>
                    ))}
                  </div>
                  {m.answer.note && <p className="mt-1.5 font-mono text-[10px] text-mute">{m.answer.note}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="font-mono text-[11px] text-mute">Looking through the approved policies…</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-dashed border-line p-3" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask about your onboarding…" className="sj-input" />
        <button disabled={busy || !q.trim()} className="rounded-xl bg-ink px-4 font-mono text-[11px] uppercase tracking-[.1em] text-white disabled:opacity-40">Ask</button>
      </form>
      {open && <PolicyModal policyId={open.id} section={open.section} onClose={() => setOpen(null)} />}
    </div>
  );
}
