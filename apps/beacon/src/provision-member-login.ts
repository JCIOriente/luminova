import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { requireAdmin } from "./callable-auth.js";

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

interface ProvisionUser {
  uid: string;
  email?: string;
  customClaims?: Record<string, unknown>;
}

export interface ProvisionDeps {
  getMember(memberId: string): Promise<Record<string, unknown> | null>;
  getUserByEmail(email: string): Promise<ProvisionUser | null>;
  createUser(email: string): Promise<ProvisionUser>;
  setClaims(uid: string, claims: ReturnType<typeof nextClaims>): Promise<void>;
  linkUid(memberId: string, uid: string): Promise<void>;
  passwordResetLink(email: string): Promise<string>;
}

/** Provision (or re-provision) a member's login. Refuses to relink a member whose
 *  stored uid does not match the Auth user its email resolves to — silently
 *  overwriting would orphan the old Auth account with its claims (possibly Admin)
 *  still live and no member doc backing them. Relinking after an email change is a
 *  deliberate console op. Same-uid re-provision stays allowed (resend invite). */
export async function provisionMember(
  deps: ProvisionDeps,
  memberId: string,
): Promise<{ email: string; actionLink: string }> {
  const member = await deps.getMember(memberId);
  if (member === null) throw new HttpsError("not-found", "member not found");
  if (member.active !== true) throw new HttpsError("failed-precondition", "member is not active");
  if (typeof member.email !== "string" || member.email.length === 0) {
    throw new HttpsError("failed-precondition", "member has no email");
  }
  const email = member.email;
  const linkedUid = typeof member.uid === "string" && member.uid.length > 0 ? member.uid : null;

  let user = await deps.getUserByEmail(email);
  if (linkedUid !== null && user?.uid !== linkedUid) {
    throw new HttpsError(
      "failed-precondition",
      "member is already linked to a different login; unlink it explicitly before re-provisioning",
    );
  }
  if (!user) user = await deps.createUser(email);
  const targetEmail = user.email ?? email;

  // Bootstrap the base Member claim; onMemberWritten (fired by the uid write below)
  // recomputes ['Member', ...trusted grants] from positions, healing pre-assigned
  // members. Both authorities share the same ['Member', ...] base — no conflict.
  await deps.setClaims(user.uid, nextClaims(user.customClaims as RawClaims | undefined, "Member"));
  await deps.linkUid(memberId, user.uid);
  const actionLink = await deps.passwordResetLink(targetEmail);

  return { email: targetEmail, actionLink } as const;
}

function ensureApp() {
  if (!getApps().length) initializeApp();
}

export const provisionMemberLogin = onCall(async (request) => {
  requireAdmin(request);
  const { memberId } = validateProvisionInput(request.data);
  ensureApp();
  const db = getFirestore();
  const auth = getAuth();

  return provisionMember(
    {
      getMember: async (id) => {
        const snap = await db.doc(`members/${id}`).get();
        return snap.exists ? (snap.data() as Record<string, unknown>) : null;
      },
      getUserByEmail: (email) => auth.getUserByEmail(email).catch(() => null),
      // Tolerate a concurrent create (a parallel invite would otherwise throw
      // auth/email-already-exists).
      createUser: (email) => auth.createUser({ email }).catch(() => auth.getUserByEmail(email)),
      setClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
      linkUid: async (id, uid) => {
        await db.doc(`members/${id}`).update({ uid });
      },
      passwordResetLink: (email) => auth.generatePasswordResetLink(email),
    },
    memberId,
  );
});
