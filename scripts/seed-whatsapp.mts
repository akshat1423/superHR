/**
 * Fills the WhatsApp tab with sample contacts, approvals and conversations so it isn't empty:
 *   npm run db:seed-wa
 * Uses the Supabase tables when configured, otherwise it only prints what it would add (the in-memory store dies with the process).
 * Idempotent (fixed ids; messages carry a WhatsApp id so repeats are dropped). Every row is marked as demo data:
 * ids start with demo_, emails end in @demo.invalid, phones start with 999000. Remove it all with `npm run db:seed-wa -- --clear` (prints the SQL).
 */
import { createGatedClient, envFromProcess } from "../src/lib/supabase/factory";
import { supabaseStore } from "../src/lib/whatsapp/store";
import type { Snapshot, WaContact, WaMessage, WaRequest } from "../src/lib/whatsapp/types";

try { process.loadEnvFile(".env.local"); } catch { /* use the real environment */ }

if (process.argv.includes("--clear")) {
  console.log(`Run this in the Supabase SQL editor to remove the demo data:
  delete from public.wa_messages where phone like '999000%';
  delete from public.wa_requests where to_phone like '999000%' or id like 'demo_%';
  delete from public.wa_contacts where id like 'demo_%';`);
  process.exit(0);
}

const db = createGatedClient(envFromProcess());
if (!db) {
  console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_APP_KEY), so there is nowhere durable to put demo data.");
  process.exit(1);
}
const s = supabaseStore(db);

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const ahead = (h: number) => new Date(now + h * 3_600_000).toISOString();
const HR = { name: "Priya Nair", email: "priya.nair@demo.invalid" };

const snap = (name: string, role: string, department: string, manager: string, startDate: string, facts: Snapshot["facts"]): Snapshot => ({
  employee: { name, role, department, location: "Bengaluru", country: "IN", grade: "L4", level: "Mid", startDate, manager },
  hr: HR,
  facts,
  updatedAt: ago(30),
});
const fact = (item: string, kind: string, state: "pending" | "completed" | "blocked" | "overdue", dueDate: string, owner: string, ownerFn: string, reason: string) => ({ item, kind, dueDate, owner, ownerFn, state, reason });

const contacts: WaContact[] = [
  { id: "demo_c1", kind: "joiner", personId: "demo_p1", name: "Aarav Mehta", email: "aarav.mehta@demo.invalid", dept: "Engineering", manager: "Arjun Rao", phone: "999000100001", status: "active", joinedAt: ago(60 * 26), lastInboundAt: ago(12), createdBy: "priya.nair", createdAt: ago(60 * 30),
    snapshot: snap("Aarav Mehta", "Backend Engineer", "Engineering", "Arjun Rao", "2026-11-09", [
      fact("Government ID", "document", "pending", "2026-11-04", "Aarav Mehta", "Employee", "Required for every hire before day one."),
      fact("Laptop", "provision", "pending", "2026-11-06", "IT Desk", "IT", "Engineering hires get a laptop shipped before the start date."),
      fact("GitHub access", "provision", "pending", "2026-11-09", "IT Desk", "IT", "Engineering hires need repository access on day one."),
    ]) },
  { id: "demo_c2", kind: "joiner", personId: "demo_p2", name: "Sneha Iyer", email: "sneha.iyer@demo.invalid", dept: "Finance", manager: "Rohan Gupta", phone: "999000100002", status: "active", joinedAt: ago(60 * 20), lastInboundAt: ago(60 * 5), createdBy: "priya.nair", createdAt: ago(60 * 24),
    snapshot: snap("Sneha Iyer", "Financial Analyst", "Finance", "Rohan Gupta", "2026-11-16", [
      fact("PAN card", "document", "completed", "2026-11-06", "Sneha Iyer", "Employee", "Needed for payroll tax set-up."),
      fact("Payroll enrolment", "provision", "pending", "2026-11-12", "Payroll", "Finance", "Finance hires are enrolled before their first pay cycle."),
    ]) },
  { id: "demo_c3", kind: "joiner", personId: "demo_p3", name: "Kabir Shah", email: "kabir.shah@demo.invalid", dept: "Sales", manager: "Meera Joshi", status: "invited", inviteCode: "DEMO42", inviteExpiresAt: ahead(40), createdBy: "priya.nair", createdAt: ago(90) },
  { id: "demo_c4", kind: "joiner", personId: "demo_p4", name: "Diya Kapoor", email: "diya.kapoor@demo.invalid", dept: "Design", manager: "Arjun Rao", phone: "999000100004", status: "opted_out", joinedAt: ago(60 * 48), lastInboundAt: ago(60 * 40), createdBy: "priya.nair", createdAt: ago(60 * 52) },
  { id: "demo_c5", kind: "staff", name: "Arjun Rao", email: "arjun.rao@demo.invalid", dept: "Engineering", phone: "999000100005", status: "active", joinedAt: ago(60 * 72), lastInboundAt: ago(45), createdBy: "priya.nair", createdAt: ago(60 * 80) },
  { id: "demo_c6", kind: "staff", name: "Rohan Gupta", email: "rohan.gupta@demo.invalid", dept: "Finance", phone: "999000100006", status: "active", joinedAt: ago(60 * 70), lastInboundAt: ago(60 * 3), createdBy: "priya.nair", createdAt: ago(60 * 78) },
  { id: "demo_c7", kind: "staff", name: "Meera Joshi", email: "meera.joshi@demo.invalid", dept: "Sales", status: "invited", inviteCode: "DEMO77", inviteExpiresAt: ahead(20), createdBy: "priya.nair", createdAt: ago(60 * 2) },
];
for (const c of contacts) await s.saveContact(c);

