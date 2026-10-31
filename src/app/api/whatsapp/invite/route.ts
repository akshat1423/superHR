import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { waConfig } from "@/lib/whatsapp/graph";
import { failed, liveDeps, publicContact } from "@/lib/whatsapp/server";
import { invite, joinLink } from "@/lib/whatsapp/service";
import { EMAIL, validateSnapshot } from "@/lib/whatsapp/validate";

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Invite a joiner or an approver to WhatsApp (HR only). The reply is a one-time code and a link; the person sends
 * "JOIN <code>" from their own phone, which is how their number becomes linked, so it is proven rather than typed in.
 * For a joiner the browser can include a snapshot of their checklist so questions work from the first message.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role !== "hr") return new Response(null, { status: 403 });
  if (!allow(`wa-invite:${user.id}`, 60, 60_000)) return NextResponse.json({ error: "Too many invites: slow down." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = b?.kind;
  if (!b || (kind !== "joiner" && kind !== "staff") || !str(b.name, 80) || (kind === "staff" && !(str(b.email, 120) && EMAIL.test(b.email))) || (b.email !== undefined && !(str(b.email, 120) && EMAIL.test(b.email))) || (kind === "joiner" && !str(b.personId, 40)))
    return NextResponse.json({ error: "Send { kind: 'joiner' | 'staff', name, email (required for staff), personId (required for a joiner) }." }, { status: 400 });
  const snapshot = b.snapshot === undefined ? undefined : validateSnapshot(b.snapshot);
  if (b.snapshot !== undefined && !snapshot) return NextResponse.json({ error: "Invalid snapshot." }, { status: 400 });
  try {
    const deps = liveDeps();
    const c = await invite(deps, { kind, name: b.name, email: b.email as string | undefined, personId: kind === "joiner" ? (b.personId as string) : undefined, dept: str(b.dept, 40) ? b.dept : undefined, manager: str(b.manager, 80) ? b.manager : undefined, createdBy: user.name });
    if (snapshot) await deps.store.saveContact({ ...c, snapshot });
    return NextResponse.json({ contact: publicContact(c), code: c.inviteCode, link: joinLink(waConfig(), c.inviteCode!), expiresAt: c.inviteExpiresAt, alreadyJoined: c.status === "active" });
  } catch (e) { return failed(e); }
}
