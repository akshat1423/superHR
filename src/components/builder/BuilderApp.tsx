"use client";
import { ReactFlowProvider } from "@xyflow/react";
import "./builder.css";
import { TopBar } from "./TopBar";
import { Palette } from "./Palette";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { useEffect } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { visibleDepartments } from "@/lib/auth/policy";
import { useBuilder } from "@/store/builder";
import { usePeople } from "@/store/people";

export function BuilderApp() {
  const user = useUser();
  const people = usePeople((s) => s.people);
  const persona = useBuilder((s) => s.persona);
  const load = useBuilder((s) => s.loadPersona);
  const depts = visibleDepartments(user, people);
  const allowed = depts.includes(persona.dept);
  // the builder starts on Engineering; someone who can't see it is moved to their own department's workflow
  useEffect(() => { if (!allowed && depts.length) load({ ...persona, dept: depts[0] }); }, [allowed, depts, persona, load]);
  if (!depts.length) return <div className="grid h-full place-items-center px-8"><p className="paper-card max-w-[460px] rounded-2xl bg-paper2 p-6 text-center text-[13px] text-[#4b4338]">There are no workflows to show: you can see the workflows of the departments your people are in, and you have nobody in onboarding.</p></div>;
  if (!allowed) return null;
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
