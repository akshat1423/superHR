const hits = new Map<string, number[]>();

/**
 * Sliding-window limiter, per key, in process memory. Protects the paid AI endpoints from a runaway client.
 * (Per server instance — put it in Redis/Upstash when running more than one.)
 */
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
