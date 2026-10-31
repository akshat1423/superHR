"use client";
import { useRef, useState } from "react";
import { parseAts, type ParsedAts } from "@/lib/csv";
import { SAMPLE_CSV } from "@/lib/sample";
import { fmtDate, missingFields } from "@/lib/people";
import { lvlName, personaLabel } from "@/lib/workflow";
import { usePeople } from "@/store/people";
import { useProvisioning } from "@/store/provisioning";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Provision } from "./Provision";

const STEPS = ["Upload ATS CSV", "Map · resolve workflows · find gaps", "Provision"];

export function IngestApp() {
  const loadBatch = usePeople((s) => s.loadBatch);
  const startRun = useProvisioning((s) => s.start);
  const [stage, setStage] = useState(0);
  const [parsed, setParsed] = useState<ParsedAts | null>(null);
  const [fileName, setFileName] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = (text: string, name: string) => {
    const res = parseAts(text);
    if (!res.people.length) { toast("No rows with a name column found — check the CSV headers"); return; }
    setParsed(res); setFileName(name); setStage(1);
  };
  const readFile = async (f: File) => ingest(await f.text(), f.name);
  const downloadSample = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    a.download = "sample-ats-export.csv";
    a.click();
  };
  const start = () => { if (!parsed) return; loadBatch(parsed.people); startRun(parsed.people); setStage(2); };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1240px] px-8 pb-16 pt-1.5">
        <h1 className="page-title">Bulk <i>ingest</i></h1>
        <div className="eyebrow mt-1">ATS export in → one workflow per person → ten microservices spin up</div>
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
              className={cn("grid h-[290px] cursor-pointer place-items-center rounded-[26px] border-2 border-dashed text-center transition", over ? "border-acc bg-[#fbe9df]" : "border-[#b7ac94] bg-[#f4efe3]/70 hover:border-acc hover:bg-[#fbe9df]")}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
            >
              <div>
                <div className="text-[44px]">⇪</div>
                <b className="my-1.5 block text-2xl tracking-[-.03em]">Drop your ATS export here</b>
                <p className="font-mono text-xs text-mute">.csv · Greenhouse / Lever / Workday / Zoho Recruit — column names are matched automatically</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
            </div>
            <div className="mt-4 flex gap-3">
              <Button accent onClick={() => ingest(SAMPLE_CSV, "sample-ats-export.csv")}>Use sample ATS export (12 rows)</Button>
              <Button onClick={downloadSample}>↓ Download sample CSV</Button>
            </div>
          </>
        )}

        {stage === 1 && parsed && <Review parsed={parsed} fileName={fileName} onBack={() => setStage(0)} onStart={start} />}
        {stage === 2 && parsed && <Provision />}
      </div>
    </div>
  );
}

function Review({ parsed, fileName, onBack, onStart }: { parsed: ParsedAts; fileName: string; onBack: () => void; onStart: () => void }) {
  const { people, mapping, unmapped } = parsed;
  const withGaps = people.filter((p) => missingFields(p).length).length;
  const guessed = people.filter((p) => p.guessed).length;
  return (
    <>
      <div className="mb-3.5 flex gap-3">
        {[[people.length, "rows parsed", ""], [people.length - guessed, "workflows matched exactly", ""], [people.length - withGaps, "complete records", "var(--color-ok)"], [withGaps, "have missing fields", "var(--color-warn)"]].map(([v, l, c]) => (
          <div key={l as string} className="flex-1 rounded-2xl bg-paper2 px-4 py-3 shadow-[0_6px_16px_rgba(107,90,58,.13)]">
            <b className="block text-[28px] leading-[1.1] tracking-[-.04em]" style={{ color: (c as string) || undefined }}>{v}</b>
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-mute">{l}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button onClick={onBack}>← Back</Button>
          <Button accent onClick={onStart} className="!px-[22px] !py-4">Spin up services →</Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="eyebrow mr-1">{fileName} · column mapping</span>
        {Object.entries(mapping).map(([h, k]) => (
          <span key={h} className={cn("rounded-md px-2 py-0.5", k ? "bg-ink text-white" : "border border-dashed border-warn bg-[#fbf0da] text-[#8a6200]")}>{h}{k ? ` → ${k}` : " · unmapped"}</span>
        ))}
      </div>
      {unmapped.length > 0 && <p className="mb-3 font-mono text-[11px] text-[#8a6200]">{unmapped.length} column(s) aren’t recognised and will be ignored: {unmapped.join(", ")}</p>}

      <div className="max-h-[430px] overflow-auto rounded-[18px] bg-paper2 shadow-[0_10px_26px_rgba(107,90,58,.15)]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>{["Name", "Role", "Dept", "Type", "Level", "Joining", "Manager", "PAN", "Aadhaar", "Bank a/c", "Address", "Photo", "Workflow"].map((h) => (
              <th key={h} className="sticky top-0 z-[2] whitespace-nowrap border-b border-line bg-[#e9e1cd] px-3 py-[9px] text-left font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-[#4b4338]">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-[#e0d8c5]">
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{p.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.role}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.persona.dept}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.persona.type}</td>
                <td className="whitespace-nowrap px-3 py-2">{lvlName(p.persona.level, p.persona.dept)}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(p.day)}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.manager}</td>
                {(["PAN", "Aadhaar", "Bank a/c", "Address", "Photo"] as const).map((k) =>
                  p.fields[k] === "missing"
                    ? <td key={k} className="whitespace-nowrap bg-[repeating-linear-gradient(135deg,#f8e6c6_0_5px,#fbf0da_5px_10px)] px-3 py-2 font-mono text-[10.5px] font-medium text-[#8a6200]">∅ missing</td>
                    : <td key={k} className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-[#4b4338]">● in CSV</td>)}
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold" title={p.issues.join("\n")}>
                  <span className={cn("rounded-md px-2 py-0.5 text-white", p.guessed ? "bg-warn" : "bg-ink")}>{personaLabel(p.persona)}{p.guessed ? " ?" : ""}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eyebrow mt-3 !tracking-[.14em]" style={{ color: "#b5ab96" }}>Amber cells are gaps in the ATS export — they become “request from candidate” tasks and block the steps that depend on them. A “?” on a workflow means the type/level was guessed; hover to see why.</p>
    </>
  );
}
