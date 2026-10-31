"use client";
import { useState } from "react";
import { Seg } from "@/components/ui/Seg";
import { useUser } from "@/components/shell/AuthProvider";
import { scopeLabel } from "@/lib/auth/policy";
import { taskCounts } from "@/lib/provision";
import { AgentFailures } from "./AgentFailures";
import { AgentLogs } from "./AgentLogs";
import { AgentOverview } from "./AgentOverview";
import { useScopedRun } from "./useScopedRun";

type Tab = "overview" | "logs" | "failures";

export function AgentsApp({ initialTab = "overview" }: { initialTab?: Tab }) {
  const user = useUser();
  const { rows, events } = useScopedRun();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [agent, setAgent] = useState("all");
  const failed = rows.reduce((n, r) => n + taskCounts(r.pr).failed, 0);
  const errors = events.filter((e) => e.kind === "error").length;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1240px] px-8 pb-14 pt-1.5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Agent <i>logs</i></h1>
            <div className="eyebrow mt-1">Every service is an agent · you see {scopeLabel(user)}</div>
          </div>
          <Seg<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "Overview" },
              { value: "logs", label: `Logs · ${events.length.toLocaleString()}` },
              { value: "failures", label: `Failures · ${failed}` },
            ]}
          />
        </div>
        {errors > 0 && tab !== "failures" && (
          <button onClick={() => setTab("failures")} className="mt-3 w-full rounded-xl border border-bad/40 bg-[#fdf0ee] px-4 py-2.5 text-left text-[13px] text-[#8c1b14]">
            <b>{failed} service{failed === 1 ? "" : "s"} failed</b> across {rows.filter((r) => taskCounts(r.pr).failed > 0).length} people — see why →
          </button>
        )}
        <div className="mt-4">
          {tab === "overview" && <AgentOverview rows={rows} onOpenAgent={(id) => { setAgent(id); setTab("logs"); }} />}
          {tab === "logs" && <AgentLogs rows={rows} agent={agent} setAgent={setAgent} />}
          {tab === "failures" && <AgentFailures rows={rows} />}
        </div>
      </div>
    </div>
  );
}
