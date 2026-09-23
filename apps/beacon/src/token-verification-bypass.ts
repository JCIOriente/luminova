import { HttpsError } from "firebase-functions/v2/https";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";

/** `true` only under the Firebase emulator, which is the ONE environment allowed to run with
 *  token verification disabled.
 *
 *  Fail-closed, and it must stay that way: ABSENCE of the variable means "this is real". Do not
 *  "improve" this into a positive check for a production marker like `K_SERVICE`, which would
 *  fail OPEN the day that variable is renamed. Only the emulator sets `FUNCTIONS_EMULATOR`
 *  (`functionsEmulator.js`: `envs.FUNCTIONS_EMULATOR = "true"`); the deploy-time discovery run
 *  does not, and no build-time process can reach it, because it is read in-process at container
 *  cold start.
 *
 *  Shared with `redeem-invite.ts`'s `ENFORCE_APP_CHECK`, which keys on the same variable for the
 *  same reason. Kept as two names because they answer different questions — "may this instance
 *  skip attestation?" versus "may this instance trust a decoded token?" — and only the second
 *  one is what this module gates. */
const UNDER_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

/** Whether firebase-functions would accept SELF-CRAFTED, UNSIGNED tokens on this process right
 *  now — BOTH an Auth ID token and an App Check token. One flag defeats both.
 *
 *  THE SCOPE IS THE WHOLE TRUST BOUNDARY, not the invite endpoints. An earlier version of this
 *  guard lived in `redeem-invite.ts` and its docblock called this "a defect scoped to two invite
 *  endpoints". That was wrong, and the mistake is instructive: the same
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
 *  It is STRICTLY WORSE on the authenticated callables than on the invite pair, because those
 *  pass no options at all, so `enforceAppCheck` defaults falsy and there is no attestation gate
 *  there to lose — the forged claim is the only gate, and this flag is exactly what breaks it.
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

/** How often one instance may log the misconfiguration. Matches the invite gate's
 *  `refusalLogIntervalMs` in spirit: bounded, but never permanently silent. */
const BYPASS_LOG_INTERVAL_MS = 10_000;

/** One line per choke point per interval per instance — NOT one per request, and NOT one per
 *  process.
 *
 *  A latch (log once, ever) was the first version and it was wrong for the same reason the
 *  invite gate's `shouldLogRefusal` docblock already gives: "throttling must stay visible, and a
 *  long flood must not go silent after its first line." That argument is STRONGER here, because
 *  in this state 100% of guarded traffic is refused and `logOutcome` never runs — this line is
 *  the only evidence that exists, and a log-based alert cannot be armed on an event that fires
 *  once per container at cold start. Keyed by `fn` so the endpoint under attack is named, and
 *  `maxKeys` bounds the map against an unbounded key space. */
const logs: RateLimiter = createRateLimiter({
  capacity: 1,
  windowMs: BYPASS_LOG_INTERVAL_MS,
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
 *  Called from the TWO CHOKE POINTS every callable already crosses: `loadValidInvite` for the
 *  unauthenticated invite pair, and `requireAdmin` / `requireAdminOrPerm` for every
 *  authenticated one. Both are the first statement of their callers, so the refusal precedes
 *  every read and every write.
 *
 *  GATED ON THE EMULATOR, so local dev is untouched: `FIREBASE_DEBUG_MODE=true` is the supported
 *  way to run the emulator, and there is no verification to bypass there anyway.
 *
 *  This covers TWO of the three keys `assert-deployed-env-clean.sh` bans. `FUNCTIONS_EMULATOR`
 *  cannot be covered from inside the process: keying on it is what turns the guard off, and
 *  separating a real emulator run from an injected value would need a positive production
 *  marker, which `UNDER_EMULATOR` above explains must never be added. For that one key the
 *  post-deploy assertion remains the only control. */
export function assertTokenVerificationNotBypassed(
  fn: string,
  /** The error to raise, so each boundary keeps its own contract. Defaults to an UNTAGGED
   *  `internal`, which is right for the authenticated gates: backstage's admin surface has no
   *  per-reason message table for them, and an operator reads the log line, not the toast.
   *
   *  The INVITE callables pass a tagged `invite-service-misconfigured` instead, because their
   *  client does have such a table and needs this distinguishable from a transient `internal` —
   *  an uncaught Firestore `unavailable` arrives with the same code and needs the OPPOSITE
   *  affordance (retry now, versus never). Parameterized rather than duplicated so the emulator
   *  gate, the predicate and the sampled log have exactly one implementation. */
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
