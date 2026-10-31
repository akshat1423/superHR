"use client";
import { cn } from "@/lib/utils";

/** The pill segmented control used all over superconnect. */
export function Seg<T extends string>({ value, options, onChange, className }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-0.5 rounded-xl bg-[#d9d1bd] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,.18)]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[9px] px-4 py-2 font-mono text-[11.5px] uppercase tracking-[.12em] transition-colors",
            value === o.value ? "bg-ink text-white" : "text-[#6b6252] hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
