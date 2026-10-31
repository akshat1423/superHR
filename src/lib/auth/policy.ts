import type { Person } from "../people";
import type { Persona } from "../workflow";
import type { DemoUser, Role } from "./users";

/** Top-level areas of the dashboard. One policy table decides who can open each. */
export type Area = "me" | "tracker" | "builder" | "library" | "ingest" | "reminders" | "agents";

export const AREA_ACCESS: Record<Area, Role[]> = {
  me: ["employee"],
  tracker: ["hr", "dept_head", "manager"],
  builder: ["hr", "dept_head", "manager"],
  library: ["hr", "dept_head", "manager"],
  ingest: ["hr"],
  reminders: ["hr", "dept_head", "manager"],
  agents: ["hr", "dept_head"],
};

export const AREA_LABEL: Record<Area, string> = {
  me: "My onboarding",
  tracker: "Tracker",
  builder: "Builder",
  library: "Library",
  ingest: "Ingest",
  reminders: "Reminders",
  agents: "Agents",
};

/** Order the tabs appear in. */
export const AREAS: Area[] = ["me", "tracker", "builder", "library", "ingest", "reminders", "agents"];

export const canOpen = (role: Role, area: Area) => AREA_ACCESS[area].includes(role);
export const visibleAreas = (role: Role) => AREAS.filter((a) => canOpen(role, a));
export const landingFor = (role: Role): string => (role === "employee" ? "/me" : "/tracker");

export function areaOfPath(pathname: string): Area | null {
  const seg = pathname.split("/")[1] as Area | undefined;
  return seg && seg in AREA_ACCESS ? seg : null;
}

/** HR edits everything; a department head edits only their own department's workflows; others read. */
export const canEditWorkflow = (u: DemoUser, persona: Persona) =>
  u.role === "hr" || (u.role === "dept_head" && u.dept === persona.dept);
/** Publishing makes a workflow live for new joiners — HR only. Heads submit for HR review. */
export const canPublish = (u: DemoUser) => u.role === "hr";
export const canBulkUpload = (u: DemoUser) => u.role === "hr";
export const canNudge = (u: DemoUser) => u.role !== "employee";
/** Re-running a failed service touches real systems — HR and the owning department head only. */
export const canRetryService = (u: DemoUser, p: Person) =>
  u.role === "hr" || (u.role === "dept_head" && u.dept === p.persona.dept);
/** Raw agent logs contain system detail; managers and employees never see them. */
export const canSeeAgentLogs = (u: DemoUser) => u.role === "hr" || u.role === "dept_head";
/** The "why did it fail" detail (error, request, root cause). Employees only see what is pending from them. */
export const canSeeFailureDetail = (u: DemoUser) => u.role !== "employee";

/** The people this user is allowed to see. The one place data scope is decided. */
export function inScope(u: DemoUser, p: Person): boolean {
  switch (u.role) {
    case "hr": return true;
    case "dept_head": return p.persona.dept === u.dept;
    case "manager": return p.manager === u.name;
    case "employee": return p.email.toLowerCase() === u.email.toLowerCase();
  }
}
export const scopePeople = (u: DemoUser, people: Person[]) => people.filter((p) => inScope(u, p));

export function scopeLabel(u: DemoUser): string {
  switch (u.role) {
    case "hr": return "everyone in onboarding";
    case "dept_head": return `everyone in ${u.dept}`;
    case "manager": return "your direct reports";
    case "employee": return "only your own onboarding";
  }
}

/** What each role can do, in plain words — shown on the login page and the forbidden page. */
export const ROLE_SUMMARY: Record<Role, string[]> = {
  hr: ["Sees every person and every department", "Edits and publishes all workflows", "Bulk-uploads from the ATS", "Full agent logs, failures and retries"],
  dept_head: ["Sees everyone in their department", "Edits their own department’s workflows (HR publishes)", "Agent logs and failures for their department", "Retries failed services"],
  manager: ["Sees their direct reports only", "Views workflows (read-only)", "Sends nudges and reminders", "No agent logs"],
  employee: ["Sees only their own onboarding", "Uploads their own missing documents", "Sees what is waiting on them", "Nothing else"],
};
