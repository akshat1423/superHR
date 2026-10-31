import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({ accent, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { accent?: boolean }) {
  return (
    <button
      {...p}
      className={cn(
        "rounded-xl border px-[18px] py-3 font-mono text-[11.5px] uppercase tracking-[.12em] transition-transform active:translate-y-0.5",
        accent
          ? "border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] text-white shadow-[0_3px_0_#8d3a1b,0_8px_18px_rgba(0,0,0,.2)]"
          : "border-white/60 bg-[#f7f3ea] shadow-[0_2px_0_#b9ae96,0_8px_18px_rgba(0,0,0,.12)]",
        className,
      )}
    />
  );
}
