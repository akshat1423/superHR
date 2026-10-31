import { addDays, todayISO } from "../../src/lib/dates";
import { usePeople } from "../../src/store/people";
import { useOnboarding } from "../../src/store/onboarding";
import { DOC_TYPES, extractFromText, makeSampleDocument, type SampleVariant } from "../../src/lib/onboarding/documents";
import { processDocument } from "../../src/lib/onboarding/docService";
import { ctxOf } from "../../src/lib/onboarding/rules";
import { deriveStates } from "../../src/lib/onboarding/status";
import type { DocTypeId } from "../../src/lib/onboarding/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => useOnboarding.getState();
const P = (name: string) => usePeople.getState().people.find((p) => p.name.startsWith(name))!;
const item = (name: string, rule: string) => S().items[P(name).id].find((i) => i.ruleId === rule)!;
const ctx = ctxOf(P("Riya"));
const text = (type: DocTypeId, v: SampleVariant = "valid") => { const d = makeSampleDocument(type, ctx, v); return { fileName: d.fileName, size: d.content.length, docType: type, ctx, content: { kind: "text" as const, text: d.content } }; };

console.log("the service decides");
for (const t of Object.keys(DOC_TYPES) as DocTypeId[]) {
  const r = await processDocument(text(t));
  ok(`a valid ${DOC_TYPES[t].label} is accepted automatically`, r.status === "Accepted" && r.extraction === "text" && r.mode === "text" && !r.issues.some((i) => i.severity === "error"), `${r.status} ${JSON.stringify(r.issues.map((i) => i.message))}`);
}
const ok1 = await processDocument(text("id_proof"));
ok("it shows its work: receive, read, check, decide", ok1.steps.map((s) => s.label.split(" ")[0]).join() === "Receive,Read,Check,Decide" && ok1.steps.every((s) => s.ok && s.ms > 0 && s.detail.length > 5));
const bad = await processDocument(text("id_proof", "wrongName"));
ok("a wrong name is sent back with the reason, not accepted", bad.status === "Correction Requested" && bad.issues.some((i) => i.code === "NAME_MISMATCH") && bad.steps.at(-1)!.detail.includes("sent back"));
ok("…and the check step says what was wrong", bad.steps[2].ok === false && /problem/.test(bad.steps[2].detail));
for (const [t, v] of [["id_proof", "expired"], ["id_proof", "wrongDob"], ["address_proof", "staleAddress"], ["pan_card", "badPan"], ["id_proof", "wrongKind"]] as const) {
  const r = await processDocument(text(t, v));
  ok(`${v} → Correction Requested`, r.status === "Correction Requested", r.status);
}
ok("the same file gives the same trace id and decision", JSON.stringify((await processDocument(text("id_proof"))).traceId) === JSON.stringify(ok1.traceId));

console.log("\nscans and PDFs");
const sample = makeSampleDocument("id_proof", ctx, "valid");
const fields = extractFromText(sample.content) as Record<string, string>;
const ai = await processDocument({ fileName: "id.pdf", size: 90_000, docType: "id_proof", ctx, content: { kind: "binary", read: async () => ({ ...fields, address: null }) } });
ok("a PDF read by the AI is checked by our code and accepted", ai.status === "Accepted" && ai.extraction === "ai" && ai.mode === "ai" && ai.steps[1].detail.includes("AI reader"));
const aiBad = await processDocument({ fileName: "id.jpg", size: 90_000, docType: "id_proof", ctx, content: { kind: "binary", read: async () => ({ ...fields, name: "Someone Else" }) } });
ok("…and a scan that names someone else is not accepted, whatever the reader says", aiBad.status === "Correction Requested");
const none = await processDocument({ fileName: "id.pdf", size: 90_000, docType: "id_proof", ctx, content: { kind: "binary", read: async () => null } });
ok("a scan nothing can read goes to a person, and says why", none.status === "Under Review" && none.mode === "manual" && none.issues[0].code === "NOT_AUTO_VALIDATED" && none.steps[1].ok === false);
const threw = await processDocument({ fileName: "id.pdf", size: 90_000, docType: "id_proof", ctx, content: { kind: "binary", read: async () => { throw new Error("timeout"); } } });
ok("a reader that fails is handled the same way, not a crash", threw.status === "Under Review" && threw.mode === "manual");
const docx = await processDocument({ fileName: "bill.docx", size: 1000, docType: "address_proof", ctx, content: { kind: "text", text: "x" } });
ok("a file type we don't take is refused outright", docx.rejected === true && docx.issues[0].code === "FILE_TYPE" && docx.steps[0].ok === false);
const big = await processDocument({ fileName: "big.pdf", size: 6 * 1024 * 1024, docType: "id_proof", ctx, content: { kind: "binary", read: async () => fields } });
ok("a file over 5 MB is refused outright", big.rejected === true);

