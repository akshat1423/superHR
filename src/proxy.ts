import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
import { areaOfPath, canOpen, landingFor } from "@/lib/auth/policy";
import { findUser } from "@/lib/auth/users";

/**
 * Optimistic gate only: sends signed-out visitors to /login and rewrites to /forbidden when the role
 * can't open an area. Pages and route handlers re-check on the server — this is not the security boundary.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = findUser(session?.uid);

  if (pathname === "/login") {
    return user ? NextResponse.redirect(new URL(landingFor(user.role), req.url)) : NextResponse.next();
  }
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname === "/") return NextResponse.redirect(new URL(landingFor(user.role), req.url));

  const area = areaOfPath(pathname);
  if (area && !canOpen(user.role, area)) return NextResponse.rewrite(new URL("/forbidden", req.url));
  return NextResponse.next();
}

export const config = {
  // API routes verify the session themselves.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
