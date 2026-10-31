"use client";
import { useEffect, useRef, useState } from "react";
import { useUserOrNull } from "@/components/shell/AuthProvider";
import { scopePeople } from "@/lib/auth/policy";
import { todayISO } from "@/lib/dates";
import { offlineTurn } from "@/lib/agent/offline";
import { WRITE_TOOLS, proposeWrite, runRead, type AgentActions, type AgentData, type WriteProposal } from "@/lib/agent/tools";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/store/onboarding";
import { useOutbox } from "@/store/outbox";
import { usePeople } from "@/store/people";
import { useProvisioning } from "@/store/provisioning";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
type Msg = { role: "user" | "assistant"; content: string | Block[] };
type Ui = { id: number; kind: "user" | "assistant" | "tool" | "confirm" | "note"; text: string; state?: "pending" | "done" | "declined" };

const STAFF_PROMPTS = ["Who is blocked right now?", "Which services failed, and why?", "What needs escalating?", "How long does background verification take?"];
const SELF_PROMPTS = ["What do I still need to do?", "How long does background verification take?", "Which documents do I need to upload?", "What is the probation period?"];
const MAX_ROUNDS = 6;

/** What the agent may see right now: this user's scope of the browser's data, read fresh on every question. */
function snapshot(user: NonNullable<ReturnType<typeof useUserOrNull>>): AgentData {
  const o = useOnboarding.getState();
  return { user, today: todayISO(), people: scopePeople(user, usePeople.getState().people), items: o.items, docs: o.docs, directory: o.directory, policies: o.policies, run: useProvisioning.getState().run };
}

const actions: AgentActions = {
  retryService: (personId, service, by) => useProvisioning.getState().retry(personId, service, by),
  sendEmail: async (draft, by) => {
    const s = await useOutbox.getState().send(draft, by);
    return s === "sent" ? "sent" : s === "preview" ? "previewed (no email provider is configured, so nothing was delivered)" : "failed to send";
  },
};

/** Citations like [POL-04 §1] stand out so it is obvious what an answer rests on. */
function Text({ text }: { text: string }) {
  return <>{text.split(/(\[[A-Z]+-\d+[^\]]*\])/g).map((p, i) => (/^\[[A-Z]+-\d+/.test(p) ? <span key={i} className="rounded bg-[#ecd9d2] px-1 font-mono text-[11px] text-[#7a3b22]">{p}</span> : <span key={i}>{p}</span>))}</>;
}

/**
 * A chat to discuss and act on onboarding: ask about people, checklists, failures and policy. With an API key the
 * model decides which tools to call (they run here, on this person's own scope of the data); without one, an offline
 * router answers from the same tools. Anything that changes something is shown first and needs a click to confirm.
 */
