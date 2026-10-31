"use client";
import { useEffect } from "react";
import { useOnboarding } from "@/store/onboarding";
import { cn } from "@/lib/utils";

/** Shows an approved policy in full, with the cited section highlighted. */
export function PolicyModal({ policyId, section, onClose }: { policyId: string; section?: string; onClose: () => void }) {
  const policy = useOnboarding((s) => s.policies.find((p) => p.id === policyId));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-[#17130e]/45 p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="paper-card max-h-full w-full max-w-[620px] overflow-auto rounded-[22px] bg-paper2 p-6 shadow-[0_30px_70px_rgba(40,30,10,.4)]">
        {!policy ? <p>Policy {policyId} isn’t loaded.</p> : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-1"><div className="eyebrow !text-[10px]">{policy.id} · {policy.version}</div><h3 className="text-[20px] font-extrabold tracking-[-.03em]">{policy.title}</h3></div>
              <button onClick={onClose} className="rounded-lg border border-line px-2.5 py-1 font-mono text-[11px]">esc</button>
            </div>
            <div className="mt-3 space-y-3">
              {policy.sections.map((s) => (
                <div key={s.id} className={cn("rounded-xl border p-3", section === s.id ? "border-acc bg-[#fbeee6]" : "border-line bg-[#fffdf7]")}>
                  <b className="text-[13px]">{s.id} {s.heading}</b>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#3d362b]">{s.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
