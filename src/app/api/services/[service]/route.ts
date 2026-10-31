import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { canSeeAgentLogs } from "@/lib/auth/policy";
import { allow } from "@/lib/rateLimit";
import { SERVICES } from "@/lib/services";
import { execute, modeOf } from "@/lib/serviceRuntime/runner";
import { asPerson } from "@/lib/serviceRuntime/validate";

/** A live connector may take a few seconds per call; a service makes two or three of them. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ service: string }> };

/** Describe one service and which connector it runs on (never any URL or secret). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canSeeAgentLogs(user)) return new Response(null, { status: 403 });
  const { service } = await params;
  const sv = SERVICES.find((s) => s.id === service);
  if (!sv) return new Response(null, { status: 404 });
  return NextResponse.json({ id: sv.id, name: sv.name, creates: sv.creates, deps: sv.deps, mode: modeOf(sv.id), calls: sv.phases.map((p) => ({ label: p.label, call: p.call })) });
}

/**
 * Run this service for one person: `{ person, attempt?, retry? }` → the full execution (each call with its request,
 * response and timing, the artifact it created or the failure with cause, evidence and fix). HR may run it for
 * anyone; a department head only for their own department.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canSeeAgentLogs(user)) return new Response(null, { status: 403 });
  const { service } = await params;
  if (!SERVICES.some((s) => s.id === service)) return new Response(null, { status: 404 });
  if (!allow(`svc:${user.id}`, 600, 60_000)) return NextResponse.json({ error: "Too many service calls — slow down." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as { person?: unknown; attempt?: unknown; retry?: unknown; action?: unknown; object?: unknown } | null;
  const person = asPerson(b?.person);
  if (!b || !person) return NextResponse.json({ error: "Send { person } with a valid id, name, persona and startDate." }, { status: 400 });
  if (user.role === "dept_head" && person.persona.dept !== user.dept) return new Response(null, { status: 403 });
  const attempt = typeof b.attempt === "number" && Number.isInteger(b.attempt) && b.attempt >= 1 && b.attempt <= 20 ? b.attempt : 1;

  const action = b.action === undefined ? "provision" : b.action;
  if (action !== "provision" && action !== "deprovision" && action !== "update") return NextResponse.json({ error: "action must be provision, deprovision or update." }, { status: 400 });
  // an object (one application) only makes sense for access; anything else would silently run the whole service
  const object = typeof b.object === "string" && b.object.trim() ? b.object.trim().slice(0, 80) : undefined;
  if (b.object !== undefined && b.object !== null && (typeof b.object !== "string" || (object && service !== "access-svc"))) return NextResponse.json({ error: "object applies only to access-svc and must be an application name." }, { status: 400 });

  return NextResponse.json(await execute(service, person, { attempt, retry: b.retry === true, action, object }));
}
