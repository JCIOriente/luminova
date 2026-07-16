import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { requireAdmin } from "./callable-auth.js";
import { firestoreProvisionDeps } from "./provision-deps.js";
import { ensureApp } from "./runtime.js";

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

export interface ProvisionUser {
  uid: string;
  email?: string;
  customClaims?: Record<string, unknown>;
}

export interface ProvisionDeps {
  getMember(memberId: string): Promise<Record<string, unknown> | null>;
  getUserByEmail(email: string): Promise<ProvisionUser | null>;
  /** Null ONLY when the account does not exist — transient Auth errors must
   *  throw, or a blip would misread a live linked account as safely deleted. */
  getUserByUid(uid: string): Promise<ProvisionUser | null>;
  createUser(email: string): Promise<ProvisionUser>;
  setClaims(uid: string, claims: ReturnType<typeof nextClaims>): Promise<void>;
  linkUid(memberId: string, uid: string): Promise<void>;
  passwordResetLink(email: string): Promise<string>;
  /** Enqueue the branded invite email (via the Trigger Email extension). */
  sendInviteEmail(input: { to: string; name: string; actionLink: string }): Promise<void>;
}

/** Claims carried over when adopting an Auth account not currently linked to
 *  the member (fresh provision, or replacing a stale link whose account was
 *  deleted). An orphaned account may still hold org roles (even Admin) —
 *  only Member and Scanner (with its scannerEventIds; same email = same
 *  person, so event-scoped scan authority travels) survive. Everything else
 *  must be re-earned through claims-sync. */
function adoptedClaims(existing: RawClaims | undefined): RawClaims {
  const roles = Array.isArray(existing?.roles)
    ? existing.roles.filter((r) => r === "Member" || r === "Scanner")
    : [];
  return { roles, scannerEventIds: existing?.scannerEventIds };
}

/** Provision (or re-provision) a member's login. Refuses to relink a member whose
 *  stored uid does not match the Auth user its email resolves to — silently
 *  overwriting would orphan the old Auth account with its claims (possibly Admin)
 *  still live and no member doc backing them. Relinking after an email change is a
 *  deliberate console op. Same-uid re-provision stays allowed (resend invite).
 *  A failure after createUser leaves an unlinked Auth user — no compensation
 *  needed: the next run resolves it by email and adopts it (linkedUid null). */
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
    // The stored link points elsewhere. Only a still-live account can be
    // orphaned; if it was deleted out-of-band, relinking by email is the
    // self-heal, not a conflict.
    if ((await deps.getUserByUid(linkedUid)) !== null) {
      throw new HttpsError(
        "failed-precondition",
        "member is already linked to a different login; unlink it explicitly before re-provisioning",
        { reason: "linked-to-different-login" },
      );
    }
  }
  if (!user) user = await deps.createUser(email);
  const targetEmail = user.email ?? email;

  // Bootstrap the base Member claim; onMemberWritten (fired by the uid write below)
  // recomputes ['Member', ...trusted grants] from positions, healing pre-assigned
  // members. Both authorities share the same ['Member', ...] base — no conflict.
  // Adopting a not-currently-linked account de-elevates it first (see
  // adoptedClaims); a same-uid re-provision keeps merge semantics — those
  // claims are already claims-sync-owned.
  const existingClaims = user.customClaims as RawClaims | undefined;
  await deps.setClaims(
    user.uid,
    nextClaims(user.uid === linkedUid ? existingClaims : adoptedClaims(existingClaims), "Member"),
  );
  await deps.linkUid(memberId, user.uid);
  const actionLink = await deps.passwordResetLink(targetEmail);
  const name =
    typeof member.name === "string" && member.name.length > 0 ? member.name : targetEmail;
  await deps.sendInviteEmail({ to: targetEmail, name, actionLink });

  return { email: targetEmail, actionLink } as const;
}

export const provisionMemberLogin = onCall(async (request) => {
  requireAdmin(request);
  const { memberId } = validateProvisionInput(request.data);
  ensureApp();
  return provisionMember(firestoreProvisionDeps(getFirestore(), getAuth()), memberId);
});
