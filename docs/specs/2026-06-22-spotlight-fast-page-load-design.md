# Spotlight — Fast Page Load

**Date:** 2026-06-22
**App:** `apps/spotlight` (public marketing site, no auth)
**Status:** Design approved, pending implementation plan

## Problem

`pnpm build:local` ships more bytes than the public site needs. The dominant
costs, in order:

| # | Cost | Root cause |
|---|------|-----------|
| 1 | `index` chunk **296 kB / 92 kB gz** | Spotlight imports `getFirestoreLite` from the `@luminova/firebase` barrel (`index.ts`), which statically imports full `firebase/auth + firestore + storage + functions + app-check`. The whole SDK lands in the public bundle. |
| 2 | 48 font files | `main.tsx` imports 6 Plus Jakarta Sans weights (200/300 have **zero** usage) × `latin` **and** `latin-ext` subsets × woff+woff2. |
| 3 | 163 kB images | 4 logo PNGs (~40 kB each) shipped raw. |
| 4 | Firestore reads compete with first paint | Below-fold sections (allies wall, showcase grid) fire their reads on mount regardless of viewport position. |

### What is NOT the problem

The runtime data-fetching strategy is already industry-standard and must be
preserved:

- `useSiteConfig` — SWR: paints instantly from `localStorage` cache (or
  `SITE_CONFIG_DEFAULTS`), revalidates in `useEffect`. Never blocks paint.
- `useAsync` (showcase/allies) — returns `loading:true` + empty data on first
  render, fetches in `useEffect`. Never blocks paint.

Spotlight reads only three **world-read** collections via
`firebase/firestore/lite`: `showcase`, `allyShowcase`, `siteConfig/current`.
It uses **no** auth, storage, functions, or app-check at runtime — confirmed by
grep. The spotlight CLAUDE.md already declares the invariant *"No other Firebase
service may be imported; `getFirebase()` is forbidden here"*; nothing currently
enforces it, and the barrel import silently violates its spirit.

## Goals

- Cut the spotlight initial JS bundle (firebase is the single largest lever).
- Cut font and image transfer weight.
- Trim which Firestore reads fire on first paint.
- Add a member-portal entry point in the footer.
- Preserve the existing non-blocking SWR data behavior — no regressions.

## Non-goals

- No change to backstage (it legitimately needs the full firebase SDK; its
  bundle is auth-gated, not public).
- No change to the contact form (stays client-side only).
- No realtime listeners, no auth, no writes in spotlight.

## Delivery — 4 independent PRs

All four branch off `main` and touch mostly disjoint files, so they can be
built in parallel (separate worktrees / subagents) and merged in any order.
PR1 is the highest-value slice; PR4's fetch-on-visible is the only one needing
care not to regress SWR behavior.

### PR1 — `@luminova/firebase/lite` subpath export

**Change:** add a second package export so consumers can pull firestore-lite
without dragging the full SDK barrel.

- `packages/firebase/package.json` `exports`:
  ```jsonc
  "exports": {
    ".": "./src/index.ts",
    "./lite": "./src/firestore-lite.ts"
  }
  ```
- `packages/firebase/src/firestore-lite.ts` already imports only
  `firebase/app` + `firebase/firestore/lite` — it becomes the public lite entry
  (export `getFirestoreLite` from it; it already does).
- Spotlight swaps every `from "@luminova/firebase"` to
  `from "@luminova/firebase/lite"` in:
  - `src/allies/ally-showcase-firestore.ts`
  - `src/site-config/site-config-firestore.ts`
  - `src/showcase/showcase-firestore.ts`
- **Guard:** add ESLint `no-restricted-imports` in spotlight config forbidding
  the bare `@luminova/firebase` specifier (allow `@luminova/firebase/lite`).
  Codifies the CLAUDE.md invariant. CI (`spotlight-ci` → eslint) enforces it.

**Rejected alternative:** rely on tree-shaking + `sideEffects:false`. Fragile —
the current 296 kB chunk proves the full SDK is not being dropped today.

**Verify:** rebuild; the firebase chunk in `apps/spotlight/dist` shrinks to
firestore-lite only. `bundle-budget-watcher` confirms the delta. Existing
spotlight vitest (firestore reader tests) stays green.

### PR2 — Variable font + drop dead weights

**Change:** in `apps/spotlight/src/main.tsx`:

- Replace the six `@fontsource/plus-jakarta-sans/<weight>.css` imports with the
  single `@fontsource-variable/plus-jakarta-sans` variable family (covers the
  400–700 range actually used).
