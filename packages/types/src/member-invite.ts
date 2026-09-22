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
