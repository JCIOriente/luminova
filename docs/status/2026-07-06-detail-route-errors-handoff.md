# Handoff — Detail-route error handling (audit item 13)

**Date:** 2026-07-06 · **Branch:** `feat/detail-route-errors` · **PR:** #141 · **Status:** gates green, ready for review
**Spec:** `docs/specs/2026-07-06-detail-route-error-handling.md` · **Prev:** item 10 (#140 MERGED)

## What shipped

Stopped conflating a query **read error** with **"no encontrado"** across the 7 sites item 10
(#140) flagged as `!data`-only-no-`isError`. Same bug class as the known TanStack-v5 `!data`
gotcha (dashboard-retention). #140 cutting retry 3→1 made read errors surface faster, so the
mis-label was newly visible.

**Three states, not two:**

| state | condition | UI |
|---|---|---|
| loading | `isLoading` | existing "Cargando…" (preserved) |
| **error** | `isError` | **NEW** `QueryErrorState` — retry, or session-refresh hint if permission-denied |
| absent | `!isError && !isLoading && !data` | existing "no encontrado" copy (preserved) |

## Chosen design (confirmed with user via AskUserQuestion)

1. **Shared `ErrorState` in `@luminova/ui`** — *composes* `EmptyState` (retry `Button` passed into
   EmptyState's `action` slot; /simplify collapsed an initial duplicated-markup version). Firebase-free.
2. **Retry wiring = `query.refetch()`** (not `router.invalidate()` — these are `useQuery` sites with
   no route-loader data). Every `onRetry={() => refetch()}`.
3. **Permission-denied = distinct variant, no retry button.** Item-10 `retryQuery` never retries
   `permission-denied`, so a retry would just fail again → it gets "Sin permiso" + a session-refresh
   hint and no button. The permission-vs-transient *selection* needs `isPermissionDenied`
   (firebase-coupled), so it lives in a backstage-local wrapper
   `apps/backstage/src/components/query-error-state.tsx`, keeping `@luminova/ui` firebase-free.
   All 7 sites render `<QueryErrorState>`, never `<ErrorState>` directly.

## Per-site classification

Every hook is a single `useQuery` → exposes `isError`/`error`/`refetch` natively.

| # | file | class | isError exposed | change | copy preserved |
|---|---|---|---|---|---|
| 1 | `routes/_app.me.tsx` | DETAIL | native | branch between isLoading & !member | "Cargando…" / "Tu usuario no está vinculado…" |
| 2 | `routes/_app.members_.$memberId.tsx` | DETAIL | native | same | "Cargando…" / "Miembro no encontrado." + back-link |
| 3 | `routes/_app.activities_.$id.tsx` | DETAIL | native | same (`!canRead` "Sin acceso" stays first) | "Cargando…" / "Actividad no encontrada." + back-link |
| 4 | `routes/_app.initiatives_.$type.$id.tsx` | DETAIL | native | same | "Cargando…" / "Proyecto no encontrado." + back-link |
| 5 | `features/permissions/components/role-manager.tsx` | LIST | native | middle ternary arm | "Cargando roles…" |
| 6 | `routes/_app.permisos.tsx` | PANEL (outlier) | native ×2 | route reads isError from both usePositions+useMembers, ORs them, swaps in QueryErrorState | Skeletons (view untouched) |
| 7 | `features/check-in/components/activity-check-in.tsx` | PANEL | native | branch after `!open` guard | "Check-in no disponible" (`!open`) |

**Retry wiring:** `() => refetch()` at every site. Site 6 refetches both queries
(`refetchPositions(); refetchMembers()`); `loadError = positionsErr ?? membersErr` (v5 sets `error`
to null on success, so the OR/`??` picks the failed one).

**Permission-denied handling:** centralized in `QueryErrorState` — `isPermissionDenied(error)` →
"Sin permiso" + "Tu sesión no tiene permiso para ver esto. Actualiza la sesión e inténtalo de nuevo.",
**no** retry button. Generic transient → "No se pudo cargar" + retry.

## Why site 6 is the outlier

`PermisosView` is purely presentational (receives only `rows` + `isLoading`). Rather than plumb an
error prop through it, the **route** reads `isError`/`error`/`refetch` from both queries and swaps
`<QueryErrorState>` in place of `<PermisosView>`. `RoleManager` (same page) handles its own error
independently. `PermisosView` unchanged.

## Gates (all green)

- **RED-first vitest** for ErrorState (4 cases: title/description, onRetry click, custom retryLabel,
  no-button-when-omitted) — proven red before implementing.
- **/simplify** → composed ErrorState on EmptyState (reuse the `action` slot; dropped duplicated markup).
- **/code-review high** → 3 finders (correctness, removed-behavior+cross-file, conventions) all `[]`.
  Confirmed: absent branch still reachable, disabled queries never wrongly show error (v5 isError:false),
  no copy regressed, all import paths resolve, `@luminova/ui` stays firebase-free.
- **/security-review** → `[]`. No error internals rendered (fixed-string copy; `error` only feeds
  `isPermissionDenied.code`); permission-denied copy names no rule/claim; preserves #130 redaction.
- **pnpm pr-tests** → EXIT=0 (backstage 444 tests / 99 files, ui suite incl. error-state, knip 0, node --test 20).
- **bundle-budget-watcher** → backstage index 100.18→100.40 kB gz (+0.22), CI gate `ok` (97 kB, ~15 kB
  headroom vs 115), knip 0, no new deps.

## Registration housekeeping

`ErrorState` added to `packages/ui/src/index.ts`, registered in `packages/ui/DESIGN.md` +
`packages/ui/CLAUDE.md` (37→38 components — the component-sync convention).

## Not touched (preserved on purpose)

item-10 retry/staleTime policy (incl. the check-in live opt-in), item-9 datetime, item-7/8 repos,
`firestore.rules`, beacon, auth. No error-boundary framework — per-query `isError` branches + one
shared presentational component only.

## Next up — item 11 (eslint-plugin-react-hooks in CI)

Highest-leverage remaining backlog row: it installs a monorepo-wide guardrail against the exact
hooks/render-state bug class this audit kept surfacing (item-13 `!data`-only, dashboard-retention
hooks-after-return, points-race). **CI now exists** (`.github/workflows/ci.yml`, stood up in
#104/#106) — so the `project-harness-feature-flow` "no CI" note is **stale** and item 11 is unblocked.
No `eslint-plugin-react-hooks` is installed anywhere today (verified). See the chaining prompt handed
to the next session.
