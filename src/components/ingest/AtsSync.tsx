"use client";
import { useRef, useState } from "react";
import { ATS_LIST, ATS_PROVIDERS, CANON, type AtsId } from "@/lib/ats/providers";
import type { Loaded } from "@/lib/onboarding/datasets";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Line { text: string; kind: "info" | "ok" | "error" }
interface PageAnswer { ok: boolean; mode: "sandbox" | "live"; request: string; status: number; ms: number; payload?: unknown; records?: number; hasNext?: boolean; error?: string }

const DEMO_TOKEN = "demo-8f3a1c9d2b7e";
const MAX_PAGES = 30;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull new joiners straight from an applicant-tracking system instead of a file. The browser asks our server for each
 * page of the vendor's API (see api/ats), maps the vendor payload to joiner fields, and hands the result to the same
 * validation as an upload. The log shows what was actually requested and returned.
 */
export function AtsSync({ onLoaded, busy }: { onLoaded: (loaded: Loaded, label: string) => { ready: number; skipped: number }; busy: boolean }) {
  const [id, setId] = useState<AtsId>("greenhouse");
  const [tenant, setTenant] = useState<Record<AtsId, string>>({ greenhouse: "harvest.greenhouse.io", lever: "api.lever.co", workday: "acme" });
  const [token, setToken] = useState(DEMO_TOKEN);
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"sandbox" | "live" | null>(null);
  const [lastSync, setLastSync] = useState<Partial<Record<AtsId, { at: string; n: number }>>>({});
  const logEnd = useRef<HTMLDivElement>(null);
  const p = ATS_PROVIDERS[id];

  const push = (text: string, kind: Line["kind"] = "info") => { setLines((l) => [...l, { text, kind }]); setTimeout(() => logEnd.current?.scrollIntoView({ block: "end" }), 0); };

  const run = async () => {
    setRunning(true); setLines([]); setMode(null);
    const rows: Record<string, string>[] = [];
    try {
      push(`Connecting to ${p.name} (${tenant[id] || p.tenantPlaceholder})…`);
      await wait(350);
      push("Authenticating with the API key…");
      await wait(300);
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetch(`/api/ats/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: tenant[id], token, page }), signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { push(res.status === 403 ? "Only HR can sync from the ATS." : `Our server refused the request (${res.status}).`, "error"); return; }
        const a = (await res.json()) as PageAnswer;
        setMode(a.mode);
        push(`${a.request}`);
        await wait(250);
        if (!a.ok) { push(`→ ${a.status} · ${a.error ?? "request failed"}`, "error"); push(a.status === 401 ? "Check the API key. In the demo tenant any key of 8+ characters works." : "Nothing was imported. Try again, or upload a file instead.", "info"); return; }
        const got = p.fromPage(a.payload);
        rows.push(...got);
        push(`→ ${a.status} · ${a.records ?? got.length} ${p.noun} · ${a.ms} ms`, "ok");
        if (!a.hasNext || !got.length) break;
        await wait(200);
      }
      push(`Mapped ${rows.length} candidates from ${p.name}'s fields to superjoin's (${p.name === "Workday" ? "Worker, Hire_Date, Supervisory_Organization…" : p.id === "lever" ? "name, hiredOn, categories.team…" : "candidate, offer.starts_at, jobs[0].departments…"}).`, "ok");
      await wait(300);
      setLastSync((s) => ({ ...s, [id]: { at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), n: rows.length } }));
      if (!rows.length) { push(`${p.name} has no ${p.noun} to import.`, "info"); return; }
      push("Checking every record against the directory…");
      await wait(250);
      const out = onLoaded({ name: `${p.name} · ${tenant[id] || p.tenantPlaceholder}`, format: "json", tabular: { headers: [...CANON], rows } }, `${p.name} sync`);
      if (out.skipped) push(`${out.skipped} already onboarding (same email), skipped.`);
      if (out.ready) push(`${out.ready} new joiner${out.ready === 1 ? "" : "s"} ready to review →`, "ok");
      else push(out.skipped ? "Already up to date: everyone in the ATS is already onboarding, so nothing new to import." : "Nothing could be imported — see the message below.", out.skipped ? "info" : "error");
    } catch {
      push("The connection dropped before it finished. Nothing was imported.", "error");
    } finally { setRunning(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="paper-card rounded-[22px] bg-paper2 p-5">
        <div className="eyebrow !text-[10px]">1 · choose your ATS</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ATS_LIST.map((a) => (
            <button key={a.id} onClick={() => { setId(a.id); setLines([]); setMode(null); }} className={cn("rounded-xl border px-3 py-3 text-left transition", id === a.id ? "border-ink bg-ink text-white" : "border-line bg-[#fffdf7] hover:border-ink")}>
              <b className="block text-[14px] tracking-[-.02em]">{a.name}</b>
              <span className={cn("font-mono text-[9.5px]", id === a.id ? "text-white/70" : "text-mute")}>{lastSync[a.id] ? `synced ${lastSync[a.id]!.at} · ${lastSync[a.id]!.n}` : "not connected"}</span>
            </button>
          ))}
        </div>

        <div className="eyebrow mt-5 !text-[10px]">2 · connection</div>
        <label className="mt-2 block font-mono text-[10.5px] text-mute">{p.tenantLabel}
          <input value={tenant[id]} onChange={(e) => setTenant((t) => ({ ...t, [id]: e.target.value }))} placeholder={p.tenantPlaceholder} className="mt-1 block w-full rounded-lg border border-line bg-[#fffdf7] px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink" />
        </label>
        <label className="mt-3 block font-mono text-[10.5px] text-mute">{p.tokenLabel}
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" className="mt-1 block w-full rounded-lg border border-line bg-[#fffdf7] px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink" />
        </label>
        <p className="mt-2 text-[11.5px] text-[#6b6252]">Demo tenant: any key of 8+ characters connects; type <code className="rounded bg-[#ece4d0] px-1">invalid</code> to see a rejected key. To sync a real tenant, set <code className="rounded bg-[#ece4d0] px-1">{p.env.url}</code> and <code className="rounded bg-[#ece4d0] px-1">{p.env.token}</code> on the server.</p>

        <div className="mt-4 flex items-center gap-3">
          <Button accent disabled={running || busy || token.trim().length === 0} onClick={() => void run()} className="!px-5 !py-3">{running ? "Syncing…" : `Connect & fetch from ${p.name} →`}</Button>
          {mode && <span className={cn("rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[.08em]", mode === "live" ? "bg-[#e6f1e9] text-[#1d5234]" : "bg-[#eee8d8] text-[#5b5244]")}>{mode === "live" ? "live tenant" : "demo tenant"}</span>}
        </div>
        <p className="mt-3 text-[11.5px] text-[#6b6252]">Only candidates marked <b>hired</b> with an accepted offer are read. People already onboarding (same email) are skipped, so syncing again only brings in new joiners.</p>
      </div>

      <div className="flex min-h-[320px] flex-col overflow-hidden rounded-[22px] bg-[#1f1b16] text-[#e9e1cd] shadow-[0_10px_26px_rgba(107,90,58,.25)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[.1em] text-[#a99d86]">
          <span className={cn("h-2 w-2 rounded-full", running ? "animate-pulse bg-acc" : lines.some((l) => l.kind === "error") ? "bg-bad" : lines.length ? "bg-ok" : "bg-[#5b5244]")} />
          {p.name} sync log
        </div>
        <div className="flex-1 space-y-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-[1.6]">
          {lines.length === 0 && <div className="text-[#7d735f]">Waiting. Press “Connect & fetch” to pull new joiners from {p.name}.</div>}
          {lines.map((l, i) => <div key={i} className={cn("break-all", l.kind === "ok" ? "text-[#8fd19e]" : l.kind === "error" ? "text-[#f09a90]" : l.text.startsWith("GET") ? "text-[#e9c27a]" : "")}>{l.kind === "ok" ? "✓ " : l.kind === "error" ? "✕ " : "› "}{l.text}</div>)}
          <div ref={logEnd} />
        </div>
      </div>
    </div>
  );
}
