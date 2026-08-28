import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { PermissionCode } from "@luminova/types";

/** One reader for both string-array claims. `roles` and `perms` are read identically and
 *  had drifted into two copies of the same three lines the moment a second gate needed one.
 *
 *  The `as` narrows `DecodedIdToken`'s `[key: string]: any` index signature to `unknown`,
 *  which is a tightening — every value is still filtered before use. Deliberately NOT
 *  `permsFromClaims` from claims-sync: that returns `PermissionCode[] | undefined` because
 *  `getExistingClaims` needs absence and empty to differ for its claim diff, and importing
 *  it would pull the Firestore port's runtime graph (chunk, role-doc, resolve-member-perms)
 *  into the callable trust boundary for a membership test. */
function stringArrayClaim(request: CallableRequest, key: "roles" | "perms"): string[] {
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const raw = token?.[key];
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

export function callerIsAdmin(request: CallableRequest): boolean {
  return stringArrayClaim(request, "roles").includes("Admin");
}

/** Reject anyone who isn't a signed-in Admin. Shared by every admin-only callable. */
export function requireAdmin(request: CallableRequest): void {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (!callerIsAdmin(request)) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
}

/** Admin by ROLE, or the exact permission code — the callable-side mirror of
 *  firestore.rules' `hasAnyRole(['Admin']) || hasPerm(code)`.
 *
 *  Exact-code, deliberately not a `canDo`-style expansion: `manage:all` must not satisfy a
 *  delegation gate, or every wildcard holder silently becomes a delegate. Same discipline as
 *  the rules' `hasPerm()` and backstage's `hasPerm`. A malformed `perms` claim (non-array,
 *  string, absent) reads as empty and therefore denies. */
export function requireAdminOrPerm(request: CallableRequest, code: PermissionCode): void {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (callerIsAdmin(request)) return;
  if (stringArrayClaim(request, "perms").includes(code)) return;
  throw new HttpsError("permission-denied", `Admin role or ${code} required`);
}
