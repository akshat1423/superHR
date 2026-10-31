"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_USERS, ROLE_LABEL, type DemoUser } from "@/lib/auth/users";
import { ROLE_SUMMARY, AREA_LABEL, visibleAreas, scopeLabel } from "@/lib/auth/policy";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);

export function LoginPicker() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const signIn = async (u: DemoUser) => {
    setBusy(u.id);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
    if (!res.ok) { setBusy(null); toast("Sign-in failed"); return; }
    const { landing } = (await res.json()) as { landing: string };
    router.push(landing);
    router.refresh();
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-16 pt-6 text-center">
        <h1 className="page-title">Sign in <i>to superjoin</i></h1>
        <p className="eyebrow mt-2 !tracking-[.12em]">Demo accounts · pick who you want to be — each role sees a different dashboard</p>
        <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 text-left">
          {DEMO_USERS.map((u) => (
            <div key={u.id} className="paper-dots paper-card flex flex-col rounded-[22px] p-5 shadow-[0_12px_28px_rgba(107,90,58,.16)]">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink font-mono text-sm font-semibold text-white">{initials(u.name)}</span>
              <b className="mt-3 text-[19px] tracking-[-.03em]">{u.name}</b>
              <small className="text-xs text-[#4b4338]">{u.title}</small>
              <span className="eyebrow mt-3 !text-[10px]">{ROLE_LABEL[u.role]}</span>
              <div className="mt-1 text-[12.5px] text-[#4b4338]">Sees {scopeLabel(u)}</div>
              <ul className="mt-3 flex-1 space-y-1 border-t border-dashed border-line pt-3 text-[12px] text-[#4b4338]">
                {ROLE_SUMMARY[u.role].map((l) => <li key={l} className="flex gap-1.5"><span className="text-ok">✓</span>{l}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1">
                {visibleAreas(u.role).map((a) => <span key={a} className="rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px] text-mute">{AREA_LABEL[a]}</span>)}
              </div>
              <button onClick={() => signIn(u)} disabled={busy !== null} className={cn("mt-4 rounded-xl border px-4 py-2.5 font-mono text-[11.5px] uppercase tracking-[.12em] text-white transition-transform active:translate-y-0.5", "border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] shadow-[0_3px_0_#8d3a1b]", busy === u.id && "opacity-70")}>
                {busy === u.id ? "Signing in…" : `Sign in as ${u.name.split(" ")[0]}`}
              </button>
            </div>
          ))}
        </div>
        <p className="eyebrow mt-8 !tracking-[.12em]" style={{ color: "#b5ab96" }}>Sessions are signed, HttpOnly cookies · swap the demo login for Okta / Google SSO without touching the dashboard</p>
      </div>
    </div>
  );
}
