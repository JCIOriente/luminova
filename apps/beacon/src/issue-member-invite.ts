import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isSafeDocId } from "./firestore-util.js";
import {
  ADOPTABLE_ROLES,
  accountIsPrivileged,
  hasDirectGrants,
  readCargoIds,
} from "./invite-guards.js";
import { isSafeTokenHash, mintInviteToken } from "./invite-token.js";
import { hasToMillis, logWarn } from "./firestore-util.js";
import { INVITE_PURGE_MS, INVITE_TTL_MS } from "@luminova/types/member-invite";
import type { InviteKind } from "@luminova/types";
import { memberEmailMalformed, provisionBlocked } from "./provision-errors.js";
import { callerIsAdmin, requireAdminOrPerm } from "./callable-auth.js";
import { firestoreInviteDeps } from "./provision-deps.js";
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

// provisionBlocked / memberEmailMalformed live in ./provision-errors.js — the port raises the
// malformed-email refusal too, and keeping the factories here made provision-deps.ts and this
// module a two-node import cycle.

/** The Admin SDK's OWN email predicate (`validator.isEmail`: `/^[^@]+@[^@]+$/`), plus the one
 *  tightening that is strictly safe: no whitespace, no control characters.
 *
 *  Deliberately not an RFC-ish pattern — a stricter one would start rejecting addresses
 *  Firebase happily accepts, which is a worse failure than the one being fixed. But `[^@]`
 *  matches `\n`, `\r`, `\t`, spaces and NUL, so `"pres@jci.bo\n"` and `"a b@jci.bo"` pass BOTH
 *  this screen and the SDK's client-side check and reach Identity Toolkit, which rejects them.
 *  `firestore.rules` never constrains `members.email`, so a CSV paste or any `update:Member`
 *  holder can store one.
 *
 *  This is a PRE-FILTER, not the guarantee. The port tags Identity Toolkit's own
 *  `auth/invalid-email` with the same reason (see ./provision-errors.js), so a shape that slips
 *  through — `a@.`, `.a@b.co` — no longer surfaces as an opaque `internal`. The screen still
 *  earns its keep: it refuses one round-trip earlier, never puts a junk address on the Auth
 *  API, and makes the refusal identical whether or not Identity Toolkit happens to reject that
 *  particular shape. */
const ADMIN_SDK_EMAIL_SHAPE = /^[^@\s\p{C}]+@[^@\s\p{C}]+$/u;

export interface ProvisionUser {
  uid: string;
  email?: string;
  customClaims?: Record<string, unknown>;
  /** Nothing in beacon disables accounts, so a true here is a CONSOLE containment measure.
   *  Minting a link for one would report success and flip the badge green while the member
   *  gets auth/user-disabled at login with no explanation. */
  disabled?: boolean;
}

/** What `issueMemberInvite` hands back. The link itself is assembled CLIENT-side from
 *  `window.location.origin` — beacon has no configuration surface for a base URL, and one
 *  would be wrong in the emulator and in previews.
 *
 *  `emailSent` / `fallbackLink` / `mailError` are deliberately gone: they encoded "mail
 *  primary, link fallback" as an invariant, and after this change the link is the ONLY
 *  delivery mechanism — always shown, never a fallback. */
export interface InviteResult {
  email: string;
  /** The bearer credential, returned exactly once and never stored in plaintext. */
  token: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Whether a still-pending link was revoked to mint this one. Drives the operator copy —
   *  this is the visible half of our advantage over a Firebase oobCode, which invalidates the
   *  previously-sent code silently with no record and no way to tell the operator. */
  replacedPreviousLink: boolean;
}

/** The three writes that must land together, as ONE port.
 *
 *  Not three deps the caller sequences: revoking the old invite, creating the new one and
 *  updating `members/{id}.invite` touch three documents, and a partial failure leaves a
 *  PENDING invite whose token the operator has already pasted into WhatsApp with the
 *  projection still pointing at the old revoked hash. Nothing could ever revoke that orphan —
 *  there is no `where` query on memberInvites, firestore.rules denies all client access, and
 *  the only key into the collection no longer points at it. It would stay redeemable for the
 *  full 48 hours.
 *
 *  Expressing it as a single port makes atomicity STRUCTURAL rather than asserted: there is
 *  no way to write these documents separately, so a unit test counting mock calls is not what
 *  the guarantee rests on. The adapter commits one `db.batch()`. */
