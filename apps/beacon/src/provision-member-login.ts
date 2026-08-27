import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { callerIsAdmin, requireAdminOrPerm } from "./callable-auth.js";
import { firestoreProvisionDeps } from "./provision-deps.js";
import { ensureApp } from "./runtime.js";

export interface ProvisionInput {
  memberId: string;
}

interface RawClaims {
  roles?: unknown;
}

export function validateProvisionInput(data: unknown): ProvisionInput {
  const raw = (data ?? {}) as { memberId?: unknown };
  if (typeof raw.memberId !== "string" || raw.memberId.length === 0 || raw.memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required");
  }
  return { memberId: raw.memberId };
}

/** Merge a role into existing custom claims without clobbering other roles. */
export function nextClaims(existing: RawClaims | undefined, role: Role): { roles: Role[] } {
  const current = Array.isArray(existing?.roles)
    ? (existing.roles as unknown[]).filter((r): r is Role => isValidRole(r))
    : [];
  const roles = current.includes(role) ? current : [...current, role];
  return { roles };
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
}

/** Claims carried over when adopting an Auth account not currently linked to
 *  the member (fresh provision, or replacing a stale link whose account was
 *  deleted). An orphaned account may still hold org roles (even Admin) —
 *  only Member and Scanner survive. Everything else must be re-earned through
 *  claims-sync. */
function adoptedClaims(existing: RawClaims | undefined): RawClaims {
  const roles = Array.isArray(existing?.roles)
    ? existing.roles.filter((r) => r === "Member" || r === "Scanner")
    : [];
  return { roles };
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
  /** Whether the CALLER holds the Admin role. A `create:MemberLogin` delegate does not, and
   *  is confined to the new-account path below — see the adoption guard. Defaults to false:
   *  a new call site must opt INTO the privileged path, never inherit it by omission. */
  callerHoldsAdminRole = false,
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
  // ADOPTION GUARD — the boundary that makes create:MemberLogin delegable at all.
  //
  // Adoption is the branch where an Auth account already exists for this email and is not
  // the one this member is linked to. For an Admin it is the documented recovery op. For a
  // delegate it would be an account-takeover primitive, because NOTHING upstream ties
  // members.email to the person: firestore.rules constrains totalPoints, uid, publicProfile,
  // name, roleIds and positions on the create arm, never `email`, and no uniqueness check
  // exists anywhere. So a create:Member + create:MemberLogin holder could file a member doc
  // carrying a sitting Admin's email and reach the three writes below — adoptedClaims()
  // stripping that Admin's claims, linkUid() binding the Admin's uid to the attacker's
  // member doc through the admin SDK (the only path that can write members.uid at all), and
  // passwordResetLink() handing back a reset link for the Admin's mailbox.
  //
  // A non-Admin therefore gets exactly ONE shape: mint a brand-new Auth account for a member
  // that has none. Not "anything but adoption" — the RESEND path is just as dangerous and was
  // the first draft's hole. `passwordResetLink` below is `generatePasswordResetLink`, which
  // returns the oobCode URL TO THE CALLER; that is categorically different from
  // `sendPasswordResetEmail`, which delivers the secret to the mailbox owner and is already
  // unprivileged. So a delegate allowed to "resend" an invite for an ALREADY-LINKED member
  // could name the president's memberId, take the returned link, set a password and sign in
  // as them — no adoption involved, every existing guard satisfied.
  //
  // Hence both halves: no pre-existing account for this email (`user === null`) AND no
  // pre-existing link (`linkedUid === null`). Costs the delegation nothing — a genuinely new
  // member has neither — and leaves resend/adoption/self-heal to an Admin, plus the
  // client-side sendPasswordResetEmail any member can already use on their own address.
  if (!callerHoldsAdminRole && (user !== null || linkedUid !== null)) {
    throw new HttpsError(
      "permission-denied",
      "this member already has a login; only an Admin can re-provision or link one",
      { reason: "reprovision-requires-admin" },
    );
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

  return { email: targetEmail, actionLink } as const;
}

// Delegable per docs/specs/board-seat-delegation.md: an Admin may hand `create:MemberLogin`
// to whoever is enrolling members, then revoke it. What the code gates is Auth account
// creation, uid linking and the initial claim write — NOT the invite email, which is a plain
// client-side sendPasswordResetEmail any signed-in user can already call.
export const provisionMemberLogin = onCall(async (request) => {
  requireAdminOrPerm(request, "create:MemberLogin");
  const { memberId } = validateProvisionInput(request.data);
  ensureApp();
  return provisionMember(
    firestoreProvisionDeps(getFirestore(), getAuth()),
    memberId,
    callerIsAdmin(request),
  );
});
