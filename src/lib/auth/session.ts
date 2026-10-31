import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionMaxAge, signSession, verifySessionToken } from "./token";
import { findUser, type DemoUser } from "./users";
import { canOpen, landingFor, type Area } from "./policy";

/** Data access layer for the session. Every server-side check goes through here. */
export const getUser = cache(async (): Promise<DemoUser | null> => {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return session ? (findUser(session.uid) ?? null) : null;
});

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** For pages: returns the user, or redirects to login. Returns `null` access when the role may not open the area. */
export async function requireArea(area: Area): Promise<{ user: DemoUser; allowed: boolean }> {
  const user = await getUser();
  if (!user) redirect("/login");
  return { user, allowed: canOpen(user.role, area) };
}

export { landingFor };
