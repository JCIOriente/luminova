import type { Timestamp } from "firebase/firestore";

/** Why the visitor reached out — user-facing Spanish values (mirrors the contact form's subjects). */
export const LEAD_INTENTS = ["Membresía", "Alianza", "Prensa", "Otro"] as const;
export type LeadIntent = (typeof LEAD_INTENTS)[number];

/** Follow-up pipeline stage an admin advances a lead through. */
export const LEAD_STATUSES = ["Nuevo", "Contactado", "Cerrado"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Persisted lead document (Firestore shape). Public form input is `LeadInput`. */
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  intent: LeadIntent;
  message: string;
  status: LeadStatus;
  source: string;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}
