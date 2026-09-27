import { HttpsError } from "firebase-functions/v2/https";
import { INVITE_RATE_LIMITS } from "@luminova/types/member-invite";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";

/** `true` only under the Firebase emulator, which is the ONE environment allowed to run with
 *  token verification disabled.
 *
 *  Fail-closed, and it must stay that way: ABSENCE of the variable means "this is real". Do not
 *  "improve" this into a positive check for a production marker like `K_SERVICE`, which would
 *  fail OPEN the day that variable is renamed — and `K_SERVICE` in particular is not even a
 *  production marker at all: firebase-tools sets it under the emulator too. Only the emulator
 *  sets `FUNCTIONS_EMULATOR`
 *  (`functionsEmulator.js`: `envs.FUNCTIONS_EMULATOR = "true"`); the deploy-time discovery run
 *  does not, and no build-time process can reach it, because it is read in-process at container
 *  cold start.
 *
 *  EXPORTED, and `redeem-invite.ts`'s `ENFORCE_APP_CHECK` is derived from it rather than reading
 *  the variable a second time. Two names survive because they answer different questions — "may
 *  this instance skip attestation?" versus "may it trust a decoded token?" — but there is now one
 *  read, so a third consumer cannot introduce a third spelling of the comparison. */
export const UNDER_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

/** Whether firebase-functions would accept SELF-CRAFTED, UNSIGNED tokens on this process right
 *  now — BOTH an Auth ID token and an App Check token. One flag defeats both.
 *
 *  THE SCOPE IS THE WHOLE TRUST BOUNDARY, not the invite endpoints: the same
 *  `isDebugFeatureEnabled("skipTokenVerification")` is consulted TWICE in
 *  `common/providers/https.js` of the installed firebase-functions 7.2.5 —
 *
 *    - `checkAppCheckToken` decodes the `X-Firebase-AppCheck` header with
 *      `unsafeDecodeAppCheckToken` instead of verifying it, and
 *    - `checkAuthToken` swaps `getAuth().verifyIdToken(idToken)` for `unsafeDecodeIdToken`,
 *      which is a JWT_REGEX shape test, a base64 decode of the payload, and `uid = sub`. NO
 *      signature check.
 *
 *  `checkAuthToken` then sets `ctx.auth = { uid, token }` and returns `"VALID"`, so the
 *  `tokenStatus.auth === "INVALID"` throw never fires. `callable-auth.ts` — beacon's only
 *  authorization gate — reads its role and permission claims straight off that payload, so
 *  `Authorization: Bearer <base64 header>.<base64 {"sub":"x","roles":["Admin"]}>.<junk>`
 *  satisfies `requireAdmin`. That reaches `setUserRoles` and `reseedBuiltInRolePerms`, i.e.
 *  custom-claim assignment and a project-wide role reseed.
 *
 *  It is STRICTLY WORSE on the authenticated callables than on the invite pair, because none of
 *  those sets `enforceAppCheck`, so it defaults falsy and there is no attestation gate there to
 *  lose — the forged claim is the only gate, and this flag is exactly what breaks it.
 *
 *  THE PREDICATE IS THE REAL CONDITION, NOT THE PRESENCE OF THE KEYS, and the asymmetry with
 *  `.github/scripts/assert-deployed-env-clean.sh` — which bans the keys at ANY value — is
 *  deliberate in both directions. That script reads a deployed service's env from OUTSIDE the
 *  process, where it cannot evaluate three consumers' truthiness rules and where no key in this
 *  family belongs at any value. This runs INSIDE the process, where the condition is exactly
 *  computable, and where a false positive refuses real traffic. `FIREBASE_DEBUG_MODE=false`, or
 *  `=true` with no parseable features object, is provably inert — refusing on it would be a
 *  self-inflicted outage. Do not "simplify" this into a presence check to match the shell
 *  script; `token-verification-bypass.test.ts` pins the inert cases against the REAL library.
 *
 *  READ PER CALL, never hoisted to module scope: `build.mjs` bundles every trigger into one
 *  `dist/index.js`, so a module-scope throw would crash-loop all 17 of beacon's triggers for a
 *  defect in the callable trust boundary. */
export function tokenVerificationBypassEnabled(): boolean {
  if (process.env.FIREBASE_DEBUG_MODE !== "true") return false;
  let features: unknown;
  try {
    features = JSON.parse(process.env.FIREBASE_DEBUG_FEATURES ?? "");
  } catch {
    // Not a silent catch (guardrail #4): an unparseable value is the NORMAL negative case —
    // `debug.js` swallows the same throw and returns `{}` — so there is nothing to report.
    return false;
  }
  // `=== null` is a DELIBERATE DIVERGENCE from `debug.js`, which checks only
  // `typeof obj !== "object"` and therefore lets `null` through to `null[feat]`. There that
  // TypeError is thrown inside `checkAppCheckToken`'s own try/catch and degrades to
  // `"INVALID"` — fail-CLOSED, so returning `false` here grants nothing. Without this line the
  // same input would throw out of THIS function and 500 every guarded call instead. A test row
  // pins it; do not "simplify to match the library exactly".
  if (typeof features !== "object" || features === null) return false;
  return Boolean((features as Record<string, unknown>).skipTokenVerification);
}

