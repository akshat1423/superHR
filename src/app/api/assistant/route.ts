import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { AI_MODEL, aiConfigured, completeWithClaude } from "@/lib/ai";
import { allow } from "@/lib/rateLimit";
import { MAX_QUESTION, answer, type AssistantInput, type ChecklistFact } from "@/lib/onboarding/assistant";
import { SAMPLE_POLICIES } from "@/lib/onboarding/policies";
import type { ItemState, Policy } from "@/lib/onboarding/types";
import { LEVELS } from "@/lib/workflow";

/** A model call can outlast a serverless function's default timeout; 60s fits every Vercel plan. */
export const maxDuration = 60;

const STATES: ItemState[] = ["completed", "pending", "blocked", "overdue"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const s = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Tells the UI whether answers will be AI-written or quoted, so it can say so. */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  return NextResponse.json({ ai: aiConfigured(), model: aiConfigured() ? AI_MODEL : null });
}

/**
 * Answer an onboarding question from approved policies and the asker's own checklist. Every field is validated and
 * length-limited; the reply is verified against the sources before it is returned (see lib/onboarding/assistant).
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allow(`assistant:${user.id}`, 20, 60_000)) return NextResponse.json({ error: "Too many questions — please wait a minute." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !s(b.question, MAX_QUESTION) || !b.question.trim()) return NextResponse.json({ error: "Ask a question of up to 500 characters." }, { status: 400 });
  const e = b.employee as Record<string, unknown> | undefined;
  const hr = b.hr as Record<string, unknown> | undefined;
  if (!e || !hr || !s(e.name, 80) || !s(e.role, 80) || !s(e.department, 40) || !s(e.location, 40) || !s(e.grade, 20) || !s(e.manager, 80) || !s(e.startDate, 10) || !ISO.test(e.startDate as string)
    || (e.country !== "IN" && e.country !== "US") || !LEVELS.includes(e.level as (typeof LEVELS)[number]) || !s(hr.name, 80) || !s(hr.email, 120))
    return NextResponse.json({ error: "Invalid employee context." }, { status: 400 });
  if (!Array.isArray(b.facts) || b.facts.length > 80) return NextResponse.json({ error: "Invalid checklist." }, { status: 400 });

  const facts: ChecklistFact[] = [];
  for (const raw of b.facts as Record<string, unknown>[]) {
    if (!raw || !s(raw.item, 120) || !s(raw.kind, 20) || !s(raw.dueDate, 10) || !s(raw.owner, 80) || !s(raw.ownerFn, 20) || !s(raw.reason, 700) || !STATES.includes(raw.state as ItemState))
      return NextResponse.json({ error: "Invalid checklist item." }, { status: 400 });
    facts.push({ item: raw.item, kind: raw.kind, dueDate: raw.dueDate, owner: raw.owner, ownerFn: raw.ownerFn, state: raw.state as ItemState, reason: raw.reason, policy: typeof raw.policy === "string" ? raw.policy.slice(0, 20) : undefined, docStatus: typeof raw.docStatus === "string" ? raw.docStatus.slice(0, 30) : undefined });
  }

  // uploaded policies may be supplied; otherwise the built-in set is used
  let policies: Policy[] = SAMPLE_POLICIES;
  if (Array.isArray(b.policies) && b.policies.length) {
    if (b.policies.length > 60 || JSON.stringify(b.policies).length > 150_000) return NextResponse.json({ error: "Policy set too large." }, { status: 413 });
    policies = (b.policies as Policy[]).filter((p) => p && typeof p.id === "string" && Array.isArray(p.sections));
  }

  const history = Array.isArray(b.history)
    ? (b.history as { role?: unknown; text?: unknown }[]).filter((h) => (h.role === "user" || h.role === "assistant") && s(h.text, 800)).slice(-6).map((h) => ({ role: h.role as "user" | "assistant", text: h.text as string }))
    : [];

  const input: AssistantInput = {
    question: b.question.trim(),
    history,
    employee: { name: e.name as string, role: e.role as string, department: e.department as string, location: e.location as string, country: e.country as "IN" | "US", grade: e.grade as string, level: e.level as AssistantInput["employee"]["level"], startDate: e.startDate as string, manager: e.manager as string },
    hr: { name: hr.name as string, email: hr.email as string },
    facts,
    policies,
  };
  return NextResponse.json(await answer(input, aiConfigured() ? completeWithClaude : undefined));
}
