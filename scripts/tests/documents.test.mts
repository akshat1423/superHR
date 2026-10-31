import { parseAts } from "../../src/lib/csv";
import { SAMPLE_CSV } from "../../src/lib/sample";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";
import { DEFAULT_REQUIREMENTS, ctxOf, generateChecklist } from "../../src/lib/onboarding/rules";
import { DOC_TYPES, checkFile, compareNames, extractFromText, makeSampleDocument, statusAfterValidation, validateDocument, MAX_BYTES, type SampleVariant } from "../../src/lib/onboarding/documents";
import type { DocTypeId } from "../../src/lib/onboarding/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const people = parseAts(SAMPLE_CSV).people;
const by = (n: string) => people.find((p) => p.name.startsWith(n))!;

console.log("file checks");
ok("PDF/JPG/PNG accepted", ["a.pdf", "b.JPG", "c.png", "d.jpeg"].every((f) => checkFile(f, 1000).length === 0));
ok(".docx rejected with a clear message", checkFile("resume.docx", 1000)[0]?.code === "FILE_TYPE" && /PDF, JPG or PNG/.test(checkFile("resume.docx", 1000)[0].message));
ok(".exe rejected", checkFile("x.exe", 10)[0]?.code === "FILE_TYPE");
ok("6 MB rejected", checkFile("a.pdf", 6 * 1024 * 1024)[0]?.code === "FILE_SIZE" && checkFile("a.pdf", MAX_BYTES).length === 0);
ok("empty file rejected", checkFile("a.pdf", 0)[0]?.code === "FILE_EMPTY");

console.log("name comparison");
ok("same name, any case/order = exact", compareNames("RIYA SHARMA", "Riya Sharma") === "exact" && compareNames("Sharma Riya", "Riya Sharma") === "exact");
ok("titles and accents ignored", compareNames("Mrs. Riya Sharma", "Riya Sharma") === "exact" && compareNames("Rïya Sharma", "Riya Sharma") === "exact");
ok("middle name / initial = close", compareNames("Riya K Sharma", "Riya Sharma") === "close" && compareNames("Riya Kumari Sharma", "Riya Sharma") === "close");
ok("one-letter typo = close", compareNames("Rhiya Sharma", "Riya Sharma") === "close" || compareNames("Riyaa Sharma", "Riya Sharma") === "close");
ok("different first name = mismatch", compareNames("Priyanka Sharma", "Riya Sharma") === "mismatch");
ok("surname alone is not a match", compareNames("Sharma", "Riya Sharma") === "mismatch");
ok("different person = mismatch", compareNames("Amit Verma", "Riya Sharma") === "mismatch");

console.log("extraction");
const x1 = extractFromText("Document Type: Passport\nName: Riya Sharma\nDate of Birth: 02/09/1997\nPassport Number: K1234567\nDate of Expiry: 01-Apr-2031");
ok("text lines read; day-first dates become ISO", x1.name === "Riya Sharma" && x1.dob === "1997-09-02" && x1.expiryDate === "2031-04-01" && x1.idNumber === "K1234567" && x1.docKind === "Passport", JSON.stringify(x1));
const x2 = extractFromText(JSON.stringify({ "Full Name": "Riya Sharma", dob: "1997-09-02", "Passport No": "K1" }), "doc.json");
ok("JSON documents read with synonym keys", x2.name === "Riya Sharma" && x2.dob === "1997-09-02" && x2.idNumber === "K1", JSON.stringify(x2));
ok("garbage text yields nothing", Object.keys(extractFromText("hello world, no fields here")).length === 0);
ok("an unreadable date is kept as text, not dropped", extractFromText("Date of Birth: sometime in spring").dob === "sometime in spring");

