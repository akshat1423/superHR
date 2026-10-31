import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { waConfig, isLive } from "@/lib/whatsapp/graph";
import { failed, getStore, mode, publicContact, publicMessage, publicRequest } from "@/lib/whatsapp/server";
import { joinLink } from "@/lib/whatsapp/service";

/**
 * Everything the WhatsApp page shows, for HR: how it is connected, who has joined or been invited, what is waiting for an
 * answer, and the recent messages (optionally just one contact's conversation). Numbers are masked and secrets never appear.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (user.role !== "hr") return new Response(null, { status: 403 });
  const cfg = waConfig();
  const store = getStore();
  const url = new URL(req.url);
  try {
    const contacts = await store.listContacts();
    const only = url.searchParams.get("contact");
    const phone = only ? contacts.find((c) => c.id === only)?.phone : undefined;
    const [messages, requests] = await Promise.all([store.recentMessages(only ? 100 : 60, phone), store.listRequests(30)]);
    return NextResponse.json({
      mode: mode(), store: store.kind,
      config: { token: !!cfg.token, phoneNumberId: !!cfg.phoneNumberId, verifyToken: !!cfg.verifyToken, appSecret: !!cfg.appSecret, displayNumber: cfg.displayNumber ?? null, templates: { notify: cfg.templates.notify ?? null, approval: cfg.templates.approval ?? null }, live: isLive(cfg) },
      webhookUrl: `${url.origin}/api/whatsapp/webhook`,
      contacts: contacts.map((c) => ({ ...publicContact(c), link: c.status === "invited" && c.inviteCode ? joinLink(cfg, c.inviteCode) : null })),
      requests: requests.map(publicRequest),
      messages: (only && !phone ? [] : messages).map(publicMessage),
    });
  } catch (e) { return failed(e); }
}
