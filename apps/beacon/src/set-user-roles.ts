import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";

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
  for (const role of raw.roles) {
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", `unknown role: ${String(role)}`);
    }
  }
  const roles = raw.roles as Role[];

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
    scannerEventIds = raw.scannerEventIds as string[];
  }

  return { targetUid: raw.targetUid, roles, scannerEventIds };
}

function adminAuth() {
  if (!getApps().length) initializeApp();
  return getAuth();
}

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles) ? (token.roles as string[]) : [];
}

export const setUserRoles = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }

  const input = validateSetRolesInput(request.data);

  await adminAuth().setCustomUserClaims(input.targetUid, {
    roles: input.roles,
    scannerEventIds: input.scannerEventIds,
  });

  return { ok: true as const };
});
