import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";

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
    ? (existing.roles as unknown[]).filter((r): r is Role => isValidRole(r))
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
  const member = snap.data() as { email?: unknown; active?: unknown };
  if (member.active !== true) throw new HttpsError("failed-precondition", "member is not active");
  if (typeof member.email !== "string" || member.email.length === 0) {
    throw new HttpsError("failed-precondition", "member has no email");
  }
  const email = member.email;

  // Get-or-create the Auth user, tolerating a concurrent create (a parallel
  // invite would otherwise throw auth/email-already-exists).
  let user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) user = await auth.createUser({ email }).catch(() => auth.getUserByEmail(email));
  const targetEmail = user.email ?? email;

  // Bootstrap the base Member claim; onMemberWritten (fired by the uid write below)
  // recomputes ['Member', ...trusted grants] from positions, healing pre-assigned
  // members. Both authorities share the same ['Member', ...] base — no conflict.
  await auth.setCustomUserClaims(
    user.uid,
    nextClaims(user.customClaims as RawClaims | undefined, "Member"),
  );
  await db.doc(`members/${memberId}`).update({ uid: user.uid });
  const actionLink = await auth.generatePasswordResetLink(targetEmail);

  return { email: targetEmail, actionLink } as const;
});
