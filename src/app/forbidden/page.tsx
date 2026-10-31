import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { Forbidden } from "@/components/auth/Forbidden";

/** Target of the proxy's rewrite when a role opens an area it may not. */
export default async function ForbiddenPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  return <Forbidden role={user.role} />;
}
