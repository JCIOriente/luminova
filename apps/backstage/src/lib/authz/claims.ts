import { isValidRole, type AuthClaims, type Role } from "@luminova/auth/roles";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types";

export function decodeClaims(tokenClaims: Record<string, unknown> | null | undefined): AuthClaims {
  if (!tokenClaims || !Array.isArray(tokenClaims.roles)) {
    return { roles: [] };
  }
  const roles = tokenClaims.roles.filter((r): r is Role => isValidRole(r));
  const rawEventIds = tokenClaims.scannerEventIds;
  const scannerEventIds =
    Array.isArray(rawEventIds) && rawEventIds.every((id) => typeof id === "string")
      ? (rawEventIds as string[])
      : undefined;
  const rawPerms = tokenClaims.perms;
  const perms = Array.isArray(rawPerms)
    ? rawPerms.filter((p): p is PermissionCode => isValidPermissionCode(p))
    : undefined;
  return {
    roles,
    ...(perms ? { perms } : {}),
    ...(scannerEventIds ? { scannerEventIds } : {}),
  };
}
