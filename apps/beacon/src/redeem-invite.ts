import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { HttpsError } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";
import { passwordPolicyViolations, passwordTooLong } from "@luminova/types/password-policy";
import type { InviteBlockReason, InviteKind, InviteStatus } from "@luminova/types";
import { accountIsPrivileged, hasDirectGrants, readCargoIds } from "./invite-guards.js";
import { hashInviteToken, isSafeTokenHash } from "./invite-token.js";
import { inviteBlocked } from "./provision-errors.js";
import { firestoreRedeemDeps } from "./redeem-deps.js";
import { ensureApp } from "./runtime.js";

/** The invite document, with its Timestamps already flattened to epoch ms by the port. */
export interface InviteDoc {
  memberId: string;
  /** The Auth account this link may write to, PINNED at issue. */
  uid: string;
  /** `member.email` verbatim at issue. */
  email: string;
  kind: InviteKind;
  issuedBy: string;
  /** Exempts this link from the privilege re-check below. */
  issuedByAdmin: boolean;
  issuedAtMs: number;
  expiresAtMs: number;
  status: InviteStatus;
}

interface RedeemUser {
  uid: string;
  /** The ACCOUNT's own address, which the console can change independently of the member doc. */
  email?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}

export interface RedeemDeps {
  now(): number;
  getInvite(tokenHash: string): Promise<InviteDoc | null>;
  getMember(memberId: string): Promise<Record<string, unknown> | null>;
  getUserByUid(uid: string): Promise<RedeemUser | null>;
  getPositionGrants(cargoId: string): Promise<Role[] | null>;
  /** Flip `pending -> used` TRANSACTIONALLY. The transaction is also the mutual-exclusion
   *  primitive for two tabs racing: the loser sees a non-pending status.
   *
   *  `ClaimStatus`, not `InviteStatus`: two of the ways a claim loses have no stored status to
   *  report — the document was purged mid-flight, or it expired between the pre-read and the
   *  transaction. Widening the PORT is what lets the adapter name them, and what makes
   *  CLAIM_REFUSALS' `expired`/`gone` keys reachable instead of decorative. */
  claimInvite(tokenHash: string, nowMs: number): Promise<{ claimed: boolean; status: ClaimStatus }>;
  /** The token is spent but the Auth write failed. A distinct state, not `used`: otherwise it
   *  renders green and the operator has no reason to re-issue while the member has no
   *  password. */
  markInviteFailed(tokenHash: string): Promise<void>;
  setPassword(uid: string, password: string): Promise<void>;
}

/** The generic refusal. DELIBERATELY indistinguishable for an unknown or malformed token —
 *  that is the only state reachable without already holding a real 256-bit token. */
function inviteInvalid(): HttpsError {
  return inviteBlocked("invite-invalid", "this invite link is not valid");
}

/** One structured line per call. Never the token, never the password, never `request.data`.
 *  `tokenPrefix` is the first 8 hex chars of the HASH — enough to correlate an issue with its
 *  redemption in Cloud Logging, and not a credential. */
function logOutcome(fn: string, tokenHash: string, outcome: string, memberId?: string): void {
  console.info("invite", {
    fn,
    memberId: memberId ?? null,
    tokenPrefix: tokenHash.slice(0, 8),
    outcome,
  });
}

function tokenHashOf(token: unknown): string | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 512) return null;
  const hash = hashInviteToken(token);
  return isSafeTokenHash(hash) ? hash : null;
}

/** Everything both callables must agree on, in ONE place so the validity rules cannot drift.
 *
 *  Covers the INVITE DOCUMENT and the MEMBER DOCUMENT: describeInvite needs the member doc
 *  anyway (for `name`), so running those refusals there too means the invitee learns a link is
 *  dead before typing a password rather than after. The cost is one extra keyed read on an
 *  unauthenticated endpoint — bounded, and it writes nothing.
 *
 *  What it deliberately does NOT cover, so this comment cannot outgrow the code: the three
 *  AUTH-DIRECTORY refusals (`invite-account-changed` on a vanished account,
 *  `invite-account-disabled`, and the privilege re-check) live in `redeemInviteFor` alone.
 *  Each needs an Auth lookup, and one needs a positions read — real cost on an unauthenticated
 *  READ endpoint, for refusals that must be correct at the moment of the WRITE anyway. The
 *  consequence is honest and accepted: those three surface on submit, not on load. */
