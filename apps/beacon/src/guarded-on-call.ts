// The ONE file allowed to import `onCall`: eslint.config.js bans it (and every other way of
// reaching a callable constructor) everywhere else in apps/beacon/src.
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

/** The only way to declare a callable in beacon. Its handler refuses while token verification is
 *  bypassed — before the handler runs, so before any claim is read and before any I/O — and then
 *  delegates.
 *
 *  `name` and `refusal` are stripped before `onCall` sees the options, and `onCall`'s value is
 *  returned unchanged, so `__endpoint` keeps the shape the deploy-list test reads. firebase-
 *  functions sets `.run` to this same handler, which is how the tests reach the guard. */
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
