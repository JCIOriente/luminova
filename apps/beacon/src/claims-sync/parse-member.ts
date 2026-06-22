import type { TermPositions } from "@luminova/types";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";

export interface SafeMember {
  uid?: string;
  positions: Record<string, TermPositions>;
  roleIds: string[];
  permissionOverrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}

/** Member fields the claims-sync needs — used to project member-collection scans. */
export const MEMBER_SYNC_FIELDS = ["uid", "positions", "roleIds", "permissionOverrides"] as const;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function permissionCodes(v: unknown): PermissionCode[] {
  return Array.isArray(v) ? v.filter((x): x is PermissionCode => isValidPermissionCode(x)) : [];
}

/** Extract a structurally-safe member from raw Firestore data. Malformed term
 *  entries are dropped (not thrown) so a bad doc can't cause a retry storm.
 *  An absent comisionIds defaults to [] (the cargo grant is still honored);
 *  a present-but-malformed comisionIds drops the entry. roleIds defaults to []
 *  when absent/malformed; override codes are filtered to the known vocabulary. */
export function parseMember(raw: unknown): SafeMember {
  const data = (raw ?? {}) as {
    uid?: unknown;
    positions?: unknown;
    roleIds?: unknown;
    permissionOverrides?: unknown;
  };
  const uid = typeof data.uid === "string" ? data.uid : undefined;
  const positions: Record<string, TermPositions> = {};
  if (data.positions && typeof data.positions === "object" && !Array.isArray(data.positions)) {
    for (const [term, value] of Object.entries(data.positions as Record<string, unknown>)) {
      const v = value as { cargoId?: unknown; comisionIds?: unknown; assignedBy?: unknown };
      if (!v || typeof v !== "object") continue;
      const cargoId =
        typeof v.cargoId === "string" ? v.cargoId : v.cargoId === null ? null : undefined;
      if (cargoId === undefined) continue;
      if (v.comisionIds !== undefined && !isStringArray(v.comisionIds)) continue;
      positions[term] = {
        cargoId,
        comisionIds: isStringArray(v.comisionIds) ? v.comisionIds : [],
        ...(typeof v.assignedBy === "string" ? { assignedBy: v.assignedBy } : {}),
      };
    }
  }
  const roleIds = isStringArray(data.roleIds) ? data.roleIds : [];
  const rawOverrides = (data.permissionOverrides ?? {}) as { grant?: unknown; revoke?: unknown };
  const permissionOverrides = {
    grant: permissionCodes(rawOverrides.grant),
    revoke: permissionCodes(rawOverrides.revoke),
  };
  return { uid, positions, roleIds, permissionOverrides };
}
