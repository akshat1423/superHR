import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { canNudge } from "@/lib/auth/policy";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const provider = () => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return key && from ? { key, from } : null;
};

/** Tells the UI whether mail will really be delivered, so it never has to guess. */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  return NextResponse.json({ configured: !!provider(), redirected: !!process.env.EMAIL_TEST_RECIPIENT });
}

/**
 * Sends one reminder email. With RESEND_API_KEY + EMAIL_FROM set it delivers through Resend; without them it
 * answers `mode: "preview"` and sends nothing. Set EMAIL_TEST_RECIPIENT to funnel every message to one inbox
 * while testing (the intended recipient is shown in the subject).
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canNudge(user)) return new Response(null, { status: 403 });

  const b = (await req.json().catch(() => null)) as { to?: unknown; subject?: unknown; html?: unknown; text?: unknown } | null;
  if (!b || typeof b.to !== "string" || !EMAIL.test(b.to) || typeof b.subject !== "string" || typeof b.html !== "string" || typeof b.text !== "string")
    return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
  if (b.subject.length > 200 || b.html.length > 100_000 || b.text.length > 20_000)
    return NextResponse.json({ error: "Email too large" }, { status: 413 });

  const p = provider();
  if (!p) {
    return NextResponse.json({ mode: "preview", note: "No email provider configured (set RESEND_API_KEY and EMAIL_FROM on the server). Nothing was delivered." });
  }

  const redirect = process.env.EMAIL_TEST_RECIPIENT;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: p.from,
      to: [redirect ?? b.to],
      subject: redirect ? `[to: ${b.to}] ${b.subject}` : b.subject,
      html: b.html,
      text: b.text,
    }),
  });
  if (!res.ok) return NextResponse.json({ mode: "failed", error: `Provider returned ${res.status}` }, { status: 502 });
  const data = (await res.json()) as { id?: string };
  return NextResponse.json({ mode: "sent", id: data.id ?? null, redirectedTo: redirect ?? null });
}
