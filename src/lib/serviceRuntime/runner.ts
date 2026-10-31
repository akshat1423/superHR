import { createHmac } from "node:crypto";
import type { Person } from "../people";
import { FAIL_RATE, traceId } from "../provision";
import { SERVICES } from "../services";
import { hash01 } from "../utils";
import { HANDLERS } from "./handlers";
import { REVOKE, UPDATE, grantApp, revokeApp, type Spec } from "./reverse";
import { webhookVar, type ActionKind, type ConnectorMode, type ExecFailure, type Execution, type PhaseResult } from "./types";

const HOOK_TIMEOUT_MS = 8000;
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Which connector a service runs on: `live` when its webhook is configured, otherwise the built-in sandbox. */
export const modeOf = (service: string): ConnectorMode => (process.env[webhookVar(service)] ? "live" : "sandbox");

const fakeId = (p: Person, service: string, phase: number) => `${service.split("-")[0]}_${Math.floor(hash01(`${p.id}|${service}|${phase}`) * 0xffffffff).toString(16).padStart(8, "0")}`;

interface HookAnswer { ok: boolean; status?: number; response?: unknown; artifact?: string; paused?: string; error?: Partial<ExecFailure> }

/**
 * Hand one call to the real system behind this service. The webhook receives the request body we would send, the
 * action (provision, deprovision or update) and the object it applies to, the person and a trace id, signed with
 * HMAC-SHA256 (`x-superjoin-signature`, key SERVICE_WEBHOOK_SECRET). It answers
 * `{ ok, status?, response?, artifact?, paused?, error?: { code, title, cause, fix, retryable } }`.
 */
async function callHook(service: string, p: Person, trace: string, attempt: number, action: ActionKind, object: string | undefined, phase: number, spec: Spec, body: unknown): Promise<{ ans: HookAnswer; status: number; ms: number }> {
  const url = process.env[webhookVar(service)]!;
  const payload = JSON.stringify({ service, trace, attempt, action, object: object ?? null, phase: { index: phase, label: spec.label, call: spec.call }, request: body, person: { id: p.id, name: p.name, email: p.email, role: p.role, department: p.persona.dept, level: p.persona.level, location: p.location, manager: p.manager, startDate: p.startDate } });
  const headers: Record<string, string> = { "content-type": "application/json", "x-superjoin-trace": trace };
  const secret = process.env.SERVICE_WEBHOOK_SECRET;
  if (secret) headers["x-superjoin-signature"] = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(HOOK_TIMEOUT_MS) });
    const ans = (await res.json().catch(() => ({ ok: false, error: { title: "Connector sent a body that is not JSON" } }))) as HookAnswer;
    return { ans: res.ok ? ans : { ...ans, ok: false }, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return { ans: { ok: false, error: { code: timeout ? "504" : "502", title: timeout ? "Connector timed out" : "Connector unreachable", cause: timeout ? `The ${service} connector did not answer within ${HOOK_TIMEOUT_MS / 1000}s.` : `Could not reach the ${service} connector.`, fix: "Check the connector is up, then retry.", retryable: true } }, status: timeout ? 504 : 502, ms: Date.now() - t0 };
  }
}

export interface ExecOptions {
  attempt: number;
  retry: boolean;
  /** default: the original provisioning run */
  action?: ActionKind;
  /** apply to one thing only (an app name, for access) */
  object?: string;
}

/** The calls a service makes for an action, in order. */
function specsFor(service: string, action: ActionKind, object: string | undefined): Spec[] {
  const sv = SERVICES.find((s) => s.id === service)!;
  if (action === "provision") {
    if (object && service === "access-svc") return [grantApp(object)];
    return sv.phases.map((ph, i) => ({ label: ph.label, call: ph.call, body: HANDLERS[service][i].body, ok: HANDLERS[service][i].ok }));
  }
  if (action === "deprovision") return object && service === "access-svc" ? [revokeApp(object)] : REVOKE[service];
  return UPDATE[service] ?? [];
}

