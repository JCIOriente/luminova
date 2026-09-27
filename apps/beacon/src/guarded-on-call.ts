// The ONE file allowed to import `onCall`. Two things make that structural rather than a
// convention: eslint.config.js bans every import that reaches a callable constructor everywhere
// else in apps/beacon/src (the list is in that block), and guarded-on-call.test.ts drives `.run`
// on every callable export of index.ts under a live bypass — the backstop for what lint cannot
// see (an eslint-disable, `require()`, a dynamic `import()`). Design:
// docs/specs/structural-oncall-guard.md.
import {
  onCall,
  type CallableOptions,
  type CallableRequest,
  type CallableResponse,
  type HttpsError,
} from "firebase-functions/v2/https";
import { assertTokenVerificationNotBypassed } from "./token-verification-bypass.js";

export interface GuardedCallableOptions<T> extends CallableOptions<T> {
  /** The EXPORT name. It keys the refusal log and its sampler, so an operator is told which
   *  endpoint is being hit and one endpoint's flood cannot hold another's log slot. */
  name: string;
  /** The error to raise while the bypass is live. Omit for the untagged `internal`; see the
   *  `refusal` parameter of `assertTokenVerificationNotBypassed` for when a boundary needs its
   *  own. */
  refusal?: () => HttpsError;
}

/** The only way to declare a callable in beacon. The handler it registers refuses while token
 *  verification is bypassed — before any claim is read and before any I/O — and then delegates.
 *
 *  `name` and `refusal` are stripped before `onCall` sees the options, and `onCall`'s value is
 *  returned unchanged, so `__endpoint` keeps the shape the deploy-list test reads. firebase-
 *  functions wires `.run` to the registered handler, which is how the tests reach the guard. */
export function guardedOnCall<T, Return>(
  options: GuardedCallableOptions<T>,
  handler: (request: CallableRequest<T>, response?: CallableResponse) => Promise<Return>,
) {
  const { name, refusal, ...callableOptions } = options;
  return onCall<T, Promise<Return>>(callableOptions, async (request, response) => {
    assertTokenVerificationNotBypassed(name, refusal);
    return handler(request, response);
  });
}
