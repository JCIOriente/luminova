// The ONE file allowed to import `onCall`. Two things make that structural rather than a
// convention: eslint.config.js bans, across apps/beacon/src, every static import or re-export
// that reaches a callable constructor — `onCall`/`onCallGenkit`, the `https` namespaces, v1's
// `runWith`/`region`/`FunctionBuilder`, the default import and any `firebase-functions/lib/`
// deep path (the list is `CALLABLE_CONSTRUCTOR_IMPORTS`); this file is exempt from exactly one
// entry, `onCall` from `firebase-functions/v2/https`. `require()` and a dynamic `import()` are
// outside that rule, as is an eslint-disable; guarded-on-call.test.ts drives `.run` on every
// callable export of index.ts under a live bypass and is the backstop for them.
// Design: docs/specs/structural-oncall-guard.md.
import {
  onCall,
  type CallableOptions,
  type CallableRequest,
  type CallableResponse,
  type HttpsError,
} from "firebase-functions/v2/https";
import { assertTokenVerificationNotBypassed } from "./token-verification-bypass.js";

// No `authPolicy`: firebase-functions runs it before the handler, so it would read forged claims
// ahead of the guard.
export interface GuardedCallableOptions<T> extends Omit<CallableOptions<T>, "authPolicy"> {
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
