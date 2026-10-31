import Link from "next/link";
import { AREA_ACCESS, AREA_LABEL, landingFor, ROLE_SUMMARY, type Area } from "@/lib/auth/policy";
import { ROLE_LABEL, type Role } from "@/lib/auth/users";

export function Forbidden({ role, area }: { role: Role; area?: Area }) {
  return (
    <div className="grid h-full place-items-center overflow-auto px-8 pb-16">
      <div className="paper-card w-full max-w-[560px] rounded-[26px] bg-paper2 p-8 text-center shadow-[0_20px_44px_rgba(107,90,58,.2)]">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-[#fffdf7] text-2xl">🔒</div>
        <h1 className="text-[28px] font-extrabold tracking-[-.04em]">No access to {area ? AREA_LABEL[area] : "this page"}</h1>
        <p className="mx-auto mt-2 max-w-[420px] text-[14px] text-[#4b4338]">
          You’re signed in as <b>{ROLE_LABEL[role]}</b>.{" "}
          {area ? <>Only {AREA_ACCESS[area].map((r) => ROLE_LABEL[r]).join(" and ")} can open this.</> : null}
        </p>
        <div className="mx-auto mt-5 max-w-[380px] rounded-2xl border border-line bg-[#fffdf7] p-4 text-left">
          <div className="eyebrow mb-2 !text-[10px]">What your role can do</div>
          <ul className="space-y-1 text-[13px]">
            {ROLE_SUMMARY[role].map((l) => <li key={l} className="flex gap-2"><span className="text-ok">✓</span>{l}</li>)}
          </ul>
        </div>
        <Link href={landingFor(role)} className="mt-6 inline-block rounded-xl border border-white/60 bg-[#f7f3ea] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] shadow-[0_2px_0_#b9ae96,0_8px_18px_rgba(0,0,0,.12)]">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
