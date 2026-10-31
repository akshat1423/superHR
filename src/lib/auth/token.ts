import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sj_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return new TextEncoder().encode("dev-only-session-secret-do-not-use-in-prod");
}

export const sessionMaxAge = MAX_AGE_SECONDS;

/** The cookie carries only the user id; role and scope are always looked up server-side. */
export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<{ uid: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.uid === "string" ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}