export interface InviteCommit {
  memberId: string;
  /** The still-pending invite to revoke, by document id. Null on a first issue. */
  revokeTokenHash: string | null;
  revokedBy: string;
  tokenHash: string;
  invite: {
    memberId: string;
    /** The Auth account this link may write to, PINNED at issue. Load-bearing: it is what
     *  stops a stale link from setting a password on a DIFFERENT account after an
     *  out-of-band relink. */
    uid: string;
    /** `member.email` verbatim at issue. Compared at redemption after trim().toLowerCase()
     *  on both sides — Identity Toolkit lower-cases what it stores while firestore.rules
     *  never constrains members.email, so a CSV paste can leave `Ana@JCI.bo` on the ficha.
     *  Getting this wrong makes every invite for a mixed-case address dead on arrival. */
    email: string;
    kind: InviteKind;
    issuedBy: string;
    /** Whether the issuer held the Admin role. Required: it is what exempts an Admin-issued
     *  link from the privilege re-check at redemption. An Admin is subject to none of these
     *  guards at issue, so re-imposing them at redemption would break the Admin's own
     *  recovery path. */
    issuedByAdmin: boolean;
    issuedAtMs: number;
    expiresAtMs: number;
    purgeAtMs: number;
  };
}

export interface InviteDeps {
  getMember(memberId: string): Promise<Record<string, unknown> | null>;
  getUserByEmail(email: string): Promise<ProvisionUser | null>;
  /** Null ONLY when the account does not exist — transient Auth errors must
   *  throw, or a blip would misread a live linked account as safely deleted. */
  getUserByUid(uid: string): Promise<ProvisionUser | null>;
  createUser(email: string): Promise<ProvisionUser>;
  setClaims(uid: string, claims: ReturnType<typeof nextClaims>): Promise<void>;
  linkUid(memberId: string, uid: string): Promise<void>;
  /** Revoke + mint + project, as ONE atomic batch. See InviteCommit. */
  commitInvite(commit: InviteCommit): Promise<void>;
  /** Injected so expiry is testable without freezing the clock globally. */
  now(): number;
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
  const allowed = new Set<unknown>(ADOPTABLE_ROLES);
  const roles = Array.isArray(existing?.roles) ? existing.roles.filter((r) => allowed.has(r)) : [];
  return { roles };
}

/** Issue an access link for a member: create the Auth account if they have none, link the
 *  uid, set the base Member claim, revoke any outstanding link, and mint a new single-use
 *  token.
 *
 *  Refuses to relink a member whose stored uid does not match the Auth user its email
 *  resolves to — silently overwriting would orphan the old Auth account with its claims
 *  (possibly Admin) still live and no member doc backing them.
 *
 *  A failure after createUser leaves an unlinked Auth user. No compensation is needed FOR AN
 *  ADMIN: the next run resolves it by email and adopts it. A delegate's retry is refused by
 *  the adoption branch, so a partial failure escalates that member to an Admin-only fix. */
