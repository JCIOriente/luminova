import { useMemo } from "react";
import { hasAnyRole, type AuthClaims, type Role } from "@luminova/auth/roles";
import type { Action, AppAbility, Subject } from "@luminova/auth/ability";
import type { ParticipationRole } from "@luminova/types/engine";
import { isNavItemVisible, type NavItem } from "../../components/nav-config";
import { canRemoveEntry } from "../../features/check-in/lib/can-remove-entry";
import { useAbility, useClaims } from "./ability-context";
import { abilityAllows, type SubjectFields } from "./probe";

/** One place to ask "may the current user do this?" for both authorities the
 *  Firestore rules use: coarse `action:subject` perms (via the CASL ability) and
 *  the built-in `roles` claim (Admin / ExecutiveCommittee / ProjectManager gates
 *  that no perm expresses). Keeps the UI's affordances in lock-step with the rules. */
export interface Can {
  /** Perm gate. Without `on` this asks the COLLECTION-level question (unconditional
   *  grants only); pass the document's fields to ask about one document. See
   *  `abilityAllows` — a bare subject type would let a conditional own-doc grant
   *  answer a collection question. */
  can(action: Action, subject: Subject, on?: SubjectFields): boolean;
  /** Role gate — the caller holds at least one of `roles`. */
  hasRole(roles: readonly Role[]): boolean;
  /** Nav/route policy (components/nav-config). Exposed here so the sidebar and the
   *  command palette never have to hold a raw ability just to pass it along. */
  navItemVisible(item: NavItem): boolean;
  /** May the caller undo THIS roster row? (features/check-in/lib/can-remove-entry) */
  canRemoveCheckIn(activityId: string, entry: { role: ParticipationRole }): boolean;
  /** Shorthand for the Admin role (not the `manage:all` perm). */
  readonly isAdmin: boolean;
  /** May curate the public /programas page (rules' `featuredUpdateSafe`). Named
   *  here so the Admin/ProjectManager policy lives in one place, not scattered
   *  role-array literals at each call site. */
  readonly canFeatureInitiatives: boolean;
  /** May assign power-granting cargos (rules' `cargoGrantsEmpty` / `createPositionsSafe`
   *  — Admin only). Named so the policy isn't a bare `isAdmin` at each grant site. */
  readonly canAssignPowerGrants: boolean;
}

/** Pure builder — no React — so the gate logic is unit-testable. */
export function buildCan(ability: AppAbility, claims: AuthClaims): Can {
  return {
    can: (action, subject, on) => abilityAllows(ability, action, subject, on),
    hasRole: (roles) => hasAnyRole(claims, roles),
    navItemVisible: (item) => isNavItemVisible(item, ability, claims),
    canRemoveCheckIn: (activityId, entry) => canRemoveEntry(ability, activityId, entry),
    isAdmin: hasAnyRole(claims, ["Admin"]),
    canFeatureInitiatives: hasAnyRole(claims, ["Admin", "ProjectManager"]),
    canAssignPowerGrants: hasAnyRole(claims, ["Admin"]),
  };
}

export function useCan(): Can {
  const ability = useAbility();
  const claims = useClaims();
  return useMemo(() => buildCan(ability, claims), [ability, claims]);
}
