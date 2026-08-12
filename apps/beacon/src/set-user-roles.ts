import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES, isValidRole, type Role } from "@luminova/auth/roles";
import { PERMISSION_CAP } from "@luminova/types/permission";
import { requireAdmin } from "./callable-auth.js";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { resolveMemberPerms } from "./claims-sync/resolve-member-perms.js";
import { ensureApp } from "./runtime.js";

export interface SetUserRolesInput {
  targetUid: string;
  roles: Role[];
}

interface RawInput {
  targetUid?: unknown;
  roles?: unknown;
}

/** Extra keys are ignored, not rejected: an older client may still send the removed
 *  `scannerEventIds`, and failing its call would break role assignment for no gain — the
 *  field is simply never written into the claim. */
export function validateSetRolesInput(data: unknown): SetUserRolesInput {
  const raw = (data ?? {}) as RawInput;

  if (typeof raw.targetUid !== "string" || raw.targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "targetUid is required");
  }
  if (!Array.isArray(raw.roles) || raw.roles.length === 0) {
    throw new HttpsError("invalid-argument", "roles must be a non-empty array");
  }
  if (raw.roles.length > ROLES.length) {
    throw new HttpsError("invalid-argument", "roles exceeds the maximum allowed count");
  }
  for (const role of raw.roles) {
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", "one or more roles are invalid");
    }
  }
  const roles = [...new Set(raw.roles as Role[])];

  return { targetUid: raw.targetUid, roles };
}

export const setUserRoles = onCall(async (request) => {
  requireAdmin(request);

  const input = validateSetRolesInput(request.data);

  if (input.targetUid === request.auth?.uid) {
    throw new HttpsError("permission-denied", "cannot modify your own roles");
  }

  ensureApp();
  const auth = getAuth();
  // Resolve the coarse perms for these built-in roles so the `perms` claim stays
  // consistent with the position-driven trigger (rules gate on perms).
  const perms = await resolveMemberPerms(
    firestoreClaimsDeps(getFirestore(), auth),
    input.roles,
    [],
    { grant: [], revoke: [] },
  );
  if (perms.length > PERMISSION_CAP) {
    throw new HttpsError("internal", "resolved perms exceed the claim size cap");
  }

  await auth.setCustomUserClaims(input.targetUid, { roles: input.roles, perms });

  return { ok: true as const };
});
