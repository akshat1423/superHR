import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { aiConfigured, extractWithClaude } from "@/lib/ai";
import { allow } from "@/lib/rateLimit";
import { DOC_TYPES, MAX_BYTES, TEXT_EXT, extOf } from "@/lib/onboarding/documents";
import { processDocument, type DocContent } from "@/lib/onboarding/docService";
import { ctxOf } from "@/lib/onboarding/rules";
import type { DocTypeId } from "@/lib/onboarding/types";
import { asPerson } from "@/lib/serviceRuntime/validate";

/** Reading a scan with a model can take a while; 60s fits every Vercel plan. */
export const maxDuration = 60;

const MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

/**
 * The document service. `{ fileName, size, mime?, docType, person, text | data }` → the decision: the fields read from
 * the file, what was checked against the person's profile, each step with its timing, and the outcome (Accepted,
 * Correction Requested with reasons, or Under Review only when a scan can't be read). A new joiner can only process
 * documents for themselves.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allow(`docproc:${user.id}`, 40, 60_000)) return NextResponse.json({ error: "Too many uploads — please wait a minute." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const person = asPerson(b?.person);
  const docType = b?.docType as DocTypeId;
  if (!b || !person || typeof b.fileName !== "string" || b.fileName.length > 200 || typeof b.size !== "number" || !Number.isFinite(b.size) || b.size < 0 || !(docType in DOC_TYPES))
    return NextResponse.json({ error: "Send { fileName, size, docType, person } and the file as text or data." }, { status: 400 });
  if (user.role === "employee" && (person.email || "").toLowerCase() !== user.email.toLowerCase()) return new Response(null, { status: 403 });
  if (b.size > MAX_BYTES * 4) return NextResponse.json({ error: "File too large." }, { status: 413 });

  let content: DocContent;
  if (TEXT_EXT.includes(extOf(b.fileName))) {
    if (typeof b.text !== "string" || b.text.length > 300_000) return NextResponse.json({ error: "Send the file's text as `text`." }, { status: 400 });
    content = { kind: "text", text: b.text };
  } else {
    const mime = typeof b.mime === "string" ? b.mime : "";
    const data = typeof b.data === "string" ? b.data : "";
    // a type we don't accept is rejected by the service's own file check; a missing body is a bad request
    if (data && (!MIME.has(mime) || data.length > Math.ceil((MAX_BYTES * 4) / 3) + 16 || !/^[A-Za-z0-9+/]+=*$/.test(data))) return NextResponse.json({ error: "Send a PDF, PNG or JPG as base64 `data`." }, { status: 400 });
    content = { kind: "binary", read: async () => (data && aiConfigured() ? extractWithClaude(data, mime) : null) };
  }

  return NextResponse.json(await processDocument({ fileName: b.fileName, size: b.size, docType, ctx: ctxOf(person), content }));
}