/**
 * Run one service for one person, on the server: every API call in order, with the request, the response and the
 * timing. Sandbox mode answers like a healthy system, and fails the same deterministic fraction of provisioning runs
 * the demo has always had (so there is something to diagnose); a retry after someone fixed the cause succeeds.
 * Deprovision and update answer like a healthy system in the sandbox; a live connector's failures are reported as is.
 */
export async function execute(service: string, p: Person, opts: ExecOptions): Promise<Execution> {
  const si = SERVICES.findIndex((s) => s.id === service);
  if (si < 0) throw new Error(`Unknown service ${service}`);
  const sv = SERVICES[si];
  const action: ActionKind = opts.action ?? "provision";
  const object = service === "access-svc" ? opts.object : undefined;
  const specs = specsFor(service, action, object);
  const trace = traceId(p.id, action === "provision" && !object ? service : `${service}:${action}:${object ?? ""}`, opts.attempt);
  const mode = modeOf(service);
  const waits = action === "provision" && !object ? sv.waits(p) : null;

  const planned = action === "provision" && !object && !opts.retry && !waits && hash01(p.id + sv.id + "F") < FAIL_RATE ? sv.failures[Math.floor(hash01(p.id + sv.id + "V") * sv.failures.length)] : null;
  const phases: PhaseResult[] = [];
  let failure: ExecFailure | undefined;
  let artifact: string | undefined;
  let paused: string | undefined;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const body = spec.body(p, object);
    const request = json(body);

    if (mode === "live") {
      const { ans, status, ms } = await callHook(service, p, trace, opts.attempt, action, object, i, spec, body);
      const response = json(ans.response ?? (ans.error ? { error: ans.error } : {}));
      phases.push({ label: spec.label, call: spec.call, ok: ans.ok, httpStatus: ans.status ?? status, ms, request, response });
      if (!ans.ok) {
        const e = ans.error ?? {};
        failure = { code: e.code ?? String(ans.status ?? status), title: e.title ?? "The connector reported a failure", cause: e.cause ?? `${spec.call} did not succeed.`, evidence: `${spec.call}\n→ ${ans.status ?? status}\n${response}`, fix: e.fix ?? "Fix the cause shown, then retry.", retryable: e.retryable ?? false, phase: i };
        break;
      }
      artifact = ans.artifact ?? artifact;
      paused = ans.paused ?? paused;
      continue;
    }

    // sandbox
    const ms = 60 + Math.floor(hash01(`${trace}|${i}`) * 340);
    if (planned && planned.phase === i) {
      const evidence = planned.evidence(p);
      phases.push({ label: spec.label, call: spec.call, ok: false, httpStatus: Number(planned.code) || 500, ms, request, response: evidence.split("\n").slice(2).join("\n") || evidence });
      failure = { code: planned.code, title: planned.title, cause: planned.cause(p), evidence, fix: planned.fix, retryable: planned.retryable, phase: i };
      break;
    }
    phases.push({ label: spec.label, call: spec.call, ok: true, httpStatus: action === "provision" && spec.call.startsWith("POST") ? 201 : 200, ms, request, response: json(spec.ok(p, fakeId(p, service, i), object)) });
  }

  const ok = !failure;
  const finished = action === "provision" && !object;
  return {
    service, traceId: trace, mode, action, ...(object ? { object } : {}), attempt: opts.attempt, ok, phases,
    paused: ok && finished ? (paused ?? waits ?? undefined) : undefined,
    artifact: ok && !(finished && (paused ?? waits)) ? (artifact ?? (finished ? sv.artifact(p) : undefined)) : undefined,
    failure,
    transient: action === "provision" && hash01(sv.id + p.id + "x") < 0.1,
    totalMs: phases.reduce((a, x) => a + x.ms, 0),
  };
}
