# Structural token-verification guard for every callable

## Threat

`FIREBASE_DEBUG_MODE=true` with `FIREBASE_DEBUG_FEATURES` carrying `skipTokenVerification` makes
firebase-functions accept unsigned Auth ID tokens and App Check tokens alike, so a forged
`roles: ["Admin"]` claim satisfies every gate in `callable-auth.ts`. No gate can tell a forged
claim from a real one; the only defence is to refuse all traffic while the bypass is live, before
any claim is read. `apps/beacon/src/token-verification-bypass.ts` holds the predicate and the
refusal. This design makes reaching that refusal a property of how a callable is declared, not a
convention each callable has to follow.

## Design

**One wrapper is the only way to declare a callable.** `apps/beacon/src/guarded-on-call.ts`
exports `guardedOnCall(options, handler)`:

- `options` is firebase-functions' `CallableOptions` plus two fields the wrapper consumes and
  strips before calling `onCall`: `name` (the export name; it keys the refusal log and its
  sampler) and an optional `refusal` factory (default: untagged `internal`; the invite pair
  passes its tagged `invite-service-misconfigured`, for the reason stated on the `refusal`
  parameter of `assertTokenVerificationNotBypassed`).
- The handler it registers calls `assertTokenVerificationNotBypassed(name, refusal)` as its first
  statement, then delegates. firebase-functions wires `func.run` to that registered handler, so
  the guard is on the same path in production and under `.run` in tests.
- It returns `onCall`'s value unchanged, so `__endpoint` keeps the shape the deploy-list test
  reads off `index.ts`'s exports.

**The guard has one call site.** `loadValidInvite`, `requireAdmin` and `requireAdminOrPerm` read
claims and rate buckets only; the refusal precedes all of them, so a refused request charges no
invite bucket and reads no claim.

**`callerIsAdmin` is module-private.** `requireAdminOrPerm` returns `{ isAdmin }`, which
`issueMemberInvite` uses for `issuedByAdmin`, so the forgeable `roles` claim is read only behind
a gate.

## Enforcement

1. **ESLint** (`no-restricted-imports`, AST-based) in a beacon-scoped block: importing `onCall` /
   `onCallGenkit` from `firebase-functions/v2/https`, `firebase-functions/https`,
   `firebase-functions/v1/https`, the `https` namespace from `firebase-functions`,
   `firebase-functions/v2`, `firebase-functions/v1`, or v1's `runWith` / `region` builders (each
   reaches `.https.onCall`) is an error everywhere in `apps/beacon/src` except
   `guarded-on-call.ts`. A namespace import (`import * as x`), a default import (under CJS
   interop the whole module object) and an `export { onCall } from` re-export are reported too.
   A deep path under `firebase-functions/lib/` (e.g.
   `firebase-functions/lib/v2/providers/https.js`) is banned too, by `pattern`. Outside the rule:
   `require()` and dynamic `import()` — the test below is the backstop.
2. **Behavioural test** (`guarded-on-call.test.ts`) over every callable export of `index.ts`
   (same selection as the deploy-list test: `__endpoint.callableTrigger`). With the bypass on,
   `.run(request)` rejects with the exact refusal (untagged `internal` for the five
   authenticated callables, tagged `invite-service-misconfigured` for the invite pair) and logs
   `{ fn: <export name> }`; with the bypass inert, every callable passes through. A callable
   declared without the wrapper turns this red whatever lint saw.

The post-deploy environment assertion is a separate control: `deploy.yml` enumerates the
callables `assert-deployed-env-clean.sh` checks, and the deploy-list test in
`redeem-invite.test.ts` pins that list against `index.ts`'s callable exports.

## Out of scope

`enforceAppCheck` on the five authenticated callables (a separate change with its own
deploy-ordering risk).
