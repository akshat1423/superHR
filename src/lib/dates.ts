/** Fixed "today" for the demo so prerendering, tests and screenshots agree. */
export const DEMO_TODAY = new Date(2026, 9, 31);
export const MS_DAY = 86_400_000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local-midnight Date from an ISO yyyy-mm-dd string. */
export const fromISO = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  // reject rollovers such as 31 Feb
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? toISO(dt) : null;
}

/**
 * Accepts yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy and "12 Nov 2026" / "12-Nov-2026".
 * Day-first for numeric dates (the datasets are Indian), and strict: an impossible date returns null.
 */
export function parseDateISO(input: unknown): string | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : toISO(input);
  if (typeof input === "number" && input > 20000 && input < 80000) {
    // Excel serial date
    return toISO(new Date(Math.round((input - 25569) * MS_DAY) + new Date(1970, 0, 1).getTimezoneOffset() * 60_000));
  }
  const v = String(input ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,-]+(\d{4})$/);
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mi < 0 ? null : valid(+m[3], mi + 1, +m[1]); }
  return null;
}

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (aISO: string, bISO: string) => Math.round((fromISO(bISO).getTime() - fromISO(aISO).getTime()) / MS_DAY);
export const todayISO = () => toISO(DEMO_TODAY);
export const addDays = (iso: string, n: number) => toISO(new Date(fromISO(iso).getTime() + n * MS_DAY + 3_600_000)); // +1h guards DST shifts
/** Days since joining: negative before the joining date, positive after. */
export const daysSinceJoining = (startISO: string) => daysBetween(startISO, todayISO());

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtHuman(iso: string, withWeekday = false): string {
  const d = fromISO(iso);
  return `${withWeekday ? WEEKDAY[d.getDay()] + " " : ""}${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
