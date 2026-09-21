import { useMemo } from "react";
import { hasAnyRole, type AuthClaims, type Role } from "@luminova/auth/roles";
import type { Action, AppAbility, Subject } from "@luminova/auth/ability";
import type { ParticipationRole } from "@luminova/types/engine";
import { capabilityFlags, type CapabilityFlags } from "./capability-flags";
import { isNavItemVisible, type NavItem } from "../../components/nav-config";
import { canRemoveEntry } from "../../features/check-in/lib/can-remove-entry";
import { isMemberOnly } from "./is-member-only";
import { useAbility, useClaims } from "./ability-context";
import { abilityAllows, type SubjectFields } from "./probe";

/** One place to ask "may the current user do this?" for both authorities the
 *  Firestore rules use: coarse `action:subject` perms (via the CASL ability) and
 *  the built-in `roles` claim (Admin / ExecutiveCommittee / ProjectManager gates
 *  that no perm expresses). Keeps the UI's affordances in lock-step with the rules. */
export interface Can extends CapabilityFlags {
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
  canRemoveCheckIn(entry: { role: ParticipationRole }): boolean;
}

/** Pure builder — no React — so the gate logic is unit-testable. The capability FLAGS come
 *  from `./capability-flags`, which the emulator parity test loads directly (this module pulls
 *  React and `@luminova/types` for value, so it cannot). */
export function buildCan(ability: AppAbility, claims: AuthClaims): Can {
  return {
    ...capabilityFlags(claims),
    can: (action, subject, on) => abilityAllows(ability, action, subject, on),
    hasRole: (roles) => hasAnyRole(claims, roles),
    // A member-only user is bounced from `/` to `/me` by _app.index, so the Inicio
    // (dashboard) link is dead weight for them — hide it. This lives HERE, in the UI
    // gate, not in nav-config's isNavItemVisible, because canAccessRoute reuses that
    // function: hiding `/` there would deny route access to `/` and, since a denied
    // route redirects to `/`, loop. Route access to `/` must stay open; only the nav
    // affordance is hidden.
    navItemVisible: (item) =>
      isNavItemVisible(item, ability, claims) && !(item.to === "/" && isMemberOnly(claims)),
    canRemoveCheckIn: (entry) => canRemoveEntry(ability, claims, entry),
  };
}

export function useCan(): Can {
  const ability = useAbility();
  const claims = useClaims();
  return useMemo(() => buildCan(ability, claims), [ability, claims]);
}
