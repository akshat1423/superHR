import { create } from "zustand";
import type { Draft, LadderRules } from "@/lib/email";
import { usePeople } from "./people";

export type MailStatus = "sending" | "sent" | "preview" | "failed";

export interface OutEmail {
  id: string;
  /** one reminder rung for one step of one person — used to show "already sent" in the queue */
  key: string;
  draft: Draft;
  by: string;
  at: string;
  status: MailStatus;
  note?: string;
}

interface OutboxState {
  emails: OutEmail[];
  /** which escalation rungs are switched on (owner, +manager, dept head, HR head) */
  ladder: LadderRules;
  toggleRung: (i: 0 | 1 | 2 | 3) => void;
  send: (draft: Draft, by: string) => Promise<MailStatus>;
}

const stamp = () => new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
let n = 0;

export const draftKey = (d: Draft) => `${d.personId}:${d.stepId}:${d.level}`;

export const useOutbox = create<OutboxState>((set, get) => ({
  emails: [],
  ladder: [true, true, true, true],
  toggleRung: (i) => set((s) => ({ ladder: s.ladder.map((v, j) => (j === i ? !v : v)) as LadderRules })),
  send: async (draft, by) => {
    const id = `m${++n}`;
    const base: OutEmail = { id, key: draftKey(draft), draft, by, at: stamp(), status: "sending" };
    set((s) => ({ emails: [base, ...s.emails] }));
    const patch = (p: Partial<OutEmail>) => set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
    // also on WhatsApp, to anyone who has joined it: best effort, never blocks or fails the email
    const alsoWhatsApp = async () => {
      const p = usePeople.getState().people.find((x) => x.id === draft.personId);
      if (!p) return;
      try {
        const r = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toEmail: draft.to.email, title: draft.subject.slice(0, 120), body: draft.text.slice(0, 1500), dept: p.persona.dept, manager: p.manager }) });
        const d = (await r.json().catch(() => ({}))) as { sent?: boolean };
        if (d.sent) patch({ note: `${emails()?.note ? `${emails()!.note} · ` : ""}also sent on WhatsApp` });
      } catch { /* the email already went; WhatsApp is a bonus */ }
    };
    const emails = () => get().emails.find((e) => e.id === id);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: draft.to.email, subject: draft.subject, html: draft.html, text: draft.text }),
      });
      const data = (await res.json().catch(() => ({}))) as { mode?: string; note?: string; error?: string; redirectedTo?: string | null };
      void alsoWhatsApp();
      if (data.mode === "sent") { patch({ status: "sent", note: data.redirectedTo ? `Test mode: delivered to ${data.redirectedTo} instead` : undefined }); return "sent"; }
      if (data.mode === "preview") { patch({ status: "preview", note: data.note }); return "preview"; }
      patch({ status: "failed", note: data.error ?? `Request failed (${res.status})` });
      return "failed";
    } catch {
      patch({ status: "failed", note: "Network error" });
      return "failed";
    }
  },
}));
