import type { Member } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";
import type { Timestamp } from "firebase/firestore";

export interface CheckInRecord {
  memberId: string;
  role: ParticipationRole;
  checkInAt: Timestamp | null;
}

export interface RosterEntry {
  memberId: string;
  role: ParticipationRole;
  name: string;
  profession: string | null;
  src: string | null;
  checkInAt: Timestamp | null;
}

export function alreadyCheckedIn(checkIns: CheckInRecord[], memberId: string): boolean {
  return checkIns.some((c) => c.memberId === memberId);
}

/** Present roster, most-recent check-in first (name-asc tiebreak for equal/absent times). */
export function buildRosterEntries(checkIns: CheckInRecord[], members: Member[]): RosterEntry[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  return checkIns
    .map((c) => {
      const member = byId.get(c.memberId);
      return {
        memberId: c.memberId,
        role: c.role,
        name: member?.name ?? c.memberId,
        profession: member?.profession ?? null,
        src: member?.profilePicture ?? null,
        checkInAt: c.checkInAt,
      };
    })
    .sort((a, b) => {
      const diff = (b.checkInAt?.toMillis() ?? 0) - (a.checkInAt?.toMillis() ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "es");
    });
}
