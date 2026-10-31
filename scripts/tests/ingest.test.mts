import { readFileSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { loadText, tabularFromRows, parseProfiles, parseRequirements, parsePolicies, parseDirectory, errorsOf } from "../../src/lib/onboarding/datasets";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";
import { SAMPLE_POLICIES } from "../../src/lib/onboarding/policies";
import { DEFAULT_REQUIREMENTS, ctxOf, generateChecklist } from "../../src/lib/onboarding/rules";

const S = new URL("../../public/samples/", import.meta.url).pathname;
const txt = (f: string) => readFileSync(S + f, "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const sig = (r: ReturnType<typeof parseProfiles>) => JSON.stringify(r.data.map((p) => [p.name, p.role, p.persona.dept, p.persona.level, p.location, p.grade, p.startDate, p.dob, p.manager]));

console.log("employee profiles: one dataset, three formats");
const csv = parseProfiles(loadText("new-joiners.csv", txt("new-joiners.csv")), SAMPLE_DIRECTORY);
const json = parseProfiles(loadText("new-joiners.json", txt("new-joiners.json")), SAMPLE_DIRECTORY);
const xlsxRows = (await readSheet(S + "new-joiners.xlsx")) as unknown[][];
const xlsx = parseProfiles({ name: "new-joiners.xlsx", format: "xlsx", tabular: tabularFromRows(xlsxRows) }, SAMPLE_DIRECTORY);
ok("CSV imports all 14 with no errors", csv.data.length === 14 && errorsOf(csv.issues).length === 0, JSON.stringify(csv.issues.slice(0, 3)));
ok("JSON imports the same 14", json.data.length === 14 && errorsOf(json.issues).length === 0);
ok("Excel (real date cells) imports the same 14", xlsx.data.length === 14 && errorsOf(xlsx.issues).length === 0, JSON.stringify(xlsx.issues.slice(0, 3)));
ok("CSV, JSON and Excel give identical employees", sig(csv) === sig(json) && sig(csv) === sig(xlsx), `\n csv ${sig(csv).slice(0, 160)}\n xls ${sig(xlsx).slice(0, 160)}`);
ok("Excel dates arrive as ISO joining dates", xlsx.data[0].startDate === "2026-10-30" && xlsx.data[0].dob === "1998-04-12", `${xlsx.data[0].startDate} ${xlsx.data[0].dob}`);

console.log("validation catches each kind of problem");
const bad = parseProfiles(loadText("e.csv", txt("new-joiners-with-errors.csv")), SAMPLE_DIRECTORY);
const msg = (row: number) => bad.issues.filter((i) => i.row === row).map((i) => `${i.severity}:${i.field}:${i.message}`).join(" | ");
console.log(bad.issues.map((i) => `   row ${i.row} ${i.severity.padEnd(7)} ${i.field ?? ""} — ${i.message}`).join("\n"));
ok("valid row imports", bad.data.some((p) => p.name === "Anjali Verma"));
ok("impossible date 31/02 rejected", /isn't a valid date/.test(msg(2)) && !bad.data.some((p) => p.name === "Bad Date"));
ok("unknown department rejected with suggestion", /Unknown department "Marketing"/.test(msg(3)) && !bad.data.some((p) => p.name === "Wrong Dept"));
ok("misspelt manager rejected with 'did you mean Arjun Rao'", /did you mean Arjun Rao/.test(msg(4)));
ok("missing grade rejected", /Grade is required/.test(msg(5)));
ok("duplicate email rejected", /Duplicate of row 1/.test(msg(6)));
ok("unknown office is a warning, row still imported", /warning:location/.test(msg(7)) && bad.data.some((p) => p.name === "Odd Office"));
ok("exactly 2 rows imported, 5 rejected", bad.data.length === 2 && bad.rejected === 5, `${bad.data.length}/${bad.rejected}`);
const noCol = parseProfiles(loadText("x.csv", "name,role\nA,B"), SAMPLE_DIRECTORY);
ok("missing mandatory columns reported once, nothing imported", noCol.data.length === 0 && /Missing mandatory columns?: grade, department, location, manager, joining date/.test(noCol.issues[0].message), noCol.issues[0]?.message);
ok("empty file reported", parseProfiles(loadText("x.csv", ""), SAMPLE_DIRECTORY).issues[0].severity === "error");
ok("invalid JSON gives a readable error", (() => { try { loadText("x.json", "{oops"); return false; } catch (e) { return /isn't valid JSON/.test((e as Error).message); } })());

console.log("requirements: CSV and JSON equal the built-in rules");
const policyIds = SAMPLE_POLICIES.map((p) => p.id);
const rc = parseRequirements(loadText("requirements.csv", txt("requirements.csv")), policyIds);
const rj = parseRequirements(loadText("requirements.json", txt("requirements.json")), policyIds);
ok("CSV: 29 rules, no errors", rc.data.length === 29 && errorsOf(rc.issues).length === 0, JSON.stringify(rc.issues.slice(0, 3)));
ok("JSON: 29 rules, no errors", rj.data.length === 29 && errorsOf(rj.issues).length === 0, JSON.stringify(rj.issues.slice(0, 3)));
const people = csv.data;
const check = (reqs: typeof DEFAULT_REQUIREMENTS) => JSON.stringify(people.map((p) => generateChecklist(ctxOf(p), reqs, SAMPLE_DIRECTORY).map((i) => [i.ruleId, i.dueDate, i.owner.name, i.policy, i.dependsOn.length])));
ok("checklists from CSV rules == built-in rules (all 14 people)", check(rc.data) === check(DEFAULT_REQUIREMENTS));
ok("checklists from JSON rules == built-in rules", check(rj.data) === check(DEFAULT_REQUIREMENTS));
const badReq = parseRequirements(loadText("r.csv", [
  "id,item,kind,owner,due_offset,depends_on",
  "A,Do A,document,Employee,-5,",
  "A,Dup,document,Employee,-5,",
  "B,Do B,bogus,Employee,-5,",
  "C,Do C,activity,Nobody,-5,",
  "D,Do D,activity,HR,soon,",
  "E,Do E,activity,HR,-1,Z",
  "F,Do F,activity,HR,-1,G",
  "G,Do G,activity,HR,-1,F",
].join("\n")));
const emsg = badReq.issues.map((i) => `${i.label}:${i.message}`).join(" | ");
console.log("   " + badReq.issues.map((i) => `${i.label ?? "-"} — ${i.message}`).join("\n   "));
ok("duplicate id, bad kind, bad owner, non-numeric offset all rejected", /Duplicate requirement id A/.test(emsg) && /kind must be/.test(emsg) && /owner must be/.test(emsg) && /due_offset must be a whole number/.test(emsg));
ok("dependency on unknown rule rejected", /depends on unknown requirement Z/.test(emsg));
ok("dependency loop detected", /dependency loop/.test(emsg));
ok("only the valid rule survives", badReq.data.map((r) => r.id).join() === "A", badReq.data.map((r) => r.id).join());

console.log("policies: JSON, CSV, markdown");
const pj = parsePolicies(loadText("policies.json", txt("policies.json")));
const pc = parsePolicies(loadText("policies.csv", txt("policies.csv")));
const pm = parsePolicies(loadText("policy-remote-work.md", txt("policy-remote-work.md")));
ok("JSON: 11 policies", pj.data.length === 11 && errorsOf(pj.issues).length === 0);
ok("CSV (one row per section): same 11 policies and section count", pc.data.length === 11 && pc.data.reduce((n, p) => n + p.sections.length, 0) === pj.data.reduce((n, p) => n + p.sections.length, 0), `${pc.data.length}`);
ok("CSV keeps country applicability", pc.data.find((p) => p.id === "POL-02")!.appliesTo.countries?.[0] === "US");
ok("Markdown: id, countries and sections from front matter + headings", pm.data[0].id === "POL-12" && pm.data[0].appliesTo.countries?.length === 2 && pm.data[0].sections.length === 2 && pm.data[0].title === "Remote Work and Equipment Policy", JSON.stringify(pm.data[0]).slice(0, 200));
ok("empty policy rejected", errorsOf(parsePolicies(loadText("p.json", "[{\"id\":\"X\",\"sections\":[]}]")).issues).length === 1);

console.log("owners and directory");
const oj = parseDirectory(loadText("owners.json", txt("owners.json")));
const oc = parseDirectory(loadText("owners.csv", txt("owners.csv")));
ok("JSON directory: 17 owners, 7 managers", oj.data[0].owners.length === 17 && oj.data[0].managers.length === 7);
ok("CSV directory equals JSON directory", JSON.stringify(oc.data[0].owners) === JSON.stringify(oj.data[0].owners) && JSON.stringify(oc.data[0].managers.map((m) => m.name)) === JSON.stringify(oj.data[0].managers.map((m) => m.name)));
const od = parseDirectory(loadText("o.csv", "type,fn,department,location,name,email\nowner,HR,*,IN,Priya,not-an-email\nowner,Wizard,*,IN,X,x@y.com"));
ok("bad owner email and unknown function rejected", errorsOf(od.issues).length >= 2);

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
