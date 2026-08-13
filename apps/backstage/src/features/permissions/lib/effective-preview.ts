import { resolveEffectivePerms } from "@luminova/auth/perms";
import {
  BUILT_IN_ROLE_PERMS,
  type PermissionCode,
  type Role,
  type RoleDefinition,
} from "@luminova/types";
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";

/** Client-side mirror of the beacon resolution for the member-assignment preview:
 *  effective perms = built-in roles (held via positions) ∪ selected custom roles ∪
 *  override grants − revokes.
 *
 *  Three-way per built-in key, mirroring resolveMemberPerms:
 *    - NO doc claims the key → the BUILT_IN_ROLE_PERMS snapshot (pre-seed window)
 *    - doc(s) claim it, live → the UNION of their permissions
 *    - doc(s) claim it, none live → nothing, and the key stays COVERED (so the
 *                              snapshot must NOT come back)
 *
 *  Grouped per key, not mapped: two docs may claim one builtInKey, and beacon computes
 *  coverage over every doc it read and unions the live ones. A Map would keep only the
 *  last, making this preview disagree with the perms that get minted — and disagree
 *  differently depending on the sort order it happened to receive.
 *
 *  NOT parity, and it cannot be: this reads `RoleDefinition[]` already through `parseDocs` +
 *  `roleDefinitionDocSchema`, so a doc the zod schema rejects is dropped before it arrives
 *  here and reads as ABSENT — i.e. falls back to the snapshot — while beacon reads the raw
 *  doc and sees the key COVERED. Divergence is confined to malformed docs, but it runs in
 *  two directions and the dangerous one is not the obvious one. Per shape:
 *    - a string `deletedAt` → beacon's isActiveRoleDoc reads it as NOT live, so the key is
 *      covered and mints nothing. Preview overstates: snapshot vs nothing.
 *    - a MISSING `active` → `active` is required here (no `.default`), so zod drops the doc;
 *      but isActiveRoleDoc is `data?.active !== false`, and `undefined !== false` is true,
 *      so beacon reads the doc as LIVE and mints its REAL `permissions`. The divergence is
 *      snapshot vs the doc's own perms — which may be WIDER than the snapshot, the strictly
 *      more dangerous reading. docs/specs/role-lifecycle.md states this case correctly.
 *  A non-string element inside `permissions` is NOT in this list any more: the doc schema
 *  filters those exactly as beacon's permsFromRoleDoc does, so such a doc now parses and
 *  both sides compute the same set.
 *
 *  The CUSTOM path filters too. members.roleIds keeps naming a deactivated custom role
 *  (softDelete never scrubs roleIds), and beacon's getRolesByIds drops inactive docs —
 *  a preview that counted them would overstate the member's perms. */
export function previewEffectivePerms(input: {
  builtInRoleNames: Role[];
  selectedCustomRoleIds: string[];
  allRoles: RoleDefinition[];
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const byId = new Map(assignableRoles(input.allRoles).map((r) => [r.id, r]));
  const builtInDocs = input.builtInRoleNames.flatMap((name) => {
    // Every doc claiming the key, live or not: coverage is what suppresses the snapshot,
    // liveness is what contributes perms. One flatMap so `builtInKey === name` narrows
    // the Role type without a cast.
    const claiming = input.allRoles.filter((r) => r.builtIn && r.builtInKey === name);
    if (claiming.length === 0) return [{ permissions: BUILT_IN_ROLE_PERMS[name] }];
    return claiming.filter(isLiveRole);
  });
  const customDocs = input.selectedCustomRoleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleDefinition => r !== undefined);
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs, ...customDocs],
    overrides: input.overrides,
  });
}
