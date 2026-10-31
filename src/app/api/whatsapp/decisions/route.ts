import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { canActFor, failed, getStore } from "@/lib/whatsapp/server";

/**
 * Answers people have given on WhatsApp that no browser has applied yet. The onboarding data lives in the browser, so a
 * signed-in browser picks these up, applies each to its checklist, then acknowledges it. HR sees all; a department head their
 * department's; a manager their reports'.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role === "employee") return new Response(null, { status: 403 });
  try {
    const rows = (await getStore().decidedUnapplied()).filter((r) => canActFor(user, { dept: r.dept, manager: r.manager }));
    return NextResponse.json({ decisions: rows.map((r) => ({ id: r.id, personId: r.personId, itemId: r.itemId, status: r.status, title: r.title, decidedBy: r.toName, decidedAt: r.decidedAt })) });
  } catch (e) { return failed(e); }
}

/** Mark decisions as applied so no other browser applies them again. Only decisions the caller may see can be acknowledged. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role === "employee") return new Response(null, { status: 403 });
  const b = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!b || !Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 50 || !b.ids.every((i) => typeof i === "string" && i.length <= 40)) return NextResponse.json({ error: "Send { ids: string[1–50] }." }, { status: 400 });
  try {
    const store = getStore();
    const ok: string[] = [];
    for (const id of b.ids as string[]) {
      const r = await store.getRequest(id);
      if (r && (r.status === "approved" || r.status === "rejected") && !r.applied && canActFor(user, { dept: r.dept, manager: r.manager })) ok.push(id);
    }
    await store.markApplied(ok);
    return NextResponse.json({ acked: ok.length });
  } catch (e) { return failed(e); }
}