const req = (n: number, over: Partial<WaRequest> & Pick<WaRequest, "toPhone" | "toName" | "title" | "body" | "personId" | "itemId">): WaRequest => ({
  id: `demo_r${n}`, code: `DM${n}X`, dept: undefined, manager: undefined, status: "pending", createdBy: "priya.nair", createdAt: ago(20), expiresAt: ahead(70), applied: false, ...over,
});
const requests: { r: WaRequest; decide?: "approved" | "rejected"; at?: number }[] = [
  { r: req(1, { toPhone: "999000100005", toName: "Arjun Rao", personId: "demo_p1", itemId: "laptop", dept: "Engineering", manager: "Arjun Rao", title: "Laptop for Aarav Mehta", body: "Approve a MacBook Pro 14-inch for Aarav Mehta (Backend Engineer, starts 9 Nov)?", createdAt: ago(20) }) },
  { r: req(2, { toPhone: "999000100006", toName: "Rohan Gupta", personId: "demo_p2", itemId: "payroll", dept: "Finance", manager: "Rohan Gupta", title: "Payroll enrolment for Sneha Iyer", body: "Confirm payroll enrolment for Sneha Iyer from the 16 Nov cycle?", createdAt: ago(60 * 6) }), decide: "approved", at: 60 * 5 },
  { r: req(3, { toPhone: "999000100005", toName: "Arjun Rao", personId: "demo_p1", itemId: "github", dept: "Engineering", manager: "Arjun Rao", title: "Admin rights on GitHub for Aarav Mehta", body: "Aarav asked for org admin on GitHub. Approve?", createdAt: ago(60 * 10) }), decide: "rejected", at: 60 * 9 },
  { r: req(4, { toPhone: "999000100006", toName: "Rohan Gupta", personId: "demo_p2", itemId: "expense", dept: "Finance", manager: "Rohan Gupta", title: "Corporate card for Sneha Iyer", body: "Issue a corporate card to Sneha Iyer?", createdAt: ago(60 * 100), expiresAt: ago(60 * 28), status: "expired" }) },
];
for (const { r, decide, at } of requests) {
  if (!(await s.getRequest(r.id))) await s.createRequest(r);
  if (decide) await s.decide(r.id, decide, r.toPhone, ago(at ?? 0));
  if (r.status === "expired") await s.expire(r.id);
}
await s.markApplied(["demo_r2"]);

