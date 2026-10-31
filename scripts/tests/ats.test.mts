import { ATS_LIST, CANON } from "../../src/lib/ats/providers";
import { loadText, parseProfiles, tabularFromCsv } from "../../src/lib/onboarding/datasets";
import { SAMPLE_CSV } from "../../src/lib/sample";
import { SAMPLE_DIRECTORY } from "../../src/lib/onboarding/owners";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const rows = tabularFromCsv(SAMPLE_CSV).rows;
const direct = parseProfiles(loadText("direct.csv", SAMPLE_CSV), SAMPLE_DIRECTORY);

for (const p of ATS_LIST) {
  console.log(`\n${p.name}`);
  const pages: unknown[] = [];
  for (let n = 1; n <= 5; n++) { const page = p.toPage(rows, n, p.pageSize, "acme"); if (p.describe(page).records === 0) break; pages.push(page); }
  const mapped = pages.flatMap((pg) => p.fromPage(pg));
  ok("the whole sample is served across pages", mapped.length === rows.length && pages.length === Math.ceil(rows.length / p.pageSize), `${mapped.length}/${rows.length} in ${pages.length} pages`);
  ok("every page but the last says another follows", pages.every((pg, i) => p.describe(pg).hasNext === (i < pages.length - 1) || p.describe(pg).records < p.pageSize));
  ok("each record is in the vendor's own shape (not our columns)", !JSON.stringify(pages[0]).includes('"full_name"'));
  const lost = mapped.flatMap((m, i) => CANON.filter((k) => (m[k] ?? "") !== (rows[i][k] ?? "")).map((k) => `${rows[i].full_name}.${k}: "${rows[i][k]}" → "${m[k]}"`));
  ok("mapping the vendor payload back loses nothing", lost.length === 0, lost.slice(0, 4).join(" | "));
  const via = parseProfiles({ name: p.name, format: "json", tabular: { headers: [...CANON], rows: mapped } }, SAMPLE_DIRECTORY);
  ok("it validates exactly like the same data uploaded as a file", via.data.length === direct.data.length && JSON.stringify(via.issues.map((i) => i.message)) === JSON.stringify(direct.issues.map((i) => i.message)), `${via.data.length} vs ${direct.data.length}`);
  ok("people come out with the right department, manager and joining date", via.data.every((x, i) => x.name === direct.data[i].name && x.persona.dept === direct.data[i].persona.dept && x.manager === direct.data[i].manager && x.startDate === direct.data[i].startDate));
  ok("an empty or malformed payload maps to no rows instead of throwing", p.fromPage(null).length === 0 && p.fromPage({}).length === 0 && p.fromPage("x").length === 0 && p.describe(null).records === 0);
  ok("the request line names the vendor's real endpoint", p.endpoint("acme", 2).startsWith("GET https://") && p.endpoint("acme", 2).includes("acme"));
}

