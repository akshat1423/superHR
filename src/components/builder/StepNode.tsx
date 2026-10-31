"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Glyph, type Tone } from "@/components/ui/Glyph";
import type { Perm } from "@/lib/catalog";
import { fmtDay } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import type { StepData, StepNode as StepNodeType } from "@/store/builder";

type Kind = "app" | "task" | "approval" | "candidate";

/** What sort of block is this? Drives the edge colour and glyph tone. */
export const kindOf = (d: StepData): Kind =>
  d.key === "approve" ? "approval" : d.perm ? "app" : d.owner === "Candidate" ? "candidate" : "task";

const TONE: Record<Kind, Tone> = { app: "ink", task: "paper", approval: "amber", candidate: "acc" };
const LEVEL: Record<Perm, number> = { Read: 1, Member: 2, Admin: 3 };

function PermMeter({ perm }: { perm: Perm }) {
  return (
    <span className="meter" title={`${perm} access`}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= LEVEL[perm] ? "on" : ""} />)}
      <em>{perm}</em>
    </span>
  );
}

function StepNodeView({ data, selected }: NodeProps<StepNodeType>) {
  const kind = kindOf(data);
  const chip = data.day === 0 ? "zero" : data.day > 0 ? "pos" : "";
  return (
    <div className={cn("sj-node", `k-${kind}`, selected && "sel")}>
      <Handle type="target" position={Position.Left} />
      <span className={cn("dchip", chip)}>{fmtDay(data.day)}</span>
      <Glyph k={data.key} size={38} tone={TONE[kind]} />
      <div className="nt">
        <b>{data.title}</b>
        <div className="meta">
          <span className="who">{data.owner}</span>
          {data.perm && <PermMeter perm={data.perm} />}
        </div>
      </div>
      {data.ver.length > 0 && <span className="stamp">✓ {data.ver.join(" + ")}</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
export const StepNodeMemo = memo(StepNodeView);