export function AgentChat() {
  const user = useUserOrNull();
  const [open, setOpen] = useState(false);
  const [ui, setUi] = useState<Ui[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"ai" | "offline" | null>(null);
  const history = useRef<Msg[]>([]);
  const confirmRef = useRef<Map<number, (ok: boolean) => void>>(new Map());
  const nextId = useRef(1);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || mode || !user) return;
    fetch("/api/agent/chat").then((r) => (r.ok ? r.json() : null)).then((j: { ai?: boolean } | null) => setMode(j?.ai ? "ai" : "offline")).catch(() => setMode("offline"));
  }, [open, mode, user]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [ui, busy]);

  if (!user) return null;
  const self = user.role === "employee";

  const add = (kind: Ui["kind"], t: string, state?: Ui["state"]) => { const id = nextId.current++; setUi((u) => [...u, { id, kind, text: t, state }]); return id; };
  const settle = (id: number, state: "done" | "declined") => setUi((u) => u.map((m) => (m.id === id ? { ...m, state } : m)));

  /** Show a proposed change and wait for the person's click. */
  const confirm = (p: WriteProposal) => new Promise<boolean>((resolve) => { const id = add("confirm", p.summary, "pending"); confirmRef.current.set(id, (ok) => { settle(id, ok ? "done" : "declined"); resolve(ok); }); });

  const offline = async (q: string, d: AgentData) => {
    const r = offlineTurn(q, d);
    add("assistant", r.text);
    if (r.proposal) {
      if (await confirm(r.proposal)) add("assistant", await r.proposal.run(actions));
      else add("assistant", "Okay, I haven’t done anything.");
    }
  };

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setText(""); setBusy(true);
    add("user", q);
    try {
      const d = snapshot(user);
      if (mode !== "ai") { await offline(q, d); return; }
      history.current = [...history.current, { role: "user" as const, content: q }].slice(-30);
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.current }), signal: AbortSignal.timeout(60_000) }).catch(() => null);
        if (res?.status === 429) { add("note", "You’re asking quickly — give it a minute."); return; }
        if (!res || !res.ok) {
          // model unreachable: answer from the data directly rather than going silent
          history.current = history.current.slice(0, history.current.findLastIndex((m) => m.role === "user" && typeof m.content === "string") + 1);
          add("note", "The AI model isn’t reachable right now — answering from your data and the approved policies instead.");
          await offline(q, d);
          return;
        }
        const out = (await res.json()) as { content: Block[]; stop_reason: string };
        const texts = out.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();
        if (texts) add("assistant", texts);
        history.current = [...history.current, { role: "assistant" as const, content: out.content }];
        const uses = out.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
        if (out.stop_reason !== "tool_use" || !uses.length) return;

        const results: Block[] = [];
        for (const u of uses) {
          const arg = Object.values(u.input).filter((v) => typeof v === "string").join(", ");
          if (WRITE_TOOLS.has(u.name)) {
            const p = proposeWrite(u.name, u.input, d);
            if ("error" in p) { results.push({ type: "tool_result", tool_use_id: u.id, content: p.error, is_error: true }); continue; }
            const ok = await confirm(p);
            results.push({ type: "tool_result", tool_use_id: u.id, content: ok ? await p.run(actions) : "The user declined. Nothing was done." });
          } else {
            add("tool", `${u.name.replace(/_/g, " ")}${arg ? ` · ${arg}` : ""}`);
            const r = runRead(u.name, u.input, d);
            results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r).slice(0, 28_000), ...(r && typeof r === "object" && "error" in r ? { is_error: true } : {}) });
          }
        }
        history.current = [...history.current, { role: "user" as const, content: results }];
      }
      add("note", "That took more steps than I allow in one question. Try asking it more narrowly.");
    } catch {
      add("note", "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const prompts = self ? SELF_PROMPTS : STAFF_PROMPTS;
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Ask superjoin" className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-ink bg-ink px-5 py-3 font-mono text-[12px] uppercase tracking-[.1em] text-white shadow-[0_10px_26px_rgba(0,0,0,.28)] hover:bg-[#2b261f]">
        <span className="text-acc">✦</span>{open ? "Close" : "Ask superjoin"}
      </button>
      {open && (
        <div role="dialog" aria-label="Ask superjoin" className="paper-card fixed bottom-[76px] right-5 z-40 flex h-[min(620px,calc(100vh-110px))] w-[min(430px,calc(100vw-40px))] flex-col overflow-hidden rounded-[22px] bg-paper2 shadow-[0_24px_60px_rgba(60,45,20,.35)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <b className="text-[15px] tracking-[-.02em]">Ask superjoin</b>
            <span title={mode === "ai" ? "A language model decides what to look up and answers from the results" : "Answers come straight from your onboarding data and the approved policies"} className={cn("rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[.08em]", mode === "ai" ? "bg-[#e6f1e9] text-[#1d5234]" : "bg-[#eee8d8] text-[#5b5244]")}>{mode === "ai" ? "AI" : mode === "offline" ? "from your data" : "…"}</span>
            <span className="flex-1" />
            <span className="font-mono text-[10px] text-mute">{self ? "your record" : user.role === "hr" ? "everyone" : user.role === "dept_head" ? "your department" : "your reports"}</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-auto px-4 py-3 text-[13px]">
            {ui.length === 0 && (
              <div className="text-[#4b4338]">
                <p>{self ? "Ask me about your onboarding or company policy." : "Ask about anyone’s progress, what’s failing and why, or policy. I can also retry a failed service or email an escalation — you confirm before anything happens."}</p>
                <div className="mt-3 flex flex-wrap gap-2">{prompts.map((p) => <button key={p} onClick={() => void send(p)} className="rounded-full border border-line bg-[#fffdf7] px-3 py-1.5 text-left text-[12px] hover:border-ink">{p}</button>)}</div>
              </div>
            )}
            {ui.map((m) => m.kind === "user" ? (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-white">{m.text}</div>
            ) : m.kind === "assistant" ? (
              <div key={m.id} className="mr-6 whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-[#fffdf7] px-3.5 py-2 text-[#2b261f]"><Text text={m.text} /></div>
            ) : m.kind === "tool" ? (
              <div key={m.id} className="font-mono text-[10.5px] text-mute">↳ looked up: {m.text}</div>
            ) : m.kind === "note" ? (
              <div key={m.id} className="rounded-lg bg-[#fbefcf] px-3 py-2 text-[12px] text-[#8a6200]">{m.text}</div>
            ) : (
              <div key={m.id} className="rounded-xl border border-[#e58a62] bg-[#fbe9df] px-3.5 py-2.5">
                <div className="eyebrow !text-[9.5px]">{m.state === "pending" ? "Confirm this action" : m.state === "done" ? "Confirmed" : "Declined"}</div>
                <p className="mt-0.5 text-[#3d362b]">{m.text}</p>
                {m.state === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => confirmRef.current.get(m.id)?.(true)} className="rounded-lg border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[.08em] text-white">Confirm</button>
                    <button onClick={() => confirmRef.current.get(m.id)?.(false)} className="rounded-lg border border-line bg-[#fffdf7] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[.08em]">Cancel</button>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="font-mono text-[11px] text-mute">thinking…</div>}
            <div ref={end} />
          </div>

          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={self ? "Ask about your onboarding…" : "Ask about people, failures, policy…"} className="min-w-0 flex-1 rounded-xl border border-line bg-[#fffdf7] px-3 py-2 text-[13px] outline-none focus:border-ink" />
            <button disabled={busy || !text.trim()} className="rounded-xl border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-white disabled:opacity-40">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
