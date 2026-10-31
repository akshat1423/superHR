import { NextResponse, after } from "next/server";
import { waConfig } from "@/lib/whatsapp/graph";
import { parseWebhook } from "@/lib/whatsapp/parse";
import { handleInbound } from "@/lib/whatsapp/service";
import { liveDeps } from "@/lib/whatsapp/server";
import { handshake, signatureOk } from "@/lib/whatsapp/verify";

/** Answering a question can involve a model call; the work runs after Meta has its 200, within this limit. */
export const maxDuration = 60;
const MAX_BODY = 1_000_000;

/** Meta's one-off handshake when the webhook is subscribed: echoes hub.challenge if hub.verify_token is ours. */
export async function GET(req: Request) {
  const r = handshake(new URL(req.url).searchParams, waConfig().verifyToken);
  return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain" } });
}

/**
 * Meta calls this for every message and delivery receipt. Fails closed: with no app secret nothing is processed, and a
 * request whose HMAC-SHA256 signature doesn't match the body is rejected before it is parsed. A valid request is answered
 * 200 straight away (Meta retries slow or failing webhooks, which would duplicate work) and handled afterwards.
 */
export async function POST(req: Request) {
  const { appSecret } = waConfig();
  if (!appSecret) return NextResponse.json({ error: "WHATSAPP_APP_SECRET is not set, so webhook calls can't be verified." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("Too large", { status: 413 });
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"), appSecret)) return new Response("Invalid signature", { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }

  const { messages } = parseWebhook(payload);
  if (messages.length) {
    after(async () => {
      const deps = liveDeps();
      // one at a time, in order: a person's messages are a conversation
      for (const m of messages) {
        try { await handleInbound(deps, m); } catch (e) { console.error("whatsapp: could not handle a message", e instanceof Error ? e.message : e); }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
