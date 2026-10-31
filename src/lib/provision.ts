import type { Person } from "./people";
import { SERVICES, serviceIndex } from "./services";
import { hash01 } from "./utils";
import type { ActionKind, ExecFailure, Execution } from "./serviceRuntime/types";

export const TICKS_PER_SEC = 4;
const MS_PER_TICK = 1000 / TICKS_PER_SEC;
/** how many people the provisioner works on at the same time; everyone else waits in the queue */
export const CONCURRENCY = 4;
/** a transient error backs off for ~1.5s before the agent retries by itself */
const RETRY_TICKS = 6;
/** share of service runs that hit a real (non-transient) failure */
export const FAIL_RATE = 0.09;

export type TaskStatus = "queued" | "running" | "retry" | "done" | "waiting" | "failed" | "skipped" | "revoked";
/** a task in one of these states will not change by itself */
export const isTerminal = (s: TaskStatus) => s === "done" || s === "waiting" || s === "failed" || s === "skipped" || s === "revoked";

/** One API call made by an agent. The timeline of these is "what was done". */
export interface ActionRec {
  label: string;
  call: string;
  status: "running" | "ok" | "failed";
  startedAt: number;
  finishedAt: number | null;
  ms: number | null;
  note?: string;
  /** what the server sent and got back for this call (set when the service ran on the server) */
  http?: number;
  request?: string;
  response?: string;
}

export interface FailureInfo {
  code: string;
  title: string;
  cause: string;
  evidence: string;
  fix: string;
  retryable: boolean;
  at: number;
  traceId: string;
  action: string;
}

export interface Task {
  status: TaskStatus;
  progress: number;
  dur: number;
  /** progress point of a one-off transient error the agent retries by itself, or null */
  transientAt: number | null;
  retryLeft: number;
  retried: boolean;
  /** artifact when done, or the reason it is paused / skipped */
  detail: string;
  startedAt: number | null;
  finishedAt: number | null;
  actions: ActionRec[];
  /** index into the service's `failures` this run will hit, or null */
  failPlan: number | null;
  failure: FailureInfo | null;
  failedAttempts: FailureInfo[];
  attempts: number;
  traceId: string;
  /** server-run: waiting for the server function to answer; progress is held until it does */
  awaiting?: boolean;
  /** the server call for this attempt has been sent */
  requested?: boolean;
  /** what the server did; the engine replays it. Absent means the local simulation decides. */
  execution?: Execution | null;
  /** set when this service was deprovisioned for the person: who, why, and what the server did */
  revocation?: { at: number; by: string; reason: string; execution: Execution } | null;
  /** applications taken away from this person individually (access only), by name */
  revokedObjects?: Record<string, { at: number; by: string; traceId: string }>;
  /** the last deprovision attempt failed (the whole service, or just `object`) and can be retried */
  revokeFailure?: (ExecFailure & { at: number; traceId: string; object?: string }) | null;
  /** the last update made to what this service created (after a joining-date, role or location change) */
  lastUpdate?: { at: number; by: string; reason: string; execution: Execution } | null;
}

export interface PersonRun {
  personId: string;
  state: "queued" | "running" | "finished";
  startedAt: number | null;
  finishedAt: number | null;
  tasks: Task[];
}

export type LogKind = "info" | "ok" | "warn" | "error";
export interface LogEvent {
  seq: number;
  t: number;
  personId: string;
  /** service id, or "queue" for scheduler messages */
  service: string;
  kind: LogKind;
  text: string;
  call?: string;
  traceId?: string;
  ms?: number;
  /** structured detail, e.g. the full failure (cause, evidence, fix) on error events */
  meta?: Record<string, unknown>;
}

export interface Run {
  /** services run through the server functions (`/api/services/*`) instead of the local simulation */
  remote?: boolean;
  tick: number;
  seq: number;
  people: PersonRun[];
  events: LogEvent[];
}

