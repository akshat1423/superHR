import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { canActFor, failed, getStore } from "@/lib/whatsapp/server";
import { validateSnapshot } from "@/lib/whatsapp/validate";

/** Which joiners are on WhatsApp, so the browser knows whose snapshot to keep fresh. (Scoped like everything else.) */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    // a new joiner sees only their own link
    const rows = (await getStore().listContacts()).filter((c) => c.kind === "joiner" && c.personId && (user.role === "employee" ? c.email?.toLowerCase() === user.email.toLowerCase() : canActFor(user, { dept: c.dept, manager: c.manager })));
    return NextResponse.json({ links: rows.map((c) => ({ personId: c.personId, contactId: c.id, status: c.status, snapshotAt: c.snapshot?.updatedAt ?? null })) });
  } catch (e) { return failed(e); }
}

/**
 * Keep the assistant's picture of each joiner current. The checklist lives in the browser, so the browser pushes a
 * snapshot (their details, checklist facts and, if customised, the policies) whenever it changes. Only for joiners who have
 * joined; validated and size-limited; a department head can only push their own department's.
 */
export async function PUT(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allow(`wa-sync:${user.id}`, 120, 60_000)) return NextResponse.json({ error: "Too many updates: slow down." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { items?: unknown } | null;
  if (!b || !Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) return NextResponse.json({ error: "Send { items: [{ personId, snapshot }] } (1–50)." }, { status: 400 });
  try {
    const store = getStore();
    let updated = 0;
    for (const it of b.items as { personId?: unknown; snapshot?: unknown }[]) {
      const snap = validateSnapshot(it?.snapshot);
      if (!snap || typeof it.personId !== "string") return NextResponse.json({ error: "Invalid snapshot." }, { status: 400 });
      const c = await store.contactByPerson(it.personId);
      if (!c || c.status !== "active") continue;
      // a new joiner may refresh only their own record (their own name, and the contact is theirs); staff by scope
      const mine = user.role === "employee" && snap.employee.name.trim().toLowerCase() === user.name.trim().toLowerCase() && c.email?.toLowerCase() === user.email.toLowerCase();
      if (!(user.role === "employee" ? mine : canActFor(user, { dept: snap.employee.department, manager: snap.employee.manager }))) return new Response(null, { status: 403 });
      await store.saveContact({ ...c, snapshot: snap, dept: snap.employee.department, manager: snap.employee.manager });
      updated++;
    }
    return NextResponse.json({ updated });
  } catch (e) { return failed(e); }
}
