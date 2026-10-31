"use client";
import { useRef, useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { fmtHuman } from "@/lib/dates";
import { errorsOf, loadFile, parseProfiles, type ProfileResult } from "@/lib/onboarding/datasets";
import { personaLabel } from "@/lib/workflow";
import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";
import { useProvisioning } from "@/store/provisioning";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { DatasetsPanel } from "./DatasetsPanel";
import { IssueList } from "./IssueList";
import { Provision } from "./Provision";

const STEPS = ["Upload employees", "Validate · review", "Provision"];
const SAMPLES: [string, string][] = [["new-joiners.csv", "CSV"], ["new-joiners.xlsx", "Excel"], ["new-joiners.json", "JSON"], ["new-joiners-with-errors.csv", "File with errors"]];

export function IngestApp() {
  const loadBatch = usePeople((s) => s.loadBatch);
  const importPeople = useOnboarding((s) => s.importPeople);
  const directory = useOnboarding((s) => s.directory);
  const startRun = useProvisioning((s) => s.start);
  const user = useUser();
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fatal, setFatal] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setBusy(true); setFatal(null);
    try {
      const res = parseProfiles(await loadFile(file), directory);
      setResult(res); setFileName(file.name);
      // a file that can't be read at all stays on this screen with its report
      if (!res.data.length) { setStage(0); setFatal(res.issues.find((i) => i.severity === "error")?.message ?? "Nothing could be imported"); return; }
      setStage(1);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Couldn't read that file");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const sample = async (f: string) => { const r = await fetch(`/samples/${f}`); await handle(new File([await r.blob()], f)); };
  const start = () => {
    if (!result?.data.length) return;
    loadBatch(result.data);
    importPeople(result.data, user.name);
    startRun(result.data, user.name);
    setStage(2);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1240px] px-8 pb-16 pt-1.5">
        <h1 className="page-title">Bulk <i>ingest</i></h1>
        <div className="eyebrow mt-1">upload employees (CSV, Excel or JSON) → validated against the directory → one checklist each → services spin up</div>

        {stage === 0 && <div className="mt-5"><DatasetsPanel /></div>}

        <div className="mb-[22px] mt-3.5 flex gap-2.5">
          {STEPS.map((s, i) => (
            <div key={s} className={cn("flex flex-1 items-center gap-2.5 rounded-[14px] border px-4 py-3 font-mono text-[11px] uppercase tracking-[.1em]", stage === i ? "border-ink bg-ink text-white" : "border-line text-mute")}>
              <b className={cn("grid h-6 w-6 place-items-center rounded-full", stage === i ? "bg-acc text-white" : stage > i ? "bg-ok text-white" : "bg-[#d9d1bd] text-[#6b6252]")}>{stage > i ? "✓" : i + 1}</b>{s}
            </div>
          ))}
        </div>

        {stage === 0 && (
          <>
            <div
              className={cn("grid h-[230px] cursor-pointer place-items-center rounded-[26px] border-2 border-dashed text-center transition", over ? "border-acc bg-[#fbe9df]" : "border-[#b7ac94] bg-[#f4efe3]/70 hover:border-acc hover:bg-[#fbe9df]")}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}
            >
              <div>
                <div className="text-[40px]">⇪</div>
                <b className="my-1.5 block text-2xl tracking-[-.03em]">{busy ? "Reading…" : "Drop your new-joiner file here"}</b>
                <p className="font-mono text-xs text-mute">.csv · .xlsx · .json — needs name, role, grade, department, location, manager and joining date</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
            </div>
            {fatal && <div className="mt-3 rounded-xl border border-bad/40 bg-[#fdf0ee] px-4 py-3 text-[13px] text-[#8c1b14]"><b>Couldn’t import that file.</b> {fatal}{result && result.issues.length > 1 && <div className="mt-2"><IssueList issues={result.issues} max={5} /></div>}</div>}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="eyebrow !text-[10px]">Try a sample</span>
              {SAMPLES.map(([f, label], i) => <Button key={f} accent={i === 0} disabled={busy} onClick={() => void sample(f)} className={i === 3 ? "!border-[#e9a39c]" : ""}>{label}</Button>)}
              <span className="flex-1" />
              {SAMPLES.slice(0, 3).map(([f, label]) => <a key={f} href={`/samples/${f}`} download className="font-mono text-[10.5px] text-mute underline hover:text-ink">↓ {label}</a>)}
            </div>
          </>
        )}

        {stage === 1 && result && <Review result={result} fileName={fileName} onBack={() => setStage(0)} onStart={start} />}
        {stage === 2 && result && <Provision />}
      </div>
    </div>
  );
}

