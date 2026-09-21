import { HttpsError } from "firebase-functions/v2/https";
import type { ProvisionBlockReason } from "@luminova/types";

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
  code: "failed-precondition" | "permission-denied",
  message: string,
  reason: ProvisionBlockReason,
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
