"use client";
import { BLOCKS } from "@/lib/catalog";
import { fmtDay, personaLabel } from "@/lib/workflow";
import type { Person, PersonStep, Status } from "@/lib/people";

const COLS: [string, string[] | null][] = [
  ["Offer", ["offer"]], ["Sign", ["esign", "nda"]], ["Docs", ["docs"]], ["BGV", ["bgv", "edu", "emp", "crim"]],
  ["Email & SSO", ["gws", "m365", "okta"]], ["Laptop", ["laptop"]], ["ID card", ["idcard"]], ["Apps", null],
  ["Payroll", ["payroll", "uan", "bank", "tax", "stipend"]], ["Insurance", ["health", "life", "nps"]],
  ["Spend", ["card", "expense", "travel"]], ["Day-1", ["agenda", "buddy", "intro", "lunch", "oneone"]],
  ["Premises", ["access", "desk", "parking", "kit"]], ["Training", ["sec", "posh", "policy", "courses"]],
  ["Approvals", ["approve"]], ["Reviews", ["review", "confirm"]],
];
const EXPLICIT = new Set(COLS.flatMap((c) => c[1] ?? []));
const inCol = (keys: string[] | null, s: PersonStep) => (keys ? keys.includes(s.key) : BLOCKS[s.key].perm && !EXPLICIT.has(s.key));
const RANK: Record<Status, number> = { blocked: 3, active: 2, scheduled: 1, done: 0 };
const GLYPH: Record<Status, string> = { done: "✓", active: "●", blocked: "!", scheduled: "" };

/** People × workflow-areas heatmap: spot the blocked column across a whole cohort at once. */
export function MatrixView({ rows, onOpen }: { rows: { person: Person; steps: PersonStep[] }[]; onOpen: (id: string) => void }) {
  return (
    <div className="mt-[26px] overflow-auto rounded-[20px] bg-paper2 p-[18px] text-left shadow-[0_14px_34px_rgba(107,90,58,.17)]">
      <table className="sj-mx border-separate" style={{ borderSpacing: 4 }}>
        <thead><tr><th />{COLS.map(([n]) => <th key={n}><span>{n}</span></th>)}</tr></thead>
        <tbody>
          {rows.map(({ person, steps }) => (
            <tr key={person.id}>
              <td className="min-w-[220px] cursor-pointer whitespace-nowrap pr-3.5" onClick={() => onOpen(person.id)}>
                <b className="text-[13.5px]">{person.name}</b>
                <small className="block font-mono text-[10px] text-mute">{personaLabel(person.persona)} · {fmtDay(-person.day)}</small>
              </td>
              {COLS.map(([n, keys]) => {
                const ss = steps.filter((s) => inCol(keys, s));
                if (!ss.length) return <td key={n}><div className="c na" /></td>;
                const worst = ss.reduce<Status>((a, s) => (RANK[s.status] > RANK[a] ? s.status : a), "done");
                return <td key={n}><div className={`c ${worst}`} title={ss.map((s) => `${s.title}: ${s.status}${s.note ? ` (${s.note})` : ""}`).join("\n")} onClick={() => onOpen(person.id)}>{GLYPH[worst]}</div></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3.5 flex gap-3.5 font-mono text-[10px] text-mute">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok" />all done</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-acc" />in progress</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-bad" />blocked</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-dashed border-[#a99d86]" />scheduled</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#e4dccb]" />n/a for this persona</span>
      </div>
    </div>
  );
}
