"use client";
import { ReactFlowProvider } from "@xyflow/react";
import "./builder.css";
import { TopBar } from "./TopBar";
import { Palette } from "./Palette";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";

export function BuilderApp() {
  return (
    <ReactFlowProvider>
      <div className="sj-bld">
        <TopBar />
        <Palette />
        <Canvas />
        <Inspector />
      </div>
    </ReactFlowProvider>
  );
}