async function loadValidInvite(
  deps: RedeemDeps,
  token: unknown,
  fn: string,
): Promise<{ tokenHash: string; invite: InviteDoc; member: Record<string, unknown> }> {
  const tokenHash = tokenHashOf(token);
  if (tokenHash === null) {
    console.info("invite", { fn, memberId: null, tokenPrefix: null, outcome: "malformed-token" });
    throw inviteInvalid();
  }

  const invite = await deps.getInvite(tokenHash);
  if (invite === null) {
    logOutcome(fn, tokenHash, "unknown-token");
    throw inviteInvalid();
  }

  // Expired / used / revoked keep their own tags: you cannot reach any of them without
  // already holding a real token, so the response confirms only what the caller possesses —
  // and it is what makes the page actionable rather than a dead end.
  if (invite.status === "used") throw refuse(fn, tokenHash, invite, "invite-used", "already used");
  if (invite.status === "revoked")
    throw refuse(fn, tokenHash, invite, "invite-revoked", "superseded by a newer link");
  if (invite.status === "failed")
    throw refuse(fn, tokenHash, invite, "invite-update-failed", "a previous attempt failed");
  if (invite.expiresAtMs <= deps.now())
    throw refuse(fn, tokenHash, invite, "invite-expired", "expired");

  const member = await deps.getMember(invite.memberId);
  if (member === null)
    throw refuse(fn, tokenHash, invite, "invite-member-missing", "member no longer exists");
  if (member.active !== true)
    throw refuse(fn, tokenHash, invite, "invite-member-inactive", "member is not active");

  // Normalized on BOTH sides. Identity Toolkit lower-cases what it stores while
  // firestore.rules never constrains members.email, so a CSV paste can leave `Ana@JCI.bo` on
  // the ficha. Comparing raw would make every invite for a mixed-case address dead on arrival.
  const memberEmail = typeof member.email === "string" ? member.email.trim().toLowerCase() : null;
  if (memberEmail === null || memberEmail !== invite.email.trim().toLowerCase())
    throw refuse(fn, tokenHash, invite, "invite-email-changed", "the member's address changed");

  // The uid is pinned at issue precisely so a stale link cannot write a password onto a
  // DIFFERENT account after an out-of-band relink.
  if (member.uid !== invite.uid)
    throw refuse(fn, tokenHash, invite, "invite-account-changed", "the member's account changed");

  return { tokenHash, invite, member };
}

function refuse(
  fn: string,
  tokenHash: string,
  invite: InviteDoc,
  reason: InviteBlockReason,
  message: string,
): HttpsError {
  logOutcome(fn, tokenHash, reason, invite.memberId);
  return inviteBlocked(reason, message);
}

/** The three privilege guards, re-run at redemption.
 *
 *  The token is a bearer credential valid for seven days, so every guard `issueMemberInvite`
 *  ran evaluated the authorization question at the instant the link was minted. Without this:
 *  day 1 a delegate issues a recovery link for a grant-free member (D3's intent); day 3 an
 *  Admin seats them on Tesorero and claims-sync mints the role; day 4 the delegate redeems the
 *  token they kept and is Tesorero. The same shape works on an initial invite.
 *
 *  Exempt when the invite was issued by an Admin: an Admin is subject to none of these at
 *  issue, so re-imposing them here would break the Admin's own recovery path — the in-product
 *  remedy for a locked-out Admin. */