export async function issueInvite(
  deps: InviteDeps,
  memberId: string,
  /** The caller's uid — stamped on the invite as `issuedBy`, which is what makes delegated
   *  recovery auditable rather than silent. */
  issuedBy: string,
  /** Whether the CALLER holds the Admin role. Defaults to false: a new call site must opt
   *  INTO the privileged path, never inherit it by omission. */
  callerHoldsAdminRole = false,
): Promise<InviteResult> {
  const member = await deps.getMember(memberId);
  // TAGGED, not bare. An untagged throw carries no `details.reason`, so
  // provisionRefusalMessage returns null and the operator gets the generic "No se pudo generar
  // el enlace de acceso." on every retry with nothing naming the remedy — verbatim the dead
  // end PROVISION_BLOCK_REASONS exists to remove, as the comment below already argues.
  if (member === null) throw provisionBlocked("not-found", "member not found", "member-not-found");
  // Both fields, for the reason loadValidInvite spells out: setStatus and softDelete write
  // different keys, so an expelled member keeps `active: true`. Without the status half the
  // row menu happily offered "Invitar acceso" for a Desafiliado member and beacon minted them
  // a fresh 48-hour bearer link.
  if (member.active !== true || member.status === "Desafiliado")
    throw provisionBlocked("failed-precondition", "member is not active", "member-not-active");
  // Shape-screened BEFORE it reaches the Auth SDK, for the same reason cargoId and assignedBy
  // are screened in claims-sync: a stored value the SDK rejects throws a PERMANENT
  // auth/invalid-email. That used to reach the caller as an opaque `internal`, leaving the
  // member unprovisionable with no hint why; the port now tags that case with this same reason,
  // so this check is the cheap first line rather than the only one. firestore.rules
  // deliberately does not shape-validate `email` on the admin write lane, so the shape reaches
  // here unchecked.
  //
  // ONE check, not a separate untagged "member has no email" above it. That one threw with no
  // `details.reason`, so the UI degraded it to the generic "no se pudo" — verbatim the dead end
  // PROVISION_BLOCK_REASONS exists to remove — and it SHADOWED this tagged one for the
  // empty-string case, which is the likelier of the two (memberDocSchema's `email` is a bare
  // z.string()). Absent, empty and malformed all have the same operator remedy: fix the ficha.
  if (typeof member.email !== "string" || !ADMIN_SDK_EMAIL_SHAPE.test(member.email)) {
    throw memberEmailMalformed();
  }
  const email = member.email;
  const linkedUid = typeof member.uid === "string" && member.uid.length > 0 ? member.uid : null;

  let user = await deps.getUserByEmail(email);
  // Captured BEFORE createUser: it is what distinguishes a first issue from a recovery.
  const hadLoginAlready = user !== null;
  if (linkedUid !== null && user?.uid !== linkedUid) {
    // The stored link points elsewhere. Only a still-live account can be
    // orphaned; if it was deleted out-of-band, relinking by email is the
    // self-heal, not a conflict.
    if ((await deps.getUserByUid(linkedUid)) !== null) {
      throw provisionBlocked(
        "failed-precondition",
        "member is already linked to a different login; unlink it explicitly before re-provisioning",
        "linked-to-different-login",
      );
    }
  }
  // THE ADOPTION / RECOVERY / SELF-HEAL SWITCH — the boundary that makes create:MemberLogin
  // delegable at all. EXHAUSTIVE over (user, linkedUid) on purpose: a two-way split is the
  // trap, because the self-heal quadrant would match NEITHER branch and fall straight through
  // to createUser -> fresh uid -> linkUid onto the existing member doc, by a delegate.
  //
  //   user !== null, linkedUid === null                 ADOPTION   Admin-only (unchanged)
  //   user !== null, linkedUid !== null, uid  === linked RECOVERY  delegate-allowed (D3)
  //   user !== null, linkedUid !== null, uid !== linked  caught above by the relink guard,
  //                                                      or adoption of a stale link
  //   user === null, linkedUid !== null                 SELF-HEAL  Admin-only
  //   user === null, linkedUid === null                 INITIAL    delegate-allowed
  //
  // ADOPTION stays Admin-only because NOTHING upstream ties members.email to the person:
  // firestore.rules constrains totalPoints, uid, publicProfile, name, roleIds and positions
  // on the create arm, never `email`, and no uniqueness check exists anywhere. A
  // create:Member + create:MemberLogin holder could file a member doc carrying a sitting
  // Admin's email and reach the writes below — adoptedClaims() stripping that Admin's claims,
  // linkUid() binding the Admin's uid to the attacker's member doc, and a token handing over
  // the account.
  //
  // RECOVERY is now open to a delegate — D3, chosen deliberately. Relaxing it does NOT reopen
  // adoption: the takeover works by making members.email point at someone ELSE's account,
  // which is by construction `user.uid !== linkedUid` and lands in the relink guard above.
  //
  // SELF-HEAL stays Admin-only. The member doc carries a uid but no Auth account resolves,
  // because the account was deleted out of band. The escalation happens to be closed by the
  // power-seat and hasDirectGrants guards (a fresh account carries no claims), but that is
  // luck, not design — pinned explicitly, and tested.
  if (!callerHoldsAdminRole) {
    const isRecovery = linkedUid !== null && user !== null && user.uid === linkedUid;
    const isInitial = linkedUid === null && user === null;
    if (!isRecovery && !isInitial) {
      throw provisionBlocked(
        "permission-denied",
        "this member's login cannot be linked or adopted by a delegate; only an Admin can",
        "reprovision-requires-admin",
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
    // attacker then reaches that uid through the invite — the returned token IS the credential
    // now, so there is no longer even a "suppress the link for a delegate" half-measure to fall
    // back on. The mint has to be refused at the source.
    //
    // Both halves of the claims-mint surface are checked, mirroring how syncMemberClaims splits
    // it: hasDirectGrants() for the roleIds/permissionOverrides -> perms path, and the cargo
    // read below for the grants -> roles path. Closing only one leaves the other reachable.
    //
    // Grant-free, un-granted members stay open: they mint nothing, so enrolling and inviting
    // them is exactly the flow this delegation exists for.
    // Direct grants first — no read required, and it is the half a cargo check cannot see.
    if (hasDirectGrants(member)) {
      throw provisionBlocked(
        "permission-denied",
        "this member has been granted roles or permissions; only an Admin can provision their login",
        "granted-member-requires-admin",
      );
    }
    for (const cargoId of readCargoIds(member)) {
      const grants = await deps.getPositionGrants(cargoId);
      if (grants === null || grants.length > 0) {
        throw provisionBlocked(
          "permission-denied",
          "this member holds a cargo that confers permissions; only an Admin can provision their login",
          "power-seat-requires-admin",
        );
      }
    }
    // THE GUARD THE MEMBER-DOC CHECKS CANNOT COVER. Both checks above read the member
    // DOCUMENT; recovery targets a live Auth ACCOUNT, which can carry claims the document does
    // not explain — an orphaned Admin claim, or claims minted before a cargo was removed
    // (syncMemberClaims does not recompute on cargo removal until the next member write).
    if (user !== null && accountIsPrivileged(user.customClaims)) {
      throw provisionBlocked(
        "permission-denied",
        "this member's account holds elevated claims; only an Admin can issue their link",
        "privileged-account-requires-admin",
      );
    }
  }
  // OUTSIDE the non-Admin block, deliberately: this is not a delegation guard. A disabled
  // account is a console containment measure, and minting a link for one reports success and
  // flips the badge amber-pending for an account nobody can sign into — the operator sends a
  // credential they were told works, and the invitee only discovers otherwise at redemption,
  // where `invite-account-disabled` fires after the fact. That is just as wrong when an Admin
  // does it, and ProvisionUser.disabled's own contract states it with no Admin carve-out.
  if (user?.disabled === true) {
    throw provisionBlocked(
      "failed-precondition",
      "this member's account is disabled; review it before issuing a link",
      "account-disabled-requires-admin",
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

  // Revoke the outstanding link, mint the new one, and project the state — ONE batch. See
  // InviteCommit for why this cannot be three calls.
  //
  // Revocation needs no query and no composite index: `members/{id}.invite.tokenHash` points
  // at the one outstanding invite, so we revoke exactly that document BY KEY.
  //
  // "At most one outstanding invite per member" holds for SEQUENTIAL issues, NOT concurrently.
  // `member` was read non-transactionally above, and commitInvite is a batch with no
  // precondition on members/{id}: two overlapping issues for the same member both observe the
  // same pending hash, both revoke it, and mint two live tokens. The loser's document is left
  // `pending` with nothing naming it — no `where` query on memberInvites, no client lane in
  // firestore.rules, and the projection now points at the winner — so it stays redeemable for
  // its full 48 hours and cannot be revoked by key.
  //
  // Not closed here: the fix is a transaction with a member-doc read precondition, which is a
  // redesign of this write path and is tracked as follow-up work. The window is one operator
  // clicking while another's call is in flight; each surface guards its own `isPending`, so it
  // takes two operators or two tabs. Recorded rather than left as a false absolute.
  const issuedAtMs = deps.now();
  const previousHash = pendingInviteHash(member, memberId, issuedAtMs);
  const { token, tokenHash } = mintInviteToken();
  await deps.commitInvite({
    memberId,
    revokeTokenHash: previousHash,
    revokedBy: issuedBy,
    tokenHash,
    invite: {
      memberId,
      uid: user.uid,
      email: targetEmail,
      // Whether a usable Auth account ALREADY existed, not whether a uid was stored. The two
      // disagree on exactly the quadrants the switch above separates: ADOPTION (an account
      // exists, the member doc is unlinked) is a recovery for a person who may already have a
      // password, and SELF-HEAL (a uid is stored but the account was deleted) mints a brand-new
      // account and is therefore a first issue. Audit-trail label only — nothing gates on it.
      kind: hadLoginAlready ? "recovery" : "initial",
      issuedBy,
      issuedByAdmin: callerHoldsAdminRole,
      issuedAtMs,
      expiresAtMs: issuedAtMs + INVITE_TTL_MS,
      purgeAtMs: issuedAtMs + INVITE_PURGE_MS,
    },
  });

  return {
    email: targetEmail,
    token,
    expiresAt: issuedAtMs + INVITE_TTL_MS,
    replacedPreviousLink: previousHash !== null,
  };
}

/** The still-pending invite's document id, or null if there is nothing to revoke.
 *
 *  Only `pending` is revoked: rewriting a `used` doc would destroy its `usedAt` audit trail,
 *  and a `revoked`/`failed` one is already spent. */
function pendingInviteHash(
  member: Record<string, unknown>,
  memberId: string,
  now: number,
): string | null {
  const invite = member.invite;
  if (invite === undefined || invite === null) return null;
  if (typeof invite !== "object" || Array.isArray(invite)) {
    // Not silently ignored (guardrail #4): a malformed projection means we cannot name the
    // outstanding token, so if one is live it is unreachable by key. Break-glass is a console
    // sweep on memberInvites.memberId, which is stored for exactly this reason.
    logWarn("invite projection is malformed; cannot revoke a prior link by key", { memberId });
    return null;
  }
  const { status, tokenHash, expiresAt } = invite as {
    status?: unknown;
    tokenHash?: unknown;
    expiresAt?: unknown;
  };
  if (status !== "pending") return null;
  // An expired link needs no revoking — it is already unusable — and claiming we revoked one
  // would put "el anterior fue revocado" in front of the operator about a link that died days
  // ago. It also keeps the common re-issue off a document the TTL policy may already have
  // reaped.
  if (hasToMillis(expiresAt) && expiresAt.toMillis() <= now) return null;
  if (!isSafeTokenHash(tokenHash)) {
    logWarn("pending invite carries an unusable tokenHash; cannot revoke it by key", { memberId });
    return null;
  }
  return tokenHash;
}

// Delegable per docs/specs/invite-link-onboarding.md: an Admin may hand `create:MemberLogin`
// to whoever is enrolling members, then revoke it.
//
// WHAT THAT PERMISSION NOW MEANS. Before this change the invite mail was explicitly "not the
// privileged part" — it was a client-side sendPasswordResetEmail any signed-in user could
// call. After it there is no mail at all and THE LINK IS THE WHOLE CREDENTIAL, so a delegate
// who can issue one for an already-provisioned member can become that member. That residual is
// deliberate (D3) and contained to grant-free, unseated, unprivileged members by the guards
// above, re-checked at redemption. It is auditable, not prevented: the invite records issuedBy
// and the projection surfaces it to the member themselves.
export const issueMemberInvite = onCall(async (request) => {
  requireAdminOrPerm(request, "create:MemberLogin", "issueMemberInvite");
  const { memberId } = validateProvisionInput(request.data);
  // requireAdminOrPerm throws `unauthenticated` on a missing auth context, so uid is present.
  const issuedBy = request.auth?.uid ?? "";
  ensureApp();
  return issueInvite(
    firestoreInviteDeps(getFirestore(), getAuth()),
    memberId,
    issuedBy,
    callerIsAdmin(request),
  );
});