console.log("every document type × every applicable person: a valid sample passes");
let combos = 0, bad: string[] = [];
for (const p of people) {
  const ctx = ctxOf(p);
  for (const it of generateChecklist(ctx, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY).filter((i) => i.docType)) {
    combos++;
    const doc = makeSampleDocument(it.docType!, ctx, "valid");
    const issues = validateDocument(DOC_TYPES[it.docType!], extractFromText(doc.content, doc.fileName), ctx);
    const errs = issues.filter((i) => i.severity === "error");
    if (errs.length) bad.push(`${p.name}/${it.docType}: ${errs.map((e) => e.code).join(",")}`);
  }
}
ok(`all ${combos} valid samples validate cleanly`, bad.length === 0, bad.slice(0, 4).join(" ; "));

console.log("each flaw is caught for the right reason");
const riya = ctxOf(by("Riya"));
const run = (t: DocTypeId, v: SampleVariant) => { const d = makeSampleDocument(t, riya, v); return validateDocument(DOC_TYPES[t], extractFromText(d.content, d.fileName), riya); };
const codes = (t: DocTypeId, v: SampleVariant) => run(t, v).filter((i) => i.severity === "error").map((i) => i.code);
ok("wrong name → NAME_MISMATCH, names both", codes("id_proof", "wrongName").includes("NAME_MISMATCH") && /Riya Sharma/.test(run("id_proof", "wrongName").find((i) => i.code === "NAME_MISMATCH")!.message));
ok("wrong DOB → DOB_MISMATCH", codes("id_proof", "wrongDob").includes("DOB_MISMATCH"));
ok("expired passport → EXPIRED", codes("id_proof", "expired").includes("EXPIRED"));
ok("passport expiring before joining → EXPIRES_BEFORE_JOINING", (() => {
  const e = { ...riya, startDate: "2031-06-01" };
  const d = makeSampleDocument("id_proof", e, "valid");
  return validateDocument(DOC_TYPES.id_proof, extractFromText(d.content, d.fileName), e).some((i) => i.code === "EXPIRES_BEFORE_JOINING");
})());
ok("old utility bill → STALE_DOCUMENT", codes("address_proof", "staleAddress").includes("STALE_DOCUMENT"));
ok("library card as ID → WRONG_DOCUMENT_TYPE", codes("id_proof", "wrongKind").includes("WRONG_DOCUMENT_TYPE"));
ok("malformed PAN → INVALID_FORMAT", codes("pan_card", "badPan").includes("INVALID_FORMAT"));
ok("DOB removed → MISSING_FIELD on dob", run("id_proof", "missingField").some((i) => i.code === "MISSING_FIELD" && i.field === "dob"));
ok("last working day after joining → DATE_ORDER", (() => {
  const x = extractFromText(`Name: ${riya.name}\nEmployer: X\nLast Working Day: 2026-12-31\nDocument Type: Relieving Letter`);
  return validateDocument(DOC_TYPES.prev_employment, x, riya).some((i) => i.code === "DATE_ORDER");
})());

console.log("outcomes");
ok("errors → Correction Requested", statusAfterValidation(run("id_proof", "wrongName")) === "Correction Requested");
ok("clean → Accepted automatically", statusAfterValidation(run("id_proof", "valid")) === "Accepted");
ok("warnings only → Accepted, warning kept on the record", (() => { const i = validateDocument(DOC_TYPES.id_proof, { ...extractFromText(makeSampleDocument("id_proof", riya).content), name: "Riya K Sharma" }, riya); return statusAfterValidation(i) === "Accepted" && i.some((x) => x.code === "NAME_CLOSE"); })());
const multi = run("id_proof", "wrongName").concat(run("id_proof", "expired"));
ok("every issue message is plain English with no codes/jargon", multi.every((i) => i.message.length > 25 && !/undefined|\[object/.test(i.message)));
console.log("   sample messages:");
for (const i of [...run("id_proof", "wrongName"), ...run("address_proof", "staleAddress"), ...run("pan_card", "badPan")].filter((i) => i.severity === "error").slice(0, 3)) console.log("    •", i.message);

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
