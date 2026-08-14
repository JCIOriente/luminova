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

/** Beacon's liveness predicate, and deliberately NOT unifiable with backstage's `isLiveRole`
 *  (apps/backstage/src/lib/role-lifecycle.ts) today. The blocker is not the `DocumentData`
 *  import — that is type-only and erases. It is that the two do not compute the same
 *  function: this one is fail-OPEN (`active !== false`, so a missing or non-bool `active`
 *  reads LIVE and keeps minting the doc's perms) while `isLiveRole` is fail-CLOSED
 *  (`active === true`). Collapsing them either revokes perms from docs that hold them today
 *  or offers assignment of docs that mint nothing — a behaviour change nobody has scoped.
 *  The divergence and its two directions are written out on `previewEffectivePerms` and in
 *  docs/specs/role-lifecycle.md; firestore.rules now bars authoring the shapes that reach it. */
export function isActiveRoleDoc(data: DocumentData | undefined): boolean {
  return data?.active !== false && (data?.deletedAt === null || data?.deletedAt === undefined);
}

export function builtInKeyFromRoleDoc(data: DocumentData | undefined): string | null {
  return typeof data?.builtInKey === "string" ? data.builtInKey : null;
}
