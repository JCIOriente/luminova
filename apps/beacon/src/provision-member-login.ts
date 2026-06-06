import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";

export interface ProvisionInput {
  memberId: string;
}

interface RawClaims {
  roles?: unknown;
  scannerEventIds?: unknown;
}

export function validateProvisionInput(data: unknown): ProvisionInput {
  const raw = (data ?? {}) as { memberId?: unknown };
  if (typeof raw.memberId !== "string" || raw.memberId.length === 0 || raw.memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required");
  }
  return { memberId: raw.memberId };
}

/** Merge a role into existing custom claims without clobbering other roles or
 *  scannerEventIds. */
export function nextClaims(
  existing: RawClaims | undefined,
  role: Role,
): { roles: Role[]; scannerEventIds?: string[] } {
  const current = Array.isArray(existing?.roles)
    ? (existing.roles as unknown[]).filter((r): r is Role => typeof r === "string")
    : [];
  const roles = current.includes(role) ? current : [...current, role];
  const scannerEventIds = Array.isArray(existing?.scannerEventIds)
    ? (existing.scannerEventIds as unknown[]).filter((s): s is string => typeof s === "string")
    : undefined;
  return scannerEventIds ? { roles, scannerEventIds } : { roles };
}

function ensureApp() {
  if (!getApps().length) initializeApp();
}

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles)
    ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
    : [];
}

export const provisionMemberLogin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "sign-in required");
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
  const { memberId } = validateProvisionInput(request.data);
  ensureApp();
  const db = getFirestore();
  const auth = getAuth();

  const snap = await db.doc(`members/${memberId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "member not found");
  const member = snap.data() as { email?: string; active?: boolean };
  if (member.active === false) throw new HttpsError("failed-precondition", "member is inactive");
  const email = member.email;
  if (!email) throw new HttpsError("failed-precondition", "member has no email");

  const user = await auth.getUserByEmail(email).catch(() => null);
  const uid = user ? user.uid : (await auth.createUser({ email })).uid;
  const existing = (user?.customClaims ?? undefined) as RawClaims | undefined;
  await auth.setCustomUserClaims(uid, nextClaims(existing, "Member"));
  await db.doc(`members/${memberId}`).update({ uid });
  const actionLink = await auth.generatePasswordResetLink(email);

  return { email, actionLink } as const;
});
