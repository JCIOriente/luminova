import type { AppAbility } from "@luminova/auth/ability";
import { hasAnyRole, type AuthClaims } from "@luminova/auth/roles";
import type { ParticipationRole } from "@luminova/types/engine";
import { abilityAllows } from "../../../lib/authz/probe";

/** May the caller undo THIS roster row? Mirrors the `checkIns` delete rule
 *  (firestore.rules): every `checkIn:Attendance` holder may undo a row, EXCEPT a Scanner,
 *  which is confined to `Attendee` rows unless it also holds `manage:Attendance`.
 *
 *  The Scanner clause reads the ROLE, not a CASL condition. It used to ride on the
 *  ability: Scanner's grant carried an `eventId` condition, so the empty-instance probe
 *  failed for it and the scoped probe passed only for its own events. Event scoping is
 *  gone — Scanner now holds the same coarse `checkIn:Attendance` as a ProjectManager — so
 *  an ability-only gate would offer "undo" on a Director row the rules deny. */
export function canRemoveEntry(
  ability: AppAbility,
  claims: AuthClaims,
  entry: { role: ParticipationRole },
): boolean {
  if (!abilityAllows(ability, "checkIn", "Attendance")) return false;
  if (!hasAnyRole(claims, ["Scanner"])) return true;
  if (abilityAllows(ability, "manage", "Attendance")) return true;
  return entry.role === "Attendee";
}
