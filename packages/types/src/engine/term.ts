import type { Timestamp } from "firebase/firestore";

export const TERM_STATUSES = ["Activo", "Cerrado"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

/** A board seat: a chapter title (Spanish) — NOT a permission role. */
export interface BoardSeat {
  memberId: string;
  title: string;
  isExecutiveCommittee: boolean;
}

/** Annual cycle (gestión). The doc id IS the year (e.g. `terms/2026`). */
export interface Term {
  id: string;
  label?: string;
  board: BoardSeat[];
  conventionDate: Timestamp | null; // unknown at term start
  pointsCutoffAt: Timestamp | null; // unknown at term start
  bestMemberId: string | null;
  status: TermStatus;
}
