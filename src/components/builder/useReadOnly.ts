"use client";
import { useUser } from "@/components/shell/AuthProvider";
import { canEditWorkflow } from "@/lib/auth/policy";
import { useBuilder } from "@/store/builder";

/**
 * Whether the signed-in user may NOT edit the workflow currently on the canvas.
 * HR edits everything; a department head edits only their own department; everyone else views.
 */
export function useReadOnly(): boolean {
  const user = useUser();
  const persona = useBuilder((s) => s.persona);
  return !canEditWorkflow(user, persona);
}

export function useReadOnlyReason(): string {
  const user = useUser();
  if (user.role === "dept_head") return `You can edit ${user.dept} workflows — this one belongs to another department.`;
  return "Only HR and the owning department head can edit workflows.";
}