/** One line per callable per interval per instance — NOT one per request, and NOT one per
 *  process.
 *
 *  A latch (log once, ever) would be wrong for the same reason the
 *  invite gate's `shouldLogRefusal` docblock already gives: "throttling must stay visible, and a
 *  long flood must not go silent after its first line." That argument is STRONGER here, because
 *  in this state 100% of guarded traffic is refused and `logOutcome` never runs — this line is
 *  the only evidence that exists, and a log-based alert cannot be armed on an event that fires
 *  once per container at cold start. Keyed by `fn` so the endpoint under attack is named, and
 *  `maxKeys` bounds the map against an unbounded key space. */
const logs: RateLimiter = createRateLimiter({
  capacity: 1,
  // IMPORTED, not a second literal. One refusal-log cadence across beacon, canonical in
  // @luminova/types — whose own docblock calls it beacon-wide rather than invite-specific. A
  // retyped 10_000 here would sit outside the tripwire that lists every site quoting it.
  windowMs: INVITE_RATE_LIMITS.refusalLogIntervalMs,
  maxKeys: 16,
});

/** The operator-facing string. Exported so the alert in `docs/firebase-setup.md` and the test
 *  both name the SAME text — a log-based alert keyed on a string a refactor can silently
 *  reword is an alert that stops firing without telling anyone. */
export const BYPASS_LOG_MESSAGE =
  "REFUSING traffic: FIREBASE_DEBUG_MODE + skipTokenVerification make this instance accept " +
  "UNSIGNED Auth and App Check tokens. Remove both from the service environment.";

/** Refuse the call outright while the bypass is live. PREVENTION, where
 *  `assert-deployed-env-clean.sh` only DETECTS post-deploy — and it needs no gcloud, no region
 *  assumption and no service list.
 *
 *  Called from ONE place, `guardedOnCall` (`guarded-on-call.ts`), as the first statement of the
 *  handler it registers — so the refusal precedes every claim read, every rate-gate charge, every
 *  read and every write. That wrapper is the only way to declare a callable in beacon, which is
 *  what makes the coverage structural:
 *
 *    - eslint.config.js bans `onCall`, `onCallGenkit`, the `https` namespaces that carry them and
 *      v1's `runWith`/`region` builders everywhere in `apps/beacon/src` except the wrapper; and
 *    - `guarded-on-call.test.ts` drives `.run` on every callable export of `index.ts` under a live
 *      bypass and asserts each one's exact refusal and log line — the backstop for what lint
 *      cannot see (an `eslint-disable`, a dynamic import).
 *
 *  The claim readers in `callable-auth.ts` therefore carry no guard of their own, and
 *  `callerIsAdmin` is module-private so its answer is reachable only through a gate.
 *
 *  GATED ON THE EMULATOR, so local dev is untouched: `FIREBASE_DEBUG_MODE=true` is the supported
 *  way to run the emulator, and there is no verification to bypass there anyway.
 *
 *  This covers TWO of the three keys `assert-deployed-env-clean.sh` bans. `FUNCTIONS_EMULATOR`
 *  cannot be covered from inside the process — keying on it is what turns the guard off — for the
 *  reasons `UNDER_EMULATOR` documents above. For that key the post-deploy assertion is the only
 *  DEPLOY-TIME control; it does not see a value set on the service between releases. Its service
 *  list is ENUMERATED in `deploy.yml` and PINNED by a test against `index.ts`'s callable exports,
 *  so a new callable turns that test red until the YAML names it. The other signal for it is
 *  per-container and already shipping: `index.ts` logs `enforceAppCheck` at every cold start, and
 *  it reads `false` if and only if that variable is set. */
export function assertTokenVerificationNotBypassed(
  fn: string,
  /** The error to raise, so each boundary keeps its own contract. Defaults to an UNTAGGED
   *  `internal`, which is right for the authenticated callables: backstage's admin surface has no
   *  per-reason message table for them, and an operator reads the log line, not the toast.
   *
   *  The INVITE callables pass a tagged `invite-service-misconfigured` instead. CANONICAL
   *  STATEMENT of why, since the other sites point here rather than restate it: a bare
   *  `functions/internal` is ALSO what an uncaught transient failure produces — a Firestore
   *  `unavailable` inside `getInvite`, say — and the two need OPPOSITE client affordances. Retry
   *  now for the transient one; never for this one, which lasts as long as the container. An
   *  untagged refusal renders "revisa tu conexión" under a retry button that cannot clear it. Parameterized rather than duplicated so the emulator gate, the predicate
   *  and the sampled log keep exactly one implementation, and kept as a THUNK so `HttpsError`
   *  (which captures a stack trace) is not constructed on the happy path. */
  refusal: () => HttpsError = serviceMisconfigured,
): void {
  if (UNDER_EMULATOR || !tokenVerificationBypassEnabled()) return;
  if (logs.tryConsume(fn, Date.now())) console.error(BYPASS_LOG_MESSAGE, { fn });
  throw refusal();
}

/** The default refusal: untagged `internal`. */
function serviceMisconfigured(): HttpsError {
  return new HttpsError("internal", "this service is misconfigured; contact an administrator");
}
