import type { ParticipationRole } from "@luminova/types/engine";

export function participationId(
  activityId: string,
  memberId: string,
  role: ParticipationRole,
): string {
  return `${activityId}__${memberId}__${role}`;
}
