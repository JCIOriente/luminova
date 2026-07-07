# Detail-route error handling (audit backlog item 13)

**Status:** In progress · branch `feat/detail-route-errors` · **Goal:** stop conflating a
query *read error* with *"no encontrado"*; add an explicit retryable error state across the 7
sites item 10 flagged as `!data`-only-no-`isError`.

## Problem

`docs/status/2026-07-02-full-audit.md` item 13 (detail row 99,
`_app.activities_.$id.tsx:118`): a transient/permission read failure renders a misleading
*"Actividad no encontrada"* page with no retry. Item 10 (#140) cut the retry count 3→1, so
read errors now surface faster — making the mis-labelling more visible. Same class as the
known TanStack-v5 `!data`-only gotcha (infinite skeleton / wrong-copy on error).

The fix distinguishes **three states** instead of collapsing error+absent into one:

| state | condition | UI |
|---|---|---|
| loading | `isLoading` | existing "Cargando…" (preserved) |
| **error (retryable)** | `isError` | **NEW** `ErrorState` — retry, or session-refresh hint for permission-denied |
| genuinely absent | `!isLoading && !isError && !data` | existing "no encontrado" copy (preserved) |

Non-goals: no error-boundary framework; no change to item-10 retry/`staleTime` policy, item-9
datetime, item-7/8 repos, or `firestore.rules`. Per-query `isError` branches + one shared
presentational component only.

## Design (confirmed with user)

1. **Shared presentational `ErrorState` in `@luminova/ui`** — mirrors `EmptyState`, adds an
   optional `onRetry`. Firebase-free (the package never imports firebase).
2. **Retry wiring = `query.refetch()`** — re-runs exactly the failed query; correct layer for
   these `useQuery` sites (no route-loader data to invalidate).
3. **Permission-denied gets a distinct variant, no retry button.** Item-10 `retryQuery` never
   retries `permission-denied`, so a "Reintentar" would just fail again. It gets its own copy +
   a session-refresh hint. The *selection* needs `isPermissionDenied` (firebase-coupled), so it
   lives in a thin **backstage-local `QueryErrorState` wrapper**, keeping `@luminova/ui` clean.

### Component contracts

`@luminova/ui` — `packages/ui/src/components/error-state.tsx` (mirror of `empty-state.tsx`):

```tsx
export function ErrorState({ icon, title, description, onRetry, retryLabel = "Reintentar" }: {
  icon?: ReactNode; title: string; description?: string;
  onRetry?: () => void; retryLabel?: string;
}) { /* same centered column as EmptyState; renders a secondary Button only when onRetry set */ }
```
Exported from `packages/ui/src/index.ts` (keeps knip green — consumed by backstage + the ui test).

backstage — `apps/backstage/src/components/query-error-state.tsx`:

```tsx
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isPermissionDenied(error))
    return <ErrorState icon={…} title="Sin permiso"
      description="Tu sesión no tiene permiso para ver esto. Actualiza la sesión e inténtalo de nuevo." />;
  return <ErrorState icon={…} title="No se pudo cargar"
    description="Ocurrió un problema al cargar la información. Inténtalo de nuevo." onRetry={onRetry} />;
}
```

No raw `error.message` / stack / Firestore path is ever rendered — copy is fixed strings
(preserves the item-4/#130 input-redaction posture; permission-denied copy names no rule/claim).

## Per-site plan

Every hook is a single `useQuery` → exposes `isError`/`error`/`refetch` natively (inventory
2026-07-06). Detail sites insert an `isError` branch **between** the existing `isLoading` and
`!data` guards, preserving both. List/panel sites add an `isError` branch beside loading/empty.

| # | file | class | change | preserved copy |
|---|---|---|---|---|
| 1 | `routes/_app.me.tsx:36,64` | DETAIL | destructure `isError,error,refetch`; add branch before `!member` | "Cargando…" / "Tu usuario no está vinculado…" |
| 2 | `routes/_app.members_.$memberId.tsx:61,92` | DETAIL | same | "Cargando…" / "Miembro no encontrado." + back-link |
| 3 | `routes/_app.activities_.$id.tsx:64,131` | DETAIL | same (keep `!canRead` "Sin acceso" first) | "Cargando…" / "Actividad no encontrada." + back-link |
| 4 | `routes/_app.initiatives_.$type.$id.tsx:77,102` | DETAIL | same | "Cargando…" / "Proyecto no encontrado." + back-link |
| 5 | `features/permissions/components/role-manager.tsx:13,44` | LIST | destructure `isError,error,refetch`; `isError ?` branch before the list | "Cargando roles…" |
| 6 | `routes/_app.permisos.tsx:23-24,52` | PANEL (outlier) | read `isError/error/refetch` from both queries; OR them; render `QueryErrorState` in place of `<PermisosView>` | Skeletons (unchanged inside view) |
| 7 | `features/check-in/components/activity-check-in.tsx:27` | PANEL | destructure `isError,error,refetch`; `isError` branch after `!open` guard | "Check-in no disponible" (`!open`) |

Site 6 is the only one touching a route to thread state — `PermisosView` stays purely
presentational (unchanged); the route branches before rendering it. Site 7's query is the
live-opt-in one (item-10 `staleTime:0`); preserve that — only add the error read.

## Tasks

- [ ] **T1** RED-first `error-state.test.tsx`: renders title/description; fires `onRetry` on
  click; no button when `onRetry` omitted. Run → fail. Implement `ErrorState` + export. Run → pass. Commit.
- [ ] **T2** `QueryErrorState` wrapper (backstage). Commit.
- [ ] **T3** Detail sweep — sites 1–4 (≤ commit-per-milestone). Commit.
- [ ] **T4** List/panel sweep — sites 5–7 (incl. permisos route wiring). Commit.
- [ ] **T5** Gates: `turbo build --filter=./packages/*`, prettier, typecheck, /simplify,
  /code-review, /security-review, `pnpm pr-tests`, bundle-budget-watcher.

## Guardrails

- knip: zero new unused (ErrorState consumed; QueryErrorState consumed ×7).
- bundle: backstage ≤115 kB gz (~97 now); ErrorState is tiny + dedupes inline JSX → ~flat.
- Rebuild `@luminova/ui` (`turbo build --filter=./packages/*`) so backstage sees the new export.
