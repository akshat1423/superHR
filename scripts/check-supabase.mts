/**
 * Verifies the Supabase connection end to end:  npm run db:check
 *   1. env vars present            4. the gate works: the public key ALONE cannot write
 *   2. project reachable           5. the gated client can read
 *   3. tables exist
 */
import { createClient } from "@supabase/supabase-js";
import { createGatedClient, envFromProcess } from "../src/lib/supabase/factory";

try { process.loadEnvFile(".env.local"); } catch { /* use the real environment */ }
const env = envFromProcess();
let failed = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string, hint?: string) => { failed++; console.log(`  ✗ ${m}${hint ? `\n      → ${hint}` : ""}`); };

console.log("superjoin ↔ Supabase");

if (!env.url || !env.publishableKey || !env.appKey) {
  bad("env vars", `missing: ${[!env.url && "NEXT_PUBLIC_SUPABASE_URL", !env.publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", !env.appKey && "SUPABASE_APP_KEY"].filter(Boolean).join(", ")} (see .env.example)`);
  process.exit(1);
}
ok(`env vars present (${new URL(env.url).host})`);

const gated = createGatedClient(env)!;
const bare = createClient(env.url, env.publishableKey, { auth: { persistSession: false } }); // public key only, no gate header

// GET (not HEAD): a HEAD response has no body, so the PostgREST error code would be invisible
const probe = await gated.from("agent_batches").select("id", { count: "exact" }).limit(1);
if (probe.error && probe.error.code !== "PGRST205") {
  bad(`project reachable, but the query failed (${probe.error.code ?? probe.error.message})`, probe.error.message);
  process.exit(1);
}
ok("project reachable");

if (probe.error?.code === "PGRST205") {
  bad("tables exist", "run `npm run db:sql` and paste the output into the Supabase SQL editor, then re-run this check");
  process.exit(1);
}
ok("tables exist (agent_batches, agent_events)");

// A write with only the public key must be refused by row-level security (42501). Using a batch id that
// does not exist means that even a misconfigured policy could not insert anything (it would fail on the
// foreign key, 23503) — and that is exactly how we tell the two cases apart.
const intruder = await bare.from("agent_events").insert({ batch_id: "no-such-batch", seq: 0, tick: 0, person_id: "x", person_name: "x", dept: "x", manager: "x", service: "x", kind: "info", message: "gate probe" });
if (intruder.error?.code === "42501") ok("gate holds: the public key alone cannot write (RLS refused it)");
else if (intruder.error?.code === "23503") bad("gate is OPEN: the public key alone passed row-level security", "re-run the SQL from `npm run db:sql` — the policies must call public.app_gate()");
else bad(`unexpected result from the gate probe (${intruder.error?.code ?? "no error"})`, intruder.error?.message);

const seen = await bare.from("agent_batches").select("id").limit(1);
if (!seen.error && (seen.data?.length ?? 0) === 0) ok("gate holds: the public key alone reads nothing");
else if (seen.error) ok(`gate holds: the public key alone cannot read (${seen.error.code})`);
else bad("gate is OPEN: the public key alone can read batches");

const batches = await gated.from("agent_batches").select("id", { count: "exact" }).limit(1);
const events = await gated.from("agent_events").select("id", { count: "exact" }).limit(1);
if (batches.error || events.error) bad("gated read", (batches.error ?? events.error)?.message);
else ok(`gated read works — ${batches.count ?? 0} batch(es), ${events.count ?? 0} event(s) stored`);
if ((batches.count ?? 0) === 0) console.log("      (empty — load the sample history with `npm run db:seed`)");

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll good.");
process.exit(failed ? 1 : 0);
