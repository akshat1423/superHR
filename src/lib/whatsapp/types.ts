import type { AssistantInput, ChecklistFact } from "../onboarding/assistant";
import type { Policy } from "../onboarding/types";

/** Shared by the server and the browser: no server-only imports here. */

export type ContactKind = "joiner" | "staff";
/** invited: has a code but no number yet · active: joined from their own phone · opted_out: sent STOP */
export type ContactStatus = "invited" | "active" | "opted_out";

/** What the WhatsApp assistant may know about one joiner: pushed from the browser (where the data lives) when it changes. */
export interface Snapshot {
  employee: AssistantInput["employee"];
  hr: AssistantInput["hr"];
  facts: ChecklistFact[];
  /** only present when the organisation's policies differ from the built-in set */
  policies?: Policy[];
  updatedAt: string;
}

export interface WaContact {
  id: string;
  kind: ContactKind;
  personId?: string;
  name: string;
  email?: string;
  dept?: string;
  manager?: string;
  /** digits only (E.164 without the +), set when they join from their own phone */
  phone?: string;
  status: ContactStatus;
  inviteCode?: string;
  inviteExpiresAt?: string;
  snapshot?: Snapshot;
  lastInboundAt?: string;
  joinedAt?: string;
  createdBy: string;
  createdAt: string;
}

export type RequestStatus = "pending" | "approved" | "rejected" | "expired";

/** A question put to one person on WhatsApp that needs a yes or a no. */
export interface WaRequest {
  id: string;
  /** short code the recipient can type if the buttons don't show */
  code: string;
  personId: string;
  itemId: string;
  dept?: string;
  manager?: string;
  toPhone: string;
  toName: string;
  title: string;
  body: string;
  status: RequestStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedByPhone?: string;
  /** a browser has applied the decision to its checklist */
  applied: boolean;
}

export interface WaMessage {
  id?: number;
  at: string;
  direction: "in" | "out";
  phone: string;
  kind: string;
  body: string;
  /** WhatsApp's own message id (used to drop Meta's duplicate deliveries) */
  waId?: string;
  status?: string;
  mode: "sandbox" | "live";
  meta?: Record<string, unknown>;
}

export interface Button { id: string; title: string }

/** What we can send. The sender decides how to deliver it (free text, interactive buttons, or an approved template). */
export type Outbound =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Button[] }
  | { type: "template"; name: string; lang: string; bodyParams: string[]; buttonPayloads?: string[] };

export interface Inbound {
  id: string;
  from: string;
  name?: string;
  type: "text" | "button" | "unsupported";
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
  at: string;
}

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const digits = (s: string) => s.replace(/\D/g, "");
export type { ChecklistFact };