console.log("\nadding a joiner by hand, and syncing again");
const { usePeople } = await import("../../src/store/people");
const { useOnboarding } = await import("../../src/store/onboarding");
const { useProvisioning } = await import("../../src/store/provisioning");
const before = usePeople.getState().people.length;
const mgr = SAMPLE_DIRECTORY.managers.find((m) => m.department === "Engineering")!;
const form = { full_name: "Zoe Hart", email: "zoe.hart@gmail.com", phone: "", role: "Backend Engineer", department: "Engineering", emp_type: "Full-time", level: "Mid", grade: "L4", location: "Bengaluru", start_date: "2026-11-16", manager: mgr.name, dob: "", address: "", pan: "", aadhaar: "", bank_account: "", photo_url: "", emergency_contact: "", education: "", prev_employer: "", school: "" };
const idStart = usePeople.getState().people.reduce((m, p) => Math.max(m, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? -1)), -1) + 1;
const one = parseProfiles({ name: "Added by hand", format: "json", tabular: { headers: [...CANON], rows: [form] } }, SAMPLE_DIRECTORY, idStart);
ok("a form entry validates with no errors", one.data.length === 1 && one.issues.every((i) => i.severity !== "error"), JSON.stringify(one.issues));
ok("…as the right kind of person", one.data[0].persona.dept === "Engineering" && one.data[0].persona.level === "Mid" && one.data[0].startDate === "2026-11-16" && one.data[0].manager === mgr.name);
ok("a new id that cannot collide with anyone", !usePeople.getState().people.some((p) => p.id === one.data[0].id));
usePeople.getState().addPeople(one.data);
useOnboarding.getState().ensure(usePeople.getState().people);
ok("adding keeps everyone who was already there", usePeople.getState().people.length === before + 1);
ok("…and builds a checklist for the new person only", (useOnboarding.getState().items[one.data[0].id]?.length ?? 0) > 10 && (useOnboarding.getState().items[usePeople.getState().people[0].id]?.length ?? 0) > 10);
const runBefore = useProvisioning.getState().run.people.length;
useProvisioning.getState().append(one.data, "Priya Nair");
const r = useProvisioning.getState().run;
ok("provisioning starts for the new person without touching anyone else's history", r.people.length === runBefore + 1 && r.people.slice(0, runBefore).every((p) => p.state === "finished") && r.people[runBefore].state === "queued");
ok("…as a server-run batch", r.remote === true && useProvisioning.getState().flushedSeq === r.seq && useProvisioning.getState().batch.length === before + 1);
const dupEmails = new Set(usePeople.getState().people.map((p) => p.email.toLowerCase()));
const again = parseProfiles(loadText("direct.csv", SAMPLE_CSV), SAMPLE_DIRECTORY, 100).data.filter((p) => !dupEmails.has(p.email.toLowerCase()));
ok("syncing the same joiners again finds nothing new", again.length === 0, String(again.length));
const bad = parseProfiles({ name: "x", format: "json", tabular: { headers: [...CANON], rows: [{ ...form, manager: "Nobody Known", start_date: "31/02/2026" }] } }, SAMPLE_DIRECTORY, 200);
ok("a hand-typed record with a bad manager and date is rejected with reasons", bad.data.length === 0 && bad.issues.some((i) => /manager/i.test(i.message)) && bad.issues.some((i) => /date/i.test(i.message)), JSON.stringify(bad.issues.map((i) => i.message)));

console.log("\nthe demo tenant's first sync");
const { demoTenantRows } = await import("../../src/lib/ats/demoTenant");
const tenant = demoTenantRows();
const known = new Set(usePeople.getState().people.map((p) => p.email.toLowerCase()));
const syncParsed = parseProfiles({ name: "sync", format: "json", tabular: { headers: [...CANON], rows: tenant } }, SAMPLE_DIRECTORY, 500);
const fresh = syncParsed.data.filter((p) => !known.has(p.email.toLowerCase()));
ok("the tenant has the people already onboarding plus new hires", tenant.length === 19, String(tenant.length));
ok("exactly the new hires come through as new, and every one is valid", fresh.length === tenant.length - 14 && fresh.length >= 5 && syncParsed.issues.every((i) => i.severity !== "error"), `${fresh.length} new, issues ${JSON.stringify(syncParsed.issues.map((i) => i.message))}`);
ok("…the other 14 are recognised as already onboarding", syncParsed.data.length - fresh.length === 14);
ok("the new hires span departments, countries and levels (so checklists differ)", new Set(fresh.map((p) => p.persona.dept)).size >= 3 && new Set(fresh.map((p) => p.location)).size >= 4 && fresh.some((p) => p.persona.type === "Intern"));
ok("some have gaps, so the data-missing flow has something to show", fresh.some((p) => Object.values(p.fields).includes("missing")));
const ghPages = ATS_LIST[0];
const pagesN = Math.ceil(tenant.length / ghPages.pageSize);
ok("the tenant is served in more than one page", pagesN >= 2 && ghPages.describe(ghPages.toPage(tenant, 1, ghPages.pageSize, "acme")).records === ghPages.pageSize);
usePeople.getState().addPeople(fresh);
useOnboarding.getState().ensure(usePeople.getState().people);
const again2 = syncParsed.data.filter((p) => !new Set(usePeople.getState().people.map((x) => x.email.toLowerCase())).has(p.email.toLowerCase()));
ok("after adding them, syncing again finds nothing new", again2.length === 0);
ok("each new hire has a checklist, and the US one gets US requirements", fresh.every((p) => (useOnboarding.getState().items[p.id]?.length ?? 0) > 10) && useOnboarding.getState().items[fresh.find((p) => p.location === "Austin")!.id].some((i) => i.reason.includes("US") || i.policy === "POL-02"));

