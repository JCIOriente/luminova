import { BUILT_IN_ROLE_PERMS } from "@luminova/types";
import type { AuthClaims, Role } from "./roles.js";
import { resolveEffectivePerms } from "./perms.js";

/** Build the claims a production token carries for a set of built-in roles: the
 *  `roles` claim plus the resolved coarse `perms` claim. Perms are derived the
 *  same way claims-sync mints them — `resolveEffectivePerms` over each role's
 *  `BUILT_IN_ROLE_PERMS` (the seeded role-doc perms, no overrides). Use this in
 *  tests instead of a bare `{ roles: [...] }` fixture: since `buildAbility` no
 *  longer falls back to the role table, a roles-only fixture grants zero coarse
 *  abilities — only what a real, backfilled token carries reflects production. */
export function roleClaims(...roles: Role[]): AuthClaims {
  return {
    roles,
    perms: resolveEffectivePerms({
      roleDocs: roles.map((role) => ({ permissions: BUILT_IN_ROLE_PERMS[role] })),
    }),
  };
}
