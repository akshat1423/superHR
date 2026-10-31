import type { RowIssue } from "@/lib/onboarding/datasets";
import { cn } from "@/lib/utils";

/** Validation findings, errors first: which row, which field, and what to change. */
export function IssueList({ issues, max = 40 }: { issues: RowIssue[]; max?: number }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error") || a.row - b.row);
  return (
    <ul className="space-y-1">
      {sorted.slice(0, max).map((i, k) => (
        <li key={k} className={cn("flex gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px]", i.severity === "error" ? "bg-[#fdf0ee] text-[#8c1b14]" : "bg-[#fbf3dc] text-[#7a5a00]")}>
          <span className="font-bold">{i.severity === "error" ? "✕" : "!"}</span>
          <span className="flex-1"><b className="font-mono text-[10.5px]">{i.row ? `row ${i.row}` : "file"}{i.label && i.label !== `row ${i.row}` ? ` · ${i.label}` : ""}{i.field ? ` · ${i.field}` : ""}</b> — {i.message}</span>
        </li>
      ))}
      {sorted.length > max && <li className="px-3 font-mono text-[10.5px] text-mute">…and {sorted.length - max} more</li>}
    </ul>
  );
}