console.log("\nthe reference-data editors");
const { parseRequirements, parsePolicies, parseDirectory } = await import("../../src/lib/onboarding/datasets");
const { DEFAULT_REQUIREMENTS } = await import("../../src/lib/onboarding/rules");
const { SAMPLE_POLICIES } = await import("../../src/lib/onboarding/policies");
const reqs = parseRequirements({ name: "e", format: "json", json: JSON.parse(JSON.stringify(DEFAULT_REQUIREMENTS)) }, SAMPLE_POLICIES.map((p) => p.id));
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
ok("opening the rules editor and saving unchanged is a no-op", reqs.issues.every((i) => i.severity !== "error") && canon(reqs.data) === canon(DEFAULT_REQUIREMENTS), `${reqs.data.length}/${DEFAULT_REQUIREMENTS.length}`);
const pols = parsePolicies({ name: "e", format: "json", json: JSON.parse(JSON.stringify(SAMPLE_POLICIES)) });
ok("…and so is the policies editor", pols.issues.length === 0 && JSON.stringify(pols.data) === JSON.stringify(SAMPLE_POLICIES));
const dirp = parseDirectory({ name: "e", format: "json", json: JSON.parse(JSON.stringify(SAMPLE_DIRECTORY)) });
ok("…and the owners editor", dirp.issues.every((i) => i.severity !== "error") && dirp.data[0].owners.length === SAMPLE_DIRECTORY.owners.length && dirp.data[0].managers.length === SAMPLE_DIRECTORY.managers.length && SAMPLE_DIRECTORY.departments.every((d) => dirp.data[0].departments.includes(d)));
const broken = parseRequirements({ name: "e", format: "json", json: [{ ...DEFAULT_REQUIREMENTS[0], owner: "Wizard" }, { ...DEFAULT_REQUIREMENTS[1], dueOffset: 1.5 }, { ...DEFAULT_REQUIREMENTS[2], dependsOn: ["NOPE"] }] });
ok("a rule with a bad owner, a fractional due date or an unknown dependency is flagged as the editor would show it", errorsOf(broken.issues).length >= 3, JSON.stringify(broken.issues.map((i) => i.field)));
function errorsOf<T extends { severity: string }>(i: T[]) { return i.filter((x) => x.severity === "error"); }
const loop = parseRequirements({ name: "e", format: "json", json: [{ ...DEFAULT_REQUIREMENTS[0], id: "A", dependsOn: ["B"] }, { ...DEFAULT_REQUIREMENTS[1], id: "B", dependsOn: ["A"] }] });
ok("a dependency loop made in the editor is caught", loop.issues.some((i) => /loop/.test(i.message)));
ok("an owner with a bad email is flagged", errorsOf(parseDirectory({ name: "e", format: "json", json: { owners: [{ fn: "HR", department: "*", location: "*", name: "A", email: "nope" }], managers: [], departments: [] } }).issues).length > 0);
ok("a policy with an empty section is flagged", errorsOf(parsePolicies({ name: "e", format: "json", json: [{ id: "P", title: "t", version: "v1", appliesTo: {}, sections: [{ id: "§1", heading: "", text: "  " }] }] }).issues).length > 0);
const ob = useOnboarding.getState();
const someone = usePeople.getState().people[0];
const nBefore = ob.items[someone.id].length;
const out = ob.setRequirements([...DEFAULT_REQUIREMENTS, { id: "R-EDIT-1", item: "Meet the security champion", kind: "activity", owner: "IT", dueOffset: 2, when: {}, because: "Added in the editor" }], "Edited in the app", "Priya Nair");
ok("saving an added rule puts the item on every checklist and says how many changed", out.added >= usePeople.getState().people.length && useOnboarding.getState().items[someone.id].length === nBefore + 1 && useOnboarding.getState().items[someone.id].some((i) => i.item === "Meet the security champion" && i.reason.includes("editor")), JSON.stringify(out));
ob.setRequirements(DEFAULT_REQUIREMENTS, "Built-in sample", "Priya Nair");

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