- Drop the unused 200 and 300 weights (no references in the codebase).
- Import only the `latin` subset; drop `latin-ext` (Spanish glyphs live in
  `latin`).
- Keep Arvo (400 + 400-italic) and JetBrains Mono (400) unchanged — no variable
  build needed for single-weight families.

**Dependency:** `@fontsource-variable/plus-jakarta-sans` is new → run
`secure-dep-vetting` (latest secure version, Node 24 compat, CVE check) before
adding. Remove `@fontsource/plus-jakarta-sans` once unused (`knip` confirms).

**Verify:** rebuild; font file count drops sharply. Visual check that headings
(600/700) and body (400/500) still render in Plus Jakarta. `spotlight-ci` knip
passes (no orphaned font dep).

### PR3 — PNG logos → WebP (build-time)

**Change:** convert the 4 logo PNGs to WebP at build time via
`vite-imagetools`.

- Add `vite-imagetools` to spotlight (dev dep) → `secure-dep-vetting`.
- Wire the plugin in `apps/spotlight/vite.config.ts`.
- Update logo imports to request WebP (e.g.
  `import logo from "...logo-color.png?format=webp&w=..."` per the plugin's
  query API; exact syntax finalized in the plan).
- Add explicit `width`/`height` on `<img>` to prevent layout shift;
  `loading="lazy"` on below-fold logo instances (keep the above-fold/nav logo
  eager).

**Rejected alternative:** pre-convert and commit `.webp` files by hand — works
but bypasses the build and leaves stale binaries to maintain. Build-time keeps
PNG as source of truth.

**Verify:** rebuild; logo assets emit as WebP (~70% smaller). Visual check on
dark/blue/light backgrounds (transparency preserved). `bundle-budget-watcher`
confirms image delta.

### PR4 — Fetch-on-visible + footer portal link

Two independent bits in one slice (both small, both spotlight-only).

**4a. Fetch-on-visible.** Add an IntersectionObserver gate so below-fold
Firestore reads fire only when the section nears the viewport.

- New hook `src/lib/use-async-on-visible.ts` (or an `enabled`/`ref` option on a
  thin wrapper over the existing `useAsync`) — returns a ref to attach to the
  section plus the same `Async<T>` shape. Until the ref intersects, stays in the
  initial `loading:true` + empty state without fetching.
- Apply to below-fold home sections only: allies wall, showcase grid. The
  above-fold hero/config path stays eager (`useSiteConfig` unchanged).
- Must not regress the empty-state / skeleton rendering that exists today.

**4b. Footer portal link.**

- New `src/config/external-links.ts`:
  ```ts
  export const BACKSTAGE_URL = "https://jcioriente-backstage.web.app";
  ```
  Single source of truth so a future custom domain is a one-line change.
- In `src/components/footer.tsx`, add a list item to the **"Sitio"** column:
  `Portal de miembros` → `BACKSTAGE_URL`. It is an external app (different
  origin), so a plain anchor with same-tab navigation — **not** the SPA
  `navigate()` used by the in-site links. Backstage is auth-gated, so the link
  lands on its login screen.

**Verify:** rebuild + manual check. Below-fold reads do not fire until scroll
(observe Network in devtools). Footer shows the new link in the Sitio column and
navigates to the backstage URL.

## Cross-cutting

- Each PR follows the repo flow: branch off `main`, TDD where it applies
  (firestore readers, the visibility hook), `react-best-practices` (auto on
  `.tsx`), `/simplify` on the diff, `superpowers:verification-before-completion`
  before claiming done, `bundle-budget-watcher` after each frontend change, PR
  via `gh pr create`, `pnpm pr-tests` locally.
- No security-review trigger: none of these touch `apps/beacon`,
  `firestore.rules`, or auth code. (PR1 *removes* SDK surface from a public app —
  strictly reductive.)
- New deps (`@fontsource-variable/plus-jakarta-sans`, `vite-imagetools`) gate on
  `secure-dep-vetting`.

## Success criteria

- Spotlight firebase footprint reduced to firestore-lite (largest single
  reduction; measured via the dist chunk + `bundle-budget-watcher`).
- Font file count and image weight materially lower vs the 2026-06-22 baseline.
- Below-fold Firestore reads deferred until their section is near the viewport.
- `Portal de miembros` link present in the footer Sitio column, URL sourced from
  `external-links.ts`.
- All gates green: `spotlight-ci` (prettier/eslint/tsc/build/vitest/knip/
  size-limit), `pnpm pr-tests`, no SWR/skeleton regressions.
