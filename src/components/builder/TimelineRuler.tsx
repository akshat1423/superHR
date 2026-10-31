"use client";
import { TIMELINE_BREAKS, fmtDay, timelinePos } from "@/lib/workflow";
import { useBuilder } from "@/store/builder";
import { cn } from "@/lib/utils";

/** Every step plotted on a T-minus / T-plus axis, so you can see *when* things happen at a glance. */
export function TimelineRuler() {
  const nodes = useBuilder((s) => s.nodes);
  const selectedId = useBuilder((s) => s.selectedId);
  const select = useBuilder((s) => s.select);
  return (
    <div className="sj-ruler">
      <span className="cap">Timeline · each dot is a step</span>
      <div className="track">
        {TIMELINE_BREAKS.map((d) => <span key={d} className="tick" style={{ left: `${timelinePos(d)}%` }}>{fmtDay(d)}</span>)}
        {nodes.map((n) => (
          <button key={n.id} className={cn("dot", selectedId === n.id && "sel")} title={`${fmtDay(n.data.day)} · ${n.data.title}`} style={{ left: `${timelinePos(n.data.day)}%` }} onClick={() => select(n.id)} />
        ))}
      </div>
    </div>
  );
}
