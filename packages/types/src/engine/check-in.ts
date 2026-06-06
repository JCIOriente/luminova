import type { Timestamp } from "./timestamp.js";
import type { ParticipationRole } from "./participation.js";

/**
 * The Recognition Engine's input fact. A client writes one of these; A2's
 * `awardPoints` trigger derives the participation + points. Uses the SDK-neutral
 * Timestamp so both backstage (client) and beacon (admin) share one contract.
 */
export interface CheckIn {
  memberId: string;
  activityId: string;
  role: ParticipationRole;
  checkInAt: Timestamp;
}
