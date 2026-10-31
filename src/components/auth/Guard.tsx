import { requireArea } from "@/lib/auth/session";
import type { Area } from "@/lib/auth/policy";
import { Forbidden } from "./Forbidden";

/**
 * Server-side access check for a page. Layouts don't re-run on client navigation, so every page wraps its
 * content in this — redirecting signed-out visitors and showing "no access" for the wrong role.
 */
export async function Guard({ area, children }: { area: Area; children: React.ReactNode }) {
  const { user, allowed } = await requireArea(area);
  if (!allowed) return <Forbidden role={user.role} area={area} />;
  return <>{children}</>;
}
