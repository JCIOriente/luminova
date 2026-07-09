import type { DocumentData } from "firebase-admin/firestore";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";

/** Pure predicates over a roles/{id} Firestore doc — no I/O, shared by the claims-sync glue and the change detector. */

export function permsFromRoleDoc(data: DocumentData | undefined): PermissionCode[] {
  const raw = data?.permissions;
  return Array.isArray(raw) ? raw.filter((p): p is PermissionCode => isValidPermissionCode(p)) : [];
}

export function isActiveRoleDoc(data: DocumentData | undefined): boolean {
  return data?.active !== false && (data?.deletedAt === null || data?.deletedAt === undefined);
}

export function builtInKeyFromRoleDoc(data: DocumentData | undefined): string | null {
  return typeof data?.builtInKey === "string" ? data.builtInKey : null;
}
