"use client";
import { useEffect } from "react";
import { usePeople } from "@/store/people";
import { useOnboarding } from "@/store/onboarding";
import { useProvisioning } from "@/store/provisioning";

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
      // what was revoked or terminated stays that way: the run is rebuilt on load, so put the saved revocations back
      await useProvisioning.persist.rehydrate();
      useProvisioning.getState().restoreLedger();
      // anyone without a checklist (e.g. people saved by an older version) gets one; people who are gone lose theirs
      useOnboarding.getState().ensure(usePeople.getState().people);
      // uploads an earlier version left at "Under Review" although they could be read are decided now
      useOnboarding.getState().settleReviews();
    })();
  }, []);
  return null;
}
