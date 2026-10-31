import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Name of the header the database policies check. */
export const GATE_HEADER = "x-superjoin-key";

export interface SupabaseEnv {
  url?: string;
  publishableKey?: string;
  appKey?: string;
}

export const envFromProcess = (): SupabaseEnv => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  appKey: process.env.SUPABASE_APP_KEY,
});

/**
 * A stateless client that always sends the app-key header. The publishable key is public by design, so the
 * row-level-security policies only answer requests that also carry this secret — see supabase/migrations.
 * Returns null when anything is missing, so callers can fall back instead of crashing.
 */
export function createGatedClient(env: SupabaseEnv): SupabaseClient | null {
  if (!env.url || !env.publishableKey || !env.appKey) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { [GATE_HEADER]: env.appKey } },
  });
}
