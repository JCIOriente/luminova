import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
  type RoleDefinition,
} from "@luminova/types";
import { isLiveRole } from "./role-lifecycle";

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
 *  This module is the ONE place in backstage allowed to import those constants — the
 *  `no-restricted-imports` block in the root eslint.config.js enforces it, and a pair of
 *  `no-restricted-syntax` selectors alongside it reject a re-declared role -> label map. */
export function roleDisplay(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDisplay {
  return displayOf(key, findDoc(key, roleDocs));
}

/** The doc that speaks for a built-in key, preferring a LIVE claimant.
 *
 *  Two docs CAN claim one key (console-authorable only — clients may not write `builtInKey`
 *  — and beacon logs the condition), and beacon then unions the live ones, so the key IS
 *  minting. Taking the first match instead made that order-dependent: with a dead doc sorted
 *  ahead of a live one, `roleLifecycleDisplay` printed "(desactivado)" for a key that
 *  `previewEffectivePerms` and beacon both agree is in service — the same order-dependence
 *  the perms side already closed by grouping per key rather than mapping. Preferring the
 *  live claimant makes the marker agree with both, and the label come from the doc whose
 *  perms are actually minting. */
function findDoc(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDefinition | null {
  const claiming = (roleDocs ?? []).filter((role) => role.builtInKey === key);
  return claiming.find(isLiveRole) ?? claiming[0] ?? null;
}

/** `.trim()` before the `||`, not just for tidiness: rules `name.size() >= 1` accepts "   "
 *  and cannot trim, so a console-written whitespace name is a doc production can hold. Bare
 *  `doc?.name ||` reads it as truthy and renders the role with a BLANK label — worse than
 *  the snapshot fallback, since the row then names nothing at all. The write path trims too
 *  (roleDefinitionSchema); this covers the docs that predate it. */
function displayOf(key: Role, doc: RoleDefinition | null): RoleDisplay {
  return {
    label: doc?.name.trim() || ROLE_LABELS[key],
    description: doc?.description.trim() || ROLE_DESCRIPTIONS[key],
  };
}

/** Whether the key is currently minting perms. TRUE with no doc: beacon's
 *  BUILT_IN_ROLE_PERMS fallback really is minting, so "desactivado" would be the
 *  opposite of the truth. */
function inService(doc: RoleDefinition | null): boolean {
  return doc === null || isLiveRole(doc);
}

/** The ONE definition of the out-of-service marker text. Three surfaces show it — the
 *  cargo grants picker, the cargo grants column and the per-member cargo summary — and
 *  they sit on the same or adjacent screens, so a second copy of this string is a
 *  cross-surface disagreement waiting to happen. */
function markedLabel(display: RoleDisplay, doc: RoleDefinition | null): string {
  return inService(doc) ? display.label : `${display.label} (desactivado)`;
}

/** Like `roleDisplay`, but the label states whether the role is still in service.
 *
 *  For surfaces that assert AUTHORITY — what a cargo confers, what a member's cargos
 *  grant. A deactivated role mints nothing (the beacon three-way), so rendering its name
 *  bare under such a heading states perms nobody has. Plain `roleDisplay` stays unmarked
 *  for surfaces that merely resolve a stored value's name (sent history, /permisos rows,
 *  which carry their own "Desactivado" badge). */
export function roleLifecycleDisplay(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDisplay {
  const doc = findDoc(key, roleDocs);
  const display = displayOf(key, doc);
  return { label: markedLabel(display, doc), description: display.description };
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
 *  from ROLES keeps the list total; a missing doc costs a fallback label, never an option.
 *
 *  A DEACTIVATED built-in keeps its option for exactly that reason, but says so in its
 *  label. A role with NO doc is not marked: beacon's BUILT_IN_ROLE_PERMS fallback really
 *  is minting its perms, so "desactivado" would be the opposite of the truth. */
export function roleOptions(
  roleDocs: readonly RoleDefinition[] | undefined,
): { value: Role; label: string }[] {
  return builtInRoles(roleDocs).map(({ key, doc }) => ({
    value: key,
    label: markedLabel(displayOf(key, doc), doc),
  }));
}
