"use client";
import { useEffect } from "react";
import { todayISO } from "@/lib/dates";
import { applyDecisions, type Decision } from "@/lib/whatsapp/apply";
import { buildSnapshot } from "@/lib/whatsapp/snapshot";
import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";
import { toast } from "@/store/toast";
import { useUserOrNull } from "./AuthProvider";

/**
 * Keeps WhatsApp and the app in step, from whichever signed-in browser has the data (the checklist lives in the browser):
 *  - an answer someone gave on WhatsApp is applied to the checklist, then acknowledged so no other browser repeats it;
 *  - each connected joiner's snapshot is re-sent when their checklist changes, so their answers stay current.
 * Quiet when WhatsApp isn't set up. Renders nothing.
 */
export function WhatsAppSync() {
  const user = useUserOrNull();
  const uid = user?.id;
  const employee = user?.role === "employee";

  // decisions (staff only)
  useEffect(() => {
    if (!uid || employee) return;
    let busy = false, dead = false;
    const tick = async () => {
      if (busy || dead) return;
      busy = true;
      try {
        const res = await fetch("/api/whatsapp/decisions");
        if (!res.ok) return;
        const { decisions } = (await res.json()) as { decisions: Decision[] };
        const { ack, notes } = applyDecisions(decisions);
        for (const n of notes) toast(n);
        if (ack.length) await fetch("/api/whatsapp/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ack }) });
      } catch { /* try again next time */ } finally { busy = false; }
    };
    const first = setTimeout(() => void tick(), 3000);
    const t = setInterval(() => void tick(), 10_000);
    return () => { dead = true; clearTimeout(first); clearInterval(t); };
  }, [uid, employee]);

  // snapshots (staff for their scope, a joiner for themselves)
  useEffect(() => {
    if (!uid) return;
    const pushed = new Map<string, string>();
    let busy = false, dead = false;
    const tick = async () => {
      if (busy || dead) return;
      busy = true;
      try {
        const res = await fetch("/api/whatsapp/sync");
        if (!res.ok) return;
        const { links } = (await res.json()) as { links: { personId: string; status: string }[] };
        const o = useOnboarding.getState();
        const items: { personId: string; snapshot: unknown; sig: string }[] = [];
        for (const l of links) {
          if (l.status !== "active") continue;
          const p = usePeople.getState().people.find((x) => x.id === l.personId);
          if (!p || !o.items[p.id]) continue;
          const snapshot = buildSnapshot(p, { items: o.items[p.id], docs: o.docs, policies: o.policies, directory: o.directory }, todayISO());
          const sig = JSON.stringify([snapshot.employee, snapshot.facts, snapshot.hr, snapshot.policies?.length ?? 0]);
          if (pushed.get(p.id) !== sig) items.push({ personId: p.id, snapshot, sig });
        }
        if (!items.length) return;
        const r = await fetch("/api/whatsapp/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.slice(0, 50).map(({ personId, snapshot }) => ({ personId, snapshot })) }) });
        if (r.ok) for (const it of items.slice(0, 50)) pushed.set(it.personId, it.sig);
      } catch { /* try again next time */ } finally { busy = false; }
    };
    const first = setTimeout(() => void tick(), 4000);
    const t = setInterval(() => void tick(), 30_000);
    return () => { dead = true; clearTimeout(first); clearInterval(t); };
  }, [uid]);

  return null;
}
