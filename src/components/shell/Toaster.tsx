"use client";
import { useEffect } from "react";
import { useToast } from "@/store/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { message, seq, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2400);
    return () => clearTimeout(t);
  }, [seq, message, hide]);
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-xl bg-ink px-[18px] py-3 font-mono text-xs tracking-[.04em] text-white transition-all duration-200",
        message ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      {message}
    </div>
  );
}
