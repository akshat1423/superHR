// The WhatsApp store's behaviour, as one set of checks run against every implementation.
//   npm test            → the in-memory store
//   npm run test:wa-db  → also the real Supabase store (needs the tables from `npm run db:sql`). It writes a few rows, all
//                         marked: emails end in @test.invalid and phones start with 999000. Clear them with the SQL it prints.
import { createGatedClient, envFromProcess } from "../../src/lib/supabase/factory";
import { memoryStore, supabaseStore, type WaStore } from "../../src/lib/whatsapp/store";
import type { WaContact, WaMessage, WaRequest } from "../../src/lib/whatsapp/types";

try { process.loadEnvFile(".env.local"); } catch { /* use the real environment */ }
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };

const run = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const phone = () => `999000${Math.floor(100000 + Math.random() * 899999)}`;
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.now();

async function contract(label: string, s: WaStore) {
  console.log(`\n${label}`);
  const P1 = phone(), P2 = phone(), P3 = phone();
  const snap = { employee: { name: "Test Person", role: "Engineer", department: "Engineering", location: "Bengaluru", country: "IN" as const, grade: "L4", level: "Mid" as const, startDate: "2026-11-02", manager: "Arjun Rao" }, hr: { name: "Priya Nair", email: "priya@x.com" }, facts: [{ item: "ID", kind: "document", dueDate: "2026-10-25", owner: "Test", ownerFn: "Employee", state: "pending" as const, reason: "because" }], updatedAt: iso(NOW) };
  const c1: WaContact = { id: `zz_${run}_a`, kind: "joiner", personId: `zz_${run}_p`, name: "Test Person", email: `Joiner.${run}@test.invalid`, dept: "Engineering", manager: "Arjun Rao", status: "invited", inviteCode: `ZZ${run.slice(-4).toUpperCase()}`, inviteExpiresAt: iso(NOW + 86_400_000), snapshot: snap, createdBy: "test", createdAt: iso(NOW) };
  await s.saveContact(c1);
  const back = await s.contactById(c1.id);
  ok("a contact round-trips, including its snapshot and dates", back?.name === "Test Person" && back.snapshot?.facts[0].item === "ID" && back.snapshot.employee.country === "IN" && back.inviteCode === c1.inviteCode && Date.parse(back.inviteExpiresAt!) === Date.parse(c1.inviteExpiresAt!), JSON.stringify(back)?.slice(0, 200));
  ok("…found by invite code (any case)", (await s.contactByCode(c1.inviteCode!.toLowerCase()))?.id === c1.id);
  ok("…by person id", (await s.contactByPerson(c1.personId!))?.id === c1.id);
  ok("…by email in any state, any case", (await s.contactByEmailAny(c1.email!.toUpperCase()))?.id === c1.id);
  ok("…but not by email while still only invited (that lookup means 'has joined')", (await s.contactByEmail(c1.email!)) === null);
  ok("an unknown phone is not found", (await s.contactByPhone(P1)) === null);

  await s.saveContact({ ...c1, phone: P1, status: "active", joinedAt: iso(NOW), lastInboundAt: iso(NOW), inviteCode: undefined, inviteExpiresAt: undefined });
  const joined = await s.contactById(c1.id);
  ok("joining sets the phone and clears the code", joined?.phone === P1 && joined.status === "active" && !joined.inviteCode && !!joined.snapshot);
  ok("…found by phone, and by email now that they've joined", (await s.contactByPhone(P1))?.id === c1.id && (await s.contactByEmail(c1.email!.toLowerCase()))?.id === c1.id);
  ok("the old code no longer finds anyone", (await s.contactByCode(c1.inviteCode!)) === null);
  const c2: WaContact = { id: `zz_${run}_b`, kind: "staff", name: "Other", email: `staff.${run}@test.invalid`, status: "invited", createdBy: "test", createdAt: iso(NOW) };
  await s.saveContact(c2);
  let threw = false;
  try { await s.saveContact({ ...c2, phone: P1, status: "active" }); } catch (e) { threw = /already linked/.test((e as Error).message); }
  ok("one number can't be linked to two people", threw);
  ok("…and the first is untouched", (await s.contactByPhone(P1))?.id === c1.id);
  await s.saveContact({ ...c1, phone: undefined, snapshot: undefined, status: "invited", joinedAt: undefined, lastInboundAt: undefined });
  const left = await s.contactById(c1.id);
  ok("leaving clears the number and the snapshot", !left?.phone && !left?.snapshot && left?.status === "invited" && (await s.contactByPhone(P1)) === null);
  ok("listContacts includes both", (await s.listContacts()).filter((c) => c.id === c1.id || c.id === c2.id).length === 2);

  // approvals
  await s.saveContact({ ...c2, phone: P2, status: "active", joinedAt: iso(NOW) });
  const mk = (n: string, over: Partial<WaRequest> = {}): WaRequest => ({ id: `zz_${run}_r${n}`, code: `Q${n}W${n}`, personId: "p0", itemId: `i${n}`, dept: "Engineering", manager: "Arjun Rao", toPhone: P2, toName: "Other", title: `Req ${n}`, body: "b", status: "pending", createdBy: "test", createdAt: iso(NOW), expiresAt: iso(NOW + 72 * 3_600_000), applied: false, ...over });
  const r1 = mk("1"), r2 = mk("2", { createdAt: iso(NOW + 1000) }), rOld = mk("3", { expiresAt: iso(NOW - 1000) });
  for (const r of [r1, r2, rOld]) await s.createRequest(r);
  ok("a request round-trips", (await s.getRequest(r1.id))?.title === "Req 1" && (await s.getRequest(r1.id))?.applied === false);
  const pend = await s.pendingFor(P2, iso(NOW));
  ok("pendingFor lists only unexpired pending requests for that number, newest first", pend.map((r) => r.id).join() === [r2.id, r1.id].join(), pend.map((r) => r.id).join());
  ok("…and none for someone else", (await s.pendingFor(P3, iso(NOW))).length === 0);
  ok("the wrong number can't decide", (await s.decide(r1.id, "approved", P3, iso(NOW))) === null && (await s.getRequest(r1.id))?.status === "pending");
  ok("an expired request can't be decided", (await s.decide(rOld.id, "approved", P2, iso(NOW))) === null);
  const race = await Promise.all([s.decide(r1.id, "approved", P2, iso(NOW)), s.decide(r1.id, "rejected", P2, iso(NOW)), s.decide(r1.id, "approved", P2, iso(NOW))]);
  ok("three answers at once: exactly one wins", race.filter(Boolean).length === 1, JSON.stringify(race.map((r) => r?.status ?? null)));
  const won = race.find(Boolean)!;
  ok("…and the stored answer is the winner's, with who and when", (await s.getRequest(r1.id))?.status === won.status && (await s.getRequest(r1.id))?.decidedByPhone === P2 && !!(await s.getRequest(r1.id))?.decidedAt);
  ok("an answered request can't be answered again", (await s.decide(r1.id, won.status === "approved" ? "rejected" : "approved", P2, iso(NOW))) === null);
  ok("it now waits to be applied", (await s.decidedUnapplied()).some((r) => r.id === r1.id) && !(await s.decidedUnapplied()).some((r) => r.id === r2.id));
  await s.markApplied([r1.id]);
  ok("…and stops waiting once applied", !(await s.decidedUnapplied()).some((r) => r.id === r1.id) && (await s.getRequest(r1.id))?.applied === true);
  await s.expire(r2.id);
  ok("expiring a pending request takes it out of pendingFor", (await s.getRequest(r2.id))?.status === "expired" && (await s.pendingFor(P2, iso(NOW))).length === 0);
  await s.expire(r1.id);
  ok("expiring one already answered changes nothing", (await s.getRequest(r1.id))?.status === won.status);
  ok("listRequests includes them", (await s.listRequests(500)).filter((r) => r.id.startsWith(`zz_${run}_r`)).length === 3);

  // messages
  const m = (waId: string | undefined, dir: "in" | "out", body: string, at: number, ph = P2): WaMessage => ({ at: iso(at), direction: dir, phone: ph, kind: "text", body, waId, mode: "sandbox", meta: dir === "out" ? { buttons: [{ id: "a", title: "A" }] } : undefined });
  ok("a message is recorded", (await s.logMessage(m(`wamid.${run}.1`, "in", "hello", NOW))) === true);
  ok("the same WhatsApp id again is refused as a duplicate", (await s.logMessage(m(`wamid.${run}.1`, "in", "hello", NOW))) === false);
  await s.logMessage(m(undefined, "out", "reply one", NOW + 1000));
  await s.logMessage(m(undefined, "out", "reply two", NOW + 2000));
  await s.logMessage(m(`wamid.${run}.2`, "in", "other number", NOW + 3000, P3));
  const recent = await s.recentMessages(50, P2);
  ok("recentMessages is newest first and limited to that number", recent.map((x) => x.body).join("|") === "reply two|reply one|hello", recent.map((x) => x.body).join("|"));
  ok("…and keeps the buttons in meta", Array.isArray((recent[0].meta as { buttons?: unknown[] })?.buttons));
  ok("countIn counts that number's inbound messages since a time", (await s.countIn(P2, iso(NOW - 1000))) === 1 && (await s.countIn(P2, iso(NOW + 500))) === 0 && (await s.countIn(P3, iso(NOW - 1000))) === 1);
  ok("lastOut is the time of our latest reply to that number", Date.parse((await s.lastOut(P2))!) === NOW + 2000 && (await s.lastOut(P3)) === null);
}

await contract("in-memory store", memoryStore());

if (process.env.WA_DB === "1") {
  const db = createGatedClient(envFromProcess());
  if (!db) { console.log("\n(WA_DB=1 but Supabase isn't configured: skipped)"); }
  else {
    await contract("Supabase store (real tables)", supabaseStore(db));
    console.log(`\nTest rows were written to your Supabase project. To clear them, run this in the SQL editor:
  delete from public.wa_messages where phone like '999000%';
  delete from public.wa_requests where to_phone like '999000%';
  delete from public.wa_contacts where email like '%@test.invalid';`);
  }
}

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
