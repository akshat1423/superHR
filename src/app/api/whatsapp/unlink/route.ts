import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { failed, getStore } from "@/lib/whatsapp/server";

/**
 * Disconnect someone (HR only): their number is forgotten, their snapshot is removed, and nothing more can be sent to them.
 * They can join again only with a new invite.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role !== "hr") return new Response(null, { status: 403 });
  const b = (await req.json().catch(() => null)) as { contactId?: unknown } | null;
  if (!b || typeof b.contactId !== "string" || b.contactId.length > 40) return NextResponse.json({ error: "Send { contactId }." }, { status: 400 });
  try {
    const store = getStore();
    const c = await store.contactById(b.contactId);
    if (!c) return new Response(null, { status: 404 });
    await store.saveContact({ ...c, phone: undefined, snapshot: undefined, status: "invited", inviteCode: undefined, inviteExpiresAt: undefined, joinedAt: undefined, lastInboundAt: undefined });
    return NextResponse.json({ ok: true });
  } catch (e) { return failed(e); }
}
