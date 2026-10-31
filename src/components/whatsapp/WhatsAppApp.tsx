"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Seg } from "@/components/ui/Seg";
import { todayISO } from "@/lib/dates";
import { buildSnapshot } from "@/lib/whatsapp/snapshot";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";
import { toast } from "@/store/toast";

type Tab = "setup" | "people" | "sim" | "activity";
interface Contact { id: string; kind: "joiner" | "staff"; personId?: string; name: string; email?: string; status: "invited" | "active" | "opted_out"; phone?: string; joinedAt?: string; lastInboundAt?: string; hasSnapshot: boolean; inviteCode?: string; inviteExpiresAt?: string; link?: string | null }
interface Msg { id?: number; at: string; direction: "in" | "out"; phone: string; kind: string; body: string; status?: string; mode: string; meta?: { buttons?: { id: string; title: string }[]; template?: string; error?: string } }
interface Req { id: string; code: string; title: string; toName: string; status: string; createdAt: string; applied: boolean }
interface Overview {
  mode: "live" | "sandbox"; store: "memory" | "supabase"; webhookUrl: string; setupRequired?: boolean;
  config: { token: boolean; phoneNumberId: boolean; verifyToken: boolean; appSecret: boolean; displayNumber: string | null; templates: { notify: string | null; approval: string | null }; live: boolean };
  contacts: Contact[]; requests: Req[]; messages: Msg[];
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "·");
const BTN = "rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0] disabled:opacity-40";
const DARK = "rounded-lg border border-ink bg-ink px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white hover:bg-[#2b261f] disabled:opacity-40";
const Chip = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <span className={cn("rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[.08em]", ok ? "bg-[#e6f1e9] text-[#1d5234]" : "bg-[#fbefcf] text-[#8a6200]")}>{children}</span>;

async function api<T>(path: string, body?: unknown, method = "POST"): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** HR's WhatsApp page: how it is connected, who is on it, a phone to try it with, and what has happened. */
export function WhatsAppApp() {
  const [tab, setTab] = useState<Tab>("setup");
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async (contact?: string | null) => {
    const r = await api<Overview & { error?: string }>(`/api/whatsapp/overview${contact ? `?contact=${contact}` : ""}`);
    if (r.status === 503) { setErr("The WhatsApp tables aren't in Supabase yet. Run `npm run db:sql`, paste the output into the SQL editor, then reload."); return null; }
    if (!r.ok) { setErr("Couldn't load WhatsApp status."); return null; }
    setErr(null); setOv(r.data); return r.data;
  }, []);
  useEffect(() => {
    // the first load runs from a timer, like every later one, so nothing sets state while the effect itself runs
    const first = setTimeout(() => void load(sel), 0);
    const t = setInterval(() => void load(sel), 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, sel]);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-16 pt-1.5">
        <h1 className="page-title">WhatsApp <i>assistant</i></h1>
        <div className="eyebrow mb-4 mt-1">reminders, approvals and questions on the number your team already uses</div>
        {err && <p className="mb-3 rounded-xl border border-[#e9a39c] bg-[#fdf0ee] px-4 py-3 text-[13px] text-[#8c1b14]">{err}</p>}
        <Seg<Tab> value={tab} onChange={setTab} options={[{ value: "setup", label: "Setup" }, { value: "people", label: `People${ov ? ` · ${ov.contacts.filter((c) => c.status === "active").length}` : ""}` }, { value: "sim", label: "Try it" }, { value: "activity", label: "Activity" }]} />
        <div className="mt-5">
          {!ov ? <p className="eyebrow">Loading…</p> : tab === "setup" ? <Setup ov={ov} /> : tab === "people" ? <People ov={ov} reload={() => load(sel)} onTry={(id) => { setSel(id); setTab("sim"); }} /> : tab === "sim" ? <Simulator key={sel ?? "none"} ov={ov} sel={sel} setSel={setSel} reload={load} /> : <Activity ov={ov} />}
        </div>
      </div>
    </div>
  );
}

