import { useMemo } from "react";
import { hasAnyRole, hasPerm, type AuthClaims, type Role } from "@luminova/auth/roles";
import type { Action, AppAbility, Subject } from "@luminova/auth/ability";
import type { ParticipationRole } from "@luminova/types/engine";
import { isNavItemVisible, type NavItem } from "../../components/nav-config";
import { canRemoveEntry } from "../../features/check-in/lib/can-remove-entry";
import { isMemberOnly } from "./is-member-only";
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
  canRemoveCheckIn(entry: { role: ParticipationRole }): boolean;
  /** Shorthand for the Admin role (not the `manage:all` perm). */
  readonly isAdmin: boolean;
  /** May curate the public /programas page (rules' `canCurateFeatured`). Named here so the
   *  policy lives in one place, not scattered role-array literals at each call site. */
  readonly canFeatureInitiatives: boolean;
  /** The Admin-only half of the positions authority — one flag because firestore.rules keys
   *  every part of it on the same `hasAnyRole(['Admin'])`: assigning a power-granting cargo
   *  (`cargoAssignableByNonAdmin` / `currentCargoGrantsEmpty` / `createPositionsSafe`) or a CEL cargo
   *  at all, creating a board-surfacing cargo (`boardSurfacingCategory()`), and editing a
   *  stored cargo's `grants`, `category` or — on a board cargo — `title`/`titleFemale`.
   *  Named so the policy isn't a bare `isAdmin` at each grant site. */
  readonly canAssignPowerGrants: boolean;
}

/** Pure builder — no React — so the gate logic is unit-testable. */
export function buildCan(ability: AppAbility, claims: AuthClaims): Can {
  return {
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
    isAdmin: hasAnyRole(claims, ["Admin"]),
    // Mirrors canCurateFeatured() in firestore.rules disjunct for disjunct: Admin by ROLE
    // (locked + undeactivatable, so its name carries none of the staleness this gate fixes),
    // everyone else by the update:Showcase PERM — so deactivating a role revokes curation,
    // which the surviving role NAME in the claim would not.
    //
    // `hasPerm` is the client mirror of the rules' own `hasPerm()` — an exact code test on
    // the claim, deliberately NOT `abilityAllows(..., "update", "Showcase")`: CASL's
    // `manage:all` wildcard would answer yes to the ability question. That would show the
    // Destacar checkbox to a manage:all perm holder whose write firestore.rules then
    // rejects — taking the whole save down with it. `probe.ts` does not help here: it
    // narrows CONDITIONAL grants, and the divergence is the unconditional wildcard.
    canFeatureInitiatives: hasAnyRole(claims, ["Admin"]) || hasPerm(claims, "update:Showcase"),
    canAssignPowerGrants: hasAnyRole(claims, ["Admin"]),
  };
}

export function useCan(): Can {
  const ability = useAbility();
  const claims = useClaims();
  return useMemo(() => buildCan(ability, claims), [ability, claims]);
}
