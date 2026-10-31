"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePeople } from "@/store/people";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/builder", label: "Builder" },
  { href: "/library", label: "Library" },
  { href: "/tracker", label: "Tracker" },
  { href: "/ingest", label: "Ingest" },
  { href: "/reminders", label: "Reminders" },
];

export function Header() {
  const path = usePathname();
  const count = usePeople((s) => s.people.length);
  return (
    <header className="flex h-[68px] flex-none items-center justify-between px-8">
      <div className="flex items-baseline">
        <Link href="/builder" className="text-[30px] font-extrabold tracking-[-.04em]">
          super<i className="font-serif font-normal tracking-[-.02em]">join</i>
        </Link>
        <span className="eyebrow ml-3.5 !text-[11px] !tracking-[.14em]">[{count}] in onboarding</span>
      </div>
      <div className="flex items-center gap-3">
        <nav className="inline-flex gap-0.5 rounded-xl bg-[#d9d1bd] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,.18)]">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "rounded-[9px] px-[15px] py-2 font-mono text-[11.5px] uppercase tracking-[.12em]",
                path.startsWith(t.href) ? "bg-ink text-white" : "text-[#6b6252] hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/ingest"
          className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] text-white shadow-[0_3px_0_#8d3a1b,0_8px_18px_rgba(0,0,0,.2)]"
        >
          + Bulk upload
        </Link>
      </div>
    </header>
  );
}
