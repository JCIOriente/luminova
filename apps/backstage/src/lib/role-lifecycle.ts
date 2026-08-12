import type { RoleDefinition } from "@luminova/types";

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
