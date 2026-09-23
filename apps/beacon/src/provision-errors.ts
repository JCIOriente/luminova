import { HttpsError } from "firebase-functions/v2/https";
import type { InviteBlockReason, ProvisionBlockReason } from "@luminova/types";

/**
 * The tagged refusals `provisionMemberLogin` can be argued with, in a module BOTH the callable
 * and its adapter can import.
 *
 * They live here rather than in `provision-member-login.ts` to dissolve a genuine import cycle:
 * the port needs to raise the malformed-email refusal (Identity Toolkit rejects addresses the
 * shape screen cannot anticipate), and the callable needs the port. That cycle was safe only
 * because every cross-module reference sat inside a hoisted function body — one top-level
 * `const` reading across it, which is an ordinary-looking edit, would throw at module
 * evaluation, and `index.ts` pulls this graph into the shared entry, so it would take out every
 * trigger in the bundle at cold start. Nothing in the repo lints for cycles. Same move
 * `firestore-util.ts` already made for the log sinks.
 */

/** A refusal the CLIENT can name. `reason` is a cross-boundary contract owned by
 *  `@luminova/types` (PROVISION_BLOCK_REASONS) and consumed by backstage's message table —
 *  routing every tagged throw through this helper is what makes renaming one a compile
 *  error on both ends instead of a silent degradation to the generic fallback. */
export function provisionBlocked(
  code: "failed-precondition" | "permission-denied" | "not-found",
  message: string,
  reason: ProvisionBlockReason,
): HttpsError {
  return taggedRefusal(code, message, reason);
}

/** The same contract for the INVITE side. One factory, generic over the reason union, rather
 *  than a second byte-identical `new HttpsError(code, message, { reason })` in
 *  redeem-invite.ts — the write-side twin of the read-side consolidation
 *  `lib/callable-refusal.ts` made, and the drift class `firestore-util.ts`'s log-sink comment
 *  records from a prior incident. */
export function inviteBlocked(reason: InviteBlockReason, message: string): HttpsError {
  // Always `failed-precondition` — a transport DEFAULT, not a meaning. The client branches on the
  // tagged reason alone (`inviteRefusal` reads `details.reason` before any code), so this code is
  // inert on the wire and an unauthenticated caller learns nothing from it.
  //
  // It USED to carry a meaning — "this link cannot be used" — which is no longer true of every
  // reason: `invite-service-misconfigured` refuses BEFORE the token is claimed because the
  // SERVICE is wrong, so the link is untouched and the client's copy promises exactly that. Do
  // not reintroduce a code-based branch on the strength of the old reading.
  return taggedRefusal("failed-precondition", message, reason);
}

/** The rate-limit refusal. `resource-exhausted`, NOT `failed-precondition`: most other invite
 *  refusals mean "this link cannot be used" (`invite-service-misconfigured` is the other
 *  exception — see `inviteBlocked`), while this one means "not right now" —
 *  the link is fine and the same call succeeds seconds later. The distinction is load-bearing
 *  in two places: the client's retry affordance keys on the tagged reason, and a
 *  log-based alert on the callables wants to tell throttling apart from a broken link. */
export function inviteRateLimited(): HttpsError {
  return taggedRefusal(
    "resource-exhausted",
    "too many attempts; try again in a moment",
    "invite-too-many-attempts",
  );
}

function taggedRefusal(
  code: "failed-precondition" | "permission-denied" | "not-found" | "resource-exhausted",
  message: string,
  reason: ProvisionBlockReason | InviteBlockReason,
): HttpsError {
  return new HttpsError(code, message, { reason });
}

/** The stored email is unusable — absent, empty, wrong shape, or rejected by Identity Toolkit
 *  itself. One factory because the refusal is raised from TWO layers and must read identically
 *  from both: `provisionMember` screens the SHAPE up front, and the port tags the SEMANTIC
 *  rejection the shape screen cannot anticipate. `ADMIN_SDK_EMAIL_SHAPE` is a cheap pre-filter,
 *  never the sole guarantee — "a@.", ".a@b.co" and "a..b@c.co" each carry one `@`, no
 *  whitespace and no control characters, so they pass it AND the Admin SDK's own isEmail, reach
 *  the API, and come back auth/invalid-email. */
export function memberEmailMalformed(): HttpsError {
  return provisionBlocked(
    "failed-precondition",
    "member's stored email is missing or not a valid address; correct it before provisioning",
    "member-email-malformed",
  );
}