export const traceId = (personId: string, svcId: string, attempt: number) =>
  "tr_" + Math.floor(hash01(`${personId}|${svcId}|${attempt}`) * 0xffffffff).toString(16).padStart(8, "0");

export function initRun(people: Person[], remote = false): Run {
  return {
    remote,
    tick: 0,
    seq: 0,
    events: [],
    people: people.map((p) => ({
      personId: p.id,
      state: "queued",
      startedAt: null,
      finishedAt: null,
      tasks: SERVICES.map((sv) => {
        const dur = Math.round((sv.secs[0] + hash01(p.id + sv.id) * (sv.secs[1] - sv.secs[0])) * TICKS_PER_SEC);
        // a service that is merely waiting on the candidate doesn't also fail
        const fails = !sv.waits(p) && hash01(p.id + sv.id + "F") < FAIL_RATE;
        return {
          status: "queued" as TaskStatus,
          progress: 0,
          dur,
          transientAt: hash01(sv.id + p.id + "x") < 0.1 ? Math.floor(dur * 0.55) : null,
          retryLeft: 0,
          retried: false,
          detail: "",
          startedAt: null,
          finishedAt: null,
          actions: [],
          failPlan: fails ? Math.floor(hash01(p.id + sv.id + "V") * sv.failures.length) : null,
          failure: null,
          failedAttempts: [],
          attempts: 0,
          traceId: "",
        };
      }),
    })),
  };
}

export const phaseIndex = (si: number, t: Task) => {
  const L = SERVICES[si].phases.length;
  return Math.min(L - 1, Math.floor((t.progress / t.dur) * L));
};
export const phaseLabel = (si: number, t: Task) => SERVICES[si].phases[phaseIndex(si, t)].label;

type Readiness = { kind: "wait" } | { kind: "go" } | { kind: "blocked"; by: string } | { kind: "skipped"; by: string; verb: "failed" | "was revoked" };

/** Can this service start yet? Paused dependencies pause it; failed dependencies skip it. */
function readiness(si: number, tasks: Task[]): Readiness {
  const d = SERVICES[si].deps;
  if (d === "all") return tasks.every((t, i) => i === si || isTerminal(t.status)) ? { kind: "go" } : { kind: "wait" };
  const deps = d.map(serviceIndex);
  const failed = deps.find((i) => tasks[i].status === "failed" || tasks[i].status === "skipped" || tasks[i].status === "revoked");
  if (failed !== undefined) return { kind: "skipped", by: SERVICES[failed].name, verb: tasks[failed].status === "revoked" ? "was revoked" : "failed" };
  const paused = deps.find((i) => tasks[i].status === "waiting");
  if (paused !== undefined) return { kind: "blocked", by: SERVICES[paused].name };
  return deps.every((i) => tasks[i].status === "done") ? { kind: "go" } : { kind: "wait" };
}

type Log = (personId: string, service: string, kind: LogKind, text: string, extra?: Partial<LogEvent>) => void;

const okCode = (call: string, label: string) => (call.startsWith("POST") && /^(Create|Send|Queue|Schedule|Reserve|Build)/.test(label) ? "201 Created" : "200 OK");

function openAction(t: Task, si: number, phase: number, tick: number, personId: string, log: Log) {
  const ph = SERVICES[si].phases[phase];
  t.actions.push({ label: ph.label, call: ph.call, status: "running", startedAt: tick, finishedAt: null, ms: null });
  log(personId, SERVICES[si].id, "info", `${ph.label}…`, { call: ph.call, traceId: t.traceId });
}

