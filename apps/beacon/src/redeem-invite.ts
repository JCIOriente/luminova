import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { HttpsError } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";
import { passwordPolicyViolations, passwordTooLong } from "@luminova/types/password-policy";
import type { InviteBlockReason, InviteKind, InviteStatus } from "@luminova/types";
import { accountIsPrivileged, hasDirectGrants, readCargoIds } from "./invite-guards.js";
import { hashInviteToken, isSafeTokenHash } from "./invite-token.js";
import { inviteBlocked, inviteRateLimited } from "./provision-errors.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
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

/** Exported so test fakes bind to the PORT instead of hand-copying its shape. The private
 *  version drifted: a fake's local copy omitted `email`, so the three account-address tests
 *  passed an excess property that only ran correctly because test files were excluded from
 *  typecheck. */
export interface RedeemUser {
  uid: string;
  /** The ACCOUNT's own address, which the console can change independently of the member doc. */
  email?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}

/** The two rate buckets in front of an unauthenticated callable, injected so a test exercises
 *  the REAL limiter rather than a stub that always admits.
 *
 *  Two keys, sized for opposite jobs:
 *
 *  - `admitToken` is TIGHT, and it is the SAFE key: a per-token bucket can only ever refuse
 *    the token that is being hammered, never a different invitee's.
 *  - `admitGlobal` is GENEROUS, and it is the EFFECTIVE key: a flood of DISTINCT random
 *    tokens gets a fresh per-token bucket every time (and thrashes the LRU, see
 *    `rate-limit.ts`), so the endpoint-wide bucket is the only thing that bounds it.
 *
 *  Sizing the global one tightly would be a self-inflicted outage on the only onboarding path
 *  there is: three invites opened in the same minute plus a reload and a retry would exhaust a
 *  5-per-minute endpoint budget with no abuse at all, and the refusal would land on real
 *  invitees with no operator remedy. */
export interface RateGate {
  /** The endpoint-wide bucket. Charged FIRST and unconditionally — before the token is even
   *  hashed — so a flood of malformed junk cannot bypass it. */
  admitGlobal(nowMs: number): boolean;
  /** The per-token bucket, keyed on the HASH and never the plaintext token. */
  admitToken(tokenHash: string, nowMs: number): boolean;
}

export interface RedeemDeps {
  now(): number;
  /** Consulted before ANY I/O. Part of the port, not a defaulted parameter: a default that
   *  admits everything would let a test pass while running no limiter at all. */
  gate: RateGate;
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
  // ONE timestamp for the whole invocation: the two buckets and the expiry comparison must
  // not disagree about when "now" is.
  const nowMs = deps.now();

  // BEFORE the hash and before any read. The order is the point: this is the bucket that
  // bounds a flood, and a refusal here must cost strictly less than the work it prevents —
  // an integer comparison against a number in memory, no Firestore access, no write.
  if (!deps.gate.admitGlobal(nowMs)) {
    console.info("invite", {
      fn,
      memberId: null,
      tokenPrefix: null,
      outcome: "rate-limited-global",
    });
    throw inviteRateLimited();
  }

  const tokenHash = tokenHashOf(token);
  if (tokenHash === null) {
    console.info("invite", { fn, memberId: null, tokenPrefix: null, outcome: "malformed-token" });
    throw inviteInvalid();
  }

