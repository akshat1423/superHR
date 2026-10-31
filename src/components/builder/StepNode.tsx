"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Glyph } from "@/components/ui/Glyph";
import { fmtDay } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import type { StepNode as StepNodeType } from "@/store/builder";

function StepNodeView({ data, selected }: NodeProps<StepNodeType>) {
  const chip = data.day === 0 ? "zero" : data.day > 0 ? "pos" : "";
  return (
    <div className={cn("sj-node", selected && "sel", data.key === "approve" && "appr")}>
      <Handle type="target" position={Position.Left} />
      <span className={cn("dchip", chip)}>{fmtDay(data.day)}</span>
      <Glyph k={data.key} size={28} />
      <div className="nt">
        <b>{data.title}</b>
        <small>{data.owner}{data.perm ? ` · ${data.perm}` : ""}</small>
      </div>
      {data.ver.length > 0 && <span className="vbadge">✓ {data.ver.join(" + ")}</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
export const StepNodeMemo = memo(StepNodeView);
