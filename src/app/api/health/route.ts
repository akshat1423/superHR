import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/ai";
import { supabaseConfigured } from "@/lib/supabase/server";

/**
 * Deployment check. Anyone gets `{ ok: true }` (so an uptime monitor works); a signed-in HR user also sees which
 * integrations are configured — as booleans only, never values — to confirm the Vercel environment is complete.
 */
export async function GET() {
  const user = await getUser();
  if (user?.role !== "hr") return NextResponse.json({ ok: true });
  return NextResponse.json({
    ok: true,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    checks: {
      sessionSecret: !!process.env.SESSION_SECRET,
      supabase: supabaseConfigured(),
      ai: aiConfigured(),
      email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    },
  });
}
