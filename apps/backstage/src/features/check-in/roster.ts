import type { Member } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";

export interface CheckInRecord {
  memberId: string;
  role: ParticipationRole;
}

export interface RosterEntry {
  memberId: string;
  name: string;
}

export function alreadyCheckedIn(checkIns: CheckInRecord[], memberId: string): boolean {
  return checkIns.some((c) => c.memberId === memberId);
}

export function buildRosterEntries(checkIns: CheckInRecord[], members: Member[]): RosterEntry[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return checkIns
    .map((c) => ({ memberId: c.memberId, name: nameById.get(c.memberId) ?? c.memberId }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
