import type { Outbound } from "./types";

export interface WaConfig {
  token?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  appSecret?: string;
  /** the business number people message, digits only (for the wa.me link) */
  displayNumber?: string;
  version: string;
  base: string;
  lang: string;
  /** an extra word that means "leave" (like chatflow's sandbox exit code); EXIT and LEAVE always work */
  exitCode?: string;
  /** approved template names, used when the 24-hour window is closed */
  templates: { notify?: string; approval?: string };
}

export const waConfig = (): WaConfig => ({
  token: process.env.WHATSAPP_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  appSecret: process.env.WHATSAPP_APP_SECRET,
  displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER?.replace(/\D/g, "") || undefined,
  version: process.env.WHATSAPP_GRAPH_VERSION || "v20.0",
  base: process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com",
  lang: process.env.WHATSAPP_TEMPLATE_LANG || "en",
  exitCode: process.env.WHATSAPP_EXIT_CODE || undefined,
  templates: { notify: process.env.WHATSAPP_TEMPLATE_NOTIFY, approval: process.env.WHATSAPP_TEMPLATE_APPROVAL },
});

/** Live when a token and phone-number id are set; otherwise everything runs in the sandbox and nothing leaves the server. */
export const isLive = (c: WaConfig = waConfig()) => !!(c.token && c.phoneNumberId);

export type SendResult = { ok: true; waId: string; mode: "sandbox" | "live" } | { ok: false; error: string; mode: "sandbox" | "live" };
export type Sender = (to: string, msg: Outbound) => Promise<SendResult>;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Template parameters may not contain new lines, tabs or runs of spaces. */
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " · ").replace(/ {2,}/g, " ").trim();

/** The JSON body for POST /{phone-number-id}/messages. Pure, so it can be tested against Meta's documented shapes. */
export function toGraphBody(to: string, m: Outbound): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (m.type === "text") return { ...base, type: "text", text: { body: cut(m.body, 4096), preview_url: false } };
  if (m.type === "buttons")
    return { ...base, type: "interactive", interactive: { type: "button", body: { text: cut(m.body, 1024) }, action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })) } } };
  return {
    ...base, type: "template",
    template: {
      name: m.name, language: { code: m.lang },
      components: [
        { type: "body", parameters: m.bodyParams.map((t) => ({ type: "text", text: cut(oneLine(t), 1000) })) },
        ...(m.buttonPayloads ?? []).map((payload, i) => ({ type: "button", sub_type: "quick_reply", index: String(i), parameters: [{ type: "payload", payload: cut(payload, 256) }] })),
      ],
    },
  };
}

/** Send through the WhatsApp Cloud API. */
export const graphSender = (c: WaConfig = waConfig()): Sender => async (to, msg) => {
  try {
    const res = await fetch(`${c.base}/${c.version}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(toGraphBody(to, msg)),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
    if (!res.ok) return { ok: false, mode: "live", error: data.error?.message ? `${data.error.message}${data.error.code ? ` (${data.error.code})` : ""}` : `WhatsApp answered ${res.status}` };
    return { ok: true, mode: "live", waId: data.messages?.[0]?.id ?? `wamid.unknown.${Date.now()}` };
  } catch (e) {
    return { ok: false, mode: "live", error: e instanceof Error && e.name === "TimeoutError" ? "WhatsApp did not answer in time" : "Could not reach WhatsApp" };
  }
};

let n = 0;
/** Pretend to send: records nothing itself, never touches the network. */
export const sandboxSender = (): Sender => async () => ({ ok: true, mode: "sandbox", waId: `sandbox.${Date.now().toString(36)}.${++n}` });

export const defaultSender = (c: WaConfig = waConfig()): Sender => (isLive(c) ? graphSender(c) : sandboxSender());