// ── setup ───────────────────────────────────────────────────────────────────
function Setup({ ov }: { ov: Overview }) {
  const c = ov.config;
  const rows: [string, boolean, string][] = [
    ["WHATSAPP_TOKEN", c.token, "Cloud API access token"], ["WHATSAPP_PHONE_NUMBER_ID", c.phoneNumberId, "the number's id in Meta"],
    ["WHATSAPP_APP_SECRET", c.appSecret, "verifies every call from Meta (required: without it the webhook refuses everything)"], ["WHATSAPP_VERIFY_TOKEN", c.verifyToken, "the word you give Meta when subscribing the webhook"],
    ["WHATSAPP_DISPLAY_NUMBER", !!c.displayNumber, "the number people message, digits only: used for the QR code and join links"],
    ["WHATSAPP_TEMPLATE_NOTIFY", !!c.templates.notify, "approved template for reminders sent outside the 24-hour window"], ["WHATSAPP_TEMPLATE_APPROVAL", !!c.templates.approval, "approved template with Approve / Reject buttons, same purpose"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="paper-card rounded-[22px] bg-paper2 p-5">
        <div className="flex items-center gap-2"><h3 className="text-[17px] font-extrabold tracking-[-.02em]">Connection</h3><Chip ok={ov.mode === "live"}>{ov.mode === "live" ? "live" : "sandbox"}</Chip><Chip ok={ov.store === "supabase"}>{ov.store === "supabase" ? "saved in Supabase" : "memory only"}</Chip></div>
        <p className="mt-1.5 text-[12.5px] text-[#4b4338]">{ov.mode === "live" ? "Messages go out through the WhatsApp Cloud API." : "No WhatsApp credentials are set, so nothing is actually sent. Use “Try it” to see how everything behaves."}{ov.store === "memory" ? " Without Supabase, joined people and requests are lost when the server restarts. Run the SQL (npm run db:sql) before relying on this." : ""}</p>
        <table className="mt-3 w-full border-collapse text-left text-[12px]"><tbody>
          {rows.map(([k, ok, d]) => <tr key={k} className="border-t border-[#e8e0cc]"><td className="py-1.5 pr-2 align-top"><code className="font-mono text-[11px]">{k}</code></td><td className="pr-2 align-top"><Chip ok={ok}>{ok ? "set" : "not set"}</Chip></td><td className="py-1.5 text-[#4b4338]">{d}</td></tr>)}
        </tbody></table>
      </div>
      <div className="space-y-4">
        <div className="paper-card rounded-[22px] bg-paper2 p-5">
          <h3 className="text-[15px] font-extrabold tracking-[-.02em]">Webhook for Meta</h3>
          <p className="mt-1 text-[12.5px] text-[#4b4338]">In Meta → WhatsApp → Configuration, set the callback URL to this, the verify token to your <code>WHATSAPP_VERIFY_TOKEN</code>, and subscribe to <b>messages</b>.</p>
          <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-[#fffdf7] px-2.5 py-2 font-mono text-[11px]">{ov.webhookUrl}</code><button className={BTN} onClick={() => { void navigator.clipboard.writeText(ov.webhookUrl); toast("Copied"); }}>Copy</button></div>
        </div>
        <div className="paper-card rounded-[22px] bg-paper2 p-5">
          <h3 className="text-[15px] font-extrabold tracking-[-.02em]">Sharing a number with another app</h3>
          <p className="mt-1 text-[12.5px] text-[#4b4338]">Meta sends every message for a number to one webhook. To share a number, let the other app’s webhook ask <code>POST /api/whatsapp/route</code> (with <code>WHATSAPP_ROUTER_KEY</code>) whether a sender belongs here, and forward Meta’s body and signature unchanged to the webhook above when it does. People leave with <b>EXIT</b> and the number goes back to the other app.</p>
        </div>
      </div>
    </div>
  );
}

// ── people ──────────────────────────────────────────────────────────────────
function People({ ov, reload, onTry }: { ov: Overview; reload: () => void; onTry: (id: string) => void }) {
  const people = usePeople((s) => s.people);
  const onboarding = useOnboarding();
  const [pick, setPick] = useState("");
  const [staff, setStaff] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = new Set(ov.contacts.filter((c) => c.personId).map((c) => c.personId));
  const joiners = people.filter((p) => !p.terminated && !linked.has(p.id));
  const approvers = useMemo(() => {
    const seen = new Map<string, { name: string; email: string; label: string }>();
    for (const o of onboarding.directory.owners) seen.set(o.email.toLowerCase(), { name: o.name, email: o.email, label: `${o.fn}${o.department !== "*" ? ` · ${o.department}` : ""}` });
    for (const m of onboarding.directory.managers) if (!seen.has(m.email.toLowerCase())) seen.set(m.email.toLowerCase(), { name: m.name, email: m.email, label: `Manager · ${m.department}` });
    const have = new Set(ov.contacts.filter((c) => c.kind === "staff").map((c) => c.email?.toLowerCase()));
    return [...seen.values()].filter((a) => !have.has(a.email.toLowerCase()));
  }, [onboarding.directory, ov.contacts]);

  const inviteJoiner = async () => {
    const p = people.find((x) => x.id === pick); if (!p) return;
    setBusy(true);
    const snapshot = buildSnapshot(p, { items: onboarding.items[p.id] ?? [], docs: onboarding.docs, policies: onboarding.policies, directory: onboarding.directory }, todayISO());
    const r = await api<{ error?: string }>("/api/whatsapp/invite", { kind: "joiner", name: p.name, email: p.email, personId: p.id, dept: p.persona.dept, manager: p.manager, snapshot });
    setBusy(false); setPick(""); toast(r.ok ? `Invite ready for ${p.name.split(" ")[0]}` : r.data.error ?? "Couldn't invite"); reload();
  };
  const inviteStaff = async () => {
    const a = approvers.find((x) => x.email === staff); if (!a) return;
    setBusy(true);
    const r = await api<{ error?: string }>("/api/whatsapp/invite", { kind: "staff", name: a.name, email: a.email });
    setBusy(false); setStaff(""); toast(r.ok ? `Invite ready for ${a.name.split(" ")[0]}` : r.data.error ?? "Couldn't invite"); reload();
  };
  const unlink = async (c: Contact) => { if (!confirm(`Disconnect ${c.name}? Their number is forgotten and they can rejoin only with a new invite.`)) return; await api("/api/whatsapp/unlink", { contactId: c.id }); toast(`${c.name.split(" ")[0]} disconnected`); reload(); };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="paper-card rounded-[22px] bg-paper2 p-5">
          <h3 className="text-[15px] font-extrabold tracking-[-.02em]">Invite a new joiner</h3>
          <p className="mt-1 text-[12.5px] text-[#4b4338]">They can then ask questions and get reminders on WhatsApp. The number is proven by them messaging us, never typed in.</p>
          <div className="mt-3 flex gap-2"><select value={pick} onChange={(e) => setPick(e.target.value)} className="sj-input !py-2 flex-1"><option value="">Choose a joiner…</option>{joiners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.persona.dept}</option>)}</select><button disabled={!pick || busy} onClick={() => void inviteJoiner()} className={DARK}>Invite</button></div>
        </div>
        <div className="paper-card rounded-[22px] bg-paper2 p-5">
          <h3 className="text-[15px] font-extrabold tracking-[-.02em]">Invite an approver</h3>
          <p className="mt-1 text-[12.5px] text-[#4b4338]">Owners and managers from the directory can then approve or reject requests with a tap.</p>
          <div className="mt-3 flex gap-2"><select value={staff} onChange={(e) => setStaff(e.target.value)} className="sj-input !py-2 flex-1"><option value="">Choose a person…</option>{approvers.map((a) => <option key={a.email} value={a.email}>{a.name} · {a.label}</option>)}</select><button disabled={!staff || busy} onClick={() => void inviteStaff()} className={DARK}>Invite</button></div>
        </div>
      </div>
      <div className="paper-card overflow-hidden rounded-[22px] bg-paper2">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead><tr>{["Who", "Kind", "Status", "Number", "Last wrote", ""].map((h) => <th key={h} className="px-3 py-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-mute">{h}</th>)}</tr></thead>
          <tbody>
            {ov.contacts.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-mute">Nobody is connected yet. Invite someone above.</td></tr>}
            {ov.contacts.map((c) => (
              <tr key={c.id} className="border-t border-[#e8e0cc] align-top">
                <td className="px-3 py-2"><b>{c.name}</b><div className="font-mono text-[10.5px] text-mute">{c.email}</div></td>
                <td className="px-3 py-2">{c.kind === "joiner" ? "joiner" : "approver"}</td>
                <td className="px-3 py-2"><Chip ok={c.status === "active"}>{c.status === "invited" ? "invited" : c.status === "active" ? "connected" : "opted out"}</Chip></td>
                <td className="px-3 py-2 font-mono text-[11px]">{c.phone ?? "·"}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{when(c.lastInboundAt)}</td>
                <td className="px-3 py-2 text-right">
                  {c.status === "invited" && c.inviteCode && (
                    <div className="flex flex-col items-end gap-1"><code className="rounded bg-[#ece4d0] px-1.5 py-0.5 font-mono text-[11px]">JOIN {c.inviteCode}</code>
                      <div className="flex gap-1.5">{c.link && <button className={BTN} onClick={() => { void navigator.clipboard.writeText(c.link!); toast("Link copied"); }}>Copy link</button>}<button className={BTN} onClick={() => onTry(c.id)}>Try joining</button></div></div>
                  )}
                  {c.status !== "invited" && <div className="flex justify-end gap-1.5"><button className={BTN} onClick={() => onTry(c.id)}>Try it</button><button className={cn(BTN, "hover:!bg-[#f6d6d2]")} onClick={() => void unlink(c)}>Disconnect</button></div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── simulator ───────────────────────────────────────────────────────────────
function Simulator({ ov, sel, setSel, reload }: { ov: Overview; sel: string | null; setSel: (id: string | null) => void; reload: (c?: string | null) => Promise<Overview | null> }) {
  const c = ov.contacts.find((x) => x.id === sel) ?? null;
  // the panel remounts for each person (see the key), so each starts clean; someone yet to join starts with their JOIN message ready
  const [text, setText] = useState(() => (c?.status === "invited" && c.inviteCode ? `JOIN ${c.inviteCode}` : ""));
  const [fake, setFake] = useState(() => `9198000${Math.floor(10000 + Math.random() * 89999)}`);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<Msg[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const msgs = (chat ?? ov.messages).slice().reverse();
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async (body: { text?: string; buttonId?: string; buttonTitle?: string }) => {
    setBusy(true);
    const r = await api<{ messages?: Msg[]; contactId?: string | null; error?: string }>("/api/whatsapp/simulate", { ...(c?.phone ? { contactId: c.id } : { phone: fake, contactId: c?.id }), ...body });
    setBusy(false);
    if (!r.ok) { toast(r.data.error ?? "Couldn't simulate"); return; }
    setChat(r.data.messages ?? []); setText("");
    if (r.data.contactId && r.data.contactId !== sel) setSel(r.data.contactId);
    void reload(r.data.contactId ?? sel);
  };

  return (
    <div className="grid gap-5 md:grid-cols-[280px_1fr]">
      <div className="paper-card rounded-[22px] bg-paper2 p-4">
        <div className="eyebrow !text-[10px]">write as…</div>
        <ul className="mt-2 space-y-1.5">
          {ov.contacts.length === 0 && <li className="text-[12.5px] text-mute">Invite someone first (People tab).</li>}
          {ov.contacts.map((x) => <li key={x.id}><button onClick={() => setSel(x.id)} className={cn("w-full rounded-lg border px-3 py-2 text-left text-[12.5px]", x.id === sel ? "border-ink bg-ink text-white" : "border-line bg-[#fffdf7] hover:border-ink")}><b>{x.name}</b><span className={cn("block font-mono text-[10px]", x.id === sel ? "text-white/70" : "text-mute")}>{x.kind === "joiner" ? "joiner" : "approver"} · {x.status === "invited" ? "not joined yet" : x.status === "active" ? "connected" : "opted out"}</span></button></li>)}
        </ul>
        <p className="mt-3 text-[11.5px] text-[#6b6252]">This runs the real message handler, with nothing sent to WhatsApp. Try “How long does background verification take?”, STOP, HELP, EXIT, or an approval request.</p>
      </div>
      <div className="paper-card flex h-[560px] flex-col overflow-hidden rounded-[22px] bg-[#e7ddc6]">
        <div className="border-b border-black/10 bg-[#d5cbb3] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[.08em] text-[#4b4338]">{c ? `${c.name}${c.phone ? ` · ${c.phone}` : ""}` : "choose someone on the left"}</div>
        <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
          {!c && <p className="text-[12.5px] text-[#6b6252]">Nothing selected.</p>}
          {c && msgs.length === 0 && <p className="text-[12.5px] text-[#6b6252]">No messages yet.</p>}
          {c && msgs.map((m, i) => (
            <div key={m.id ?? i} className={cn("max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] shadow-sm", m.direction === "in" ? "ml-auto rounded-br-md bg-[#d9f4c8]" : "mr-auto rounded-bl-md bg-white")}>
              {m.meta?.template && <div className="mb-0.5 font-mono text-[9.5px] uppercase text-mute">sent as template · {m.meta.template}</div>}
              {m.body.replace(/\n?\[(Approve · Reject)\]$/, "")}
              {m.meta?.buttons && m.direction === "out" && <div className="mt-2 flex flex-wrap gap-1.5">{m.meta.buttons.map((b) => <button key={b.id} disabled={busy} onClick={() => void send({ buttonId: b.id, buttonTitle: b.title, ...(m.meta?.template ? {} : {}) })} className="rounded-full border border-[#2f8f5b] bg-[#f1faf4] px-3 py-1 text-[12px] text-[#1d5234] hover:bg-[#dbeadf]">{b.title}</button>)}</div>}
              <div className="mt-1 text-right font-mono text-[9.5px] text-mute">{when(m.at)}{m.status === "failed" || m.status === "blocked" ? ` · ${m.status}` : ""}</div>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="flex gap-2 border-t border-black/10 bg-[#d5cbb3] p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send({ text }); }}>
          {c && !c.phone && <input value={fake} onChange={(e) => setFake(e.target.value.replace(/\D/g, ""))} aria-label="phone to write from" className="sj-input !w-[150px] !py-2 font-mono !text-[11px]" />}
          <input disabled={!c} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="sj-input !py-2 flex-1" />
          <button disabled={!c || busy || !text.trim()} className={DARK}>Send</button>
        </form>
      </div>
    </div>
  );
}

// ── activity ────────────────────────────────────────────────────────────────
function Activity({ ov }: { ov: Overview }) {
  return (
    <div className="space-y-5">
      <div className="paper-card overflow-hidden rounded-[22px] bg-paper2">
        <div className="eyebrow px-4 pt-3 !text-[10px]">approval requests</div>
        <table className="w-full border-collapse text-left text-[12.5px]"><thead><tr>{["Request", "Asked", "Code", "Status", "Applied", "When"].map((h) => <th key={h} className="px-3 py-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-mute">{h}</th>)}</tr></thead>
          <tbody>{ov.requests.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-mute">No requests yet. Use “Ask on WhatsApp” on a checklist item.</td></tr>}
            {ov.requests.map((r) => <tr key={r.id} className="border-t border-[#e8e0cc]"><td className="px-3 py-2">{r.title}</td><td className="px-3 py-2">{r.toName}</td><td className="px-3 py-2 font-mono text-[11px]">{r.code}</td><td className="px-3 py-2"><Chip ok={r.status === "approved"}>{r.status}</Chip></td><td className="px-3 py-2">{r.status === "pending" || r.status === "expired" ? "·" : r.applied ? "yes" : "waiting for a browser"}</td><td className="px-3 py-2 font-mono text-[11px]">{when(r.createdAt)}</td></tr>)}</tbody></table>
      </div>
      <div className="paper-card overflow-hidden rounded-[22px] bg-paper2">
        <div className="eyebrow px-4 pt-3 !text-[10px]">recent messages</div>
        <table className="w-full border-collapse text-left text-[12px]"><thead><tr>{["When", "", "Number", "Kind", "Message", "Mode"].map((h) => <th key={h} className="px-3 py-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-mute">{h}</th>)}</tr></thead>
          <tbody>{ov.messages.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-mute">Nothing yet.</td></tr>}
            {ov.messages.map((m, i) => <tr key={m.id ?? i} className="border-t border-[#e8e0cc] align-top"><td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10.5px]">{when(m.at)}</td><td className="px-3 py-1.5">{m.direction === "in" ? "←" : "→"}</td><td className="px-3 py-1.5 font-mono text-[10.5px]">{m.phone}</td><td className="px-3 py-1.5 font-mono text-[10.5px]">{m.kind}</td><td className="max-w-[420px] truncate px-3 py-1.5" title={m.body}>{m.body.replace(/\n/g, " ")}{m.status === "failed" || m.status === "blocked" ? <span className="ml-1 text-bad"> ({m.status}{m.meta?.error ? `: ${m.meta.error}` : ""})</span> : null}</td><td className="px-3 py-1.5 font-mono text-[10.5px]">{m.mode}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
