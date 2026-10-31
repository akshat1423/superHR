// Writes request bodies for /api/documents/process into the directory given as argv[2] (used by e2e.sh).
import { writeFileSync } from "node:fs";
import { usePeople } from "../../src/store/people";
import { ctxOf } from "../../src/lib/onboarding/rules";
import { makeSampleDocument, type SampleVariant } from "../../src/lib/onboarding/documents";

const dir = process.argv[2];
const people = usePeople.getState().people;
const yash = people.find((p) => p.name.startsWith("Yash"))!;
const riya = people.find((p) => p.name.startsWith("Riya"))!;
const body = (p: typeof yash, type: "id_proof" | "address_proof", v: SampleVariant) => {
  const d = makeSampleDocument(type, ctxOf(p), v);
  return { fileName: d.fileName, size: d.content.length, docType: type, person: p, text: d.content };
};
const out: Record<string, unknown> = {
  valid: body(yash, "id_proof", "valid"),
  wrong: body(yash, "id_proof", "wrongName"),
  riya: body(riya, "id_proof", "valid"),
  pdf: { fileName: "id.pdf", size: 4000, docType: "id_proof", person: yash, mime: "application/pdf", data: "JVBERi0xLjQKJSAgbm90IGEgcmVhbCBwZGY=" },
  docx: { fileName: "bill.docx", size: 4000, docType: "address_proof", person: yash, text: "x" },
  baddoc: { ...body(yash, "id_proof", "valid"), docType: "nonsense" },
};
for (const [k, v] of Object.entries(out)) writeFileSync(`${dir}/doc-${k}.json`, JSON.stringify(v));
