# QueryClient defaults — audit backlog item 10

Date: 2026-07-06
Branch: `feat/query-client-defaults`
Scope: `apps/backstage` frontend only (no beacon / rules / auth / repositories).

## Problem

`apps/backstage/src/lib/query-client.ts` builds `new QueryClient({ queryCache })`
with **no `defaultOptions`**, so every query inherits TanStack Query v5 defaults:
`staleTime: 0`, `retry: 3`, `refetchOnWindowFocus: true`. For an auth-gated admin
app reading Firestore this is wrong:

- **`retry: 3`** retries a `permission-denied` rules rejection and a malformed-doc
  `DocParseError` three times — both are deterministic non-transient failures, so
  the retries only add latency before the inevitable error surfaces.
- **`refetchOnWindowFocus: true` + `staleTime: 0`** refetches every active query on
  every tab-refocus — redundant Firestore reads (cost + noise) with no UX gain for
  reference data.

Recon confirmed a clean slate: **zero** per-hook `staleTime`/`retry`/`refetchOn*`
overrides exist anywhere in `apps/backstage/src` today (19 query call sites, 29
mutations, no infinite/suspense queries). Any default set here is greenfield, not an
override.

## Policy (approved 2026-07-06)

Global `defaultOptions` on the `QueryClient`:

| Option | Value | Rationale |
|---|---|---|
| `queries.staleTime` | `5 * 60_000` (5 min) | Admin reference data tolerates brief staleness; kills refetch storms. A just-written mutation still forces a refetch via its `invalidateQueries`, so writes stay consistent regardless. |
| `queries.refetchOnWindowFocus` | `false` | Stop tab-refocus refetch storms. Live screens opt back in per-hook (see below). |
| `queries.refetchOnReconnect` | `true` | v5 default, set explicit — cheap correctness after a sleep/wifi-drop. |
| `queries.retry` | `retryQuery` predicate | Never retry `permission-denied` or `DocParseError`; one retry for genuine transient errors. |
| `mutations.retry` | `false` | Firestore writes are non-idempotent — a check-in retried on a transient error could double-write. Explicit (matches v5 default) to guard against future confusion. |

`gcTime` left at the v5 default (5 min) — not touched.

### Retry predicate

New pure module `apps/backstage/src/lib/query-retry.ts`:

```ts
import { isPermissionDenied } from "./firestore-errors";
import { DocParseError } from "./firestore-read";

export function retryQuery(failureCount: number, error: unknown): boolean {
  if (isPermissionDenied(error)) return false;
  if (error instanceof DocParseError) return false;
  return failureCount < 1;
}
```

`failureCount` semantics verified against installed `@tanstack/query-core@5.101.0`
(`retryer.js:95,100`): the predicate is called with `failureCount` starting at **0**
on the first failure and incremented *after* the check, so `failureCount < 1` yields
**exactly one retry** (2 total attempts). Extracted as a standalone pure function so it
is unit-testable without a live QueryClient.

RED-first vitest (`query-retry.test.ts`):

- `permission-denied` FirebaseError → `false` (any failureCount)
- `DocParseError` → `false` (any failureCount)
- generic error, `failureCount 0` → `true` (one retry)
- generic error, `failureCount 1` → `false` (stop after one retry)

## Chokepoint to preserve

`query-client.ts:9-26` — the existing `QueryCache.onError` handler (DocParseError
log with redacted zod issues + DEV-only `permission-denied` claims-refresh hint, from
PR #109). It stays verbatim; `defaultOptions` is added alongside the existing
`queryCache`, not in place of it.

## Live-data opt-ins

Two screens rely on the current live behavior. Decision:

1. **Check-in roster (`useActivityCheckIns`)** — OPT IN. Dedicated single-consumer
   hook feeding the live scan/roster UI (`activity-check-in.tsx`). Add
   `staleTime: 0` + `refetchOnWindowFocus: true` directly in the hook. Restores
   cross-device convergence at live events (operator B's roster reflects operator A's
   scans on refocus) — the highest-stakes live surface in the app. Contained, no call
   site changes.

2. **Dashboard (`_app.index.tsx`)** — DEFER (accept global policy). It already
   remounts fresh on navigation and already has an `isError` branch (so it is NOT one
   of the item-13 skeleton sites). The only lost behavior is: parking on the dashboard
   tab, tabbing away, tabbing back sees counts stale up to 5 min. Opting it back in
   would require widening 6 shared hooks (`useMembers`, `useAllies`,
   `useActivitiesByTerm`, `useMemberPointsByTerm`, `useInitiativesByTerm` →
   `useInitiativesOfType`) to forward query-options config into hooks that non-live
   screens also consume — a config-leak design smell for marginal value. Noted as an
   optional follow-up if focus-freshness on the parked dashboard is later wanted.

## Out of scope (flagged, not fixed)

**Item 13 — infinite-skeleton / error-conflation sites.** A non-retrying policy
surfaces errors faster, so 7 consumers that branch only on loading/`!data` with no
`isError` branch will show an infinite skeleton or a misleading "not found"/empty
state on a genuine fetch error (today `retry:3` usually masks transient errors before
`isError` flips). These are handed to backlog item 13, NOT fixed here:

| # | Site | Fed by |
|---|---|---|
| 1 | `routes/_app.me.tsx:64-67` (renders "not linked" on error) | `useCurrentMember()` |
| 2 | `routes/_app.members_.$memberId.tsx:92-99` ("member not found") | `useMember(memberId)` |
| 3 | `routes/_app.activities_.$id.tsx:130-138` ("activity not found") | `useActivity(id)` |
| 4 | `routes/_app.initiatives_.$type.$id.tsx:101-109` ("project not found") | `useInitiative(type, id)` |
| 5 | `features/permissions/components/role-manager.tsx:44-46` (silent empty list) | `useRoles()` |
| 6 | `features/positions/components/permisos-view.tsx:11` (silent empty table) | `usePositions()` + `useMembers()` |
| 7 | `features/check-in/components/activity-check-in.tsx:27-32` (silent empty roster) | `useActivityCheckIns()` |

Item 13's detail route is `routes/_app.activities_.$id.tsx:118` (site #3) — the anchor
for that backlog row.

Also out of scope: item 9 datetime, InitiativeRepository (item 7), usePhotoCrud
(item 8), any refuted audit findings.

## Verification

- RED-first vitest on `retryQuery` (proven RED before the predicate exists).
- `pnpm --filter backstage run ci` (prettier → eslint → tsc → build → vitest → knip → size-limit).
- `bundle-budget-watcher` (config-only change → expect ~0 gz delta; budget ≤ 115 kB, currently ~103).
- `/simplify` → `/code-review high` → `/security-review` (confirm the retry predicate
  cannot loop an auth failure — permission-denied returns `false` unconditionally).
