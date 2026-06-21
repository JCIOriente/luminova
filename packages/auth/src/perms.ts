import type { PermissionCode, RoleDefinition } from "@luminova/types";

/** Resolve a member's effective coarse permission set: union of all role perms,
 *  plus override grants, minus override revokes. Deduped and sorted so equality
 *  checks (idempotent claim writes) are stable. Revoke wins over grant. */
export function resolveEffectivePerms(input: {
  roleDocs: Pick<RoleDefinition, "permissions">[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const set = new Set<PermissionCode>();
  for (const doc of input.roleDocs) for (const code of doc.permissions) set.add(code);
  for (const code of input.overrides?.grant ?? []) set.add(code);
  for (const code of input.overrides?.revoke ?? []) set.delete(code);
  return [...set].sort();
}
