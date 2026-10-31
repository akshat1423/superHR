/**
 * Stores the sample batch's provisioning history in Supabase so the Agents → Logs tab has data from the start:
 *   npm run db:seed
 * Idempotent: running it again changes nothing ((batch, seq) is unique and duplicates are ignored).
 */
import { SEED_BATCH_ID } from "../src/lib/agentEvents";
import { parseAts } from "../src/lib/csv";
import { fastForward, initRun } from "../src/lib/provision";
import { SAMPLE_CSV } from "../src/lib/sample";
import { createGatedClient, envFromProcess } from "../src/lib/supabase/factory";

try { process.loadEnvFile(".env.local"); } catch { /* use the real environment */ }
const db = createGatedClient(envFromProcess());
if (!db) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_APP_KEY — see .env.example");
  process.exit(1);
}

const people = parseAts(SAMPLE_CSV).people;
const run = fastForward(initRun(people), people);
const byId = new Map(people.map((p) => [p.id, p]));

const b = await db.from("agent_batches").upsert({ id: SEED_BATCH_ID, started_by: "seed", label: `${people.length} people (sample)`, people: people.length }, { onConflict: "id", ignoreDuplicates: true });
if (b.error) {
  console.error(b.error.code === "PGRST205" ? "Tables don't exist yet — run `npm run db:sql` and paste the output into the Supabase SQL editor." : `Could not create the batch: ${b.error.message}`);
  process.exit(1);
}

const rows = run.events.flatMap((e) => {
  const p = byId.get(e.personId);
  return p ? [{ batch_id: SEED_BATCH_ID, seq: e.seq, tick: e.t, person_id: p.id, person_name: p.name, dept: p.persona.dept, manager: p.manager, service: e.service, kind: e.kind, message: e.text, call: e.call ?? null, trace_id: e.traceId ?? null, ms: e.ms ?? null, meta: e.meta ?? null }] : [];
});

let sent = 0;
for (let i = 0; i < rows.length; i += 400) {
  const chunk = rows.slice(i, i + 400);
  const r = await db.from("agent_events").upsert(chunk, { onConflict: "batch_id,seq", ignoreDuplicates: true });
  if (r.error) { console.error(`Insert failed at row ${i}: ${r.error.message}`); process.exit(1); }
  sent += chunk.length;
  process.stdout.write(`\r  ${sent}/${rows.length} events`);
}
const count = await db.from("agent_events").select("id", { count: "exact" }).eq("batch_id", SEED_BATCH_ID).limit(1);
const errors = rows.filter((r) => r.kind === "error").length;
console.log(`\nSeeded batch "${SEED_BATCH_ID}": ${count.count ?? "?"} events stored (${errors} errors with failure details).`);
