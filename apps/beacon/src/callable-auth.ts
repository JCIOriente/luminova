import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { PermissionCode } from "@luminova/types";
import { assertTokenVerificationNotBypassed } from "./token-verification-bypass.js";

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
  // BEFORE the claims are read, because under the debug bypass they are ATTACKER-SUPPLIED.
  // `checkAuthToken` in firebase-functions swaps `verifyIdToken` for `unsafeDecodeIdToken` when
  // FIREBASE_DEBUG_MODE + skipTokenVerification are set, so `request.auth.token` below is a
  // base64 payload with no signature check and `roles: ["Admin"]` is free to anyone. This
  // function and `requireAdminOrPerm` are the choke point EVERY authenticated callable crosses
  // as its first statement, which is why the refusal belongs here and not in five handlers.
  assertTokenVerificationNotBypassed("requireAdmin");
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
  // Same reason as `requireAdmin`: the `perms` claim this consults is unsigned under the bypass.
  assertTokenVerificationNotBypassed("requireAdminOrPerm");
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (callerIsAdmin(request)) return;
  if (stringArrayClaim(request, "perms").includes(code)) return;
  throw new HttpsError("permission-denied", `Admin role or ${code} required`);
}
