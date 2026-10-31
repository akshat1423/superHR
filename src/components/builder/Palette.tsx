"use client";
import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { BLOCKS_BY_CAT, CATEGORIES, PACKS, type BlockDef } from "@/lib/catalog";
import { Glyph, Mono, type Tone } from "@/components/ui/Glyph";
import { useBuilder } from "@/store/builder";
import { toast } from "@/store/toast";

export const DND_MIME = "application/superjoin";

/** Same kind → tone mapping as the canvas nodes (see StepNode). */
const toneOf = (b: BlockDef): Tone => (b.key === "approve" ? "amber" : b.perm ? "ink" : b.owner === "Candidate" ? "acc" : "paper");
type Payload = { kind: "block" | "pack"; id: string };

export function Palette() {
  const [q, setQ] = useState("");
  const rf = useReactFlow();
  const addBlock = useBuilder((s) => s.addBlock);
  const addPack = useBuilder((s) => s.addPack);
  const query = q.trim().toLowerCase();

  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        packs: c.id === "packs" ? PACKS.filter((p) => !query || p.name.toLowerCase().includes(query)) : [],
        blocks: c.id === "packs" ? [] : (BLOCKS_BY_CAT[c.id] ?? []).filter((b) => !query || b.name.toLowerCase().includes(query)),
      })).filter((c) => c.packs.length || c.blocks.length),
    [query],
  );

  const addAtCenter = (p: Payload) => {
    const el = document.querySelector(".sj-canvas .react-flow");
    const r = el?.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 });
    const at = { x: pos.x - 106, y: pos.y - 70 };
    if (p.kind === "block") addBlock(p.id, at);
    else { addPack(p.id, at); toast(`Added pack “${p.id}”`); }
  };
  const drag = (e: React.DragEvent, p: Payload) => e.dataTransfer.setData(DND_MIME, JSON.stringify(p));

  return (
    <aside className="sj-panel">
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-xl font-extrabold tracking-[-.03em]">Blocks</h2>
        <p className="mb-3 mt-0.5 text-xs text-mute">Drag onto the canvas, or click to add.</p>
        <input className="sj-input" placeholder="Search blocks…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sj-scroll px-2.5 pb-3">
        {sections.map((c, i) => (
          <details key={c.id} open={!!query || i < 2} className="mb-0.5">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[.12em] text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
              {c.name}
              <span className="font-normal">{c.id === "packs" ? PACKS.length : (BLOCKS_BY_CAT[c.id] ?? []).length}</span>
            </summary>
            <div className="grid grid-cols-2 gap-2 px-0.5 pb-2.5 pt-0.5">
              {c.packs.map((p) => (
                <div key={p.name} className="sj-tile" draggable onDragStart={(e) => drag(e, { kind: "pack", id: p.name })} onClick={() => addAtCenter({ kind: "pack", id: p.name })}>
                  <Mono text={`+${p.keys.length}`} size={38} tone="ink" />
                  {p.name}
                  <small>pack</small>
                </div>
              ))}
              {c.blocks.map((b) => (
                <div key={b.key} className="sj-tile" draggable onDragStart={(e) => drag(e, { kind: "block", id: b.key })} onClick={() => addAtCenter({ kind: "block", id: b.key })}>
                  <Glyph k={b.key} size={38} tone={toneOf(b)} />
                  {b.name}
                  <small>{b.perm ? "app access" : b.owner}</small>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </aside>
  );
}
