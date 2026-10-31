import "server-only";
import { createGatedClient, envFromProcess } from "./factory";

/** Supabase client for route handlers and Server Components. Never import this from client code. */
export const supabaseServer = () => createGatedClient(envFromProcess());

/** True when the three env vars are present (says nothing about whether the tables exist). */
export const supabaseConfigured = () => {
  const e = envFromProcess();
  return !!(e.url && e.publishableKey && e.appKey);
};

/** PostgREST error codes that mean "the setup SQL has not been run yet". */
export const isMissingTable = (err: { code?: string } | null) => err?.code === "PGRST205" || err?.code === "42P01";
