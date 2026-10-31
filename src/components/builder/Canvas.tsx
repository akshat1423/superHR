"use client";
import { useCallback, useEffect } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, getViewportForBounds, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BLOCKS } from "@/lib/catalog";
import { APP_SIZE, STAGE_CENTER_Y, useBuilder } from "@/store/builder";
import { toast } from "@/store/toast";
import { StepNodeMemo } from "./StepNode";
import { InsertEdge } from "./InsertEdge";
import { TimelineRuler } from "./TimelineRuler";
import { BlockPicker } from "./BlockPicker";
import { DND_MIME } from "./Palette";
import { useReadOnly } from "./useReadOnly";

const nodeTypes = { step: StepNodeMemo };
const edgeTypes = { insert: InsertEdge };
const START_ZOOM = 0.9;

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, select, addBlock, addPack, viewRequest } = useBuilder();
  const rf = useReactFlow();
  const readOnly = useReadOnly();

  // Move the viewport when asked: readable start, whole flow, or zoomed onto the app logos.
  useEffect(() => {
    const t = setTimeout(() => {
      if (viewRequest.kind === "start") {
        const h = document.querySelector(".sj-canvas .react-flow")?.clientHeight ?? 600;
        rf.setViewport({ x: 28, y: h / 2 - STAGE_CENTER_Y * START_ZOOM, zoom: START_ZOOM }, { duration: 300 });
      } else if (viewRequest.kind === "fit") {
        rf.fitView({ padding: 0.1, duration: 450 });
      } else {
        // zoom to the main app-access stage: the day with the most app blocks (earliest wins a tie)
        const all = useBuilder.getState().nodes.filter((n) => n.data.perm);
        if (!all.length) { toast("This workflow has no app access blocks"); return; }
        const perDay = new Map<number, typeof all>();
        for (const n of all) perDay.set(n.data.day, [...(perDay.get(n.data.day) ?? []), n]);
        const apps = [...perDay.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0][1];
        const x0 = Math.min(...apps.map((n) => n.position.x));
        const y0 = Math.min(...apps.map((n) => n.position.y));
        const x1 = Math.max(...apps.map((n) => n.position.x + APP_SIZE.w));
        const y1 = Math.max(...apps.map((n) => n.position.y + APP_SIZE.h));
        const box = document.querySelector(".sj-canvas .react-flow");
        const vp = getViewportForBounds({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, box?.clientWidth ?? 900, box?.clientHeight ?? 600, 0.2, 1.5, 0.12);
        rf.setViewport(vp, { duration: 600 });
      }
    }, 60);
    return () => clearTimeout(t);
  }, [viewRequest, rf]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    const { kind, id } = JSON.parse(raw) as { kind: "block" | "pack"; id: string };
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const at = { x: p.x - 106, y: p.y - 36 };
    if (kind === "block" && BLOCKS[id]) addBlock(id, at);
    if (kind === "pack") addPack(id, at);
  }, [rf, addBlock, addPack, readOnly]);

  // Delete removes the step and re-links its neighbours (React Flow's default would orphan them).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      const { selectedId, deleteStep } = useBuilder.getState();
      if (selectedId) deleteStep(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

  return (
    <div className="sj-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onPaneClick={() => select(null)}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        defaultViewport={{ x: 28, y: 40, zoom: START_ZOOM }}
        minZoom={0.2}
        maxZoom={1.8}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#cfc5ae" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <TimelineRuler />
      <BlockPicker />
    </div>
  );
}