async function memberBecamePrivileged(
  deps: RedeemDeps,
  invite: InviteDoc,
  member: Record<string, unknown>,
  user: RedeemUser,
): Promise<boolean> {
  if (invite.issuedByAdmin) return false;
  if (hasDirectGrants(member)) return true;
  if (accountIsPrivileged(user.customClaims)) return true;
  for (const cargoId of readCargoIds(member)) {
    const grants = await deps.getPositionGrants(cargoId);
    // Fail closed: an unreadable cargo counts as power-conferring, exactly as at issue.
    if (grants === null || grants.length > 0) return true;
  }
  return false;
}

/** The outcomes a lost claim can report: every stored status, plus the two that have none —
 *  the document is gone, or it expired against the transaction's own read. */
export type ClaimStatus = InviteStatus | "expired" | "gone";

/** How a lost claim maps to what the invitee is told. `pending` cannot appear (the claim
 *  would have succeeded) but is listed so the record stays exhaustive over the union. */
const CLAIM_REFUSALS: Readonly<Record<ClaimStatus, InviteBlockReason>> = {
  pending: "invite-invalid",
  used: "invite-used",
  revoked: "invite-revoked",
  failed: "invite-update-failed",
  expired: "invite-expired",
  gone: "invite-invalid",
};

export interface DescribeInviteResult {
  email: string;
  name: string;
  expiresAt: number;
}

/** What the invitee sees before setting a password. Read-only: it does NOT consume the token.
 *
 *  The full address, unmasked — the token holder is the intended recipient, and showing it is
 *  how they confirm the operator sent the right link. Masking protects nobody who could simply
 *  redeem it. Neither callable accepts an email, so there is no address-to-token oracle. */
export async function describeInviteFor(
  deps: RedeemDeps,
  data: { token: unknown },
): Promise<DescribeInviteResult> {
  const { tokenHash, invite, member } = await loadValidInvite(deps, data.token, "describeInvite");
  logOutcome("describeInvite", tokenHash, "ok", invite.memberId);
  return {
    // Normalized, exactly as the redemption comparison normalizes it. Showing the raw pinned
    // value would render "  Ana@JCI.bo " for a CSV-pasted ficha while the account Identity
    // Toolkit actually holds is `ana@jci.bo` — and the whole reason the address is shown
    // unmasked is so the invitee can verify it.
    email: invite.email.trim().toLowerCase(),
    name: typeof member.name === "string" ? member.name : "",
    expiresAt: invite.expiresAtMs,
  };
}

