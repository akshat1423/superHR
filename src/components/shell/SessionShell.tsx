import { getUser } from "@/lib/auth/session";
import { AuthProvider } from "./AuthProvider";
import { Header } from "./Header";
import { ProvisionDriver } from "./ProvisionDriver";

/**
 * Reads the session on the server (dynamic) and hands the verified user to the client tree.
 * Wrapped in <Suspense> by the root layout so the static shell can prerender.
 */
export async function SessionShell({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <AuthProvider user={user}>
      <Header />
      <main className="relative min-h-0 flex-1">{children}</main>
      <ProvisionDriver />
    </AuthProvider>
  );
}