console.log("\nthe record");
const pid = P("Meera").id;
const meera = ctxOf(P("Meera"));
const target = S().items[pid].find((i) => i.docType === "pan_card")!;
const d = makeSampleDocument("pan_card", meera, "valid");
const res = await processDocument({ fileName: d.fileName, size: d.content.length, docType: "pan_card", ctx: meera, content: { kind: "text", text: d.content } });
const before = S().items[pid].find((i) => i.id === target.id)!.status;
S().submitDocument(pid, target.id, { fileName: d.fileName, size: d.content.length, extraction: res.extraction, extracted: res.extracted }, "Meera Iyer", res);
const after = S().items[pid].find((i) => i.id === target.id)!;
ok("storing an accepted decision completes the item", after.status === "completed" && S().docs[target.id].status === "Accepted", `${before} → ${after.status}`);
ok("…and keeps how it was processed (trace and steps) on the document", S().docs[target.id].processing?.traceId === res.traceId && S().docs[target.id].processing!.steps.length === 4);
ok("…and the audit trail names the document service and the trace", S().audit.some((a) => a.personId === pid && a.actor === "Document service" && a.detail?.includes(res.traceId)));

console.log("\ndocuments left under review earlier");
const rid = P("Kabir").id;
const kItem = S().items[rid].find((i) => i.docType === "id_proof")!;
const kctx = ctxOf(P("Kabir"));
const kd = makeSampleDocument("id_proof", kctx, "valid");
const wd = makeSampleDocument("pan_card", kctx, "wrongName");
const pItem = S().items[rid].find((i) => i.docType === "pan_card")!;
const rec = (itemId: string, docType: DocTypeId, content: string, extra = {}) => ({ id: `doc:${itemId}`, personId: rid, itemId, docType, status: "Under Review" as const, issues: [], attempts: 1, fileName: "x.txt", extraction: "text" as const, extracted: extractFromText(content), ...extra });
useOnboarding.setState((s) => ({ docs: { ...s.docs, [kItem.id]: rec(kItem.id, "id_proof", kd.content), [pItem.id]: rec(pItem.id, "pan_card", wd.content) } }));
const handled = S().settleReviews();
ok("stuck documents that could be read are decided now", handled >= 2 && S().docs[kItem.id].status === "Accepted" && S().docs[pItem.id].status === "Correction Requested", `${handled} ${S().docs[kItem.id].status} ${S().docs[pItem.id].status}`);
ok("…an accepted one completes its item", S().items[rid].find((i) => i.id === kItem.id)!.status === "completed");
ok("…and a person's own decision is never overridden", (() => {
  useOnboarding.setState((s) => ({ docs: { ...s.docs, [kItem.id]: rec(kItem.id, "id_proof", kd.content, { reviewedBy: "Priya Nair", reviewerNote: "hold" }) } }));
  S().settleReviews();
  return S().docs[kItem.id].status === "Under Review";
})());
ok("…and a scan nobody could read stays with a person", (() => {
  useOnboarding.setState((s) => ({ docs: { ...s.docs, [kItem.id]: { ...rec(kItem.id, "id_proof", ""), extracted: undefined, extraction: "none" as const } } }));
  S().settleReviews();
  return S().docs[kItem.id].status === "Under Review";
})());
ok("running it again changes nothing more", S().settleReviews() === 0);

console.log("\nwhen the person's details change");
const sid = P("Aarav").id;
const sItem = S().items[sid].find((i) => i.docType === "address_proof")!;
const sctx = ctxOf(P("Aarav"));
const sd = makeSampleDocument("address_proof", sctx, "valid");
const sres = await processDocument({ fileName: sd.fileName, size: sd.content.length, docType: "address_proof", ctx: sctx, content: { kind: "text", text: sd.content } });
S().submitDocument(sid, sItem.id, { fileName: sd.fileName, size: sd.content.length, extraction: "text", extracted: sres.extracted }, "Aarav Mehta", sres);
ok("Aarav's proof of address was accepted automatically", S().docs[sItem.id].status === "Accepted" && S().items[sid].find((i) => i.id === sItem.id)!.status === "completed", S().docs[sItem.id].status);
S().updateEmployee(sid, { startDate: addDays(todayISO(), 200) }, "Priya Nair");
const rechecked = S().docs[sItem.id];
ok("moving the joining date months later re-checks it: the proof is now out of date", rechecked.status === "Correction Requested" && rechecked.issues.some((i) => i.code === "STALE_DOCUMENT"), `${rechecked.status} ${JSON.stringify(rechecked.issues.map((i) => i.code))}`);
ok("…and the item reopens", S().items[sid].find((i) => i.id === sItem.id)!.status !== "completed");
ok("…with the change in the audit trail", S().audit.some((a) => a.personId === sid && /recalculated/.test(a.action)));
void deriveStates;

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
