import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
  type RoleDefinition,
} from "@luminova/types";

export interface RoleDisplay {
  label: string;
  description: string;
}

/** Resolve a built-in role's display text. The live `roles/{id}` doc is the single source
 *  of truth; ROLE_LABELS / ROLE_DESCRIPTIONS are the bootstrap snapshot, read ONLY when no
 *  doc exists for the key (fresh project, pre-seed).
 *
 *  `||` not `??`: seeded docs carry `description: ""` today, and an empty string must fall
 *  through to the snapshot rather than render blank.
 *
 *  This module is the ONE place in backstage allowed to import those constants —
 *  role-display.guard.test.ts enforces it. */
export function roleDisplay(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDisplay {
  const doc = roleDocs?.find((role) => role.builtInKey === key);
  return {
    label: doc?.name || ROLE_LABELS[key],
    description: doc?.description || ROLE_DESCRIPTIONS[key],
  };
}

/** Options for a role picker, derived from ROLES rather than from the doc list.
 *
 *  This is load-bearing. MultiSelect renders chips by filtering `options` against the
 *  stored value, so an option list built from the docs would silently hide a grant already
 *  stored on a cargo whenever its role doc is missing or inactive — the admin would then be
 *  making authorization decisions from a display that omits a live power grant. Deriving
 *  from ROLES keeps the list total; a missing doc costs a fallback label, never an option. */
export function roleOptions(
  roleDocs: readonly RoleDefinition[] | undefined,
): { value: Role; label: string }[] {
  return ROLES.map((role) => ({ value: role, label: roleDisplay(role, roleDocs).label }));
}
