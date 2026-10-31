import type { Dept } from "../workflow";

export type Role = "employee" | "manager" | "dept_head" | "hr";

export interface DemoUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  email: string;
  /** department a head owns (dept_head only) */
  dept?: Dept;
}

/**
 * Demo identity provider: one account per role, signed in with a click on the login page.
 * Swap this for real SSO (Okta / Google Workspace) by replacing `findUser` and the login route —
 * everything downstream only sees a `DemoUser`.
 *
 * Scopes are matched against onboarding data, not hard-coded ids, so they survive a re-ingest:
 *  - employee  → the person whose email equals `email`
 *  - manager   → people whose `manager` equals `name`
 *  - dept_head → people in `dept`
 */
export const DEMO_USERS: DemoUser[] = [
  { id: "u-yash", name: "Yash Bansal", title: "ML Engineer · joining", role: "employee", email: "yash.bansal@gmail.com" },
  { id: "u-arjun", name: "Arjun Rao", title: "Engineering Manager", role: "manager", email: "arjun.rao@acme.com" },
  { id: "u-vikram", name: "Vikram Singh", title: "Head of Engineering", role: "dept_head", email: "vikram.singh@acme.com", dept: "Engineering" },
  { id: "u-neha", name: "Neha Kapoor", title: "Head of Finance", role: "dept_head", email: "neha.kapoor@acme.com", dept: "Finance" },
  { id: "u-priya", name: "Priya Nair", title: "HR Business Partner", role: "hr", email: "priya.nair@acme.com" },
];

export const findUser = (id: string | undefined | null) => DEMO_USERS.find((u) => u.id === id);

export const ROLE_LABEL: Record<Role, string> = {
  employee: "New joiner",
  manager: "Manager",
  dept_head: "Department head",
  hr: "HR",
};