function Review({ result, fileName, onBack, onStart }: { result: ProfileResult; fileName: string; onBack: () => void; onStart: () => void }) {
  const { data: people, issues, rows, rejected, ats } = result;
  const errs = errorsOf(issues).length, warns = issues.length - errs;
  const gaps = people.filter((p) => Object.values(p.fields).includes("missing")).length;
  return (
    <>
      <div className="mb-3.5 flex gap-3">
        {([[rows, "rows read", ""], [people.length, "will be imported", "var(--color-ok)"], [rejected, "rejected (errors)", rejected ? "var(--color-bad)" : ""], [warns, "warnings", warns ? "var(--color-warn)" : ""], [gaps, "have data gaps", gaps ? "var(--color-warn)" : ""]] as const).map(([v, l, c]) => (
          <div key={l} className="paper-card flex-1 rounded-2xl bg-paper2 px-4 py-3"><b className="block text-[28px] leading-[1.1] tracking-[-.04em]" style={{ color: c || undefined }}>{v}</b><span className="font-mono text-[10px] uppercase tracking-[.1em] text-mute">{l}</span></div>
        ))}
        <div className="flex items-center gap-2"><Button onClick={onBack}>← Back</Button><Button accent onClick={onStart} className="!px-[22px] !py-4">Import {people.length} &amp; start →</Button></div>
      </div>

      {issues.length > 0 ? (
        <div className="paper-card mb-4 rounded-2xl bg-paper2 p-4">
          <h3 className="mb-2 text-[15px] font-extrabold tracking-[-.02em]">Validation report <span className="font-mono text-[10.5px] font-normal text-mute">· {fileName}</span></h3>
          <p className="mb-2 text-[12.5px] text-[#4b4338]">{errs ? `${rejected} row${rejected === 1 ? " has" : "s have"} errors and will be left out; fix them in the file and upload again. ` : ""}Warnings don’t block the import.</p>
          <IssueList issues={issues} max={30} />
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-[#b8d6c1] bg-[#eef4ea] px-4 py-2.5 text-[12.5px] text-[#1d5234]">✓ Every row passed validation: mandatory fields, date formats, departments and managers all check out.</div>
      )}

      {ats && ats.unmapped.length > 0 && <p className="mb-3 font-mono text-[11px] text-[#8a6200]">{ats.unmapped.length} column(s) aren’t recognised and will be ignored: {ats.unmapped.join(", ")}</p>}

      <div className="max-h-[430px] overflow-auto rounded-[18px] bg-paper2 shadow-[0_10px_26px_rgba(107,90,58,.15)]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>{["Name", "Role", "Dept", "Location", "Grade", "Joining", "Manager", "Workflow"].map((h) => <th key={h} className="sticky top-0 z-[2] whitespace-nowrap border-b border-line bg-[#e9e1cd] px-3 py-[9px] text-left font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-[#4b4338]">{h}</th>)}</tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-[#e0d8c5]">
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{p.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.role}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.persona.dept}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.location}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{p.grade}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtHuman(p.startDate)}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.manager}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold" title={p.issues.join("\n")}><span className={cn("rounded-md px-2 py-0.5 text-white", p.guessed ? "bg-warn" : "bg-ink")}>{personaLabel(p.persona)}{p.guessed ? " ?" : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eyebrow mt-3 !tracking-[.14em]" style={{ color: "#b5ab96" }}>A “?” on a workflow means the type or level was guessed from the job title; hover to see why.</p>
    </>
  );
}
