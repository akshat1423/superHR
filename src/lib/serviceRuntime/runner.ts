import { createHmac } from "node:crypto";
import type { Person } from "../people";
import { FAIL_RATE, traceId } from "../provision";
import { SERVICES } from "../services";
import { hash01 } from "../utils";
import { HANDLERS } from "./handlers";
import { webhookVar, type ConnectorMode, type ExecFailure, type Execution, type PhaseResult } from "./types";

const HOOK_TIMEOUT_MS = 8000;
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Which connector a service runs on: `live` when its webhook is configured, otherwise the built-in sandbox. */
export const modeOf = (service: string): ConnectorMode => (process.env[webhookVar(service)] ? "live" : "sandbox");

const fakeId = (p: Person, service: string, phase: number) => `${service.split("-")[0]}_${Math.floor(hash01(`${p.id}|${service}|${phase}`) * 0xffffffff).toString(16).padStart(8, "0")}`;

interface HookAnswer { ok: boolean; status?: number; response?: unknown; artifact?: string; paused?: string; error?: Partial<ExecFailure> }

/**
 * Hand one call to the real system behind this service. The webhook receives the request body we would send, the
 * person and a trace id, signed with HMAC-SHA256 (`x-superjoin-signature`, key SERVICE_WEBHOOK_SECRET). It answers
 * `{ ok, status?, response?, artifact?, paused?, error?: { code, title, cause, fix, retryable } }`.
 */
async function callHook(service: string, p: Person, trace: string, attempt: number, phase: number, body: unknown): Promise<{ ans: HookAnswer; status: number; ms: number }> {
  const url = process.env[webhookVar(service)]!;
  const sv = SERVICES.find((s) => s.id === service)!;
  const payload = JSON.stringify({ service, trace, attempt, phase: { index: phase, label: sv.phases[phase].label, call: sv.phases[phase].call }, request: body, person: { id: p.id, name: p.name, email: p.email, role: p.role, department: p.persona.dept, level: p.persona.level, location: p.location, manager: p.manager, startDate: p.startDate } });
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

/**
 * Run one service for one person, on the server: every API call in order, with the request, the response and the
 * timing. Sandbox mode answers like a healthy system, and fails the same deterministic fraction of runs the demo
 * has always had (so there is something to diagnose); a retry after someone fixed the cause succeeds.
 */
export async function execute(service: string, p: Person, opts: { attempt: number; retry: boolean }): Promise<Execution> {
  const si = SERVICES.findIndex((s) => s.id === service);
  if (si < 0) throw new Error(`Unknown service ${service}`);
  const sv = SERVICES[si];
  const impl = HANDLERS[service];
  const trace = traceId(p.id, service, opts.attempt);
  const mode = modeOf(service);
  const waits = sv.waits(p);

  const planned = !opts.retry && !waits && hash01(p.id + sv.id + "F") < FAIL_RATE ? sv.failures[Math.floor(hash01(p.id + sv.id + "V") * sv.failures.length)] : null;
  const phases: PhaseResult[] = [];
  let failure: ExecFailure | undefined;
  let artifact: string | undefined;
  let paused: string | undefined;

  for (let i = 0; i < sv.phases.length; i++) {
    const ph = sv.phases[i];
    const body = impl[i].body(p);
    const request = json(body);

    if (mode === "live") {
      const { ans, status, ms } = await callHook(service, p, trace, opts.attempt, i, body);
      const response = json(ans.response ?? (ans.error ? { error: ans.error } : {}));
      phases.push({ label: ph.label, call: ph.call, ok: ans.ok, httpStatus: ans.status ?? status, ms, request, response });
      if (!ans.ok) {
        const e = ans.error ?? {};
        failure = { code: e.code ?? String(ans.status ?? status), title: e.title ?? "The connector reported a failure", cause: e.cause ?? `${ph.call} did not succeed.`, evidence: `${ph.call}\n→ ${ans.status ?? status}\n${response}`, fix: e.fix ?? "Fix the cause shown, then retry.", retryable: e.retryable ?? false, phase: i };
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
      phases.push({ label: ph.label, call: ph.call, ok: false, httpStatus: Number(planned.code) || 500, ms, request, response: evidence.split("\n").slice(2).join("\n") || evidence });
      failure = { code: planned.code, title: planned.title, cause: planned.cause(p), evidence, fix: planned.fix, retryable: planned.retryable, phase: i };
      break;
    }
    phases.push({ label: ph.label, call: ph.call, ok: true, httpStatus: ph.call.startsWith("POST") ? 201 : 200, ms, request, response: json(impl[i].ok(p, fakeId(p, service, i))) });
  }

  const ok = !failure;
  return {
    service, traceId: trace, mode, attempt: opts.attempt, ok, phases,
    paused: ok ? (paused ?? waits ?? undefined) : undefined,
    artifact: ok && !(paused ?? waits) ? (artifact ?? sv.artifact(p)) : undefined,
    failure,
    transient: hash01(sv.id + p.id + "x") < 0.1,
    totalMs: phases.reduce((a, x) => a + x.ms, 0),
  };
}
