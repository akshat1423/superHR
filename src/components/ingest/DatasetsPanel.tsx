"use client";
import { useRef, useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { DEFAULT_REQUIREMENTS } from "@/lib/onboarding/rules";
import { SAMPLE_DIRECTORY } from "@/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "@/lib/onboarding/policies";
import { errorsOf, loadFile, parseDirectory, parsePolicies, parseRequirements, type RowIssue } from "@/lib/onboarding/datasets";
import { useOnboarding } from "@/store/onboarding";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { IssueList } from "./IssueList";
import { OwnersEditor, PoliciesEditor, RulesEditor } from "./RefEditors";

type Kind = "requirements" | "policies" | "owners";

const META: Record<Kind, { title: string; what: string; accept: string; samples: [string, string][] }> = {
  requirements: { title: "Onboarding requirements", what: "Rules by role, department, grade and location: what is needed, who owns it, when it is due.", accept: ".csv,.xlsx,.json", samples: [["requirements.csv", "CSV"], ["requirements.json", "JSON"]] },
  policies: { title: "Policy documents", what: "The approved text the assistant may answer from. JSON, CSV (one row per section) or Markdown files.", accept: ".json,.csv,.md,.txt,.xlsx", samples: [["policies.json", "JSON"], ["policies.csv", "CSV"], ["policy-remote-work.md", "Markdown"]] },
  owners: { title: "Owners & directory", what: "Who owns HR, IT, facilities and compliance tasks per department and city, plus the managers that profiles may reference.", accept: ".csv,.xlsx,.json", samples: [["owners.csv", "CSV"], ["owners.json", "JSON"]] },
};

/** Reference data the checklist is built from. Replacing it recalculates every employee's checklist. */
export function DatasetsPanel() {
  const user = useUser();
  const { info, requirements, policies, directory, setRequirements, setPolicies, setDirectory } = useOnboarding();
  const [editing, setEditing] = useState<Kind | null>(null);
  const [reports, setReports] = useState<Partial<Record<Kind, RowIssue[]>>>({});
  const [busy, setBusy] = useState<Kind | null>(null);
  const [addMode, setAddMode] = useState(true);
  const refs = { requirements: useRef<HTMLInputElement>(null), policies: useRef<HTMLInputElement>(null), owners: useRef<HTMLInputElement>(null) };

  const apply = async (kind: Kind, files: File[]) => {
    setBusy(kind);
    try {
      const loaded = await Promise.all(files.map((f) => loadFile(f)));
      if (kind === "requirements") {
        const r = parseRequirements(loaded[0], policies.map((p) => p.id));
        setReports((s) => ({ ...s, requirements: r.issues }));
        if (!r.data.length) { toast("No valid requirements in that file — see the report"); return; }
        const out = setRequirements(r.data, files[0].name, user.name);
        toast(`${r.data.length} rules loaded · ${out.employees} employee checklists recalculated (+${out.added} / −${out.removed} items)`);
      } else if (kind === "policies") {
        const rs = loaded.map((l) => parsePolicies(l));
        const issues = rs.flatMap((r) => r.issues);
        setReports((s) => ({ ...s, policies: issues }));
        const data = rs.flatMap((r) => r.data);
        if (!data.length) { toast("No valid policies in that upload — see the report"); return; }
        setPolicies(data, files.map((f) => f.name).join(", "), addMode ? "add" : "replace", user.name);
        toast(`${data.length} polic${data.length === 1 ? "y" : "ies"} ${addMode ? "added" : "loaded"}`);
      } else {
        const r = parseDirectory(loaded[0]);
        setReports((s) => ({ ...s, owners: r.issues }));
        if (errorsOf(r.issues).length && !r.data[0].owners.length) { toast("No valid owners in that file — see the report"); return; }
        setDirectory(r.data[0], files[0].name, user.name);
        toast(`Directory loaded: ${r.data[0].owners.length} owners, ${r.data[0].managers.length} managers — owners updated on every checklist`);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Couldn't read that file";
      setReports((s) => ({ ...s, [kind]: [{ row: 0, severity: "error", message: m }] }));
      toast(m);
    } finally { setBusy(null); if (refs[kind].current) refs[kind].current.value = ""; }
  };

  const sample = async (kind: Kind) => {
    const f = META[kind].samples[0][0];
    const res = await fetch(`/samples/${f}`);
    await apply(kind, [new File([await res.blob()], f)]);
  };
  const reset = (kind: Kind) => {
    if (kind === "requirements") { const o = setRequirements(DEFAULT_REQUIREMENTS, "Built-in sample", user.name); toast(`Reset · ${o.employees} checklists recalculated`); }
    if (kind === "policies") { setPolicies(SAMPLE_POLICIES, "Built-in sample", "replace", user.name); toast("Policies reset"); }
    if (kind === "owners") { setDirectory(SAMPLE_DIRECTORY, "Built-in sample", user.name); toast("Directory reset"); }
    setReports((s) => ({ ...s, [kind]: [] }));
  };
  const countOf = (k: Kind) => (k === "requirements" ? `${requirements.length} rules` : k === "policies" ? `${policies.length} policies` : `${info.owners.count} people`);

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-end justify-between"><h2 className="text-[20px] font-extrabold tracking-[-.03em]">Reference data</h2><span className="eyebrow !text-[10px]">checklists, owners and assistant answers are built from these</span></div>
      <div className="grid grid-cols-3 gap-3.5">
        {(Object.keys(META) as Kind[]).map((k) => {
          const m = META[k], rep = reports[k] ?? [];
          const src = info[k].source;
          return (
            <div key={k} className="paper-card flex flex-col rounded-2xl bg-paper2 p-4">
              <div className="flex items-baseline gap-2"><b className="text-[15px] tracking-[-.02em]">{m.title}</b><span className="ml-auto font-mono text-[10.5px] text-mute">{countOf(k)}</span></div>
              <p className="mt-1 text-[12px] text-[#4b4338]">{m.what}</p>
              <div className={cn("mt-2 rounded-lg px-2.5 py-1.5 font-mono text-[10.5px]", src === "Built-in sample" ? "bg-[#ece4d0] text-[#5b5244]" : "bg-[#dbeadf] text-[#1d5234]")}>Source: {src}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <input ref={refs[k]} type="file" hidden multiple={k === "policies"} accept={m.accept} onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void apply(k, fs); }} />
                <button onClick={() => setEditing(k)} className="rounded-lg bg-ink px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white">Edit</button>
                <button disabled={busy === k} onClick={() => refs[k].current?.click()} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0] disabled:opacity-50">{busy === k ? "Reading…" : "Upload file"}</button>
                <button disabled={busy === k} onClick={() => void sample(k)} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">Use sample</button>
                {src !== "Built-in sample" && <button onClick={() => reset(k)} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#f6d6d2]">Reset</button>}
              </div>
              {k === "policies" && <label className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-mute"><input type="checkbox" checked={addMode} onChange={(e) => setAddMode(e.target.checked)} /> add to existing (untick to replace)</label>}
              <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-[10px] text-mute">{m.samples.map(([f, label]) => <a key={f} href={`/samples/${f}`} download className="underline hover:text-ink">↓ {label}</a>)}</div>
              {rep.length > 0 && <div className="mt-3"><IssueList issues={rep} max={6} /></div>}
            </div>
          );
        })}
      </div>

      {editing === "requirements" && (
        <RulesEditor initial={requirements} policyIds={policies.map((p) => p.id)} departments={directory.departments} onClose={() => setEditing(null)}
          onSave={(r) => { const o = setRequirements(r, "Edited in the app", user.name); toast(`${r.length} rules saved · ${o.employees} employee checklists recalculated (+${o.added} / −${o.removed} items)`); setEditing(null); }} />
      )}
      {editing === "policies" && (
        <PoliciesEditor initial={policies} departments={directory.departments} onClose={() => setEditing(null)}
          onSave={(p) => { setPolicies(p, "Edited in the app", "replace", user.name); toast(`${p.length} polic${p.length === 1 ? "y" : "ies"} saved`); setEditing(null); }} />
      )}
      {editing === "owners" && (
        <OwnersEditor initial={directory} onClose={() => setEditing(null)}
          onSave={(d) => { setDirectory(d, "Edited in the app", user.name); toast(`Directory saved: ${d.owners.length} owners, ${d.managers.length} managers — owners updated on every checklist`); setEditing(null); }} />
      )}
    </div>
  );
}
