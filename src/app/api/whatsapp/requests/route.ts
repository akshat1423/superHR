import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { canActFor, failed, liveDeps, publicRequest } from "@/lib/whatsapp/server";
import { requestApproval } from "@/lib/whatsapp/service";
import { EMAIL } from "@/lib/whatsapp/validate";

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Ask someone on WhatsApp to approve or reject one checklist item. They tap Approve or Reject (or reply APPROVE / REJECT
 * with the code); only the number the request was sent to can answer, once, within 72 hours. The decision then waits for a
 * browser to apply it to the checklist (see /api/whatsapp/decisions). Asking again for an item still waiting doesn't re-send.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role === "employee") return new Response(null, { status: 403 });
  if (!allow(`wa-req:${user.id}`, 60, 60_000)) return NextResponse.json({ error: "Too many requests: slow down." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !str(b.personId, 40) || !str(b.itemId, 80) || !str(b.toEmail, 120) || !EMAIL.test(b.toEmail) || !str(b.title, 120) || !str(b.body, 600))
    return NextResponse.json({ error: "Send { personId, itemId, toEmail, title (≤120), body (≤600), dept?, manager? }." }, { status: 400 });
  const dept = str(b.dept, 40) ? b.dept : undefined, manager = str(b.manager, 80) ? b.manager : undefined;
  if (!canActFor(user, { dept, manager })) return new Response(null, { status: 403 });
  try {
    const r = await requestApproval(liveDeps(), { personId: b.personId, itemId: b.itemId, toEmail: b.toEmail, title: b.title, body: b.body, dept, manager, createdBy: user.name });
    if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, detail: r.detail });
    return NextResponse.json({ ok: true, duplicate: !!r.duplicate, via: r.delivery.via, mode: r.delivery.mode, request: publicRequest(r.request) });
  } catch (e) { return failed(e); }
}
