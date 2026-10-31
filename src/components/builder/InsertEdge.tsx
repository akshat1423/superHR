"use client";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useBuilder } from "@/store/builder";
import { useReadOnly } from "./useReadOnly";

/** Edge with a "+" at its midpoint — the fast way to add a block between two steps. */
export function InsertEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps) {
  const openPicker = useBuilder((s) => s.openPicker);
  const readOnly = useReadOnly();
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: "#17130e", strokeWidth: 1.4, opacity: 0.28 }} />
      {!readOnly && (
      <EdgeLabelRenderer>
        <button
          className="sj-eplus nodrag nopan"
          style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
          title="Insert a step here"
          onClick={(e) => openPicker({ edgeId: id, x: e.clientX, y: e.clientY })}
        >
          +
        </button>
      </EdgeLabelRenderer>
      )}
    </>
  );
}
