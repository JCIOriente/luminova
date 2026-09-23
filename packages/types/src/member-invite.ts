import type { Timestamp } from "firebase/firestore";

/** How long a minted link stays redeemable.
 *
 *  48 hours. THE LINK IS THE WHOLE CREDENTIAL — whoever holds it sets that member's password —
 *  and it travels through WhatsApp, where it persists in a chat history, in notification
 *  previews, and in whatever backup that phone syncs to. The window is the exposure, so it is
 *  sized to the operator flow and no longer: share it, the member opens it, done.
 *
 *  It was seven days, chosen so a Friday-afternoon send survived until Monday. That traded a
 *  five-day replay window for one weekend of convenience. Two days still covers an overnight
 *  and a next-day reminder, and re-issuing is one click — which also REVOKES the previous
 *  link, so a lapsed invite costs the operator a click and costs the member nothing.
 *
 *  Anything shorter starts failing the actual delivery channel: a link sent at 22:00 has to
 *  still work after a night's sleep and a working day. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** When the invite DOCUMENT is reaped by the Firestore TTL policy. Cleanup only: expiry is
 *  enforced in code against `expiresAt`, because TTL deletion is best-effort with up to ~24 h
 *  of lag. 90 days keeps used and revoked docs readable for audit past any plausible incident
 *  window, then stops the collection growing without bound.
 *
 *  DELIBERATELY UNCHANGED when the TTL above was shortened to 48 h. The two answer different
 *  questions: `expiresAt` is the security boundary, `purgeAt` is retention, and beacon computes
 *  `purgeAt` from `issuedAt` so the two never move together. A used or revoked invite document
 *  is not a credential — it is the record of who issued a login and when — so shrinking this
 *  would cost audit evidence and buy nothing. */
export const INVITE_PURGE_MS = 90 * 24 * 60 * 60 * 1000;

/** The rate ceilings on the two unauthenticated invite callables.
 *
 *  HERE, not in beacon, for the same reason `INVITE_TTL_MS` is here: the CLIENT needs these
 *  too. The redemption page tells a throttled invitee how long to wait, and it derives that
 *  from `windowMs / perTokenPerMinute` — so a hard-coded 12 on the client would be a second,
 *  silently drifting model of the server's refill rate. One source, imported by both ends.
 *
 *  Beacon builds its limiters from these (`apps/beacon/src/redeem-invite.ts`) and a test pins
 *  the resulting behaviour, so retuning a security-relevant ceiling shows up in the diff as a
 *  changed test rather than one edited digit. */
export const INVITE_RATE_LIMITS = {
  /** Calls per minute per token, PER CALLABLE — each has its own bucket. Tight, because a
   *  per-token bucket is structurally incapable of refusing a different invitee. A legitimate
   *  redemption is one `describeInvite` on load plus one `redeemInvite` on submit; five leaves
   *  room for a reload and a retry. */
  perTokenPerMinute: 5,
  /** Calls per minute per INSTANCE, endpoint-wide. The flood bound, and the one with SHARED
   *  FATE: exhausting it refuses every invitee, not just the caller who exhausted it.
   *
   *  Sized to bound COST, not availability, because availability is already bounded by
   *  `maxInstances` — and a tight ceiling here is actively harmful. At 60 this tripped at
   *  roughly ONE sustained request/second from a single source, which denied every invitee on
   *  the only onboarding path in the product: the limiter made a total outage far cheaper to
   *  cause than saturating the instance pool it nominally protects.
   *
   *  THE COST BOUND, stated PER INSTANCE because that is where the bucket lives: 600 admitted
   *  calls/minute times at most two keyed reads each — `loadValidInvite` reads the invite, then
   *  the member — is ~1,200 Firestore reads/minute on one instance. A flood of random tokens
   *  costs one read apiece rather than two, since an unknown token resolves to a nonexistent
   *  document and returns there. The whole-deployment figure multiplies by `maxInstances`,
   *  which lives in `apps/beacon/src/redeem-invite.ts` and cannot be seen from this package —
   *  quoting it here as though it were the single-instance number is exactly what an earlier
   *  draft did, and it is the same multiply the next paragraph refutes. Beacon owns it.
   *
   *  DO NOT read "per instance" as headroom that multiplies by `maxInstances` when sizing the
   *  DENIAL threshold. An earlier version put it near 100 req/s on that reasoning — the same
   *  arithmetic that made 60 look survivable — and the real figure is about 10 req/s
   *  sustained, the floor being one warm instance's 600/min.
   *
   *  The reason a flood does not simply buy itself more instances is LATENCY, not the absence
   *  of I/O. Cloud Run's concurrency signal is in-flight requests over the concurrency limit,
   *  and a refusal is in flight for microseconds, so by Little's law it takes thousands of
   *  requests per second to make a dent in 80 slots. State it that way and not as "a refusal
   *  touches no Firestore", which would equally "prove" that any zero-I/O endpoint has
   *  infinite headroom.
   *
   *  And NOT "never scales out": CPU utilization is an independent autoscaling signal, and a
   *  refusal is still TLS termination, JSON parsing and event-loop work. A large enough flood
   *  does add instances and does raise the aggregate ceiling — but that is already far past
   *  the point where onboarding is down, so ~10 req/s remains the number to alert on. It is a
   *  conservative FLOOR, not a guarantee, and `docs/firebase-setup.md` sets the request-rate
   *  alert just under it. Still far above a chapter that issues a handful of invites a week,
   *  but it is a total outage of the only onboarding path when it does trip, and it lands on
   *  legitimate invitees whose own per-token budgets are untouched.
   *
   *  The fix that would remove shared fate entirely, deliberately NOT taken here: charge this
   *  bucket only on the UNKNOWN/malformed-token outcomes and raise the cap well above 600. A
   *  holder of a valid token could then never be refused by it, while an enumeration flood is
   *  still cut. The cost is moving one keyed read ahead of the global decision, which is
   *  exactly what `rate-limit.ts`'s header argues against — so it is a design change with its
   *  own PR, not a tweak to smuggle in beside an App Check flip.
   *
   *  Deleting it outright was considered and rejected: `maxInstances` bounds CONCURRENCY, not
   *  sustained throughput, so it is a weak cost bound on its own. This is the only control in
   *  the design that bounds total reads over time. */
  globalPerMinute: 600,
  /** Distinct token buckets held per instance: a HARD memory bound, because a flood of
   *  distinct tokens is exactly what would otherwise grow one bucket per token. */
  tokenBuckets: 2048,
  windowMs: 60_000,
  /** One logged refusal per instance PER KEY per this interval, so a flood cannot bury the log
   *  stream the monitoring alert reads. The invite gate uses a single key; the token-verification
   *  bypass guard keys by callable, so its bound is this interval times its own `maxKeys`.
   *  Beacon-only, but kept with its siblings. */
  refusalLogIntervalMs: 10_000,
} as const;