export async function redeemInviteFor(
  deps: RedeemDeps,
  data: { token: unknown; password: unknown },
): Promise<{ ok: true; email: string }> {
  const fn = "redeemInvite";
  const { tokenHash, invite, member } = await loadValidInvite(deps, data.token, fn);

  const user = await deps.getUserByUid(invite.uid);
  if (user === null)
    throw refuse(fn, tokenHash, invite, "invite-account-changed", "the account no longer exists");
  if (user.disabled === true)
    throw refuse(fn, tokenHash, invite, "invite-account-disabled", "the account is disabled");
  // The last leg of the identity-changed table. member.uid and member.email are both pinned
  // above, but the AUTH account's own address can be changed from the console — and then the
  // password would land on an account whose address is not the one describeInvite showed the
  // invitee. Normalized, and only when the account actually carries one.
  if (
    typeof user.email === "string" &&
    user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()
  )
    throw refuse(fn, tokenHash, invite, "invite-email-changed", "the account's address changed");

  if (await memberBecamePrivileged(deps, invite, member, user)) {
    throw refuse(
      fn,
      tokenHash,
      invite,
      "invite-member-now-privileged",
      "this member now holds permissions; an administrator must issue the link",
    );
  }

  // SERVER-SIDE policy, and checked BEFORE the claim so a typo does not burn the link.
  // Claiming a policy a direct callable invocation bypasses would be guardrail #6.
  if (passwordPolicyViolations(data.password).length > 0 || passwordTooLong(data.password))
    throw refuse(fn, tokenHash, invite, "invite-password-weak", "the password is too weak");
  const password = data.password as string;

  // CLAIM FIRST, then write the password. auth.updateUser is not transactional with Firestore,
  // so one of two failure modes must be chosen: a crash after claiming burns the token (an
  // annoyance with a one-click operator remedy), while a crash after updateUser would leave a
  // LIVE token and a set password — a replay window. We take the annoyance.
  const claim = await deps.claimInvite(tokenHash, deps.now());
  if (!claim.claimed) {
    // Lost the race, or the state moved under us between the pre-read and the transaction.
    // Each outcome keeps its own tag — telling someone their link was "superseded" when it
    // actually expired sends them to the wrong remedy.
    const reason: InviteBlockReason = CLAIM_REFUSALS[claim.status];
    throw refuse(fn, tokenHash, invite, reason, "this link can no longer be claimed");
  }

  try {
    // Redemption EVICTS EXISTING SESSIONS: updateUser bumps tokensValidAfterTime exactly as
    // revokeRefreshTokens does. Load-bearing — a recovery that left the previous holder's
    // session live would not be a recovery. Stated so a refactor cannot quietly lose it.
    await deps.setPassword(invite.uid, password);
  } catch (err) {
    // Never a silent catch (guardrail #4). The error object only — never the password.
    console.error("invite redemption failed after the token was claimed", {
      fn,
      memberId: invite.memberId,
      tokenPrefix: tokenHash.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    await deps.markInviteFailed(tokenHash);
    throw refuse(
      fn,
      tokenHash,
      invite,
      "invite-update-failed",
      "the password could not be set; ask for a new link",
    );
  }

  logOutcome(fn, tokenHash, "redeemed", invite.memberId);
  return { ok: true, email: invite.email };
}

// THE PROJECT'S FIRST UNAUTHENTICATED CALLABLES.
//
// enforceAppCheck is FALSE, and the reason is NOT the one an earlier draft of the spec gave.
// That draft said the reCAPTCHA keys do not exist in production; they do —
// `apps/backstage/.env.production` carries a real VITE_APPCHECK_SITE_KEY, and `ensureApp()`
// wires `initAppCheck` unconditionally, so a prod backstage build already sends a token.
// Leaving a justification in the code that the repository refutes would be guardrail #6.
//
// The REAL reason it is still false: App Check enforcement is per-PRODUCT, and
// docs/firebase-setup.md records it as enabled for Firestore and Storage only — Cloud
// Functions is not confirmed. Flipping it here without first confirming the backstage app is
// registered for Functions, and without testing /invitacion against a real build, would 403
// every redemption. That failure is silent and total: this is now the ONLY onboarding path,
// so a misconfigured deploy locks out every new member with no error anyone sees.
//
// So it is a deliberate, staged flip with a named precondition — not an absent control. The
// owner-op is in docs/firebase-setup.md; these two are the first functions to flip.
//
// maxInstances is both the control and the lever. Brute force is arithmetic, not a threat
// (2^256, and a guess resolves to a nonexistent document — one read, no write). The real
// exposure is billing and availability: the same cap that stops a flood consuming the project
// budget means a trivial flood saturates the pool, so genuine invitees get 429/503 on the only
// onboarding path that now exists. That is a trade, not a mitigation — hence the GCP budget
// alert in the operator notes.
const UNAUTHENTICATED_CALL = {
  enforceAppCheck: false,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: "256MiB",
} as const;

export const describeInvite = onCall(UNAUTHENTICATED_CALL, async (request) => {
  ensureApp();
  const data = (request.data ?? {}) as { token?: unknown };
  return describeInviteFor(firestoreRedeemDeps(getFirestore(), getAuth()), { token: data.token });
});

export const redeemInvite = onCall(UNAUTHENTICATED_CALL, async (request) => {
  ensureApp();
  const data = (request.data ?? {}) as { token?: unknown; password?: unknown };
  return redeemInviteFor(firestoreRedeemDeps(getFirestore(), getAuth()), {
    token: data.token,
    password: data.password,
  });
});
