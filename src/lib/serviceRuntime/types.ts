/** Shared by the server functions and the browser engine that replays their results. No server-only imports here. */

export type ConnectorMode = "sandbox" | "live";

/**
 * What a service is asked to do for a person: `provision` (the original run, or granting one object such as an app),
 * `deprovision` (undo it: revoke access, release the desk, cancel the record) or `update` (move or reissue what was
 * created, e.g. after a joining-date, role or location change).
 */
export type ActionKind = "provision" | "deprovision" | "update";

/** One API call the service made, with what came back. */
export interface PhaseResult {
  label: string;
  call: string;
  ok: boolean;
  httpStatus: number;
  ms: number;
  /** the request body that was (or, in sandbox mode, would have been) sent */
  request: string;
  /** the response body */
  response: string;
}

export interface ExecFailure {
  code: string;
  title: string;
  cause: string;
  evidence: string;
  fix: string;
  retryable: boolean;
  /** index of the phase that failed */
  phase: number;
}

/** The outcome of running one service for one person. */
export interface Execution {
  service: string;
  traceId: string;
  mode: ConnectorMode;
  /** what was asked of the service (absent on executions recorded before actions existed: a provision) */
  action?: ActionKind;
  /** the one thing it applied to, e.g. an app name for access (absent: the whole service) */
  object?: string;
  attempt: number;
  ok: boolean;
  phases: PhaseResult[];
  /** set when the service finished but is waiting on the candidate */
  paused?: string;
  artifact?: string;
  failure?: ExecFailure;
  /** a one-off error the agent retries by itself */
  transient: boolean;
  totalMs: number;
}

/** Environment variable that points a service at a real system (see runner.ts). */
export const webhookVar = (service: string) => `SERVICE_WEBHOOK_${service.toUpperCase().replace(/-/g, "_")}`;
