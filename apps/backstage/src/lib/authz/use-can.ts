import { useMemo } from "react";
import { hasAnyRole, type AuthClaims, type Role } from "@luminova/auth/roles";
import type { Action, AppAbility, Subject } from "@luminova/auth/ability";
import { useAbility, useClaims } from "./ability-context";

/** One place to ask "may the current user do this?" for both authorities the
 *  Firestore rules use: coarse `action:subject` perms (via the CASL ability) and
 *  the built-in `roles` claim (Admin / ExecutiveCommittee / ProjectManager gates
 *  that no perm expresses). Keeps the UI's affordances in lock-step with the rules. */
export interface Can {
  /** Coarse perm gate — `ability.can(action, subject)`. */
  can(action: Action, subject: Subject): boolean;
  /** Role gate — the caller holds at least one of `roles`. */
  hasRole(roles: readonly Role[]): boolean;
  /** Shorthand for the Admin role (not the `manage:all` perm). */
  readonly isAdmin: boolean;
}

/** Pure builder — no React — so the gate logic is unit-testable. */
export function buildCan(ability: AppAbility, claims: AuthClaims): Can {
  return {
    can: (action, subject) => ability.can(action, subject),
    hasRole: (roles) => hasAnyRole(claims, roles),
    isAdmin: hasAnyRole(claims, ["Admin"]),
  };
}

export function useCan(): Can {
  const ability = useAbility();
  const claims = useClaims();
  return useMemo(() => buildCan(ability, claims), [ability, claims]);
}
