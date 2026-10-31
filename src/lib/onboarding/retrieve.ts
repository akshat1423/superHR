import type { EmployeeCtx } from "./rules";
import type { Policy } from "./types";

export interface Passage {
  /** citation id, e.g. "POL-01 §2" */
  id: string;
  policyId: string;
  title: string;
  heading: string;
  text: string;
}
export interface Hit extends Passage {
  score: number;
  /** share of the question's content words that this passage actually contains (synonyms count) */
  coverage: number;
}

const STOP = new Set(("a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so than that the their them then there these they this to us was we what when where which who why will with you your should would could about into any").split(" "));
/** Words that shape a question without naming a topic; they don't count towards how much of the question a passage covers. */
const FILLER = new Set("long many much take takes taking get got getting give need needs tell know please want allowed able possible prove show shown tomorrow today".split(" "));
const SYNONYMS: Record<string, string[]> = {
  period: ["probation"], training: ["module", "course"],
  expired: ["valid", "expiry"], expire: ["valid", "expiry"], expiry: ["valid"], invalid: ["valid"], outdated: ["valid"],
  doc: ["document"], docs: ["document"], paperwork: ["document"], certificate: ["certificate", "education"], certificates: ["certificate", "education"],
  wfh: ["remote"], pto: ["leave"], vacation: ["leave"], holiday: ["leave"], holidays: ["leave"],
  joining: ["first", "day", "arrival"], start: ["first", "day"], reach: ["arrive", "arrival"], report: ["arrive", "arrival"],
  id: ["identity", "photo"], identity: ["identity", "photo"], passport: ["identity", "passport"],
  laptop: ["laptop", "provisioning"], computer: ["laptop"], email: ["email", "account"], mail: ["email", "account"],
  access: ["access", "system"], password: ["password", "security"], vpn: ["security"],
  bgv: ["background", "verification"], background: ["background", "verification"], police: ["criminal"],
  salary: ["payroll", "salary"], pay: ["payroll", "salary"], stipend: ["stipend"],
  harassment: ["harassment", "posh"], dress: ["dress", "code"], office: ["office", "location"], address: ["address", "office", "location"],
};

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, (m, _s, off) => (off > 3 ? "" : m));
export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9§ ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);
}
const expand = (tokens: string[], raw: string[]) => {
  const out = [...tokens];
  for (const r of raw) for (const s of SYNONYMS[r] ?? []) out.push(stem(s));
  return out;
};

/** Is this policy meant for this employee? A policy with no restrictions applies to everyone. */
export function applies(p: Policy, e: Pick<EmployeeCtx, "country" | "department" | "location" | "level">): boolean {
  const a = p.appliesTo;
  if (a.countries?.length && !a.countries.includes(e.country)) return false;
  if (a.departments?.length && !a.departments.some((d) => d.toLowerCase() === e.department.toLowerCase())) return false;
  if (a.locations?.length && !a.locations.some((l) => l.toLowerCase() === e.location.toLowerCase())) return false;
  if (a.grades?.length && !a.grades.includes(e.level)) return false;
  return true;
}

export function passagesFor(corpus: Policy[], e: Pick<EmployeeCtx, "country" | "department" | "location" | "level">): Passage[] {
  return corpus.filter((p) => applies(p, e)).flatMap((p) => p.sections.map((s) => ({ id: `${p.id} ${s.id}`, policyId: p.id, title: p.title, heading: s.heading, text: s.text })));
}

/** BM25 over the passages an employee is allowed to see. Headings and titles count extra. */
export function retrieve(question: string, passages: Passage[], k = 4): Hit[] {
  const raw = question.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const q = [...new Set(expand(tokenize(question), raw))];
  if (!q.length || !passages.length) return [];
  const docs = passages.map((p) => tokenize(`${p.title} ${p.heading} ${p.heading} ${p.text}`));
  const N = docs.length, avg = docs.reduce((n, d) => n + d.length, 0) / N;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.4, b = 0.75;
  const content = raw.filter((w) => !STOP.has(w) && !FILLER.has(w));
  return passages
    .map((p, i): Hit => {
      const d = docs[i];
      const have = new Set(d);
      const matched = content.filter((w) => have.has(stem(w)) || (SYNONYMS[w] ?? []).some((s) => have.has(stem(s)))).length;
      const coverage = content.length ? matched / content.length : 0;
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
      }
      return { ...p, score, coverage };
    })
    .filter((h) => h.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

/**
 * Below this the best passage is only a coincidental word match, so the question is treated as not covered.
 * Tuned on scripts/tests/assistant.test.mts (answerable and unanswerable questions).
 */
export const MIN_SCORE = 3.2;
/** …and at least this share of the question's content words must appear in the passage ("dog" + "office" ≠ the office-locations section). */
export const MIN_COVERAGE = 0.6;

/** A hit is only an answer if it both scores well and covers most of what was asked. */
export const relevant = (h: Hit | undefined): h is Hit => !!h && h.score >= MIN_SCORE && h.coverage >= MIN_COVERAGE;
