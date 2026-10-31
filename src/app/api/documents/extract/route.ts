import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { aiConfigured, extractWithClaude } from "@/lib/ai";
import { allow } from "@/lib/rateLimit";
import { MAX_BYTES } from "@/lib/onboarding/documents";

/** Reading a PDF with a model can take a while; 60s fits every Vercel plan. */
export const maxDuration = 60;

const MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

/**
 * Read the fields off an uploaded PDF or image with Claude. The model only reports what is printed; every judgement
 * (name match, expiry, staleness…) is made afterwards by our own validation code, never by the model.
 * Without an API key this answers 503 and the document goes to a human reviewer instead.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ extracted: null, reason: "not_configured" }, { status: 503 });
  if (!allow(`extract:${user.id}`, 15, 60_000)) return NextResponse.json({ error: "Too many uploads — please wait a minute." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as { mime?: unknown; data?: unknown } | null;
  if (!b || typeof b.mime !== "string" || !MIME.has(b.mime) || typeof b.data !== "string") return NextResponse.json({ error: "Send { mime, data } for a PDF, PNG or JPG." }, { status: 400 });
  // base64 is ~4/3 the size of the file
  if (b.data.length > Math.ceil((MAX_BYTES * 4) / 3) + 16) return NextResponse.json({ error: "File too large." }, { status: 413 });
  if (!/^[A-Za-z0-9+/]+=*$/.test(b.data)) return NextResponse.json({ error: "Data must be base64." }, { status: 400 });

  try {
    return NextResponse.json({ extracted: await extractWithClaude(b.data, b.mime) });
  } catch {
    return NextResponse.json({ extracted: null, reason: "extraction_failed" }, { status: 502 });
  }
}
