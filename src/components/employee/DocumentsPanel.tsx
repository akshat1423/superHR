"use client";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { fmtHuman, parseDateISO } from "@/lib/dates";
import { DOC_TYPES, TEXT_EXT, checkFile, compareNames, extOf, extractFromText, makeSampleDocument, type SampleVariant } from "@/lib/onboarding/documents";
import { draftCorrection } from "@/lib/onboarding/escalate";
import type { ChecklistItem, DocumentRecord, Extracted, Issue } from "@/lib/onboarding/types";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { useOnboarding } from "@/store/onboarding";
import { useOutbox } from "@/store/outbox";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { DocBadge } from "./badges";

const VARIANTS: { v: SampleVariant; label: string; types?: string[] }[] = [
  { v: "valid", label: "Valid document" },
  { v: "wrongName", label: "Wrong name" },
  { v: "expired", label: "Expired", types: ["id_proof", "us_work_auth"] },
  { v: "wrongDob", label: "Wrong date of birth", types: ["id_proof"] },
  { v: "staleAddress", label: "Out-of-date proof", types: ["address_proof"] },
  { v: "badPan", label: "Malformed PAN", types: ["pan_card"] },
  { v: "wrongKind", label: "Wrong kind of document" },
  { v: "missingField", label: "Missing field", types: ["id_proof"] },
];

const readB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

const FIELDS: { k: keyof Extracted; label: string }[] = [
  { k: "docKind", label: "Document" }, { k: "name", label: "Name" }, { k: "dob", label: "Date of birth" }, { k: "idNumber", label: "ID number" }, { k: "address", label: "Address" },
  { k: "issueDate", label: "Issue date" }, { k: "expiryDate", label: "Expiry date" }, { k: "degree", label: "Degree" }, { k: "institution", label: "Institution" },
  { k: "year", label: "Year" }, { k: "employer", label: "Employer" }, { k: "lastWorkingDate", label: "Last working day" },
];

