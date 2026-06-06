import type { Timestamp } from "firebase/firestore";

export const TERM_STATUSES = ["Activo", "Cerrado"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

/** A board seat: a chapter title (Spanish) — NOT a permission role. */
export interface BoardSeat {
  memberId: string;
  title: string;
  isExecutiveCommittee: boolean;
}

/** Annual cycle (gestión). `year` is first-class so saved data is self-describing. */
export interface Term {
  id: string;
  year: number;
  label?: string;
  board: BoardSeat[];
  conventionDate: Timestamp;
  pointsCutoffAt: Timestamp;
  bestMemberId: string | null;
  status: TermStatus;
}
