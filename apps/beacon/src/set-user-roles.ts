import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES, isValidRole, type Role } from "@luminova/auth/roles";
import { PERMISSION_CAP } from "@luminova/types/permission";
import { requireAdmin } from "./callable-auth.js";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { resolveMemberPerms } from "./claims-sync/resolve-member-perms.js";
import { ensureApp } from "./runtime.js";

const MAX_SCANNER_EVENT_IDS = 50;
const MAX_EVENT_ID_LENGTH = 128;

export interface SetUserRolesInput {
  targetUid: string;
  roles: Role[];
  scannerEventIds?: string[];
}

interface RawInput {
  targetUid?: unknown;
  roles?: unknown;
  scannerEventIds?: unknown;
}

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

  let scannerEventIds: string[] | undefined;
  if (raw.scannerEventIds !== undefined) {
    if (
      !Array.isArray(raw.scannerEventIds) ||
      raw.scannerEventIds.some((id) => typeof id !== "string")
    ) {
      throw new HttpsError("invalid-argument", "scannerEventIds must be a string array");
    }
    if (!roles.includes("Scanner")) {
      throw new HttpsError("invalid-argument", "scannerEventIds requires the Scanner role");
    }
    if (raw.scannerEventIds.length > MAX_SCANNER_EVENT_IDS) {
      throw new HttpsError("invalid-argument", "too many scannerEventIds");
    }
    if (
      (raw.scannerEventIds as string[]).some(
        (id) => id.length === 0 || id.length > MAX_EVENT_ID_LENGTH,
      )
    ) {
      throw new HttpsError("invalid-argument", "scannerEventIds entries are out of bounds");
    }
    scannerEventIds = [...new Set(raw.scannerEventIds as string[])];
  }

  if (
    roles.includes("Scanner") &&
    (scannerEventIds === undefined || scannerEventIds.length === 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Scanner role requires at least one scannerEventIds entry",
    );
  }

  return { targetUid: raw.targetUid, roles, scannerEventIds };
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

  await auth.setCustomUserClaims(input.targetUid, {
    roles: input.roles,
    perms,
    scannerEventIds: input.scannerEventIds,
  });

  return { ok: true as const };
});