function closeAction(t: Task, si: number, tick: number, status: "ok" | "failed", personId: string, log: Log, failText?: string, meta?: Record<string, unknown>) {
  const a = t.actions[t.actions.length - 1];
  a.status = status;
  a.finishedAt = tick;
  const sr = t.execution?.phases[t.actions.length - 1];
  a.ms = sr ? sr.ms : Math.round((tick - a.startedAt) * MS_PER_TICK + hash01(t.traceId + a.label) * 180);
  if (sr) { a.http = sr.httpStatus; a.request = sr.request; a.response = sr.response; }
  if (status === "ok") log(personId, SERVICES[si].id, "ok", `${a.label} → ${sr ? `${sr.httpStatus} ${sr.httpStatus === 201 ? "Created" : "OK"}` : okCode(a.call, a.label)}`, { call: a.call, traceId: t.traceId, ms: a.ms });
  else log(personId, SERVICES[si].id, "error", `${a.label} → ${failText}`, { call: a.call, traceId: t.traceId, ms: a.ms, meta });
}

/** Advance the whole batch by one tick (¼ second of simulated time). Pure: returns a new Run. */
export function stepRun(run: Run, people: Person[]): Run {
  const tick = run.tick + 1;
  let seq = run.seq;
  const events = [...run.events];
  const log: Log = (personId, service, kind, text, extra) => events.push({ seq: ++seq, t: tick, personId, service, kind, text, ...extra });
  const byId = new Map(people.map((p) => [p.id, p]));
  const runs: PersonRun[] = run.people.map((pr) => ({
    ...pr,
    tasks: pr.tasks.map((t) => ({ ...t, actions: t.actions.map((a) => ({ ...a })), failedAttempts: [...t.failedAttempts] })),
  }));

  // hand free worker slots to the next people in the queue
  let active = runs.filter((r) => r.state === "running").length;
  for (const r of runs) {
    if (r.state === "queued" && active < CONCURRENCY) {
      r.state = "running";
      r.startedAt = tick;
      active++;
      log(r.personId, "queue", "info", "picked up by a worker");
    }
  }

  for (const r of runs) {
    if (r.state !== "running") continue;
    const p = byId.get(r.personId);
    if (!p) continue;

    r.tasks.forEach((t, si) => {
      const sv = SERVICES[si];

      if (t.status === "queued") {
        const ready = readiness(si, r.tasks);
        if (ready.kind === "go") {
          t.status = "running";
          t.startedAt = tick;
          t.attempts++;
          t.traceId = traceId(r.personId, sv.id, t.attempts);
          t.execution = null;
          t.requested = false;
          t.awaiting = !!run.remote;
          openAction(t, si, 0, tick, r.personId, log);
        } else if (ready.kind === "blocked") {
          t.status = "waiting";
          t.detail = `blocked by ${ready.by}`;
          t.startedAt = t.finishedAt = tick;
          log(r.personId, sv.id, "warn", `paused — ${t.detail}`);
        } else if (ready.kind === "skipped") {
          t.status = "skipped";
          t.detail = `not run — ${ready.by} ${ready.verb}`;
          t.startedAt = t.finishedAt = tick;
          log(r.personId, sv.id, "warn", `skipped — upstream ${ready.by} ${ready.verb}`);
        }
        return;
      }

      if (t.status === "retry") {
        if (--t.retryLeft <= 0) { t.status = "running"; t.retried = true; log(r.personId, sv.id, "info", "retry succeeded, continuing", { traceId: t.traceId }); }
        return;
      }

      if (t.status !== "running") return;
      if (t.awaiting) return;

      t.progress++;
      const L = sv.phases.length;
      const idx = Math.min(L - 1, Math.floor((t.progress / t.dur) * L));

      // transient error the agent handles itself
      if (t.transientAt !== null && !t.retried && t.progress === t.transientAt) {
        t.status = "retry";
        t.retryLeft = RETRY_TICKS;
        t.actions[t.actions.length - 1].note = "HTTP 503 — retried automatically";
        log(r.personId, sv.id, "warn", "transient error (HTTP 503) — retrying in 1.5s", { call: t.actions[t.actions.length - 1].call, traceId: t.traceId });
        return;
      }

      // move into the next API call
      while (t.actions.length - 1 < idx) {
        closeAction(t, si, tick, "ok", r.personId, log);
        openAction(t, si, t.actions.length, tick, r.personId, log);
      }

      // a real failure: the server's, when it ran the service; otherwise the local plan
      const ex = t.execution;
      const fail = ex ? (ex.failure ?? null) : t.failPlan !== null ? (() => { const f = sv.failures[t.failPlan]; return { code: f.code, title: f.title, cause: f.cause(p), evidence: f.evidence(p), fix: f.fix, retryable: f.retryable, phase: f.phase }; })() : null;
      if (fail && t.progress >= Math.ceil(((fail.phase + 0.5) / L) * t.dur)) {
        const act = t.actions[t.actions.length - 1];
        const info = { code: fail.code, title: fail.title, cause: fail.cause, evidence: fail.evidence, fix: fail.fix, retryable: fail.retryable, at: tick, traceId: t.traceId, action: act.label };
        closeAction(t, si, tick, "failed", r.personId, log, `${fail.code} ${fail.title}`, { failure: info, ...(ex ? { mode: ex.mode } : {}) });
        act.note = `${fail.code} ${fail.title}`;
        t.failure = info;
        t.failedAttempts = [...t.failedAttempts, info];
        t.status = "failed";
        t.finishedAt = tick;
        return;
      }

      if (t.progress >= t.dur) {
        closeAction(t, si, tick, "ok", r.personId, log);
        const why = ex ? (ex.paused ?? null) : sv.waits(p);
        const art = ex?.artifact ?? sv.artifact(p);
        t.status = why ? "waiting" : "done";
        t.detail = why ?? art;
        t.finishedAt = tick;
        log(r.personId, sv.id, why ? "warn" : "ok", why ? `paused — ${why}` : `done · ${art}`, { traceId: t.traceId, ...(ex ? { meta: { mode: ex.mode } } : {}) });
      }
    });

    if (r.tasks.every((t) => isTerminal(t.status))) {
      r.state = "finished";
      r.finishedAt = tick;
      const failed = r.tasks.filter((t) => t.status === "failed").length;
      log(r.personId, "queue", failed ? "error" : "ok", failed ? `finished with ${failed} failed service${failed > 1 ? "s" : ""}` : "all services finished");
    }
  }

  return { remote: run.remote, tick, seq, people: runs, events: events.slice(-6000) };
}

