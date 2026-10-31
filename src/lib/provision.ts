import type { Person } from "./people";
import { SERVICES } from "./services";
import { hash01 } from "./utils";

export const TICKS_PER_SEC = 4;
/** how many people the provisioner works on at the same time; everyone else waits in the queue */
export const CONCURRENCY = 4;
/** a transient failure backs off for ~1.5s before retrying */
const RETRY_TICKS = 6;

export type TaskStatus = "queued" | "running" | "retry" | "done" | "waiting";
export const isTerminal = (s: TaskStatus) => s === "done" || s === "waiting";

export interface Task {
  status: TaskStatus;
  progress: number;
  dur: number;
  /** progress point at which a transient error happens (once), or null */
  failAt: number | null;
  retryLeft: number;
  retried: boolean;
  /** result shown after finishing (artifact, or the reason it is waiting) */
  detail: string;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface PersonRun {
  state: "queued" | "running" | "finished";
  startedAt: number | null;
  finishedAt: number | null;
  tasks: Task[];
}

export interface LogEvent {
  t: number;
  personId: string;
  service: string;
  text: string;
  kind: "info" | "ok" | "warn";
}

export interface Run {
  tick: number;
  people: PersonRun[];
  events: LogEvent[];
}

export function initRun(people: Person[]): Run {
  return {
    tick: 0,
    events: [],
    people: people.map((p) => ({
      state: "queued",
      startedAt: null,
      finishedAt: null,
      tasks: SERVICES.map((sv) => {
        const dur = Math.round((sv.secs[0] + hash01(p.id + sv.id) * (sv.secs[1] - sv.secs[0])) * TICKS_PER_SEC);
        return {
          status: "queued" as TaskStatus,
          progress: 0,
          dur,
          failAt: hash01(sv.id + p.id + "x") < 0.1 ? Math.floor(dur * 0.55) : null,
          retryLeft: 0,
          retried: false,
          detail: "",
          startedAt: null,
          finishedAt: null,
        };
      }),
    })),
  };
}

export const phaseLabel = (svcIndex: number, t: Task) => {
  const ph = SERVICES[svcIndex].phases;
  return ph[Math.min(ph.length - 1, Math.floor((t.progress / t.dur) * ph.length))];
};

type Readiness = { kind: "wait" } | { kind: "go" } | { kind: "blocked"; by: string };

/** Can this service start yet? A service whose dependency is paused is itself paused ("blocked by …"). */
const readiness = (svcIndex: number, tasks: Task[]): Readiness => {
  const d = SERVICES[svcIndex].deps;
  if (d === "all") return tasks.every((t, i) => i === svcIndex || isTerminal(t.status)) ? { kind: "go" } : { kind: "wait" };
  const deps = d.map((id) => SERVICES.findIndex((s) => s.id === id));
  const paused = deps.find((i) => tasks[i].status === "waiting");
  if (paused !== undefined) return { kind: "blocked", by: SERVICES[paused].name };
  return deps.every((i) => tasks[i].status === "done") ? { kind: "go" } : { kind: "wait" };
};

/** Advance the whole batch by one tick (¼ second of simulated time). Pure: returns a new Run. */
export function stepRun(run: Run, people: Person[]): Run {
  const tick = run.tick + 1;
  const events = [...run.events];
  const log = (personId: string, service: string, text: string, kind: LogEvent["kind"]) =>
    events.push({ t: tick, personId, service, text, kind });

  const runs: PersonRun[] = run.people.map((pr) => ({ ...pr, tasks: pr.tasks.map((t) => ({ ...t })) }));

  // hand free worker slots to the next people in the queue
  let active = runs.filter((r) => r.state === "running").length;
  runs.forEach((r, i) => {
    if (r.state === "queued" && active < CONCURRENCY) {
      r.state = "running";
      r.startedAt = tick;
      active++;
      log(people[i].id, "queue", "picked up by a worker", "info");
    }
  });

  runs.forEach((r, pi) => {
    if (r.state !== "running") return;
    const p = people[pi];
    r.tasks.forEach((t, si) => {
      const sv = SERVICES[si];
      if (t.status === "queued") {
        const ready = readiness(si, r.tasks);
        if (ready.kind === "go") {
          t.status = "running";
          t.startedAt = tick;
          log(p.id, sv.id, `${sv.phases[0]}…`, "info");
        } else if (ready.kind === "blocked") {
          t.status = "waiting";
          t.detail = `blocked by ${ready.by}`;
          t.startedAt = t.finishedAt = tick;
          log(p.id, sv.id, `paused — ${t.detail}`, "warn");
        }
      } else if (t.status === "retry") {
        if (--t.retryLeft <= 0) { t.status = "running"; t.retried = true; log(p.id, sv.id, "retry succeeded, continuing", "info"); }
      } else if (t.status === "running") {
        const before = phaseLabel(si, t);
        t.progress++;
        if (t.failAt !== null && !t.retried && t.progress === t.failAt) {
          t.status = "retry";
          t.retryLeft = RETRY_TICKS;
          log(p.id, sv.id, "transient error (HTTP 503) — retrying in 1s", "warn");
        } else if (t.progress >= t.dur) {
          const why = sv.waits(p);
          t.status = why ? "waiting" : "done";
          t.detail = why ?? sv.artifact(p);
          t.finishedAt = tick;
          log(p.id, sv.id, why ? `paused — ${why}` : sv.artifact(p), why ? "warn" : "ok");
        } else if (phaseLabel(si, t) !== before) {
          log(p.id, sv.id, `${phaseLabel(si, t)}…`, "info");
        }
      }
    });
    if (r.tasks.every((t) => isTerminal(t.status))) {
      r.state = "finished";
      r.finishedAt = tick;
      log(p.id, "queue", "all services finished", "ok");
    }
  });

  return { tick, people: runs, events: events.slice(-1200) };
}

export const allFinished = (run: Run) => run.people.every((p) => p.state === "finished");
export const fmtClock = (tick: number) => {
  const s = Math.floor(tick / TICKS_PER_SEC);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
