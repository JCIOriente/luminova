import type { Timestamp } from "firebase/firestore";
import type { ParticipationRole } from "./participation.js";

export interface ComputePunctualityInput {
  role: ParticipationRole;
  checkInAt: Timestamp | null;
  startAt: Timestamp;
}

const TOLERANCE_MS = 15 * 60 * 1000;

/** Punctuality factor for a participation row. Only `Attendee` rows are reduced. */
export function computePunctualityFactor({
  role,
  checkInAt,
  startAt,
}: ComputePunctualityInput): 1 | 0.5 {
  if (role !== "Attendee") return 1;
  if (checkInAt === null) return 0.5;
  return checkInAt.toMillis() <= startAt.toMillis() + TOLERANCE_MS ? 1 : 0.5;
}
