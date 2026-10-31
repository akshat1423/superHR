import { BLOCKS, type CatId, type Owner, type Perm } from "./catalog";

export const TYPES = ["Full-time", "Part-time", "Intern"] as const;
export const DEPTS = ["Engineering", "Finance", "Product", "Business", "People"] as const;
export const LEVELS = ["Intern", "Associate", "Mid", "Senior", "Leader"] as const;
export type EmpType = (typeof TYPES)[number];
export type Dept = (typeof DEPTS)[number];
export type Level = (typeof LEVELS)[number];

export interface Persona { type: EmpType; dept: Dept; level: Level }

const ENG_LEVEL: Record<Level, string> = { Intern: "Intern", Associate: "SDE-1", Mid: "SDE-2", Senior: "SDE-3", Leader: "Eng Leader" };
export const lvlName = (l: Level, d: Dept) => (d === "Engineering" ? ENG_LEVEL[l] : l);

export const personaLabel = (p: Persona) =>
  `${p.type === "Full-time" ? "FT" : p.type === "Part-time" ? "PT" : "INT"} · ${p.dept.slice(0, 3).toUpperCase()} · ${lvlName(p.level, p.dept)}`;

export const fmtDay = (d: number) => (d < 0 ? `T${d}` : d === 0 ? "Day 0" : `T+${d}`);

/**
 * Default permission a persona gets in an app. Comms/identity tools are plain Member for everyone;
 * work tools are Read for interns, Member by default, Admin for leaders.
 */
export function defaultPerm(level: Level, cat: CatId): Perm {
  if (cat === "identity") return "Member";
  if (level === "Intern") return "Read";
  if (level === "Leader") return "Admin";
  return "Member";
}

export type Reminder = "none" | "due" | "daily" | "ladder";

/** A fully-resolved step of a workflow (what a node on the canvas carries). */
export interface Step {
  key: string;
  title: string;
  owner: Owner;
  day: number;
  perm: Perm | null;
  /** roles that must verify this step before it counts as done */
  ver: Owner[];
  rem: Reminder;
}

interface Spec { key: string; title?: string; owner?: Owner; perm?: Perm }
const x = (key: string, o: Omit<Spec, "key"> = {}): Spec => ({ key, ...o });
const s = (key: string): Spec => ({ key });

export interface Stage { day: number; items: Spec[] }

/** Template engine: persona (type × department × level) → ordered stages of parallel steps. */
export function genStages(p: Persona): Stage[] {
  const intern = p.type === "Intern" || p.level === "Intern";
  const pt = p.type === "Part-time";
  const ft = p.type === "Full-time" && !intern;
  const sr = p.level === "Senior";
  const lead = p.level === "Leader";
  const raw: Stage[] = [];
  const add = (day: number, ...items: (Spec | false | null | undefined)[]) =>
    raw.push({ day, items: items.filter(Boolean) as Spec[] });

  add(-10, s("offer_accept"));
  add(-9, s("offer"), s("esign"));
  add(-7, s("docs"), s(intern ? "edu" : "bgv"), s("nda"));
  add(-5, x("approve", { title: "HR verifies documents", owner: "HR" }));
  add(-3, s("gws"), s("laptop"), s("idcard"));

  const apps: Record<Dept, (Spec | false)[]> = {
    Engineering: [s("slack"), s("github"), s("jira"), s("claude"), !intern && s("aws"), (sr || lead) && s("datadog")],
    Finance: [s("slack"), s("m365"), s("teams"), s("sap"), s("zoho"), s("looker"), s("claude")],
    Product: [s("slack"), s("figma"), s("linear"), s("notion"), s("looker"), s("claude")],
    Business: [s("slack"), s("salesforce"), s("hubspot"), s("zoom"), s("notion"), s("claude")],
    People: [s("slack"), s("okta"), s("notion"), s("claude"), s("zoom")],
  };
  add(-1, ...apps[p.dept]);
  add(0, s("agenda"), s("access"), s("buddy"));
  if (ft) add(2, s("payroll"), s("uan"), s("bank"), s("health"));
  else if (intern) add(2, s("stipend"), s("bank"));
  else if (pt) add(2, s("payroll"), s("bank"));
  add(3, s("sec"), s("posh"));
  if (!intern && p.dept === "Finance")
    add(5, s("card"), s("expense"), x("approve", { title: "Finance Head approves card", owner: "Finance" }));
  add(7, s("oneone"), s("courses"));
  if (sr || lead) add(14, x("approve", { title: "Prod access approval", owner: "Dept Head" }));
  if (lead) add(14, s("desk"), s("parking"));
  if (ft) add(30, s("life"), s("nps"));
  add(30, s("review"));
  add(intern ? 60 : 90, intern ? x("confirm", { title: "Conversion review" }) : s("confirm"));

  // merge stages that share a day
  const merged = new Map<number, Stage>();
  for (const st of raw) {
    const m = merged.get(st.day) ?? { day: st.day, items: [] };
    m.items.push(...st.items);
    merged.set(st.day, m);
  }
  return [...merged.values()].sort((a, b) => a.day - b.day);
}

export function resolveSpec(spec: Spec, day: number, level: Level): Step {
  const b = BLOCKS[spec.key];
  const owner = spec.owner ?? b.owner;
  return {
    key: spec.key,
    title: spec.title ?? b.name,
    owner,
    day,
    perm: b.perm ? spec.perm ?? defaultPerm(level, b.cat) : null,
    ver: spec.key === "approve" ? [owner] : [],
    rem: "ladder",
  };
}

/** Flat list of resolved steps for a persona (used by library stats and by person timelines). */
export const flatSteps = (p: Persona): Step[] =>
  genStages(p).flatMap((st) => st.items.map((it) => resolveSpec(it, st.day, p.level)));

/** Piecewise timeline scale shared by the ruler: evenly spaced breakpoints, linear in between. */
export const TIMELINE_BREAKS = [-14, -7, -3, 0, 1, 3, 7, 14, 30, 60, 90];
export function timelinePos(day: number): number {
  const d = Math.max(-14, Math.min(90, day));
  const b = TIMELINE_BREAKS;
  for (let i = 0; i < b.length - 1; i++) {
    if (d <= b[i + 1]) return ((i + (d - b[i]) / (b[i + 1] - b[i])) / (b.length - 1)) * 100;
  }
  return 100;
}

export type PhaseName = "Pre-boarding" | "Day 0" | "Week 1" | "Month 1" | "Month 3";
export const PHASES: { name: PhaseName; sub: string }[] = [
  { name: "Pre-boarding", sub: "before joining" },
  { name: "Day 0", sub: "joining day" },
  { name: "Week 1", sub: "T+1 → T+7" },
  { name: "Month 1", sub: "T+8 → T+30" },
  { name: "Month 3", sub: "T+31 → T+90" },
];
export const phaseOf = (d: number): PhaseName =>
  d < 0 ? "Pre-boarding" : d === 0 ? "Day 0" : d <= 7 ? "Week 1" : d <= 30 ? "Month 1" : "Month 3";