/** Seconds an invitee should wait before a throttled retry can succeed: the per-token emission
 *  interval. DERIVED, never typed out — this is the number the invite page's copy promises. */
export const INVITE_RETRY_AFTER_SECONDS =
  INVITE_RATE_LIMITS.windowMs / INVITE_RATE_LIMITS.perTokenPerMinute / 1000;

/** Sustained requests/second at which the endpoint-wide bucket starts refusing EVERY invitee,
 *  on one warm instance. DERIVED for the same reason `INVITE_RETRY_AFTER_SECONDS` is: this
 *  figure was hand-written into prose in six places and was wrong in all six, twice. Its
 *  sibling — the one constant that WAS derived and tripwired — has never been wrong.
 *
 *  A conservative FLOOR, not a guarantee: see `globalPerMinute` above for why a flood does not
 *  simply buy itself more instances, and why "never scales out" would overstate it. */
export const INVITE_GLOBAL_DENIAL_PER_SECOND =
  INVITE_RATE_LIMITS.globalPerMinute / (INVITE_RATE_LIMITS.windowMs / 1000);

/** Firestore reads/minute the endpoint-wide bucket admits on ONE instance: every admitted call
 *  costs at most two keyed reads (`loadValidInvite` reads the invite, then the member).
 *
 *  Deliberately NOT the whole-deployment figure. That one multiplies by `maxInstances`, which
 *  is a Cloud Functions option living in `apps/beacon/src/redeem-invite.ts` and invisible from
 *  here — a docblock in this package cannot derive or verify it, which is exactly how an
 *  earlier draft came to quote the saturated-pool number as if it were this one. Beacon owns
 *  that figure, and a test there pins it. */
export const INVITE_GLOBAL_READS_PER_MINUTE = INVITE_RATE_LIMITS.globalPerMinute * 2;

export type InviteKind = "initial" | "recovery";

export type InviteStatus = "pending" | "used" | "revoked" | "failed";

/** Beacon-owned projection on `members/{id}.invite`, mirroring how `uid` is owned.
 *
 *  Clients never read `memberInvites` — the token hash must not be listable — so the three
 *  scalars the operator surfaces need are mirrored here, onto a document those surfaces
 *  already hold. No new query, no new cache key, no bundle delta.
 *
 *  `tokenHash` is deliberately present: it is an irreversible SHA-256 of 256 bits of CSPRNG
 *  output, not a credential, and it is what makes revocation a KEYED write instead of a
 *  collection query (guardrail #5) — which is what makes "at most one outstanding invite per
 *  member, revocable without a composite index" true by construction. */
export interface MemberInviteProjection {
  status: InviteStatus;
  kind: InviteKind;
  tokenHash: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  issuedBy: string;
  usedAt: Timestamp | null;
}

/** What the operator surfaces render. Two states are DERIVED, not stored:
 *
 *  - `expired` — `pending` past `expiresAt`. No write is needed for a link to go stale.
 *  - `legacy`  — `member.uid && !member.invite`: provisioned before this feature existed.
 *    Without it the ENTIRE existing roster reads "Sin invitar" on day one, which makes the
 *    new column useless at launch and invites operators to re-issue links for people who
 *    already have accounts — and for a delegate, each such re-issue is the D3 impersonation
 *    primitive. One derived branch, zero writes, no migration. */
export type InviteState =
  | "never"
  | "legacy"
  | "pending"
  | "used"
  | "expired"
  | "revoked"
  | "failed";
