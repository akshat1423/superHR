"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREA_LABEL, canBulkUpload, scopeLabel, visibleAreas } from "@/lib/auth/policy";
import { useScopedPeople, useUserOrNull } from "./AuthProvider";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";

export function Header() {
  const path = usePathname();
  const user = useUserOrNull();
  const scoped = useScopedPeople();

  return (
    <header className="flex h-[68px] flex-none items-center justify-between px-8">
      <div className="flex items-baseline">
        <Link href="/" className="text-[30px] font-extrabold tracking-[-.04em]">
          super<i className="font-serif font-normal tracking-[-.02em]">join</i>
        </Link>
        {user && (
          <span className="eyebrow ml-3.5 !text-[11px] !tracking-[.14em]" title={`You can see ${scopeLabel(user)}`}>
            [{scoped.length}] {user.role === "employee" ? "yours" : "in view"}
          </span>
        )}
      </div>
      {user && (
        <div className="flex items-center gap-3">
          <nav className="inline-flex gap-0.5 rounded-xl bg-[#d9d1bd] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,.18)]">
            {visibleAreas(user.role).map((a) => (
              <Link
                key={a}
                href={`/${a}`}
                className={cn(
                  "rounded-[9px] px-[15px] py-2 font-mono text-[11.5px] uppercase tracking-[.12em]",
                  path.startsWith(`/${a}`) ? "bg-ink text-white" : "text-[#6b6252] hover:text-ink",
                )}
              >
                {AREA_LABEL[a]}
              </Link>
            ))}
          </nav>
          {canBulkUpload(user) && (
            <Link
              href="/ingest"
              className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] text-white shadow-[0_3px_0_#8d3a1b,0_8px_18px_rgba(0,0,0,.2)]"
            >
              + Bulk upload
            </Link>
          )}
          <UserMenu />
        </div>
      )}
    </header>
  );
}
