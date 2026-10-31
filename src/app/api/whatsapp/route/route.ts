import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { allow } from "@/lib/rateLimit";
import { failed, getStore } from "@/lib/whatsapp/server";
import { routeCheck } from "@/lib/whatsapp/service";
import { digits } from "@/lib/whatsapp/types";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * For a WhatsApp number shared with another app (Meta sends every message for a number to one webhook, so one app has to
 * hand the right messages to the other). That app calls this with `Authorization: Bearer <WHATSAPP_ROUTER_KEY>` and
 * `{ phone, text }`; the answer says whether the message belongs here. If it does, it forwards Meta's body and
 * x-hub-signature-256 header, unchanged, to /api/whatsapp/webhook. Read-only: an invite code isn't used up by asking.
 */
export async function POST(req: Request) {
  const key = process.env.WHATSAPP_ROUTER_KEY;
  if (!key) return NextResponse.json({ error: "WHATSAPP_ROUTER_KEY is not set." }, { status: 503 });
  if (!same(req.headers.get("authorization") ?? "", `Bearer ${key}`)) return new Response(null, { status: 401 });
  if (!allow("wa-route", 1200, 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { phone?: unknown; text?: unknown } | null;
  const phone = typeof b?.phone === "string" ? digits(b.phone) : "";
  if (phone.length < 8 || phone.length > 15) return NextResponse.json({ error: "Send { phone, text? }." }, { status: 400 });
  try {
    return NextResponse.json(await routeCheck({ store: getStore() }, phone, typeof b?.text === "string" ? b.text.slice(0, 200) : undefined));
  } catch (e) { return failed(e); }
}
