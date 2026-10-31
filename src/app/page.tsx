import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { landingFor } from "@/lib/auth/policy";

/** The proxy normally redirects "/" first; this is the server-side fallback. */
export default async function Home() {
  const user = await getUser();
  redirect(user ? landingFor(user.role) : "/login");
}
