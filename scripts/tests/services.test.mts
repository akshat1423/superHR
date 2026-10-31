import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { usePeople } from "../../src/store/people";
import { SERVICES } from "../../src/lib/services";
import { applyExecution, claimExecutions, initRun, isTerminal, retryTask, stepRun, type Run } from "../../src/lib/provision";
import { execute, modeOf } from "../../src/lib/serviceRuntime/runner";
import { asPerson } from "../../src/lib/serviceRuntime/validate";
import { HANDLERS } from "../../src/lib/serviceRuntime/handlers";
import { webhookVar } from "../../src/lib/serviceRuntime/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const people = usePeople.getState().people;

console.log("a function per service");
ok("every service has a handler with one entry per API call", SERVICES.every((s) => HANDLERS[s.id]?.length === s.phases.length));
const p0 = people[0];
const exs = await Promise.all(SERVICES.map((s) => execute(s.id, p0, { attempt: 1, retry: false })));
ok("each runs in sandbox mode by default", exs.every((e) => e.mode === "sandbox"));
ok("each records every call it made, with request and response bodies", exs.every((e) => e.phases.length >= 1 && e.phases.every((x) => x.request.length > 2 && x.response.length > 0 && x.ms > 0)));
ok("a service that did not fail made all its calls, in order", exs.filter((e) => e.ok).every((e) => e.phases.length === SERVICES.find((s) => s.id === e.service)!.phases.length && e.phases.every((x, i) => x.label === SERVICES.find((s) => s.id === e.service)!.phases[i].label)));
ok("…and produced an artifact (or says what it is waiting on)", exs.filter((e) => e.ok).every((e) => !!e.artifact !== !!e.paused));
ok("a failure carries code, cause, evidence and fix, and stops at the failing call", exs.filter((e) => !e.ok).every((e) => e.failure && e.failure.cause && e.failure.evidence && e.failure.fix && e.phases.length === e.failure.phase + 1 && !e.phases[e.failure.phase].ok));
ok("payloads are built from the person (email, department)", JSON.stringify(exs[0].phases[0].request).includes("acme.com") && JSON.stringify(exs[0].phases[0].request).includes(p0.persona.dept));
ok("runs are deterministic", JSON.stringify(await execute("identity-svc", p0, { attempt: 1, retry: false })) === JSON.stringify(exs[0]));
ok("trace id differs per attempt", (await execute("identity-svc", p0, { attempt: 2, retry: false })).traceId !== exs[0].traceId);

console.log("\nfailures across the sample batch");
const all = (await Promise.all(people.flatMap((p) => SERVICES.map((s) => execute(s.id, p, { attempt: 1, retry: false }))))).flat();
const failed = all.filter((e) => !e.ok);
ok("some runs fail, most succeed", failed.length > 0 && failed.length < all.length * 0.25, `${failed.length}/${all.length}`);
let retried = 0, healed = 0;
for (const p of people) for (const s of SERVICES) {
  const e = await execute(s.id, p, { attempt: 1, retry: false });
  if (!e.ok) { retried++; if ((await execute(s.id, p, { attempt: 2, retry: true })).ok) healed++; }
}
ok("a retry after the cause is fixed succeeds, every time", retried > 0 && healed === retried, `${healed}/${retried}`);

console.log("\ninput validation");
ok("a real person is accepted", asPerson(JSON.parse(JSON.stringify(p0)))?.id === p0.id);
ok("unknown department is refused", asPerson({ ...p0, persona: { ...p0.persona, dept: "Piracy" } }) === null);
ok("missing name is refused", asPerson({ ...p0, name: "" }) === null);
ok("over-long strings are refused", asPerson({ ...p0, name: "x".repeat(200) }) === null);
ok("bad date is refused", asPerson({ ...p0, startDate: "tomorrow" }) === null);
ok("non-objects are refused", asPerson(null) === null && asPerson("p0") === null && asPerson(7) === null);

