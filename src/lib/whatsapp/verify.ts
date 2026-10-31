import { createHmac, timingSafeEqual } from "node:crypto";

/** The value Meta puts in x-hub-signature-256 for this body, given the app secret. */
export const expectedSignature = (raw: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

/**
 * Is this request really from Meta? Constant-time comparison of the HMAC-SHA256 of the raw body.
 * (chatflow checks this only when a secret happens to be set; here a missing secret fails closed in the route.)
 */
export function signatureOk(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const want = Buffer.from(expectedSignature(raw, secret));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Meta's one-off subscription handshake: echo hub.challenge when hub.verify_token is ours. */
export function handshake(params: URLSearchParams, verifyToken: string | undefined): { status: number; body: string } {
  if (params.get("hub.mode") !== "subscribe") return { status: 400, body: "Invalid request" };
  if (!verifyToken || !same(params.get("hub.verify_token") ?? "", verifyToken)) return { status: 403, body: "Verification token mismatch" };
  return { status: 200, body: params.get("hub.challenge") ?? "" };
}
