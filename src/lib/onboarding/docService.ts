import { hash01 } from "../utils";
import { DOC_TYPES, checkFile, extractFromText, statusAfterValidation, validateDocument } from "./documents";
import type { EmployeeCtx } from "./rules";
import type { DocStatus, DocTypeId, Extracted, Issue } from "./types";

/**
 * The document service: receives an upload, reads the fields off it, checks them against the person's profile,
 * and decides. A clean document is accepted; one with errors goes back to the employee with the reasons; one that
 * can't be read (a scan or PDF when no AI reader is configured) is the only case left to a person. Our own code makes
 * every judgement; a model, when used, only reads what is printed.
 */
export interface ProcessStep { label: string; ok: boolean; ms: number; detail: string }
export interface ProcessResult {
  traceId: string;
  /** how the fields were read: from the file's text, by an AI reader, or not at all */
  mode: "text" | "ai" | "manual";
  extraction: "text" | "ai" | "none";
  extracted?: Extracted;
  issues: Issue[];
  status: DocStatus;
  steps: ProcessStep[];
  /** the file itself was refused (wrong type or too big); nothing was recorded */
  rejected?: boolean;
}

export type DocContent = { kind: "text"; text: string } | { kind: "binary"; read: () => Promise<Record<string, string | null> | null> };

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const ms = (trace: string, i: number, base: number) => base + Math.floor(hash01(`${trace}|${i}`) * base);

export async function processDocument(input: { fileName: string; size: number; docType: DocTypeId; ctx: EmployeeCtx; content: DocContent }): Promise<ProcessResult> {
  const def = DOC_TYPES[input.docType];
  const traceId = "doc_" + Math.floor(hash01(`${input.ctx.id}|${input.docType}|${input.fileName}|${input.size}`) * 0xffffffff).toString(16).padStart(8, "0");
  const steps: ProcessStep[] = [];

  const fileIssues = checkFile(input.fileName, input.size);
  if (fileIssues.some((i) => i.severity === "error")) {
    steps.push({ label: "Receive the file", ok: false, ms: ms(traceId, 0, 20), detail: fileIssues.map((i) => i.message).join(" ") });
    return { traceId, mode: "manual", extraction: "none", issues: fileIssues, status: "Not Submitted", steps, rejected: true };
  }
  steps.push({ label: "Receive the file", ok: true, ms: ms(traceId, 0, 20), detail: `${input.fileName} · ${fmtSize(input.size)}` });

  // read the fields
  let extracted: Extracted | undefined;
  let extraction: ProcessResult["extraction"] = "none";
  if (input.content.kind === "text") {
    extracted = extractFromText(input.content.text, input.fileName);
    extraction = "text";
    steps.push({ label: "Read the fields", ok: true, ms: ms(traceId, 1, 30), detail: `read from the file's text · ${Object.values(extracted).filter(Boolean).length} fields found` });
  } else {
    let raw: Record<string, string | null> | null = null;
    try { raw = await input.content.read(); } catch { raw = null; }
    if (raw) {
      extracted = {};
      for (const [k, v] of Object.entries(raw)) if (v) (extracted as Record<string, string>)[k] = v;
      extraction = "ai";
      steps.push({ label: "Read the fields", ok: true, ms: ms(traceId, 1, 900), detail: `read by the AI reader · ${Object.keys(extracted).length} fields found` });
    } else {
      steps.push({ label: "Read the fields", ok: false, ms: ms(traceId, 1, 300), detail: "this scan or PDF couldn't be read automatically (the AI reader is off or didn't respond)" });
    }
  }

  if (!extracted) {
    const issues: Issue[] = [{ severity: "warning", code: "NOT_AUTO_VALIDATED", message: "This file couldn't be read automatically, so HR will check it by hand." }];
    steps.push({ label: "Decide", ok: true, ms: ms(traceId, 3, 10), detail: "sent to a person: the only case the service can't decide" });
    return { traceId, mode: "manual", extraction, issues, status: "Under Review", steps };
  }

  const issues = validateDocument(def, extracted, input.ctx);
  const errs = issues.filter((i) => i.severity === "error").length, warns = issues.length - errs;
  steps.push({ label: `Check against ${input.ctx.name.split(" ")[0]}'s profile`, ok: errs === 0, ms: ms(traceId, 2, 25), detail: errs ? `${errs} problem${errs > 1 ? "s" : ""} found${warns ? `, ${warns} warning${warns > 1 ? "s" : ""}` : ""}` : warns ? `matches, with ${warns} warning${warns > 1 ? "s" : ""}` : "name, dates and document type all match" });
  const status = statusAfterValidation(issues);
  steps.push({ label: "Decide", ok: status === "Accepted", ms: ms(traceId, 3, 10), detail: status === "Accepted" ? "accepted automatically" : "sent back to the employee with the reasons" });
  return { traceId, mode: extraction === "ai" ? "ai" : "text", extraction, extracted, issues, status, steps };
}