const m = (n: number, minutesAgo: number, direction: "in" | "out", phone: string, body: string, kind = "text", meta?: Record<string, unknown>): WaMessage =>
  ({ at: ago(minutesAgo), direction, phone, kind, body, waId: `demo.${n}`, mode: "sandbox", meta });
const messages: WaMessage[] = [
  m(1, 60 * 26, "in", "999000100001", "JOIN DEMO11"),
  m(2, 60 * 26 - 1, "out", "999000100001", "Welcome to Superjoin, Aarav. You're connected. Ask me anything about your onboarding, or type HELP."),
  m(3, 60 * 3, "in", "999000100001", "what do i still need to submit"),
  m(4, 60 * 3 - 1, "out", "999000100001", "Two things are open: your Government ID (due 4 Nov) and your laptop shipping address. Your GitHub access is set up on day one."),
  m(5, 14, "in", "999000100001", "why do I need the government id"),
  m(6, 13, "out", "999000100001", "It's required for every hire before day one. Reason: identity and right-to-work checks."),
  m(7, 12, "in", "999000100001", "ok uploading today"),
  m(8, 20, "out", "999000100005", "Approval needed: Laptop for Aarav Mehta. Reply APPROVE DM1X or REJECT DM1X.", "buttons", { buttons: [{ id: "approve:demo_r1", title: "Approve" }, { id: "reject:demo_r1", title: "Reject" }] }),
  m(9, 45, "in", "999000100005", "who is joining my team this month"),
  m(10, 44, "out", "999000100005", "Aarav Mehta (Backend Engineer) joins on 9 Nov. Diya Kapoor from Design has paused WhatsApp messages."),
  m(11, 60 * 6, "out", "999000100006", "Approval needed: Payroll enrolment for Sneha Iyer. Reply APPROVE DM2X or REJECT DM2X.", "buttons", { buttons: [{ id: "approve:demo_r2", title: "Approve" }, { id: "reject:demo_r2", title: "Reject" }] }),
  m(12, 60 * 5, "in", "999000100006", "Approve", "button", { buttonId: "approve:demo_r2" }),
  m(13, 60 * 5 - 1, "out", "999000100006", "Done. Payroll enrolment for Sneha Iyer is approved."),
  m(14, 60 * 10, "out", "999000100005", "Approval needed: Admin rights on GitHub for Aarav Mehta. Reply APPROVE DM3X or REJECT DM3X.", "buttons", { buttons: [{ id: "approve:demo_r3", title: "Approve" }, { id: "reject:demo_r3", title: "Reject" }] }),
  m(15, 60 * 9, "in", "999000100005", "REJECT DM3X"),
  m(16, 60 * 9 - 1, "out", "999000100005", "Noted. Admin rights on GitHub for Aarav Mehta is rejected."),
  m(17, 60 * 40, "in", "999000100004", "STOP"),
  m(18, 60 * 40 - 1, "out", "999000100004", "You won't get messages from Superjoin any more. Send START to turn them back on."),
  m(19, 60 * 5, "in", "999000100002", "can i change my start date"),
  m(20, 60 * 5 - 1, "out", "999000100002", "Start dates are changed by HR, not on WhatsApp. I've left your question for Priya Nair."),
];
let added = 0;
for (const x of messages) if (await s.logMessage(x)) added++;

const all = await s.listContacts();
const rq = await s.listRequests(500);
console.log(`Demo data in place: ${all.filter((c) => c.id.startsWith("demo_")).length} contacts, ${rq.filter((r) => r.id.startsWith("demo_")).length} approvals, ${added} new messages (${messages.length - added} already there).`);
console.log("Open the WhatsApp tab → People / Try it / Activity. Join code for the invited joiner: DEMO42. Remove it all: npm run db:seed-wa -- --clear");
