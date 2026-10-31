"use client";
import { useEffect } from "react";
import { usePeople } from "@/store/people";
import { useOnboarding } from "@/store/onboarding";

/**
 * Restores saved people and onboarding data from the browser after the first render. Doing it here (not during
 * render) keeps the server HTML and the first client render identical, so there is no hydration mismatch.
 * Renders nothing.
 */
export function Hydrate() {
  useEffect(() => {
    void (async () => {
      await usePeople.persist.rehydrate();
      await useOnboarding.persist.rehydrate();
      // anyone without a checklist (e.g. people saved by an older version) gets one; people who are gone lose theirs
      useOnboarding.getState().ensure(usePeople.getState().people);
    })();
  }, []);
  return null;
}
