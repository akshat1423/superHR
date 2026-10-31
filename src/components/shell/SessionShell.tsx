import { getUser } from "@/lib/auth/session";
import { AgentChat } from "@/components/agent/AgentChat";
import { waConfig } from "@/lib/whatsapp/graph";
import { WhatsAppFooter } from "./WhatsAppFooter";
import { WhatsAppSync } from "./WhatsAppSync";
import { AuthProvider } from "./AuthProvider";
import { Header } from "./Header";
import { ProvisionDriver } from "./ProvisionDriver";
import { Hydrate } from "./Hydrate";

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
      <WhatsAppFooter number={waConfig().displayNumber ?? null} />
      <ProvisionDriver />
      {user && <WhatsAppSync />}
      {user && <AgentChat />}
      <Hydrate />
    </AuthProvider>
  );
}
