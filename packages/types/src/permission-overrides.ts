import type { PermissionCode } from "./permission.js";

/** Per-member coarse permission adjustments layered on resolved role perms.
 *  Revoke wins over grant for the same code. */
export interface PermissionOverrides {
  grant: PermissionCode[];
  revoke: PermissionCode[];
}