/**
 * Re-run one failed service for a person. Skipped dependents are put back in the queue.
 * The retry is assumed to succeed (someone fixed the cause) — a real system would re-hit the API.
 */
export function retryTask(run: Run, personId: string, svcId: string, by: string): Run {
  const pi = run.people.findIndex((r) => r.personId === personId);
  const si = serviceIndex(svcId);
  if (pi < 0 || si < 0 || run.people[pi].tasks[si].status !== "failed") return run;
  let seq = run.seq;
  const events = [...run.events];
  const runs = run.people.map((r, i) => (i !== pi ? r : { ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const r = runs[pi];
  const reset = (t: Task) => Object.assign(t, { status: "queued" as TaskStatus, progress: 0, retried: false, transientAt: null, failPlan: null, failure: null, detail: "", startedAt: null, finishedAt: null, actions: [], retryLeft: 0, awaiting: false, requested: false, execution: null });
  reset(r.tasks[si]);
  r.tasks.forEach((t) => { if (t.status === "skipped") reset(t); });
  r.state = "running";
  r.finishedAt = null;
  events.push({ seq: ++seq, t: run.tick, personId, service: svcId, kind: "info", text: `manual retry requested by ${by}` });
  return { ...run, seq, people: runs, events };
}

export const allFinished = (run: Run) => run.people.every((p) => p.state === "finished");
export const hasActivity = (run: Run) => run.people.some((p) => p.state !== "finished");

export function fastForward(run: Run, people: Person[], maxTicks = 4000): Run {
  let r = run;
  for (let i = 0; i < maxTicks && !allFinished(r); i++) r = stepRun(r, people);
  return r;
}

export const fmtClock = (tick: number) => {
  const s = Math.floor(tick / TICKS_PER_SEC);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Wall-clock stamp for log lines: the batch starts at 09:00:00. */
export const fmtStamp = (tick: number) => {
  const ms = 9 * 3600_000 + tick * MS_PER_TICK;
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
};

export const taskCounts = (r: PersonRun) => ({
  done: r.tasks.filter((t) => t.status === "done").length,
  waiting: r.tasks.filter((t) => t.status === "waiting").length,
  failed: r.tasks.filter((t) => t.status === "failed").length,
  skipped: r.tasks.filter((t) => t.status === "skipped").length,
  revoked: r.tasks.filter((t) => t.status === "revoked").length,
});

/** Server-run tasks whose call has not been sent yet: marks them sent and returns what to ask the server. */
export function claimExecutions(run: Run): { run: Run; jobs: { personId: string; service: string; attempt: number; retry: boolean }[] } {
  if (!run.remote) return { run, jobs: [] };
  const jobs: { personId: string; service: string; attempt: number; retry: boolean }[] = [];
  const people = run.people.map((pr) => {
    if (!pr.tasks.some((t) => t.awaiting && !t.requested)) return pr;
    return {
      ...pr,
      tasks: pr.tasks.map((t, si) => {
        if (!(t.awaiting && !t.requested)) return t;
        jobs.push({ personId: pr.personId, service: SERVICES[si].id, attempt: t.attempts, retry: t.failedAttempts.length > 0 });
        return { ...t, requested: true };
      }),
    };
  });
  return jobs.length ? { run: { ...run, people }, jobs } : { run, jobs };
}

/**
 * The server answered (or could not): release the task so the engine replays what it did. With no execution the
 * local simulation decides instead, and the log says so.
 */
export function applyExecution(run: Run, personId: string, service: string, ex: Execution | null, why?: string): Run {
  const pi = run.people.findIndex((r) => r.personId === personId);
  const si = serviceIndex(service);
  if (pi < 0 || si < 0 || !run.people[pi].tasks[si].awaiting) return run;
  const people = run.people.map((r, i) => (i !== pi ? r : { ...r, tasks: r.tasks.map((t, j) => (j !== si ? t : { ...t, awaiting: false, execution: ex, transientAt: ex ? (ex.transient ? Math.floor(t.dur * 0.55) : null) : t.transientAt })) }));
  const events = ex ? run.events : [...run.events, { seq: run.seq + 1, t: run.tick, personId, service, kind: "warn" as LogKind, text: `service endpoint unavailable${why ? ` (${why})` : ""} — simulated locally`, traceId: run.people[pi].tasks[si].traceId }];
  return { ...run, seq: ex ? run.seq : run.seq + 1, people, events };
}

// ── deprovisioning, updates and termination ─────────────────────────────────

/** A change to what the services created for one person. */
export interface ProvAction { service: string; kind: ActionKind; object?: string; reason: string }

/** Is something provisioned for this person by this service (so there is something to undo or update)? */
export const isProvisioned = (t: Task) => t.status === "done" || t.status === "waiting" || (t.status === "failed" && t.actions.some((a) => a.status === "ok"));

const phaseEvents = (log: (kind: LogKind, text: string, extra?: Partial<LogEvent>) => void, ex: Execution) => {
  for (const ph of ex.phases) log(ph.ok ? "ok" : "error", `${ph.label} → ${ph.ok ? `${ph.httpStatus} ${ph.httpStatus === 201 ? "Created" : "OK"}` : `${ph.httpStatus}`}`, { call: ph.call, traceId: ex.traceId, ms: ph.ms, ...(ph.ok ? {} : { meta: { failure: ex.failure } }) });
};

/**
 * The server answered a deprovision, update or single-object provision (or could not). Records what happened on the
 * task and in the log. Nothing is marked revoked unless the server said every call succeeded.
 */
export function applyAction(run: Run, personId: string, a: ProvAction & { by: string }, ex: Execution | null): Run {
  const pi = run.people.findIndex((r) => r.personId === personId);
  const si = serviceIndex(a.service);
  if (pi < 0 || si < 0) return run;
  let seq = run.seq;
  const events = [...run.events];
  const log = (kind: LogKind, text: string, extra?: Partial<LogEvent>) => events.push({ seq: ++seq, t: run.tick, personId, service: a.service, kind, text, ...extra });
  const what = `${a.kind === "deprovision" ? "revoke" : a.kind === "update" ? "update" : "grant"}${a.object ? ` ${a.object}` : ""}`;
  log("info", `${what} requested by ${a.by}: ${a.reason}`, ex ? { traceId: ex.traceId } : {});

  const fail: Task["revokeFailure"] = ex?.failure
    ? { ...ex.failure, at: run.tick, traceId: ex.traceId, ...(a.object ? { object: a.object } : {}) }
    : !ex ? { code: "502", title: "The service could not be reached", cause: "The request to the service function did not complete, so nothing was changed.", evidence: "no response", fix: "Try again.", retryable: true, phase: 0, at: run.tick, traceId: "", ...(a.object ? { object: a.object } : {}) } : null;
  if (ex) phaseEvents(log, ex);

  const people = run.people.map((r, i) => (i !== pi ? r : {
    ...r,
    tasks: r.tasks.map((t, j) => {
      if (j !== si) return t;
      if (fail) { log("error", `${what} failed — ${fail.code} ${fail.title}`, { traceId: fail.traceId || undefined }); return a.kind === "update" ? t : { ...t, revokeFailure: fail }; }
      const x = ex!;
      if (a.kind === "update") { log("ok", `updated · ${a.reason}`, { traceId: x.traceId }); return { ...t, lastUpdate: { at: run.tick, by: a.by, reason: a.reason, execution: x } }; }
      if (a.kind === "provision") {
        // granting one object back (the whole-service re-run goes through reprovisionTask)
        const rest = { ...(t.revokedObjects ?? {}) };
        if (a.object) delete rest[a.object];
        log("ok", `granted ${a.object ?? "access"}`, { traceId: x.traceId });
        return { ...t, revokedObjects: rest, revokeFailure: null };
      }
      if (a.object) { log("ok", `revoked ${a.object}`, { traceId: x.traceId }); return { ...t, revokedObjects: { ...(t.revokedObjects ?? {}), [a.object]: { at: run.tick, by: a.by, traceId: x.traceId } }, revokeFailure: null }; }
      log("ok", `revoked · ${a.reason}`, { traceId: x.traceId });
      return { ...t, status: "revoked" as TaskStatus, detail: `revoked by ${a.by}`, revocation: { at: run.tick, by: a.by, reason: a.reason, execution: x }, revokeFailure: null, finishedAt: run.tick };
    }),
  }));
  return { ...run, seq, people, events };
}

/** What survives a reload: the services revoked for a person, and the applications taken away individually. */
export interface LedgerEntry {
  services: Record<string, { at: number; by: string; reason: string; execution: Execution }>;
  objects: Record<string, Record<string, { at: number; by: string; traceId: string }>>;
}

/**
 * Put saved revocations back onto a freshly built run (the run itself is not saved). For a terminated person the
 * rest of the run is closed out the same way termination closed it: nothing left queued, running or failed.
 */
export function restoreRevocations(run: Run, personId: string, entry: LedgerEntry | undefined, terminated: boolean): Run {
  const pi = run.people.findIndex((r) => r.personId === personId);
  if (pi < 0 || (!entry && !terminated)) return run;
  const runs = run.people.map((r, i) => (i !== pi ? r : { ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const r = runs[pi];
  SERVICES.forEach((sv, si) => {
    const t = r.tasks[si];
    const rev = entry?.services[sv.id];
    if (rev) { t.status = "revoked"; t.detail = `revoked by ${rev.by}`; t.revocation = rev; t.finishedAt = rev.at; return; }
    const objs = entry?.objects[sv.id];
    if (objs) t.revokedObjects = { ...objs };
    if (terminated && (t.status === "queued" || t.status === "running" || t.status === "retry" || t.status === "failed")) { t.status = "skipped"; t.detail = "cancelled: onboarding terminated"; t.failure = null; t.awaiting = false; }
  });
  if (terminated) { r.state = "finished"; r.finishedAt = r.finishedAt ?? run.tick; }
  return { ...run, people: runs };
}

const resetTask = (t: Task) => Object.assign(t, { status: "queued" as TaskStatus, progress: 0, retried: false, transientAt: null, failPlan: null, failure: null, detail: "", startedAt: null, finishedAt: null, actions: [], retryLeft: 0, awaiting: false, requested: false, execution: null, revocation: null, revokedObjects: {}, revokeFailure: null });

/** Run a revoked (or failed) service again from the start, putting back anything that was skipped because of it. */
export function reprovisionTask(run: Run, personId: string, svcId: string, by: string): Run {
  const pi = run.people.findIndex((r) => r.personId === personId);
  const si = serviceIndex(svcId);
  if (pi < 0 || si < 0 || (run.people[pi].tasks[si].status !== "revoked" && run.people[pi].tasks[si].status !== "skipped" && run.people[pi].tasks[si].status !== "failed")) return run;
  let seq = run.seq;
  const events = [...run.events];
  const runs = run.people.map((r, i) => (i !== pi ? r : { ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const r = runs[pi];
  resetTask(r.tasks[si]);
  r.tasks.forEach((t) => { if (t.status === "skipped") resetTask(t); });
  r.state = "running";
  r.finishedAt = null;
  events.push({ seq: ++seq, t: run.tick, personId, service: svcId, kind: "info", text: `provisioning again, requested by ${by}` });
  return { ...run, seq, people: runs, events };
}

/**
 * Terminating a person's onboarding: everything not yet started is cancelled, and the services that created something
 * are returned (dependents before the things they depend on, so the account goes last) for the caller to deprovision.
 */
export function cancelRun(run: Run, personId: string, by: string, reason: string): { run: Run; revoke: string[] } {
  const pi = run.people.findIndex((r) => r.personId === personId);
  if (pi < 0) return { run, revoke: [] };
  let seq = run.seq;
  const events = [...run.events];
  const revoke: string[] = [];
  const runs = run.people.map((r, i) => (i !== pi ? r : { ...r, tasks: r.tasks.map((t) => ({ ...t, actions: t.actions.map((a) => ({ ...a })) })) }));
  const r = runs[pi];
  [...SERVICES].reverse().forEach((sv) => {
    const si = serviceIndex(sv.id);
    const t = r.tasks[si];
    if (isProvisioned(t) || ((t.status === "running" || t.status === "retry") && t.actions.length > 0)) {
      // a call that was mid-flight may have partly happened: cancel it and clean up
      if (t.status === "running" || t.status === "retry") { t.status = "skipped"; t.detail = "cancelled mid-run, cleaning up"; t.awaiting = false; t.finishedAt = run.tick; }
      revoke.push(sv.id);
    } else if (t.status === "queued" || t.status === "running" || t.status === "retry") {
      t.status = "skipped"; t.detail = "cancelled: onboarding terminated"; t.awaiting = false; t.startedAt = t.finishedAt = run.tick;
    } else if (t.status === "failed") {
      // it failed before creating anything, so there is nothing to undo; close it out rather than leave a failure on a closed record
      t.status = "skipped"; t.detail = "cancelled: onboarding terminated (it had failed before creating anything)"; t.failure = null; t.finishedAt = run.tick;
    }
  });
  r.state = "finished";
  r.finishedAt = run.tick;
  events.push({ seq: ++seq, t: run.tick, personId, service: "queue", kind: "warn", text: `onboarding terminated by ${by}: ${reason}${revoke.length ? ` · revoking ${revoke.length} service${revoke.length > 1 ? "s" : ""}` : ""}` });
  return { run: { ...run, seq, people: runs, events }, revoke };
}