/** What the document says next to what the profile says. Mismatches are highlighted. */
function Comparison({ x, view }: { x: Extracted; view: EmployeeView }) {
  const p = view.person;
  const rows = FIELDS.filter((f) => x[f.k]).map((f) => {
    const found = String(x[f.k]);
    let profile: string | undefined, match: "ok" | "close" | "bad" | undefined;
    if (f.k === "name") { profile = p.name; const c = compareNames(found, p.name); match = c === "exact" ? "ok" : c === "close" ? "close" : "bad"; }
    if (f.k === "dob" && p.dob) { profile = p.dob; match = parseDateISO(found) === p.dob ? "ok" : "bad"; }
    return { ...f, found, profile, match };
  });
  if (!rows.length) return null;
  return (
    <table className="mt-2 w-full border-collapse text-[12px]">
      <thead><tr className="text-left font-mono text-[9.5px] uppercase tracking-[.08em] text-mute"><th className="py-1">Field</th><th>On the document</th><th>On the profile</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.k} className={cn("border-t border-[#eee6d3]", r.match === "bad" && "bg-[#fdf0ee]", r.match === "close" && "bg-[#fbf3dc]")}>
            <td className="py-1 pr-2 text-mute">{r.label}</td>
            <td className="pr-2 font-semibold">{/^\d{4}-\d{2}-\d{2}$/.test(r.found) ? fmtHuman(r.found) : r.found}</td>
            <td className="pr-2">{r.profile ? (/^\d{4}-\d{2}-\d{2}$/.test(r.profile) ? fmtHuman(r.profile) : r.profile) : <span className="text-mute">—</span>}</td>
            <td>{r.match === "ok" ? <span className="text-ok">✓ matches</span> : r.match === "close" ? <span className="text-[#8a6200]">≈ close</span> : r.match === "bad" ? <b className="text-bad">✕ mismatch</b> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {issues.map((i, k) => (
        <li key={k} className={cn("flex gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]", i.severity === "error" ? "bg-[#fdf0ee] text-[#8c1b14]" : "bg-[#fbf3dc] text-[#7a5a00]")}>
          <span>{i.severity === "error" ? "✕" : "!"}</span><span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

function DocCard({ item, doc, view, mode, highlight }: { item: ChecklistItem; doc?: DocumentRecord; view: EmployeeView; mode: "staff" | "self"; highlight: boolean }) {
  const user = useUser();
  const { submitDocument, markSubmitted, reviewDocument } = useOnboarding();
  const send = useOutbox((s) => s.send);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Issue[] | null>(null);
  const [variant, setVariant] = useState<SampleVariant>("valid");
  const [note, setNote] = useState("");
  const def = DOC_TYPES[item.docType!];
  const status = doc?.status ?? "Not Submitted";
  const canReview = mode === "staff" && (user.role === "hr" || user.role === "dept_head");

  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [highlight]);

  const handle = async (file: File) => {
    setMsg(null);
    const fileIssues = checkFile(file.name, file.size);
    if (fileIssues.some((i) => i.severity === "error")) {
      submitDocument(view.person.id, item.id, { fileName: file.name, size: file.size, extraction: "none" }, user.name); // logs the rejection
      setMsg(fileIssues);
      toast(fileIssues[0].message);
      return;
    }
    setBusy(true);
    try {
      let up: Parameters<typeof submitDocument>[2];
      if (TEXT_EXT.includes(extOf(file.name))) {
        up = { fileName: file.name, size: file.size, extraction: "text", extracted: extractFromText(await file.text(), file.name) };
      } else {
        markSubmitted(view.person.id, item.id, file.name, file.size, user.name);
        const res = await fetch("/api/documents/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mime: file.type || (extOf(file.name) === "pdf" ? "application/pdf" : "image/jpeg"), data: await readB64(file) }) }).catch(() => null);
        const body = res && res.ok ? ((await res.json()) as { extracted: Record<string, string | null> | null }) : null;
        const ex: Extracted = {};
        for (const [k, v] of Object.entries(body?.extracted ?? {})) if (v) (ex as Record<string, string>)[k] = v;
        up = body?.extracted ? { fileName: file.name, size: file.size, extraction: "ai", extracted: ex } : { fileName: file.name, size: file.size, extraction: "none" };
      }
      const r = submitDocument(view.person.id, item.id, up, user.name);
      setMsg(r.issues);
      toast(r.status === "Correction Requested" ? "We found a problem with this document — see below" : "Received — it's now with HR for review");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const sample = () => {
    const s = makeSampleDocument(item.docType!, view.ctx, variant);
    return { ...s, file: new File([s.content], s.fileName, { type: "text/plain" }) };
  };
  const download = () => { const s = sample(); const a = document.createElement("a"); a.href = URL.createObjectURL(s.file); a.download = s.fileName; a.click(); };

  const emailEmployee = async () => {
    if (!doc) return;
    const d = draftCorrection(view.ctx, def.label, doc.issues.filter((i) => i.severity === "error").map((i) => i.message), item.id);
    const st = await send(d, user.name);
    useOnboarding.getState().log(view.person.id, user.name, "Correction email sent", `${def.label} → ${view.person.email} (${st === "sent" ? "delivered to provider" : st === "preview" ? "preview mode, not delivered" : "failed"})`);
    toast(st === "sent" ? "Email sent" : st === "preview" ? "Email drafted (preview mode — not delivered)" : "Sending failed");
  };

  return (
    <div ref={ref} className={cn("paper-card rounded-2xl bg-paper2 p-4", highlight && "ring-2 ring-acc")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <b className="text-[14.5px] tracking-[-.01em]">{def.label}</b>
        <DocBadge status={status} />
        <span className="font-mono text-[10.5px] text-mute">due {fmtHuman(item.dueDate)}</span>
        <span className="ml-auto font-mono text-[10.5px] text-mute">{def.hint}</span>
      </div>

      {doc && doc.status !== "Not Submitted" && (
        <div className="mt-2 text-[12px] text-[#4b4338]">
          <span className="font-mono">{doc.fileName}</span>{doc.fileSize ? ` · ${(doc.fileSize / 1024).toFixed(1)} KB` : ""} · attempt {doc.attempts}
          {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
          {doc.extraction && <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px]">{doc.extraction === "text" ? "read from text" : doc.extraction === "ai" ? "read by AI" : "not auto-read"}</span>}
        </div>
      )}
      {status === "Correction Requested" && mode === "self" && <p className="mt-2 rounded-lg bg-[#fdf0ee] px-3 py-2 text-[12.5px] text-[#8c1b14]"><b>Please upload a corrected copy.</b> Here’s what needs fixing:</p>}
      {doc?.extracted && mode === "staff" && <Comparison x={doc.extracted} view={view} />}
      {doc && <Issues issues={mode === "self" ? doc.issues.filter((i) => i.severity === "error") : doc.issues} />}
      {doc?.reviewerNote && <p className="mt-2 text-[12.5px]"><b>{doc.reviewedBy}:</b> {doc.reviewerNote}</p>}
      {msg && !doc && <Issues issues={msg} />}
      {msg && doc && msg.some((m) => m.code.startsWith("FILE_")) && <Issues issues={msg} />}

      {status !== "Accepted" || mode === "staff" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
          <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.txt,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
          <button disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl border border-white/60 bg-[#f7f3ea] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.1em] shadow-[0_2px_0_#b9ae96] disabled:opacity-50">{busy ? "Reading…" : status === "Not Submitted" ? "Upload file" : "Upload a new copy"}</button>
          <span className="text-[11px] text-mute">PDF, JPG or PNG · max 5 MB</span>
          <span className="flex-1" />
          <select value={variant} onChange={(e) => setVariant(e.target.value as SampleVariant)} className="rounded-lg border border-line bg-[#fffdf7] px-2 py-1.5 font-mono text-[10.5px]" aria-label="sample type">
            {VARIANTS.filter((v) => !v.types || v.types.includes(item.docType!)).map((v) => <option key={v.v} value={v.v}>{v.label}</option>)}
          </select>
          <button disabled={busy} onClick={() => void handle(sample().file)} className="rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0] disabled:opacity-50" title="Generates a synthetic document and uploads it, to try the checks">Try a sample</button>
          <button onClick={download} className="rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">↓ Sample file</button>
        </div>
      ) : null}

      {canReview && doc && status !== "Not Submitted" && status !== "Submitted" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the employee (optional)" className="sj-input !w-[260px]" />
          {status !== "Accepted" && <button onClick={() => { reviewDocument(view.person.id, item.id, "accept", note, user.name); setNote(""); toast("Accepted"); }} className="rounded-lg bg-ok px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white">Accept{doc.issues.some((i) => i.severity === "error") ? " anyway" : ""}</button>}
          {status !== "Correction Requested" && <button onClick={() => { reviewDocument(view.person.id, item.id, "correct", note || "Please upload a corrected copy.", user.name); setNote(""); toast("Correction requested"); }} className="rounded-lg bg-bad px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white">Request correction</button>}
          {status === "Correction Requested" && <button onClick={emailEmployee} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">✉ Email the employee</button>}
        </div>
      )}
    </div>
  );
}

/** Every required document for this person, with upload, automatic checks and review. */
export function DocumentsPanel({ view, mode, focusItemId }: { view: EmployeeView; mode: "staff" | "self"; focusItemId?: string | null }) {
  const docItems = view.items.filter((i) => i.docType);
  const counts = docItems.reduce<Record<string, number>>((m, i) => { const s = view.docs[i.id]?.status ?? "Not Submitted"; m[s] = (m[s] ?? 0) + 1; return m; }, {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 font-mono text-[11px] text-[#4b4338]">
        {Object.entries(counts).map(([s, n]) => <span key={s} className="flex items-center gap-1.5 rounded-xl border border-line bg-[#fffdf7] px-2.5 py-1"><DocBadge status={s as never} /><b>{n}</b></span>)}
      </div>
      {docItems.length === 0 && <p className="eyebrow">No documents are required for this role and location.</p>}
      {docItems.map((i) => <DocCard key={i.id} item={i} doc={view.docs[i.id]} view={view} mode={mode} highlight={focusItemId === i.id} />)}
    </div>
  );
}
