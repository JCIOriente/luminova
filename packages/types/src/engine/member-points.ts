import type { Timestamp } from "firebase/firestore";

/** Derived aggregate (id === memberId). Engine-written; `Member.totalPoints` mirrors `cumulative`. */
export interface MemberPoints {
  id: string;
  termId: string;
  cumulative: number;
  byMonth: Record<string, number>;
  updatedAt: Timestamp;
}
