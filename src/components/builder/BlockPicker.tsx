"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_BLOCKS } from "@/lib/catalog";
import { Glyph } from "@/components/ui/Glyph";
import { useBuilder } from "@/store/builder";

/** Popover for inserting a block into the middle of an edge. Remounts per edge so the search resets. */
export function BlockPicker() {
  const picker = useBuilder((s) => s.picker);
  if (!picker) return null;
  return <PickerBody key={picker.edgeId} edgeId={picker.edgeId} x={picker.x} y={picker.y} />;
}

function PickerBody({ edgeId, x, y }: { edgeId: string; x: number; y: number }) {
  const openPicker = useBuilder((s) => s.openPicker);
  const insertOnEdge = useBuilder((s) => s.insertOnEdge);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) openPicker(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openPicker]);

  const hits = useMemo(
    () => ALL_BLOCKS.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 7),
    [q],
  );
  return (
    <div
      ref={ref}
      className="paper-card fixed z-[150] w-[270px] rounded-2xl bg-paper2 p-2.5 shadow-[0_20px_50px_rgba(60,45,20,.25)]"
      style={{ left: Math.min(x, window.innerWidth - 290), top: Math.min(y, window.innerHeight - 360) }}
    >
      <input autoFocus className="sj-input mb-1.5" placeholder="Insert a step here…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((b) => (
        <button key={b.key} onClick={() => insertOnEdge(edgeId, b.key)} className="sj-row w-full text-left">
          <Glyph k={b.key} size={26} />
          <span>{b.name}</span>
          <small>{b.owner}</small>
        </button>
      ))}
    </div>
  );
}