  // Also before the read. Charged on the HASH: keying an in-memory map by the plaintext token
  // would put the bearer credential in the heap, which is the one property this whole design
  // rests on not doing.
  if (!deps.gate.admitToken(tokenHash, nowMs)) {
    logOutcome(fn, tokenHash, "rate-limited-token");
    throw inviteRateLimited();
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
  if (invite.expiresAtMs <= nowMs) throw refuse(fn, tokenHash, invite, "invite-expired", "expired");

  const member = await deps.getMember(invite.memberId);
  if (member === null)
    throw refuse(fn, tokenHash, invite, "invite-member-missing", "member no longer exists");
  // `active` AND `status`. They are SEPARATE fields with separate writers: setStatus writes
  // only `status` (Activo/Inactivo/Desafiliado), softDelete writes only `active`. So an
  // expelled member keeps `active: true`, and checking `active` alone let a link issued before
  // the expulsion still mint them a working login days after the board removed them —
  // `invite-member-inactive`'s own contract says it covers "deactivated OR desafiliado".
  if (member.active !== true || member.status === "Desafiliado")
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
 *  The token is a bearer credential valid for 48 hours, so every guard `issueMemberInvite`
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
// Anyone who knows the URL can invoke these; an invitee has no account yet, so that is
// inherent rather than an oversight. Three controls stand in front of them.
//
// 1. APP CHECK, now ENFORCED. The earlier draft of the spec said the reCAPTCHA keys were
//    missing in production; that was false — `apps/backstage/.env.production` carries a real
//    VITE_APPCHECK_SITE_KEY. It was also NOT blocked by "/invitacion has no session":
//    attestation is app-level, `/invitacion` is deliberately a TOP-LEVEL route outside the
//    `_auth` layout, and the client's `ensureApp()` wires `initAppCheck` on first app
//    acquisition — which `getFunctionsService()` goes through. So an unauthenticated
//    /invitacion load does attest.
//
//    ENFORCEMENT IS PER-PRODUCT, and that is the live risk. See the blocking owner-op in
//    docs/firebase-setup.md: the backstage app must be registered for the Cloud Functions
//    product and /invitacion tested against a real build BEFORE this deploys. Get it wrong
//    and every redemption 403s — silently, totally, on the only onboarding path there is.
//
// 2. THE RATE GATE, below. App Check bounds WHO may call; it does not bound HOW OFTEN. A
//    standard App Check token lives ~30 minutes and is replayable, so harvesting one from the
//    public page and flooding with it stays open with enforcement on. The two are
//    complementary, not alternatives, which is why both ship.
//
// 3. maxInstances, which is both a control and a lever: it caps billing but converts a cost
//    problem into an availability one, since a flood that saturates the pool blocks real
//    invitees. The rate gate is what makes that trade cheaper — a throttled request is
//    refused on an integer comparison, before it can occupy an instance doing Firestore reads.
//
// Brute-forcing the token itself remains arithmetic rather than a threat: 2^256, and a guess
// resolves to a nonexistent document id — one read, no write, no secret comparison anywhere.
/** App Check enforcement: ON in production, OFF under the emulator.
 *
 *  `enforceAppCheck` is enforced BY firebase-functions ITSELF, not by the App Check service.
 *  `common/providers/https.js` reads the `X-Firebase-AppCheck` header and throws
 *  `unauthenticated` when `app === "MISSING"` — and the MISSING branch returns BEFORE the
 *  `FIREBASE_DEBUG_MODE` / `skipTokenVerification` escape, so a debug token cannot rescue a
 *  request that carries no header at all.
 *
 *  Local dev leaves `VITE_APPCHECK_SITE_KEY` blank on purpose (docs/firebase-setup.md), so the
 *  client initializes no App Check and sends no header. Enforcing unconditionally would make
 *  `/invitacion` — the one route a developer most needs to exercise, and the only onboarding
 *  path in the product — impossible to run against the emulator.
 *
 *  KEYED ON `FUNCTIONS_EMULATOR`, verified rather than assumed: firebase-tools sets it only in
 *  the emulator (`functionsEmulator.js`: `envs.FUNCTIONS_EMULATOR = "true"`), while the
 *  deploy-time discovery run that resolves these options sets `FUNCTIONS_CONTROL_API` and NOT
 *  this. So a real deploy resolves this to `true`. That is load-bearing and silent if it ever
 *  changes, so a test pins BOTH branches — enforcing under the emulator breaks local
 *  onboarding, and failing to enforce in production removes the control. */
const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== "true";

export const UNAUTHENTICATED_CALL = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: "256MiB",
} as const;

/** The agreed ceilings, EXPORTED so a test can pin them.
 *
 *  Not a tautological restatement of two literals: the test builds a real gate from this
 *  object and asserts the 6th call on a token and the 61st on the endpoint are refused. What
 *  it buys is that retuning a security-relevant ceiling shows up in the diff as a changed
 *  test, rather than as one silently edited digit. */
export const INVITE_RATE_LIMITS = {
  /** Calls per minute per TOKEN. Tight, because it is structurally incapable of refusing a
   *  different invitee. A legitimate redemption is one `describeInvite` on page load plus one
   *  `redeemInvite` on submit; five leaves room for a reload and a retry, and the bucket
   *  refills one slot every 12 s so a refusal clears in seconds, not at a window boundary. */
  perTokenPerMinute: 5,
  /** Calls per minute per INSTANCE, endpoint-wide. Generous on purpose — see `RateGate`. This
   *  is the flood bound, and it must sit well above any realistic legitimate burst; sizing it
   *  down to the per-token figure would deny real invitees on the only onboarding path. */
  globalPerMinute: 60,
  /** Distinct token buckets held per instance. At ~300 bytes per entry (a 64-char hex key plus
   *  Map overhead and a number) this is well under a megabyte against a 256MiB instance, and
   *  it is a HARD bound: the flood this limiter exists to survive is precisely the one that
   *  would otherwise grow a bucket per distinct token until the instance died. */
  tokenBuckets: 2048,
  windowMs: 60_000,
} as const;

/** One gate per callable.
 *
 *  Each gen2 function is its own Cloud Run service, so there is no cross-callable state to
 *  share even in principle — `describeInvite` and `redeemInvite` never run in the same
 *  process. Separate gates also mean a reload-happy invitee spending the describe budget
 *  cannot starve the redeem budget on the same token. */
export function createRateGate(): RateGate {
  const perToken: RateLimiter = createRateLimiter({
    capacity: INVITE_RATE_LIMITS.perTokenPerMinute,
    windowMs: INVITE_RATE_LIMITS.windowMs,
    maxKeys: INVITE_RATE_LIMITS.tokenBuckets,
  });
  const global: RateLimiter = createRateLimiter({
    capacity: INVITE_RATE_LIMITS.globalPerMinute,
    windowMs: INVITE_RATE_LIMITS.windowMs,
    maxKeys: 1,
  });
  return {
    admitGlobal: (nowMs) => global.tryConsume("*", nowMs),
    admitToken: (tokenHash, nowMs) => perToken.tryConsume(tokenHash, nowMs),
  };
}

// MODULE SCOPE, deliberately: the buckets must outlive a single invocation to mean anything,
// and a warm instance is the only thing that carries them. A cold start resets them, which is
// the honest limit of an in-process limiter — the ceiling is "per minute PER INSTANCE, times
// however many instances are warm", bounded by maxInstances above and never a global figure.
const describeGate = createRateGate();
const redeemGate = createRateGate();

export const describeInvite = onCall(UNAUTHENTICATED_CALL, async (request) => {
  ensureApp();
  const data = (request.data ?? {}) as { token?: unknown };
  const deps = { ...firestoreRedeemDeps(getFirestore(), getAuth()), gate: describeGate };
  return describeInviteFor(deps, { token: data.token });
});

export const redeemInvite = onCall(UNAUTHENTICATED_CALL, async (request) => {
  ensureApp();
  const data = (request.data ?? {}) as { token?: unknown; password?: unknown };
  const deps = { ...firestoreRedeemDeps(getFirestore(), getAuth()), gate: redeemGate };
  return redeemInviteFor(deps, {
    token: data.token,
    password: data.password,
  });
});
