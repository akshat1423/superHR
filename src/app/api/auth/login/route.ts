import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { landingFor } from "@/lib/auth/policy";
import { findUser } from "@/lib/auth/users";

/** Demo sign-in: pick a persona. Replace the lookup with a real IdP callback to go to production. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const user = findUser(body?.userId);
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 401 });
  await createSession(user.id);
  return NextResponse.json({ ok: true, landing: landingFor(user.role) });
}
