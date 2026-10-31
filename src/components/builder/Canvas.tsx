"use client";
import { useCallback, useEffect } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BLOCKS } from "@/lib/catalog";
import { useBuilder } from "@/store/builder";
import { StepNodeMemo } from "./StepNode";
import { InsertEdge } from "./InsertEdge";
import { TimelineRuler } from "./TimelineRuler";
import { BlockPicker } from "./BlockPicker";
import { DND_MIME } from "./Palette";

const nodeTypes = { step: StepNodeMemo };
const edgeTypes = { insert: InsertEdge };
const START_ZOOM = 0.9;
/** y of the vertical centre of a stage in the generated layout */
const CENTER_Y = 416;

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, select, addBlock, addPack, fitToken } = useBuilder();
  const rf = useReactFlow();

  // Start readable (left edge of the flow, vertically centred) rather than zooming everything out.
  const focusStart = useCallback(() => {
    const h = document.querySelector(".sj-canvas .react-flow")?.clientHeight ?? 600;
    rf.setViewport({ x: 28, y: h / 2 - CENTER_Y * START_ZOOM, zoom: START_ZOOM }, { duration: 300 });
  }, [rf]);
  useEffect(() => {
    const t = setTimeout(focusStart, 60);
    return () => clearTimeout(t);
  }, [fitToken, focusStart]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    const { kind, id } = JSON.parse(raw) as { kind: "block" | "pack"; id: string };
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const at = { x: p.x - 106, y: p.y - 36 };
    if (kind === "block" && BLOCKS[id]) addBlock(id, at);
    if (kind === "pack") addPack(id, at);
  }, [rf, addBlock, addPack]);

  // Delete removes the step and re-links its neighbours (React Flow's default would orphan them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      const { selectedId, deleteStep } = useBuilder.getState();
      if (selectedId) deleteStep(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        defaultViewport={{ x: 28, y: 40, zoom: START_ZOOM }}
        minZoom={0.2}
        maxZoom={1.6}
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
