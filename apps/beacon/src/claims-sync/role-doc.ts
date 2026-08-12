import type { DocumentData } from "firebase-admin/firestore";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";

/** Pure predicates over a roles/{id} Firestore doc — no I/O, shared by the claims-sync glue and the change detector. */

/** Exactly what the doc holds, junk included. The reseed's before/after report needs the
 *  on-disk array — the sanitized view below would describe a state that does not exist. */
export function rawPermsFromRoleDoc(data: DocumentData | undefined): unknown[] {
  const raw = data?.permissions;
  return Array.isArray(raw) ? raw : [];
}

export function permsFromRoleDoc(data: DocumentData | undefined): PermissionCode[] {
  return rawPermsFromRoleDoc(data).filter((p): p is PermissionCode => isValidPermissionCode(p));
}

/** True when `permissions` carries an entry the sanitizer above drops — the doc on disk and
 *  the perms the claims pipeline mints from it disagree. Lives HERE, beside the filter it
 *  is the complement of, so the two can never drift: derived downstream (say, by comparing
 *  array lengths) it would silently change meaning the moment this filter also deduped. */
export function roleDocPermsMalformed(data: DocumentData | undefined): boolean {
  return rawPermsFromRoleDoc(data).some((p) => !isValidPermissionCode(p));
}

export function isActiveRoleDoc(data: DocumentData | undefined): boolean {
  return data?.active !== false && (data?.deletedAt === null || data?.deletedAt === undefined);
}

export function builtInKeyFromRoleDoc(data: DocumentData | undefined): string | null {
  return typeof data?.builtInKey === "string" ? data.builtInKey : null;
}
