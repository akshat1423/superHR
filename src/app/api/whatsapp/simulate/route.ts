import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { allow } from "@/lib/rateLimit";
import { metaPayload, parseWebhook } from "@/lib/whatsapp/parse";
import { failed, getStore, publicMessage, simDeps } from "@/lib/whatsapp/server";
import { handleInbound } from "@/lib/whatsapp/service";
import { digits } from "@/lib/whatsapp/types";

let n = 0;

/**
 * Pretend to be someone on WhatsApp (HR only), without Meta: the message is built in Meta's own payload shape, read by
 * the real parser and handled by the real handler. Replies are recorded but never sent to WhatsApp. Use a joined contact's
 * id to write as them, or a made-up number to try "JOIN <code>" for someone invited.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role !== "hr") return new Response(null, { status: 403 });
  if (!allow(`wa-sim:${user.id}`, 120, 60_000)) return NextResponse.json({ error: "Too many messages: slow down." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof b?.text === "string" ? b.text.slice(0, 1000) : undefined;
  const buttonId = typeof b?.buttonId === "string" ? b.buttonId.slice(0, 256) : undefined;
  if (!b || (!text && !buttonId)) return NextResponse.json({ error: "Send { contactId | phone, text | buttonId, buttonTitle?, template? }." }, { status: 400 });
  try {
    const store = getStore();
    const c = typeof b.contactId === "string" ? await store.contactById(b.contactId) : null;
    const phone = c?.phone ?? (typeof b.phone === "string" ? digits(b.phone) : "");
    if (phone.length < 8 || phone.length > 15) return NextResponse.json({ error: "That contact hasn't joined yet: give a phone number to simulate from (8–15 digits)." }, { status: 400 });
    const payload = metaPayload({ from: phone, name: c?.name, id: `sim.${Date.now().toString(36)}.${++n}`, text, buttonId, buttonTitle: typeof b.buttonTitle === "string" ? b.buttonTitle.slice(0, 20) : undefined, template: b.template === true });
    for (const m of parseWebhook(payload).messages) await handleInbound(simDeps(), m);
    const after = await store.contactByPhone(phone);
    return NextResponse.json({ phone: `••••${phone.slice(-4)}`, contactId: after?.id ?? null, messages: (await store.recentMessages(40, phone)).map(publicMessage) });
  } catch (e) { return failed(e); }
}
