import type { DocStatus, ItemState } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

const STATE: Record<ItemState, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "border-[#9fcfae] bg-[#dbeadf] text-[#1d5234]" },
  pending: { label: "Pending", cls: "border-line bg-[#fffdf7] text-[#4b4338]" },
  blocked: { label: "Blocked", cls: "border-bad bg-[repeating-linear-gradient(135deg,#f6d6d2_0_6px,#f9e3e0_6px_12px)] text-[#8c1b14]" },
  overdue: { label: "Overdue", cls: "border-[#e0a455] bg-[#fbe7cf] text-[#8a4a00]" },
};

export function StateBadge({ state }: { state: ItemState }) {
  const s = STATE[state];
  return <span className={cn("inline-block whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em]", s.cls)}>{s.label}</span>;
}

const DOC: Record<DocStatus, string> = {
  "Not Submitted": "border-dashed border-[#c4b99f] bg-transparent text-[#6b6252]",
  Submitted: "border-[#c9d3e6] bg-[#e8eef9] text-[#2c4a85]",
  "Under Review": "border-[#e6c978] bg-[#fbefcf] text-[#8a6200]",
  Accepted: "border-[#9fcfae] bg-[#dbeadf] text-[#1d5234]",
  "Correction Requested": "border-bad bg-[#f6d6d2] text-[#8c1b14]",
};

export function DocBadge({ status }: { status: DocStatus }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold", DOC[status])}>{status}</span>;
}
