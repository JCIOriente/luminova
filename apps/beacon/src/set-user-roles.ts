import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { ROLES, isValidRole, type Role } from "@luminova/auth/roles";

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

function adminAuth() {
  if (!getApps().length) initializeApp();
  return getAuth();
}

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles)
    ? (token.roles as unknown[]).filter((role): role is string => typeof role === "string")
    : [];
}

export const setUserRoles = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }

  const input = validateSetRolesInput(request.data);

  if (input.targetUid === request.auth.uid) {
    throw new HttpsError("permission-denied", "cannot modify your own roles");
  }

  await adminAuth().setCustomUserClaims(input.targetUid, {
    roles: input.roles,
    scannerEventIds: input.scannerEventIds,
  });

  return { ok: true as const };
});
