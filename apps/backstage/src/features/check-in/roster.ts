import type { Member } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";

export interface CheckInRecord {
  memberId: string;
  role: ParticipationRole;
}

export interface RosterEntry {
  memberId: string;
  name: string;
  src: string | null;
}

export function alreadyCheckedIn(checkIns: CheckInRecord[], memberId: string): boolean {
  return checkIns.some((c) => c.memberId === memberId);
}

export function buildRosterEntries(checkIns: CheckInRecord[], members: Member[]): RosterEntry[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  return checkIns
    .map((c) => {
      const member = byId.get(c.memberId);
      return {
        memberId: c.memberId,
        name: member?.name ?? c.memberId,
        src: member?.profilePicture ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
