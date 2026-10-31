import { isProvisioned, type ProvAction } from "../provision";
import { SERVICES, serviceIndex } from "../services";
import type { Execution } from "../serviceRuntime/types";
import { useOnboarding } from "@/store/onboarding";
import { usePeople } from "@/store/people";
import { useProvisioning } from "@/store/provisioning";

/** The signature of the thing that asks the server to run a service (a fetch in the browser, a fake in tests). */
export type Caller = (service: string, body: { person: unknown; action: string; object?: string; attempt: number }) => Promise<Execution | null>;

const browserCaller: Caller = async (service, body) => {
  const res = await fetch(`/api/services/${service}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }).catch(() => null);
  return res && res.ok ? ((await res.json()) as Execution) : null;
};

// Each deprovision/update gets its own trace id: the trace is derived from (person, service, action, object, attempt).
const counters = new Map<string, number>();
const attemptFor = (key: string) => { const n = ((counters.get(key) ?? 0) % 19) + 1; counters.set(key, n); return n; };

/**
 * Run changes to what the services created for one person (revoke, update, grant an app), one at a time, in the order
 * given. Every result is recorded on the person's services and in the agent logs, whether it worked or not.
 */
export async function runProvActions(actions: ProvAction[], personId: string, by: string, call: Caller = browserCaller): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (const a of actions) {
    const person = usePeople.getState().people.find((p) => p.id === personId);
    if (!person) break;
    const prov = useProvisioning.getState();
    if (a.kind === "provision" && !a.object) { prov.reprovision(personId, a.service, by); ok++; continue; }
    const ex = await call(a.service, { person, action: a.kind, ...(a.object ? { object: a.object } : {}), attempt: attemptFor(`${personId}|${a.service}|${a.kind}|${a.object ?? ""}`) });
    useProvisioning.getState().applyAct(personId, { ...a, by }, ex);
    if (ex?.ok) ok++; else failed++;
  }
  return { ok, failed };
}

/**
 * End a person's onboarding: mark them terminated, cancel what has not started, and deprovision everything that was
 * created (applications and the account last). Returns how many services were revoked and how many failed so the
 * caller can say so; a failed revoke stays visible on that service with a retry.
 */
export async function terminateOnboarding(personId: string, by: string, reason: string, call: Caller = browserCaller): Promise<{ revoked: number; failed: number; cancelled: number }> {
  const person = usePeople.getState().people.find((p) => p.id === personId);
  if (!person || person.terminated) return { revoked: 0, failed: 0, cancelled: 0 };
  usePeople.getState().setTerminated(personId, { at: new Date().toISOString(), by, reason });
  const before = useProvisioning.getState().run.people.find((r) => r.personId === personId);
  const revoke = useProvisioning.getState().cancel(personId, by, reason);
  const cancelled = before ? before.tasks.filter((t, i) => (t.status === "queued" || t.status === "running" || t.status === "retry") && !revoke.includes(SERVICES[i].id)).length : 0;
  useOnboarding.getState().log(personId, by, "Onboarding terminated", `${reason}${revoke.length ? ` — revoking ${revoke.map((s) => SERVICES[serviceIndex(s)].name).join(", ")}` : ""}`);
  const r = await runProvActions(revoke.map((service) => ({ service, kind: "deprovision" as const, reason: `onboarding terminated: ${reason}` })), personId, by, call);
  return { revoked: r.ok, failed: r.failed, cancelled };
}

/** Undo a termination: the person is active again and every revoked or cancelled service runs again. */
export function reinstateOnboarding(personId: string, by: string): number {
  const pr = useProvisioning.getState().run.people.find((r) => r.personId === personId);
  if (!pr || !usePeople.getState().people.find((p) => p.id === personId)?.terminated) return 0;
  usePeople.getState().setTerminated(personId, null);
  const todo = SERVICES.filter((_, i) => pr.tasks[i].status === "revoked" || pr.tasks[i].status === "skipped");
  for (const sv of todo) useProvisioning.getState().reprovision(personId, sv.id, by);
  useOnboarding.getState().log(personId, by, "Onboarding reinstated", `${todo.length} service${todo.length === 1 ? "" : "s"} provisioning again`);
  return todo.length;
}

export { isProvisioned };
