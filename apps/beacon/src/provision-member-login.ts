import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isSafeDocId } from "./firestore-util.js";
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
  // isSafeDocId, not a hand-rolled subset: `..` and `__x__` build a valid ref and then fail at
  // get() with a permanent INVALID_ARGUMENT, which surfaces as `internal` (a 500) instead of
  // the invalid-argument this is meant to return.
  if (!isSafeDocId(raw.memberId)) {
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
  /** The cargo's grants, or null if missing. Only consulted to refuse a non-Admin
   *  provisioning of a POWER-SEATED member — see the power-seat guard. */
  getPositionGrants(cargoId: string): Promise<Role[] | null>;
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

/** Whether this member carries DIRECT grants — a custom role or a per-member override.
 *
 *  The second half of the privileged-member question. syncMemberClaims mints from two
 *  independent sources: trusted cargo grants become `roles`, and `roleIds` +
 *  `permissionOverrides` become `perms` (resolveMemberPerms). A guard that reads only the
 *  cargo half leaves the other wide open — and `roleIds`/`permissionOverrides` are exactly
 *  what the Admin-only panel writes, so "granted but not yet invited" is as ordinary a state
 *  as "seated but not yet invited".
 *
 *  Fail-closed on any shape that is not a clean empty: a present-but-unparseable `roleIds`
 *  must refuse, not read as "no grants". Absent and null are the genuine empties — the rules'
 *  unchanged()/touched() gap admits an explicit null, and parseMember resolves that to []. */
function hasDirectGrants(member: Record<string, unknown>): boolean {
  const roleIds = member.roleIds;
  if (roleIds !== undefined && roleIds !== null) {
    if (!Array.isArray(roleIds)) return true;
    if (roleIds.length > 0) return true;
  }
  const overrides = member.permissionOverrides;
  if (overrides === undefined || overrides === null) return false;
  // Array before the typeof: `typeof [] === "object"`, so a legacy/console
  // `permissionOverrides: ["manage:all"]` would reach `.grant === undefined` and read as
  // ungranted — failing OPEN, which is what the roleIds branch above refuses to do.
  if (Array.isArray(overrides) || typeof overrides !== "object") return true;
  const grant = (overrides as { grant?: unknown }).grant;
  if (grant === undefined || grant === null) return false;
  if (!Array.isArray(grant)) return true;
  return grant.length > 0;
}

/** Every cargo id in the member's positions map, for the power-seat guard.
 *
 *  EVERY term, not just the current one — and that is the point. `syncMemberClaims` reads
 *  `positions[currentTermKey()]` at TRIGGER time, so a future-term entry is invisible today
 *  and mints on the UTC-year rollover. All client write lanes are term-pinned
 *  (`positionsDelta().hasOnly()` on update, `keys().hasOnly()` on create, both binding Admins
 *  too), so such a map takes a console edit, an admin-SDK write or a legacy migration — the
 *  same reachability this file already fail-closes on for a malformed cargoId, and a
 *  console-authored next-term board slate is the more plausible of the two.
 *
 *  Yields:
 *    a usable id   — read its grants.
 *    ""            — present but unreadable (a non-object entry, a non-string or empty
 *                    cargoId, or an id `isSafeDocId` rejects). Deliberately NOT skipped: ""
 *                    fails `isSafeDocId` at the port too, so the guard refuses. A malformed
 *                    shape must never read as "no cargo" — that is the guard's own bypass.
 *  A genuinely absent cargo (no map, no entry, or `cargoId` absent/null) yields nothing, so an
 *  unseated member produces an empty list and the delegate may enrol them. */
function readCargoIds(member: Record<string, unknown>): string[] {
  const positions = member.positions;
  if (positions === undefined || positions === null) return [];
  if (typeof positions !== "object") return [""];
  const ids: string[] = [];
  for (const term of Object.values(positions as Record<string, unknown>)) {
    if (term === undefined || term === null) continue;
    if (typeof term !== "object") {
      ids.push("");
      continue;
    }
    const cargoId = (term as { cargoId?: unknown }).cargoId;
    if (cargoId === undefined || cargoId === null) continue;
    if (typeof cargoId !== "string" || cargoId.length === 0) {
      ids.push("");
      continue;
    }
    ids.push(isSafeDocId(cargoId) ? cargoId : "");
  }
  return [...new Set(ids)];
}

/** Provision (or re-provision) a member's login. Refuses to relink a member whose
 *  stored uid does not match the Auth user its email resolves to — silently
 *  overwriting would orphan the old Auth account with its claims (possibly Admin)
 *  still live and no member doc backing them. Relinking after an email change is a
 *  deliberate console op. Same-uid re-provision stays allowed (resend invite).
 *  A failure after createUser leaves an unlinked Auth user — no compensation needed FOR AN
 *  ADMIN: the next run resolves it by email and adopts it (linkedUid null). A delegate's retry
 *  is refused by the adoption guard below (`user !== null`), so a partial failure escalates
 *  that member to an Admin-only fix. Stated in the spec's operator notes too. */
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
  // POWER-SEAT GUARD. The check above asks whether this is a NEW login; it does not ask whose
  // member doc it is, and "unprovisioned" does not mean "enrolled by this delegate". Any
  // uid-less member is reachable, including one an Admin already seated on an Admin-granting
  // cargo — the normal state between being seated and being invited.
  //
  // Without this guard that is a clean escalation, and the delegate forges nothing: linkUid()
  // below fires onMemberWritten, resolveTrustedGrants reads the STORED assignedBy (a genuine
  // Admin), honors the grants, and mints Admin onto the uid this call just created. The
  // attacker then reaches that uid through the invite — either the returned actionLink, or,
  // if they also hold manage:Member, by rewriting members.email first (the rules do not pin
  // it) so the ordinary reset mail lands in their own inbox. Suppressing the link alone
  // therefore does NOT close it; the mint has to be refused at the source.
  //
  // Both halves of the claims-mint surface are checked, mirroring how syncMemberClaims splits
  // it: hasDirectGrants() for the roleIds/permissionOverrides -> perms path, and the cargo
  // read below for the grants -> roles path. Closing only one leaves the other reachable.
  //
  // Grant-free, un-granted members stay open: they mint nothing, so enrolling and inviting
  // them is exactly the flow this delegation exists for.
  if (!callerHoldsAdminRole) {
    // Direct grants first — no read required, and it is the half a cargo check cannot see.
    if (hasDirectGrants(member)) {
      throw new HttpsError(
        "permission-denied",
        "this member has been granted roles or permissions; only an Admin can provision their login",
        { reason: "granted-member-requires-admin" },
      );
    }
    for (const cargoId of readCargoIds(member)) {
      const grants = await deps.getPositionGrants(cargoId);
      if (grants === null || grants.length > 0) {
        throw new HttpsError(
          "permission-denied",
          "this member holds a cargo that confers permissions; only an Admin can provision their login",
          { reason: "power-seat-requires-admin" },
        );
      }
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
  // The link is generatePasswordResetLink's oobCode URL — a bearer credential for this
  // account. An Admin gets it as the manual fallback the invite drawer offers when the mail
  // fails; a delegate does not need it (the client sends the reset mail itself through the
  // unprivileged sendPasswordResetEmail) and must not hold it. Defence in depth behind the
  // power-seat guard, not a substitute for it.
  const actionLink = callerHoldsAdminRole ? await deps.passwordResetLink(targetEmail) : "";

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
