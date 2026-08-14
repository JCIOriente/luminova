import type { PermissionCode } from "@luminova/types";

/** Resolve a member's effective coarse permission set: union of all role perms,
 *  plus override grants, minus override revokes. Deduped and sorted so equality
 *  checks (idempotent claim writes) are stable. Revoke wins over grant.
 *
 *  `roleDocs` is readonly all the way down because this function only ITERATES it —
 *  beacon hands it a deep-frozen graph, so requiring mutability would force callers to
 *  copy arrays purely to launder the type.
 *
 *  Returns the full set uncapped — the caller enforces `PERMISSION_CAP`
 *  (fail-closed in the beacon trigger; a save-blocking preview in the admin UI). */
export function resolveEffectivePerms(input: {
  roleDocs: readonly { readonly permissions: readonly PermissionCode[] }[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const set = new Set<PermissionCode>();
  for (const doc of input.roleDocs) for (const code of doc.permissions) set.add(code);
  for (const code of input.overrides?.grant ?? []) set.add(code);
  for (const code of input.overrides?.revoke ?? []) set.delete(code);
  return [...set].sort();
}
