import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { canActFor, failed, getStore, liveDeps } from "@/lib/whatsapp/server";
import { notify } from "@/lib/whatsapp/service";
import { EMAIL } from "@/lib/whatsapp/validate";

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Send a notification (a reminder, an escalation, a correction request) to someone who has joined WhatsApp, found by email.
 * Not being joined isn't an error: it answers `{ sent: false, reason: "not_linked" }` so the caller can carry on. Outside
 * WhatsApp's 24-hour window the message goes as an approved template; if none is configured it is not sent, and the reason says so.
 * HR may notify anyone; a department head their department; a manager their reports.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role === "employee") return new Response(null, { status: 403 });
  if (!allow(`wa-send:${user.id}`, 120, 60_000)) return NextResponse.json({ error: "Too many messages: slow down." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !str(b.toEmail, 120) || !EMAIL.test(b.toEmail) || !str(b.title, 120) || !str(b.body, 1500)) return NextResponse.json({ error: "Send { toEmail, title (≤120), body (≤1500), dept?, manager? }." }, { status: 400 });
  const scope = { dept: str(b.dept, 40) ? b.dept : undefined, manager: str(b.manager, 80) ? b.manager : undefined };
  if (!canActFor(user, scope)) return new Response(null, { status: 403 });
  try {
    const c = await getStore().contactByEmail(b.toEmail);
    if (!c || !c.phone) return NextResponse.json({ sent: false, reason: "not_linked" });
    const r = await notify(liveDeps(), c, b.title, b.body, { by: user.name });
    return NextResponse.json(r.ok ? { sent: true, via: r.via, mode: r.mode } : { sent: false, reason: r.via === "blocked" ? "blocked" : "send_failed", detail: r.error });
  } catch (e) { return failed(e); }
}
