import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { AI_MODEL, agentTurn, aiConfigured, type AgentMessage } from "@/lib/ai";
import { systemPrompt } from "@/lib/agent/prompt";
import { toolsFor } from "@/lib/agent/tools";
import { todayISO } from "@/lib/dates";
import { allow } from "@/lib/rateLimit";

/** A tool-using turn can take a while; 60s fits every Vercel plan. */
export const maxDuration = 60;

const MAX_BYTES = 250_000;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Tells the UI whether the chat is model-driven or the offline router, so it can say which. */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  return NextResponse.json({ ai: aiConfigured(), model: aiConfigured() ? AI_MODEL : null, tools: toolsFor(user).map((t) => t.name) });
}

/**
 * One step of the chat agent. The browser holds the data (and runs the tools), so this is stateless: it takes the
 * conversation so far, including any tool results, and returns the model's next turn — an answer, or tool calls.
 * The system prompt and the tool list come from the verified session; the request can't widen them.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allow(`agent:${user.id}`, 30, 60_000)) return NextResponse.json({ error: "Too many messages — please wait a minute." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Conversation too long." }, { status: 413 });
  let body: { messages?: unknown } | null = null;
  try { body = JSON.parse(raw) as { messages?: unknown }; } catch { /* handled below */ }
  const list = Array.isArray(body?.messages) ? (body!.messages as unknown[]) : null;
  if (!list || !list.length || list.length > 40) return NextResponse.json({ error: "Send { messages } with 1 to 40 messages." }, { status: 400 });

  const allowed = new Set(toolsFor(user).map((t) => t.name));
  const messages: AgentMessage[] = [];
  for (const m of list as { role?: unknown; content?: unknown }[]) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    if (typeof m.content === "string") {
      if (!text(m.content, 4000)) return NextResponse.json({ error: "Message too long." }, { status: 400 });
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content) || !m.content.length || m.content.length > 20) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    const blocks: Record<string, unknown>[] = [];
    for (const b of m.content as Record<string, unknown>[]) {
      if (b?.type === "text" && text(b.text, 8000) && b.text) blocks.push({ type: "text", text: b.text });
      else if (b?.type === "tool_use" && m.role === "assistant" && text(b.id, 80) && text(b.name, 40) && allowed.has(b.name) && b.input && typeof b.input === "object") blocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      else if (b?.type === "tool_result" && m.role === "user" && text(b.tool_use_id, 80) && text(b.content, 30_000)) blocks.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error === true ? { is_error: true } : {}) });
      else return NextResponse.json({ error: "Invalid message content." }, { status: 400 });
    }
    messages.push({ role: m.role, content: blocks } as unknown as AgentMessage);
  }
  if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "A conversation starts and ends with the user." }, { status: 400 });

  // no key: the UI answers with the offline router instead
  if (!aiConfigured()) return NextResponse.json({ mode: "offline" }, { status: 503 });

  try {
    const tools = toolsFor(user);
    const out = await agentTurn(systemPrompt(user, todayISO()), messages, tools);
    return NextResponse.json({ mode: "ai", ...out });
  } catch {
    // the UI falls back to the offline router on this
    return NextResponse.json({ mode: "offline", reason: "model_unavailable" }, { status: 502 });
  }
}
