import { parseAts } from "../../src/lib/csv";
import { SAMPLE_CSV } from "../../src/lib/sample";
import { todayISO } from "../../src/lib/dates";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "../../src/lib/onboarding/policies";
import { DEFAULT_REQUIREMENTS, ctxOf, generateChecklist } from "../../src/lib/onboarding/rules";
import { deriveStates } from "../../src/lib/onboarding/status";
import { answer, buildSources, toFacts, type AssistantInput, type Completer } from "../../src/lib/onboarding/assistant";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const p = parseAts(SAMPLE_CSV).people.find((x) => x.name.startsWith("Yash"))!;
const e = ctxOf(p);
const items = generateChecklist(e, DEFAULT_REQUIREMENTS, SAMPLE_DIRECTORY);
const make = (question: string): AssistantInput => ({ question, employee: e, hr: { name: "Priya Nair", email: "priya.nair@acme.com" }, facts: toFacts(items, deriveStates(items, {}, todayISO())), policies: SAMPLE_POLICIES });
const reply = (o: unknown): Completer => async () => ({ text: typeof o === "string" ? o : JSON.stringify(o) });

console.log("answer(): the model path, with a fake model");
const q = make("How long does background verification take?");
const ids = buildSources(q).sources.map((s) => s.id);
const policyId = ids.find((i) => i === "POL-04 §2")!;
ok("the relevant passage is among the sources the model gets", !!policyId);

const good = await answer(q, reply({ answer: "It usually takes 5 to 7 business days.", covered: true, citations: [policyId] }));
ok("a verified AI answer is returned as AI, with its citation resolved", good.mode === "ai" && good.covered && good.citations[0].id === "POL-04 §2" && !good.note);

const fake = await answer(q, reply({ answer: "It takes 2 days, per POL-99.", covered: true, citations: ["POL-99 §1"] }));
ok("an invented citation is rejected → falls back to quoted approved text, and says why", fake.mode === "extractive" && /couldn't be verified/.test(fake.note ?? "") && /5 to 7 business days/.test(fake.answer) && fake.citations.every((c) => ids.includes(c.id)), JSON.stringify(fake).slice(0, 220));

const uncited = await answer(q, reply({ answer: "Two days.", covered: true, citations: [] }));
ok("a confident answer that cites nothing is rejected", uncited.mode === "extractive" && !!uncited.note);

const nc = await answer(make("Can I bring my dog?"), reply({ answer: "Yes, dogs are welcome on Fridays!", covered: false, citations: [] }));
ok("'not covered' uses OUR wording, never the model's prose", !nc.covered && /Priya Nair/.test(nc.answer) && !/dogs are welcome/i.test(nc.answer), nc.answer);

const junk = await answer(q, reply("Sure! Verification takes about a week."));
ok("a non-JSON reply is rejected → extractive fallback", junk.mode === "extractive" && /not valid JSON/.test(junk.note ?? ""));

const refused = await answer(q, async () => ({ text: "", refused: true }));
ok("a refusal degrades to approved text instead of an error", refused.mode === "extractive" && /declined/.test(refused.note ?? "") && refused.covered);

const boom = await answer(q, async () => { throw new Error("network"); });
ok("an API error degrades gracefully", boom.mode === "extractive" && /unavailable/.test(boom.note ?? "") && boom.covered);

const off = await answer(q);
ok("no key → quoted approved text with a clear note", off.mode === "extractive" && /AI is off/.test(off.note ?? "") && /5 to 7 business days/.test(off.answer));

const docs = await answer(make("Which documents do I need to submit?"), reply({ answer: "You need your photo ID, address proof, PAN and education certificate.", covered: true, citations: ["CL-1", "CL-3"] }));
ok("checklist facts can be cited by the model", docs.mode === "ai" && docs.citations.every((c) => c.kind === "checklist"));

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
