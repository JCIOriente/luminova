import type { Role, RoleDefinition } from "@luminova/types";

/** Built-in keys firestore.rules' `roleDeactivationAllowed()` bars from going inactive.
 *  ONE list, mirroring that one helper, so the two reasons cannot drift apart into two
 *  hand-written booleans:
 *    Member — computeMemberRoles injects it into every claim unconditionally, so
 *      deactivating it strips its reads from the whole chapter through an unbounded,
 *      no-retry members scan. An admin who wants that empties its `permissions` instead.
 *    Admin — anti-lockout. Keyed on builtInKey and NOT on `locked`, deliberately: prod
 *      role docs are documented as lagging the seed, so a `roles/Admin` whose `locked` is
 *      false or missing would otherwise be one write away from losing manage:all
 *      chapter-wide.
 *  Keyed on builtInKey exactly as the rules clause is — a UI mirror keyed on a different
 *  field renders an affordance the write then denies (guardrail #6, "claim == reality"). */
const UNDEACTIVATABLE_BUILT_IN_KEYS: readonly Role[] = ["Member", "Admin"];

export function isUndeactivatableRole(role: RoleDefinition): boolean {
  return role.builtInKey !== null && UNDEACTIVATABLE_BUILT_IN_KEYS.includes(role.builtInKey);
}

/** Client mirror of beacon's `isActiveRoleDoc`
 *  (apps/beacon/src/claims-sync/role-doc.ts). BOTH fields matter: `active: true` with
 *  `deletedAt` set is live to `where("active","==",true)` and dead to the perms
 *  pipeline, so a surface that trusted `active` alone would offer a role that mints
 *  nothing. Keep the two in lockstep. */
export function isLiveRole(role: RoleDefinition): boolean {
  return role.active && role.deletedAt === null;
}

/** The ONE filter every ASSIGNMENT surface applies to the role list.
 *
 *  `useRoles()` returns every role doc — unfiltered — so /permisos can show and
 *  restore a deactivated role. That makes each consumer state its own intent, and a
 *  picker that hands out a deactivated role promises perms beacon will never mint.
 *  DISPLAY surfaces deliberately do NOT call this: `roleDisplay`, the sent-history
 *  role names and the cargo grants picker must still resolve a value that is already
 *  stored. The per-surface tests are the actual guard — the type system cannot express
 *  "this list must be filtered". */
export function assignableRoles(roles: readonly RoleDefinition[] | undefined): RoleDefinition[] {
  return (roles ?? []).filter(isLiveRole);
}
