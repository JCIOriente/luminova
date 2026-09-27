# Structural token-verification guard for every callable

## Problem

`assertTokenVerificationNotBypassed` refuses all traffic while `FIREBASE_DEBUG_MODE` plus
`skipTokenVerification` make firebase-functions accept unsigned Auth and App Check tokens. It is
called from three places — `loadValidInvite` (the invite pair), `requireAdmin` and
`requireAdminOrPerm` (the five authenticated callables) — and every current callable happens to
cross one of them first. Nothing forces a new `onCall` to. `callerIsAdmin` is exported and reads
the same forgeable `roles` claim with no guard of its own; its one caller,
`issueMemberInvite`, is safe only because it runs after `requireAdminOrPerm`.

## Design

**One wrapper is the only way to declare a callable.** `apps/beacon/src/guarded-on-call.ts`
exports `guardedOnCall(options, handler)`:

- `options` is firebase-functions' `CallableOptions` plus two fields the wrapper consumes and
  strips before calling `onCall`: `name` (the export name, used as the refusal log key) and an
  optional `refusal` factory (default: untagged `internal`; the invite pair passes its tagged
  `invite-service-misconfigured`).
- The handler it registers calls `assertTokenVerificationNotBypassed(name, refusal)` as its first
  statement, then delegates. firebase-functions' v2 `onCall` sets `func.run` to the handler, so
  the guard is on the same path in production and under `.run` in tests.
- It returns `onCall`'s value unchanged, so `__endpoint` (and the deploy-list test that reads
  `__endpoint.callableTrigger` off `index.ts`'s exports) keeps its shape.

**The inner calls go.** The wrapper is the single choke point; `loadValidInvite`,
`requireAdmin` and `requireAdminOrPerm` no longer call the guard. Their bypass tests move to the
exported callables themselves.

**`callerIsAdmin` becomes module-private.** `requireAdminOrPerm` returns `{ isAdmin }`, which
`issueMemberInvite` uses for `issuedByAdmin`.

## Enforcement

1. **ESLint** (`no-restricted-imports`, AST-based) in a beacon-scoped block: importing `onCall` /
   `onCallGenkit` from `firebase-functions/v2/https`, `firebase-functions/https`,
   `firebase-functions/v1/https`, or the `https` namespace from `firebase-functions`,
   `firebase-functions/v2`, `firebase-functions/v1` is an error everywhere in `apps/beacon/src`
   except `guarded-on-call.ts`. Verified against each import form on a scratch file.
2. **Behavioural test** over every callable export of `index.ts` (same selection as the
   deploy-list test: `__endpoint.callableTrigger`): with the bypass on, `.run(request)` rejects
   with the exact refusal (untagged `internal` for five, tagged `invite-service-misconfigured`
   for the invite pair) and logs `{ fn: <export name> }`. A callable declared without the wrapper
   turns this red even if it slips past lint (an `eslint-disable`, a dynamic import).

The deploy-list test is unchanged in kind: `deploy.yml` enumerates the callables, and a test pins
that list against `index.ts`'s callable exports, so a new callable turns it red until the YAML is
widened.

## Out of scope

`enforceAppCheck` on the five authenticated callables (a separate change with its own
deploy-ordering risk).
