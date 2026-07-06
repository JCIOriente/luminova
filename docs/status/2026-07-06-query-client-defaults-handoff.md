# Handoff — QueryClient defaults (audit item 10), PR #140

Date: 2026-07-06
Branch: `feat/query-client-defaults` → PR #140 (OPEN)
Spec: `docs/specs/2026-07-06-query-client-defaults-design.md`

## What shipped

Global TanStack Query v5 `defaultOptions` for `apps/backstage` — previously
`new QueryClient({ queryCache })` with no defaults (inherited `staleTime:0`,
`retry:3`, `refetchOnWindowFocus:true`).

### Chosen policy (user-approved 2026-07-06)

| Option | Value | Rationale |
|---|---|---|
| `queries.staleTime` | **5 min** (`5 * 60_000`) | Admin reference data tolerates brief staleness; kills tab-refocus/mount refetch storms. Writes stay consistent via each mutation's `invalidateQueries` (refetches active queries regardless of staleTime). |
| `queries.refetchOnWindowFocus` | **false** | Stop refocus refetch storms. Live screens opt back in per-hook. |
| `queries.refetchOnReconnect` | **true** | v5 default, explicit — refresh after sleep/wifi-drop. |
| `queries.retry` | **`retryQuery`** | Never retry `permission-denied` or `DocParseError`; 1 retry for transient. |
| `mutations.retry` | **false** | Firestore writes non-idempotent — a retried check-in could double-write. |

`gcTime` untouched (v5 default 5 min).

### Retry predicate (`lib/query-retry.ts`, RED-first tested)

```ts
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (isPermissionDenied(error)) return false;
  if (error instanceof DocParseError) return false;
  return failureCount < 1;
}
```

`failureCount` starts at 0 on first failure (verified against
`@tanstack/query-core@5.101.0` `retryer.js:95,100` — the check runs before the
`failureCount++`), so `< 1` = **exactly one retry / two attempts**. Test
(`query-retry.test.ts`, 4/4): permission-denied→false@any, DocParseError→false@any,
transient→true@0/false@1, unknown-Error→true@0/false@1.

### Live opt-in

`useActivityCheckIns` → `staleTime:0` + `refetchOnWindowFocus:true` baked in. Single
consumer (`activity-check-in.tsx`), highest-stakes live surface (cross-device roster
convergence at events). Per-hook value wins over global default in v5.

## Per-hook staleTime-reliance table (blast radius)

Recon: **19 query sites, 29 mutations, 0 infinite/suspense; zero pre-existing
`staleTime`/`retry`/`refetchOn*` overrides** — greenfield. All reference-data reads
(members, allies, positions, roles, point-rules, site-config, leaderboard, /me) are
safe going stale for the window. Exceptions considered:

| Screen | Reliance | Decision |
|---|---|---|
| Check-in roster (`useActivityCheckIns`) | Cross-device convergence on refocus — highest stakes | **OPT IN** (staleTime:0 + focus-refetch) |
| Dashboard (`_app.index.tsx`) | Focus-refetch gave free count updates while parked on the tab | **DEFER** — remounts fresh on nav + already has `isError`. Opting in = widening 6 shared hooks (config-leak). Optional follow-up. |
| Activity edit-lock `checkInCount` (`_app.activities.tsx:107`, `_app.activities_.$id.tsx:114`) | staleTime:0 re-read the lock on every sheet open | **Accept** — check-in mutations invalidate `checkInKeys.byActivity` but NOT `activityKeys.checkInCount`, so a reopened form can show `locked=false` up to 5 min. NOT a hole: `ActivityRepository.update` re-reads the count server-side → `ActivityLockedError`, caught into a toast. Freshness/UX bounce only, server-enforced. |

## Flagged for item 13 (infinite-skeleton / error-conflation) — NOT fixed here

A non-retrying policy surfaces errors faster. These 7 consumers branch only on
loading/`!data` with no `isError` branch → show an infinite skeleton or a
misleading "not found"/empty state on a genuine fetch error (today `retry:3` masks
transient errors before `isError` flips):

| # | Site | Fed by |
|---|---|---|
| 1 | `routes/_app.me.tsx:64-67` ("not linked" on error) | `useCurrentMember()` |
| 2 | `routes/_app.members_.$memberId.tsx:92-99` ("member not found") | `useMember()` |
| 3 | `routes/_app.activities_.$id.tsx:130-138` ("activity not found") — item-13 anchor `:118` | `useActivity()` |
| 4 | `routes/_app.initiatives_.$type.$id.tsx:101-109` ("project not found") | `useInitiative()` |
| 5 | `features/permissions/components/role-manager.tsx:44-46` (silent empty list) | `useRoles()` |
| 6 | `features/positions/components/permisos-view.tsx:11` (silent empty table) | `usePositions()`+`useMembers()` |
| 7 | `features/check-in/components/activity-check-in.tsx:27-32` (silent empty roster) | `useActivityCheckIns()` |

Dashboard (`_app.index.tsx`) is NOT in this list — it already has an `isError` branch.

## Gates (all green)

- RED-first vitest (predicate) · backstage CI 444/444 · bundle +130 B gz (96.7/115, knip clean)
- /simplify CLEAN · /code-review high 0 correctness findings · /security-review NO FINDINGS
- No beacon/rules/auth/repositories touched → security gate didn't fire, no trailer needed.

## Next

Audit backlog **item 13 — detail-route error handling** (`_app.activities_.$id.tsx:118`):
stop conflating query error with "no encontrado"; add `isError` + retry branches.
Directly consumes sites #1–#7 above.
