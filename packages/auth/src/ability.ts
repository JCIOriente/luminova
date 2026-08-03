import { AbilityBuilder, createMongoAbility, subject, type MongoAbility } from "@casl/ability";
import { type Action, type Subject, type PermissionCode } from "@luminova/types";
import type { AuthClaims, Role } from "./roles.js";

export { subject };
export type { Action, Subject };

type SubjectObject = object;
export type AppAbility = MongoAbility<[Action, Subject | SubjectObject]>;

type Can = AbilityBuilder<AppAbility>["can"];

/** Conditional / object-scoped grants that can't be expressed as coarse perms.
 *  These stay hardcoded per built-in role name and are NOT editable in the UI.
 *
 *  Scanner used to live here with `checkIn Attendance { eventId ∈ scannerEventIds }`.
 *  Event scoping was abandoned: Scanner now carries coarse `read:Activity` +
 *  `checkIn:Attendance` in BUILT_IN_ROLE_PERMS, and the Attendee-only restriction is a
 *  Scanner-specific conjunct in firestore.rules (mirrored by
 *  features/check-in/lib/can-remove-entry.ts), not a CASL condition. */
function applyConditional(role: Role, uid: string, can: Can): void {
  switch (role) {
    case "Member":
      can(["read", "update"], "Member", { uid });
      can("read", ["MemberPoints", "Project", "Position"]);
      break;
    default:
      // Other built-in roles carry only coarse grants, applied via the perms claim.
      break;
  }
}

function applyPerms(perms: readonly PermissionCode[], can: Can): void {
  for (const code of perms) {
    const [action, sub] = code.split(":") as [Action, Subject];
    can(action, sub);
  }
}

/** Build the CASL ability from a member's claims. Coarse abilities come solely
 *  from the resolved `perms` claim (minted by claims-sync as the single source of
 *  coarse authority); an absent `perms` grants none. Conditional grants always
 *  derive from the built-in `roles` claim, independent of `perms`. */
export function buildAbility(claims: AuthClaims, uid: string): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  const perms = claims.perms ?? [];
  applyPerms(perms, builder.can);
  for (const role of claims.roles) applyConditional(role, uid, builder.can);
  return builder.build();
}
