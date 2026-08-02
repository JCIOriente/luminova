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
  return displayOf(key, findDoc(key, roleDocs));
}

function findDoc(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDefinition | null {
  return roleDocs?.find((role) => role.builtInKey === key) ?? null;
}

function displayOf(key: Role, doc: RoleDefinition | null): RoleDisplay {
  return {
    label: doc?.name || ROLE_LABELS[key],
    description: doc?.description || ROLE_DESCRIPTIONS[key],
  };
}

/** Every built-in role paired with its live doc, or `null` where none is seeded — the
 *  total list, keyed off ROLES rather than the doc list. Both consumers of "what are all
 *  the built-in roles" route through here (`roleOptions` and the /permisos overview) so
 *  the ROLES-is-total rule and the match-by-builtInKey rule each live in one place. */
export function builtInRoles(
  roleDocs: readonly RoleDefinition[] | undefined,
): { key: Role; doc: RoleDefinition | null }[] {
  return ROLES.map((key) => ({ key, doc: findDoc(key, roleDocs) }));
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
  return builtInRoles(roleDocs).map(({ key, doc }) => ({
    value: key,
    label: displayOf(key, doc).label,
  }));
}
