import type { Person } from "./people";
import { SERVICES, serviceIndex } from "./services";
import { hash01 } from "./utils";
import type { Execution } from "./serviceRuntime/types";

export const TICKS_PER_SEC = 4;
const MS_PER_TICK = 1000 / TICKS_PER_SEC;
/** how many people the provisioner works on at the same time; everyone else waits in the queue */
export const CONCURRENCY = 4;
/** a transient error backs off for ~1.5s before the agent retries by itself */
const RETRY_TICKS = 6;
/** share of service runs that hit a real (non-transient) failure */
export const FAIL_RATE = 0.09;

export type TaskStatus = "queued" | "running" | "retry" | "done" | "waiting" | "failed" | "skipped";
/** a task in one of these states will not change by itself */
export const isTerminal = (s: TaskStatus) => s === "done" || s === "waiting" || s === "failed" || s === "skipped";

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

type Readiness = { kind: "wait" } | { kind: "go" } | { kind: "blocked"; by: string } | { kind: "skipped"; by: string };

/** Can this service start yet? Paused dependencies pause it; failed dependencies skip it. */
function readiness(si: number, tasks: Task[]): Readiness {
  const d = SERVICES[si].deps;
  if (d === "all") return tasks.every((t, i) => i === si || isTerminal(t.status)) ? { kind: "go" } : { kind: "wait" };
  const deps = d.map(serviceIndex);
  const failed = deps.find((i) => tasks[i].status === "failed" || tasks[i].status === "skipped");
  if (failed !== undefined) return { kind: "skipped", by: SERVICES[failed].name };
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
          t.detail = `not run — ${ready.by} failed`;
          t.startedAt = t.finishedAt = tick;
          log(r.personId, sv.id, "warn", `skipped — upstream ${ready.by} failed`);
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
