import { AgentsApp } from "@/components/agents/AgentsApp";
import { Guard } from "@/components/auth/Guard";

export default async function AgentsPage({ searchParams }: PageProps<"/agents">) {
  const { tab } = await searchParams;
  const initialTab = tab === "logs" || tab === "failures" ? tab : "overview";
  return <Guard area="agents"><AgentsApp initialTab={initialTab} /></Guard>;
}
