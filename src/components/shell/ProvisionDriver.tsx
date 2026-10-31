"use client";
import { useEffect } from "react";
import { hasActivity } from "@/lib/provision";
import { useProvisioning } from "@/store/provisioning";

/**
 * Keeps the provisioning simulation ticking no matter which page is open, so agent logs and failures
 * keep filling in while you browse elsewhere. Renders nothing.
 */
export function ProvisionDriver() {
  const active = useProvisioning((s) => hasActivity(s.run));
  const speed = useProvisioning((s) => s.speed);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => useProvisioning.getState().tick(Number(speed)), 250);
    return () => clearInterval(id);
  }, [active, speed]);
  return null;
}
