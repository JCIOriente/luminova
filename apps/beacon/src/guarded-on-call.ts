// The ONE file allowed to import `onCall`: eslint.config.js bans every callable constructor
// import across apps/beacon/src (the canonical list is above `CALLABLE_CONSTRUCTOR_IMPORTS`),
// and guarded-on-call.test.ts is the behavioural backstop. Design:
// docs/specs/structural-oncall-guard.md.
import {
  onCall,
  type CallableOptions,
  type CallableRequest,
  type CallableResponse,
  type HttpsError,
} from "firebase-functions/v2/https";
import { assertTokenVerificationNotBypassed } from "./token-verification-bypass.js";

// No `authPolicy`: firebase-functions runs it before the handler, so it would read forged claims
// ahead of the guard. The Omit rejects a literal one; a spread from a wider object escapes it,
// which `callableOptions` covers at runtime.
export interface GuardedCallableOptions<T> extends Omit<CallableOptions<T>, "authPolicy"> {
  /** The EXPORT name. It keys the refusal log and its sampler, so an operator is told which
   *  endpoint is being hit and one endpoint's flood cannot hold another's log slot. */
  name: string;
  /** The error to raise while the bypass is live. Omit for the untagged `internal`; see the
   *  `refusal` parameter of `assertTokenVerificationNotBypassed` for when a boundary needs its
   *  own. */
  refusal?: () => HttpsError;
}

/** The options `guardedOnCall` hands `onCall`: `name` and `refusal` stripped, and any
 *  `authPolicy` that got past the type wrapped so the bypass refusal runs first. firebase-functions
 *  awaits `authPolicy` inside the same try as the handler and sends a thrown `HttpsError` as-is,
 *  so the refusal reaches the client exactly as it does from the handler. */
export function callableOptions<T>(options: GuardedCallableOptions<T>): CallableOptions<T> {
  const { name, refusal, ...rest } = options;
  const wide: CallableOptions<T> = rest;
  const { authPolicy } = wide;
  if (!authPolicy) return wide;
  return {
    ...wide,
    authPolicy: (auth, data) => {
      assertTokenVerificationNotBypassed(name, refusal);
      return authPolicy(auth, data);
    },
  };
}

/** The only way to declare a callable in beacon. The handler it registers refuses while token
 *  verification is bypassed — before any claim is read and before any I/O — and then delegates.
 *
 *  `onCall` gets `callableOptions(options)` and its value is returned unchanged, so `__endpoint`
 *  keeps the shape the deploy-list test reads. firebase-functions wires `.run` to the registered
 *  handler, which is how the tests reach the guard. */
export function guardedOnCall<T, Return>(
  options: GuardedCallableOptions<T>,
  handler: (request: CallableRequest<T>, response?: CallableResponse) => Promise<Return>,
) {
  return onCall<T, Promise<Return>>(callableOptions(options), async (request, response) => {
    assertTokenVerificationNotBypassed(options.name, options.refusal);
    return handler(request, response);
  });
}
