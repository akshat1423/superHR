"use client";
import { createContext, useContext, useMemo } from "react";
import { scopePeople } from "@/lib/auth/policy";
import type { DemoUser } from "@/lib/auth/users";
import type { Person } from "@/lib/people";
import { usePeople } from "@/store/people";

const Ctx = createContext<DemoUser | null>(null);

/** Receives the verified user from a Server Component; client UI only reads it. */
export function AuthProvider({ user, children }: { user: DemoUser | null; children: React.ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export const useUserOrNull = () => useContext(Ctx);

export function useUser(): DemoUser {
  const u = useContext(Ctx);
  if (!u) throw new Error("useUser called outside a signed-in page");
  return u;
}

/** Everyone the signed-in user may see — the single client-side entry point for people data. */
export function useScopedPeople(): Person[] {
  const user = useContext(Ctx);
  const people = usePeople((s) => s.people);
  return useMemo(() => (user ? scopePeople(user, people) : []), [user, people]);
}