console.log("\nlive mode through a connector");
const calls: { sig: string; body: string; trace: string }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ sig: String(req.headers["x-superjoin-signature"] ?? ""), body, trace: String(req.headers["x-superjoin-trace"] ?? "") });
    const j = JSON.parse(body) as { phase: { index: number } };
    res.setHeader("content-type", "application/json");
    if (j.phase.index === 1 && req.url === "/fail") { res.statusCode = 409; res.end(JSON.stringify({ ok: false, error: { code: "409", title: "Seat limit reached", cause: "No seats left", fix: "Buy a seat", retryable: false } })); return; }
    res.end(JSON.stringify({ ok: true, status: 201, response: { created: true }, artifact: "mailbox created by the real system" }));
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
process.env.SERVICE_WEBHOOK_SECRET = "s3cret";
process.env[webhookVar("identity-svc")] = `http://127.0.0.1:${port}/ok`;
const quiet = people.find((p) => !SERVICES[0].waits(p))!;
ok("a service with a webhook runs live", modeOf("identity-svc") === "live" && modeOf("letter-svc") === "sandbox");
const live = await execute("identity-svc", quiet, { attempt: 1, retry: false });
ok("the connector is called once per API call", calls.length === SERVICES[0].phases.length, String(calls.length));
ok("…each call is signed with HMAC-SHA256", calls.every((c) => c.sig === `sha256=${createHmac("sha256", "s3cret").update(c.body).digest("hex")}`));
ok("…and carries the trace id", calls.every((c) => c.trace === live.traceId));
ok("the real system's answer and artifact are used", live.ok && live.mode === "live" && live.artifact === "mailbox created by the real system" && live.phases[0].response.includes("created"));
process.env[webhookVar("identity-svc")] = `http://127.0.0.1:${port}/fail`;
const bad = await execute("identity-svc", quiet, { attempt: 1, retry: false });
ok("a connector failure becomes a diagnosable failure", !bad.ok && bad.failure?.code === "409" && bad.failure.title === "Seat limit reached" && bad.failure.phase === 1 && bad.phases.length === 2);
process.env[webhookVar("identity-svc")] = "http://127.0.0.1:1/nothing";
const down = await execute("identity-svc", quiet, { attempt: 1, retry: false });
ok("an unreachable connector is reported, not hidden", !down.ok && down.failure?.code === "502" && down.failure.retryable);
delete process.env[webhookVar("identity-svc")];
server.close();

console.log("\nthe engine replays what the server did");
const batch = people;
let run: Run = initRun(batch, true);
const answered: string[] = [];
for (let i = 0; i < 6000 && !run.people.every((r) => r.state === "finished"); i++) {
  run = stepRun(run, batch);
  const { run: next, jobs } = claimExecutions(run);
  run = next;
  for (const j of jobs) {
    answered.push(`${j.personId}|${j.service}`);
    const ex = await execute(j.service, batch.find((p) => p.id === j.personId)!, { attempt: j.attempt, retry: j.retry });
    run = applyExecution(run, j.personId, j.service, ex);
  }
}
ok("every person finishes", run.people.every((r) => r.state === "finished"));
ok("every service was asked of the server, exactly once", new Set(answered).size === answered.length && answered.length > batch.length * 5);
ok("every task ended in a terminal state", run.people.every((r) => r.tasks.every((t) => isTerminal(t.status))));
const done = run.people.flatMap((r) => r.tasks).filter((t) => t.status === "done");
ok("a finished service keeps the server's request and response per call", done.length > 0 && done.every((t) => t.actions.every((a) => a.http && a.request && a.response)));
ok("a finished service shows the server's artifact", done.every((t) => t.detail.length > 0 && t.execution?.artifact === t.detail));
const failedTasks = run.people.flatMap((r) => r.tasks).filter((t) => t.status === "failed");
ok("a failed service shows the server's cause and evidence", failedTasks.every((t) => t.failure && t.execution?.failure?.cause === t.failure.cause && t.failure.evidence.length > 10));
ok("log lines carry the connector mode", run.events.some((e) => (e.meta as { mode?: string } | undefined)?.mode === "sandbox"));

const t = failedTasks[0];
if (t) {
  const pr = run.people.find((r) => r.tasks.includes(t))!;
  const svc = SERVICES[pr.tasks.indexOf(t)].id;
  run = retryTask(run, pr.personId, svc, "Priya Nair");
  for (let i = 0; i < 4000 && !run.people.find((r) => r.personId === pr.personId)!.tasks.every((x) => isTerminal(x.status)); i++) {
    run = stepRun(run, batch);
    const { run: next, jobs } = claimExecutions(run);
    run = next;
    for (const j of jobs) run = applyExecution(run, j.personId, j.service, await execute(j.service, batch.find((p) => p.id === j.personId)!, { attempt: j.attempt, retry: j.retry }));
  }
  const after = run.people.find((r) => r.personId === pr.personId)!.tasks[SERVICES.findIndex((s) => s.id === svc)];
  ok("retrying a failed service runs it on the server again and it succeeds", after.status === "done" || after.status === "waiting", after.status);
  ok("…with a new attempt number and trace id", after.attempts === 2 && after.traceId !== t.traceId);
} else ok("(no failed service in this batch to retry)", true);

console.log("\nwhen the server can't be reached");
let fb: Run = initRun(batch.slice(0, 1), true);
for (let i = 0; i < 6000 && !fb.people.every((r) => r.state === "finished"); i++) {
  fb = stepRun(fb, batch.slice(0, 1));
  const { run: next, jobs } = claimExecutions(fb);
  fb = next;
  for (const j of jobs) fb = applyExecution(fb, j.personId, j.service, null, "HTTP 503");
}
ok("the run still finishes (simulated locally)", fb.people.every((r) => r.state === "finished"));
ok("…and the log says it fell back, instead of pretending", fb.events.some((e) => e.text.includes("simulated locally") && e.text.includes("HTTP 503")));

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
