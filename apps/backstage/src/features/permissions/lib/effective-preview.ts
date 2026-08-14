import { resolveBuiltInPerms } from "@luminova/auth/built-in-perms";
import type { PermissionCode, Role, RoleDefinition } from "@luminova/types";
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";

/** Client-side mirror of the beacon resolution for the member-assignment preview:
 *  effective perms = built-in roles (held via positions) ∪ selected custom roles ∪
 *  override grants − revokes.
 *
 *  The three-way itself is NOT reimplemented here — it is `resolveBuiltInPerms`
 *  (`@luminova/auth/built-in-perms`), the same function beacon's `resolveMemberPerms`
 *  delegates to, so preview and mint cannot drift. This file owns only the PORT: which
 *  docs claim a key, and whether each is live. `PERMISSION_CAP` is likewise not applied
 *  here — the role editor blocks Save on it; beacon fail-closes instead.
 *
 *  Every doc claiming the key is passed through, live or not: coverage is what suppresses
 *  the snapshot, liveness is what contributes perms.
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
  // One flatMap over the requested names so `builtInKey` comes from `name`, already a
  // `Role`, and the adapter stays castless — `r.builtInKey` is `Role | null`.
  const builtInDocs = input.builtInRoleNames.flatMap((name) =>
    input.allRoles
      .filter((r) => r.builtIn && r.builtInKey === name)
      .map((r) => ({ permissions: r.permissions, builtInKey: name, live: isLiveRole(r) })),
  );
  const customDocs = input.selectedCustomRoleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleDefinition => r !== undefined);
  return resolveBuiltInPerms({
    builtInRoleNames: input.builtInRoleNames,
    builtInDocs,
    customDocs,
    overrides: input.overrides,
  });
}
