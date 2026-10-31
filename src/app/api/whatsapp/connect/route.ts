import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { waConfig } from "@/lib/whatsapp/graph";
import { failed, liveDeps } from "@/lib/whatsapp/server";
import { invite, joinLink } from "@/lib/whatsapp/service";
import { validateSnapshot } from "@/lib/whatsapp/validate";

/**
 * "Connect my WhatsApp" (the QR code in the page footer): the signed-in person gets their own one-time code and link. Scanning
 * the QR sends "JOIN <code>" from their phone, which links that number to them. A person can only create a code for themselves:
 * the name and email come from the session, and a new joiner must send a snapshot of their own record.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allow(`wa-connect:${user.id}`, 10, 60_000)) return NextResponse.json({ error: "Too many tries: wait a minute." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { personId?: unknown; snapshot?: unknown } | null;
  try {
    const deps = liveDeps();
    let c;
    if (user.role === "employee") {
      const snap = validateSnapshot(b?.snapshot);
      if (!snap || typeof b?.personId !== "string" || b.personId.length > 40) return NextResponse.json({ error: "Send { personId, snapshot } for your own record." }, { status: 400 });
      // the snapshot must be this person's own, so nobody can link their phone to someone else's record
      if (snap.employee.name.trim().toLowerCase() !== user.name.trim().toLowerCase()) return new Response(null, { status: 403 });
      c = await invite(deps, { kind: "joiner", name: user.name, email: user.email, personId: b.personId, dept: snap.employee.department, manager: snap.employee.manager, createdBy: user.name });
      await deps.store.saveContact({ ...c, snapshot: snap });
    } else {
      c = await invite(deps, { kind: "staff", name: user.name, email: user.email, dept: user.dept, createdBy: user.name });
    }
    return NextResponse.json({ code: c.inviteCode, link: joinLink(waConfig(), c.inviteCode!), number: waConfig().displayNumber ?? null, expiresAt: c.inviteExpiresAt, alreadyJoined: c.status === "active" });
  } catch (e) { return failed(e); }
}
