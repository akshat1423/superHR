"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_USERS, ROLE_LABEL } from "@/lib/auth/users";
import { scopeLabel } from "@/lib/auth/policy";
import { toast } from "@/store/toast";
import { useUser } from "./AuthProvider";
import { cn } from "@/lib/utils";

const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);

export function UserMenu() {
  const user = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const switchTo = async (userId: string) => {
    setBusy(true);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    const data = (await res.json()) as { landing?: string };
    setBusy(false);
    setOpen(false);
    router.push(data.landing ?? "/");
    router.refresh();
  };
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
    toast("Signed out");
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl border border-white/60 bg-[#f7f3ea] py-1.5 pl-1.5 pr-3 shadow-[0_2px_0_#b9ae96,0_8px_18px_rgba(0,0,0,.12)]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink font-mono text-[11px] font-semibold text-white">{initials(user.name)}</span>
        <span className="text-left leading-tight">
          <b className="block text-[12.5px]">{user.name}</b>
          <small className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{ROLE_LABEL[user.role]}</small>
        </span>
        <span className="text-mute">▾</span>
      </button>

      {open && (
        <div className="paper-card absolute right-0 top-[calc(100%+8px)] z-[120] w-[320px] rounded-2xl bg-paper2 p-3 shadow-[0_24px_50px_rgba(60,45,20,.28)]">
          <div className="px-1.5 pb-2.5">
            <div className="eyebrow !text-[10px]">Signed in as</div>
            <b className="text-[15px]">{user.name}</b>
            <div className="text-xs text-mute">{user.title}</div>
            <div className="mt-1.5 font-mono text-[10.5px] text-[#4b4338]">Can see {scopeLabel(user)}</div>
          </div>
          <div className="eyebrow border-t border-dashed border-line px-1.5 pb-1.5 pt-2.5 !text-[10px]">Switch persona (demo)</div>
          {DEMO_USERS.map((u) => (
            <button key={u.id} disabled={busy || u.id === user.id} onClick={() => switchTo(u.id)} className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-[#ece4d0] disabled:opacity-100", u.id === user.id && "bg-[#ece4d0]")}>
              <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-[#fffdf7] font-mono text-[10px] font-semibold">{initials(u.name)}</span>
              <span className="leading-tight"><b className="block text-[12.5px]">{u.name}</b><small className="font-mono text-[9.5px] text-mute">{u.title}</small></span>
              {u.id === user.id && <span className="ml-auto font-mono text-[10px] text-ok">you</span>}
            </button>
          ))}
          <button onClick={signOut} className="mt-2 w-full rounded-[10px] border border-line py-2 font-mono text-[11px] uppercase tracking-[.1em] hover:bg-[#f6d6d2]">Sign out</button>
        </div>
      )}
    </div>
  );
}
