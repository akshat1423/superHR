"use client";
import { useEffect, useMemo, useState } from "react";
import "./tracker.css";
import { DEPTS } from "@/lib/workflow";
import { deriveSteps, healthOf, missingFields } from "@/lib/people";
import { useScopedPeople } from "@/components/shell/AuthProvider";
import { toast } from "@/store/toast";
import { Seg } from "@/components/ui/Seg";
import { cn } from "@/lib/utils";
import { Badge } from "./Badge";
import { Journey } from "./Journey";
import { GridView } from "./GridView";
import { MatrixView } from "./MatrixView";

type View = "stack" | "grid" | "matrix";

export function TrackerApp() {
  const people = useScopedPeople();
  const [view, setView] = useState<View>("stack");
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const all = useMemo(() => people.map((person) => ({ person, steps: deriveSteps(person) })), [people]);
  const rows = useMemo(
    () => all.filter(({ person: p, steps }) => {
      if (q && !`${p.name} ${p.role} ${p.persona.dept} ${p.persona.type}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "blocked") return healthOf(steps) === "blocked";
      if (filter === "week") return p.day <= 0 && p.day >= -7;
      if (filter === "missing") return missingFields(p).length > 0;
      if (filter.startsWith("d:")) return p.persona.dept === filter.slice(2);
      return true;
    }),
    [all, q, filter],
  );
  const cur = rows[Math.min(idx, rows.length - 1)];

  const chips: { k: string; label: string; n: number; red?: boolean }[] = [
    { k: "all", label: "All", n: all.length },
    { k: "blocked", label: "Blocked", n: all.filter((r) => healthOf(r.steps) === "blocked").length, red: true },
    { k: "week", label: "Joining this week", n: all.filter((r) => r.person.day <= 0 && r.person.day >= -7).length },
    { k: "missing", label: "Data missing", n: all.filter((r) => missingFields(r.person).length > 0).length, red: true },
    ...DEPTS.map((d) => ({ k: `d:${d}`, label: d, n: all.filter((r) => r.person.persona.dept === d).length })),
  ];

  const step = (d: number) => setIdx((i) => (rows.length ? (i + d + rows.length) % rows.length : 0));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "stack" || /INPUT|SELECT/.test(document.activeElement?.tagName ?? "")) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "/") { e.preventDefault(); document.getElementById("tracker-search")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openPerson = (id: string) => { setIdx(Math.max(0, rows.findIndex((r) => r.person.id === id))); setView("stack"); };
  const nudge = () => {
    if (!cur) return;
    const open = cur.steps.filter((s) => s.status === "blocked" || s.status === "active");
    toast(`Nudged ${[...new Set(open.map((s) => s.owner))].join(", ") || "nobody"} for ${open.length} open step(s)`);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1320px] px-8 pb-24 text-center">
        <div className="mb-[18px] mt-0.5 flex justify-center">
          <Seg value={view} onChange={setView} options={[{ value: "stack", label: "▤ Stack" }, { value: "grid", label: "▦ Grid" }, { value: "matrix", label: "▥ Matrix" }]} />
        </div>
        <div className="mx-auto flex h-[62px] max-w-[640px] items-center gap-3 rounded-[20px] border border-white/70 bg-[#fffdf7] px-5 shadow-[0_10px_26px_rgba(107,90,58,.16)] focus-within:border-ink">
          <span className="text-mute">⌕</span>
          <input id="tracker-search" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Try “blocked backgrounds in Engineering” or “interns joining Monday”" className="flex-1 bg-transparent text-[17px] outline-none placeholder:text-[#a99d86]" />
          <kbd className="rounded-[7px] border border-[#4a4238] px-2 py-0.5 font-mono text-xs text-[#8a8070]">/</kbd>
        </div>
        <div className="mx-auto my-4 flex max-w-[860px] flex-wrap items-center justify-center gap-2">
          <em className="eyebrow mr-1 !not-italic !tracking-[.14em]">Jump to</em>
          {chips.map((c) => (
            <button key={c.k} onClick={() => { setFilter(c.k); setIdx(0); }}
              className={cn("rounded-full border px-[13px] py-1.5 font-mono text-xs", filter === c.k ? "border-ink bg-ink text-white" : c.red ? "border-[#e9a39c] bg-[#f4efe3]/70 text-bad" : "border-line bg-[#f4efe3]/70 text-[#4b4338]")}>
              {c.label}<b className="ml-1 font-normal opacity-60">{c.n}</b>
            </button>
          ))}
        </div>

        {!rows.length && <p className="eyebrow mt-16 !tracking-[.14em]" style={{ color: "#b5ab96" }}>Nobody matches</p>}

        {cur && view === "stack" && (
          <div className="mx-auto mt-[26px] grid max-w-[1180px] grid-cols-[400px_1fr] items-start gap-14 text-left">
            <div>
              <Badge key={cur.person.id} person={cur.person} steps={cur.steps} buddy={rows[(rows.indexOf(cur) + 3) % rows.length].person.name} />
              <div className="mt-[34px] flex items-center justify-center gap-3">
                <NavBtn onClick={() => step(-1)}>‹</NavBtn>
                <span className="px-[22px] font-mono text-[13px] tracking-[.14em]">{String(rows.indexOf(cur) + 1).padStart(2, "0")} / {String(rows.length).padStart(2, "0")}</span>
                <NavBtn onClick={() => step(1)}>›</NavBtn>
                <NavBtn onClick={nudge}>↗ Nudge owners</NavBtn>
              </div>
              <div className="eyebrow mt-4 text-center !text-[10px] !tracking-[.14em]" style={{ color: "#b5ab96" }}>← → to shuffle · click badge to flip</div>
            </div>
            <Journey person={cur.person} steps={cur.steps} />
          </div>
        )}
        {rows.length > 0 && view === "grid" && <GridView rows={rows} onOpen={openPerson} />}
        {rows.length > 0 && view === "matrix" && <MatrixView rows={rows} onOpen={openPerson} />}
      </div>
    </div>
  );
}

function NavBtn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className="rounded-xl border border-white/60 bg-[#f7f3ea] px-4 py-3 font-mono text-[13px] tracking-[.08em] shadow-[0_2px_0_#b9ae96,0_8px_16px_rgba(0,0,0,.12)] active:translate-y-0.5" />;
}
