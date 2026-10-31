import type { Inbound } from "./types";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export interface DeliveryStatus { id: string; status: string; recipient: string }

/**
 * Meta's webhook payload → the messages we act on. Handles plain text, interactive button and list replies, and the
 * quick-reply buttons of a template (which arrive as type "button" with a payload). Media and anything else comes
 * through as "unsupported" so the person gets a clear answer instead of silence. Never throws on odd input.
 */
export function parseWebhook(payload: unknown): { messages: Inbound[]; statuses: DeliveryStatus[] } {
  const messages: Inbound[] = [], statuses: DeliveryStatus[] = [];
  const root = obj(payload);
  if (root.object !== "whatsapp_business_account") return { messages, statuses };
  for (const entry of arr(root.entry)) for (const change of arr(obj(entry).changes)) {
    const value = obj(obj(change).value);
    const names = new Map(arr(value.contacts).map((c) => [str(obj(c).wa_id), str(obj(obj(c).profile).name)]));
    for (const m of arr(value.messages)) {
      const msg = obj(m), id = str(msg.id), from = str(msg.from).replace(/\D/g, "");
      if (!id || !from) continue;
      const base = { id, from, name: names.get(str(msg.from)) || undefined, at: new Date((Number(msg.timestamp) || Date.now() / 1000) * 1000).toISOString() };
      const type = str(msg.type);
      if (type === "text") messages.push({ ...base, type: "text", text: str(obj(msg.text).body) });
      else if (type === "interactive") {
        const i = obj(msg.interactive), r = obj(i.type === "list_reply" ? i.list_reply : i.button_reply);
        if (str(r.id)) messages.push({ ...base, type: "button", buttonId: str(r.id), buttonTitle: str(r.title) });
        else messages.push({ ...base, type: "unsupported" });
      } else if (type === "button") {
        const b = obj(msg.button);
        messages.push({ ...base, type: "button", buttonId: str(b.payload), buttonTitle: str(b.text) });
      } else messages.push({ ...base, type: "unsupported" });
    }
    for (const s of arr(value.statuses)) {
      const st = obj(s);
      if (str(st.id)) statuses.push({ id: str(st.id), status: str(st.status), recipient: str(st.recipient_id) });
    }
  }
  return { messages, statuses };
}

/** Build a payload in Meta's shape (used by the simulator and the tests, so they exercise the real parser). */
export function metaPayload(opts: { from: string; name?: string; id: string; text?: string; buttonId?: string; buttonTitle?: string; template?: boolean }): unknown {
  const message: Record<string, unknown> = { from: opts.from, id: opts.id, timestamp: String(Math.floor(Date.now() / 1000)) };
  if (opts.buttonId) {
    if (opts.template) Object.assign(message, { type: "button", button: { payload: opts.buttonId, text: opts.buttonTitle ?? "" } });
    else Object.assign(message, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: opts.buttonId, title: opts.buttonTitle ?? "" } } });
  } else Object.assign(message, { type: "text", text: { body: opts.text ?? "" } });
  return { object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: [{ wa_id: opts.from, profile: { name: opts.name ?? "" } }], messages: [message] } }] }] };
}
