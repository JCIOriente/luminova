# Backstage Auth Foundation — Design

**Date:** 2026-06-05
**Scope:** `apps/backstage` first incursion — app bootstrap + auth foundation + protected shell.
**Status:** Approved (brainstorming). Members CRUD deferred to a separate branch/session.

## Goal

Stand up `apps/backstage` from an empty package to a running admin shell with
email/password auth: a public `/login`, an auth-guarded app area, and a session
listener that drives routing. Members CRUD (branch 3) is explicitly out of scope.

## Starting state

`apps/backstage` is un-bootstrapped: `package.json` has zero dependencies (no
Vite, React, TanStack, Tailwind, RHF, Zod), and `src/` holds only a placeholder
`index.ts` + test. Everything sits on a bootstrap layer that nobody had built yet.

`@luminova/firebase` exports only `getFirebase()` → `{ app, auth, db, storage }`
(memoized; App Check coded but enforcement off; emulator wiring present). It is
not imported anywhere in backstage yet.

> **Doc drift:** `apps/backstage/CLAUDE.md` shows `import { db } from '@luminova/firebase'`.
> The package exports no `db` binding — only `getFirebase()`. This design uses
> `getFirebase().db` / `.auth`. The stale snippet is noted, not fixed here.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Branch slicing | Three branches: `chore/backstage-bootstrap` → `feat/backstage-auth` → `feat/backstage-members` |
| This incursion | Branches 1 + 2 only. Members is a fresh session. |
| Auth state → routing | Single `onAuthStateChanged` listener owns state, fed into TanStack Router context; `beforeLoad` reads it. |
| Redirect after login | Return to originally-requested route via `redirect` search param, else `/`. |
| Login errors | Map common Firebase codes → friendly Spanish; generic fallback. Form-level (not per-field). |
| QueryClientProvider | Lands in branch 1 (`__root.tsx`), even though no queries until members. |
| First-load UX | Branded `defaultPendingComponent` while the auth `ready` promise resolves. |

## Branch 1 — `chore/backstage-bootstrap`

**Outcome:** backstage builds, runs, and renders an empty shell. No auth logic.

### Dependencies
Resolved live via `secure-dep-vetting` (never typed from memory; mirror the
versions already used by `apps/spotlight` / root where they overlap).

- Runtime: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@luminova/ui`
- Dev: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`,
  `@tanstack/router-plugin`, `@types/react`, `@types/react-dom`
- Test: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event` (`vitest` is a root dev dep)

### Files (mirrored from `apps/spotlight`)
- `vite.config.ts` — same three plugins: `tanstackRouter({ target: "react", autoCodeSplitting: true })`, `react()`, `tailwindcss()`.
- `tsconfig.json` — extends `../../tsconfig.base.json`, same compiler options.
- `index.html` — `lang="es"`, `#root`, module script to `/src/main.tsx`.
- `src/vite-env.d.ts` — `/// <reference types="vite/client" />`.
- `src/styles.css` — `@import "tailwindcss"` + `@import "@luminova/ui/theme.css"`
  + the mandatory `@source "../../../packages/ui/src/**/*.{ts,tsx}"`. Admin gets
  the shared tokens only — none of spotlight's marketing-specific semantic CSS.
- `src/main.tsx` — `createRoot` → `RouterProvider` with a typed router.
- `src/routes/__root.tsx` — `QueryClientProvider` + router/query devtools + `<Outlet/>`.
- One placeholder index route so the shell renders.
- `package.json` scripts aligned to spotlight: `dev` (`vite`), `build`
  (`tsc --noEmit && vite build`), `lint`, `typecheck`, `test`, `ci`
  (`eslint . && tsc --noEmit && vitest run --passWithNoTests`). vitest uses jsdom env.

### Verification
`pnpm --filter backstage run ci` passes; `pnpm --filter backstage dev` renders the
placeholder at localhost:5173.

## Branch 2 — `feat/backstage-auth`

**Outcome:** working login, protected shell, guard, redirect-after-login.
**Sensitive surface:** touches the auth boundary → `/security-review` +
`firestore-security-reviewer` before the PR.

### Dependencies
`@luminova/firebase`, `react-hook-form`, `zod`, `@hookform/resolvers`
(+ `@luminova/types` if a shared type is needed). Resolved via `secure-dep-vetting`.

### Auth module — `src/lib/auth/`
- `auth-store.ts` — single `onAuthStateChanged(getFirebase().auth)` subscription.
  Exposes `{ status: 'pending' | 'authenticated' | 'unauthenticated', user, ready }`
  where `ready: Promise<void>` resolves on the first emission. Backed by
  `useSyncExternalStore` for component reads.
- `sign-in.ts` — wraps `signInWithEmailAndPassword`.
- `sign-out.ts` — wraps `signOut`.
- `auth-errors.ts` — maps Firebase codes (`auth/invalid-credential`,
  `auth/too-many-requests`, `auth/network-request-failed`, …) to Spanish
  messages; everything else → one generic `"No se pudo iniciar sesión"`.

### Router wiring
- Router created with `context.auth = authStore`.
- `main.tsx` subscribes the store and calls `router.invalidate()` on every auth
  change, so route guards re-run (e.g. logout bounces to `/login`).
- `defaultPendingComponent` renders a branded centered spinner/logo while
  `auth.ready` is unresolved.

### Routes — `src/routes/`
- `_auth.tsx` — centered-card layout, no sidebar.
- `_auth.login.tsx` (`/login`) — `LoginForm` (RHF + Zod). On success navigate to
  `search.redirect ?? '/'`. Form-level error from `auth-errors`.
- `_app.tsx` — protected layout (minimal sidebar: Dashboard + Logout).
  `beforeLoad`: `await context.auth.ready; if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })`.
- `_app.index.tsx` (`/`) — dashboard placeholder.

Members/events/allies nav entries are deferred — no dead links this incursion.

### Feature folder — `src/features/auth/`
- `components/LoginForm.tsx` — email + password fields via `@luminova/ui`
  `Field` / `Input` / `Button`; submit calls `sign-in`, maps errors form-level.
- `types/login-schema.ts` — `z.object({ email: z.string().email(), password: z.string().min(1) })`.

The sidebar is bespoke and app-local (not promoted to `@luminova/ui` yet).

## Testing (TDD, both branches)

Unit-level, mocking the `firebase/auth` boundary for speed and determinism:
- `auth-errors` — code → message mapping incl. generic fallback.
- `auth-store` — status transitions across emissions; `ready` resolution.
- `LoginForm` — Zod validation, submit success path, error display.
- Guard — `beforeLoad` redirect logic (unauth → `/login` with `redirect` param).

Emulator-backed e2e stays manual/deferred — not wired into CI this incursion.

## Out of scope

- Members CRUD (branch 3, next session, via `backstage-feature-scaffold`).
- App Check enforcement (stays off until prod site keys exist).
- Any `firestore.rules` change.
- Per-app `size-limit` / `knip` scripts — `apps/spotlight` has none; not inventing here.
