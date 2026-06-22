# Spotlight Fast Page Load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut spotlight's initial load — strip the full firebase SDK from the public bundle, ship a variable font, serve WebP logos, and defer below-fold reads; add a member-portal footer link.

**Architecture:** Four file-disjoint PRs, each built in its own `.worktrees/<slug>` worktree off `main` (worktree-first is MANDATORY per CLAUDE.md). PR1 also carries the spec + this plan. Each PR runs scoped checks (`pnpm --filter spotlight run ci`, plus `@luminova/firebase` ci for PR1) inside its worktree — never the primary checkout.

**Tech Stack:** pnpm workspaces, Vite 8, React 19, TanStack Router, Tailwind v4, `firebase/firestore/lite`, `@fontsource-variable/*`, `vite-imagetools`, vitest, ESLint.

**Spec:** `docs/specs/2026-06-22-spotlight-fast-page-load-design.md`

---

## PR1 — `@luminova/firebase/lite` subpath export

**Worktree/branch:** `feat/spotlight-fast-load` (already exists, holds spec+plan).

**Files:**
- Modify: `packages/firebase/package.json` (`exports` map)
- Modify: `apps/spotlight/src/allies/ally-showcase-firestore.ts:2`
- Modify: `apps/spotlight/src/site-config/site-config-firestore.ts:2`
- Modify: `apps/spotlight/src/showcase/showcase-firestore.ts:2`
- Modify: `apps/spotlight/eslint.config.*` (no-restricted-imports guard)
- Test: `apps/spotlight/eslint` (guard) + existing reader vitests

- [ ] **Step 1: Add the subpath export**

In `packages/firebase/package.json`, replace the `exports` block:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./lite": "./src/firestore-lite.ts"
}
```

`src/firestore-lite.ts` already exports `getFirestoreLite` and imports only
`firebase/app` + `firebase/firestore/lite`. No dist (build is `tsc --noEmit`).

- [ ] **Step 2: Point spotlight at the lite entry**

In all three readers, change the import specifier only:

```ts
import { getFirestoreLite } from "@luminova/firebase/lite";
```

(Files: `allies/ally-showcase-firestore.ts`, `site-config/site-config-firestore.ts`, `showcase/showcase-firestore.ts`.)

- [ ] **Step 3: Add the ESLint guard (failing first)**

In spotlight's ESLint config, add a `no-restricted-imports` rule:

```js
"no-restricted-imports": ["error", {
  paths: [{
    name: "@luminova/firebase",
    message: "Spotlight is public/lite-only. Import from '@luminova/firebase/lite'.",
  }],
}],
```

- [ ] **Step 4: Verify the guard catches the barrel**

Temporarily revert one reader to `from "@luminova/firebase"`, run
`pnpm --filter spotlight run lint`. Expected: FAIL on that import. Restore the
`/lite` specifier; lint passes.

- [ ] **Step 5: Build + measure**

Run: `VITE_FIREBASE_EMULATOR_ENABLED=true pnpm turbo run build --filter spotlight --force`
Expected: the firebase chunk shrinks (full SDK gone; only firestore-lite). Record
before/after gzip in the PR body.

- [ ] **Step 6: Scoped CI**

Run: `pnpm --filter spotlight run ci && pnpm --filter @luminova/firebase run ci`
Expected: all green (prettier, eslint w/ guard, tsc, build, vitest, knip).

- [ ] **Step 7: Commit**

```bash
git add packages/firebase/package.json apps/spotlight/src apps/spotlight/eslint.config.* docs/
git commit -m "perf(spotlight): import firebase via /lite subpath, drop full SDK from public bundle"
```

---

## PR2 — Variable Plus Jakarta font, drop dead weights

**Worktree/branch:** `feat/spotlight-variable-font`.

**Files:**
- Modify: `apps/spotlight/src/main.tsx:1-9`
- Modify: `apps/spotlight/package.json` (swap font dep)

- [ ] **Step 1: Vet + add the variable font dep**

Run `secure-dep-vetting` for `@fontsource-variable/plus-jakarta-sans` (latest
secure, Node 24, no CVE). Add it; remove `@fontsource/plus-jakarta-sans`.
`pnpm install`.

- [ ] **Step 2: Swap the imports in `main.tsx`**

Replace the six per-weight Plus Jakarta imports (lines 1-6) with the variable
family, latin subset only; keep Arvo + JetBrains as-is:

```ts
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/arvo/400.css";
import "@fontsource/arvo/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
```

(If a `latin`-only subpath is needed to drop latin-ext, use the package's
documented subset import; confirm against the installed package's exports.)

- [ ] **Step 3: Build + check font output**

Run: `VITE_FIREBASE_EMULATOR_ENABLED=true pnpm turbo run build --filter spotlight --force`
Expected: font file count drops sharply (one variable woff2 vs six static weights);
no `latin-ext` Plus Jakarta files.

- [ ] **Step 4: Visual confirm**

`pnpm --filter spotlight dev`; confirm headings (600/700) and body (400/500)
render in Plus Jakarta — variable axis covers them.

- [ ] **Step 5: Scoped CI**

Run: `pnpm --filter spotlight run ci`
Expected: green. knip must NOT flag the old font dep (it's removed) and must NOT
flag the new one as unused (imported in `main.tsx`).

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/main.tsx apps/spotlight/package.json pnpm-lock.yaml
git commit -m "perf(spotlight): use variable Plus Jakarta font, drop unused weights + latin-ext"
```

---

## PR3 — PNG logos → WebP (build-time)

**Worktree/branch:** `feat/spotlight-webp-logos`.

**Files:**
- Modify: `apps/spotlight/vite.config.ts` (add plugin)
- Modify: `apps/spotlight/package.json` (dev dep)
- Modify: logo import sites (grep `logo-*.png` importers)

- [ ] **Step 1: Vet + add `vite-imagetools`**

Run `secure-dep-vetting` for `vite-imagetools` (dev dep, latest secure, Node 24).
Add it; `pnpm install`.

- [ ] **Step 2: Wire the plugin**

Append to the existing multiline `plugins` array in `apps/spotlight/vite.config.ts`
(the post-#92 form with `tanstackRouter({ routeFileIgnorePattern })`, `react()`,
`tailwindcss()`):

```ts
import { imagetools } from "vite-imagetools";
// plugins: [ tanstackRouter({...}), react(), tailwindcss(), imagetools() ]
```

- [ ] **Step 3: Convert logo imports to WebP**

Find importers: `grep -rn "logo-.*\.png" apps/spotlight/src`. Append the
imagetools query to each (per the plugin's API, e.g.):

```ts
import logoColor from "../assets/logo-color.png?format=webp&as=url";
```

Add explicit `width`/`height` to each `<img>`; `loading="lazy"` on below-fold
instances only (keep the nav/above-fold logo eager).

- [ ] **Step 4: Build + verify WebP emitted**

Run: `VITE_FIREBASE_EMULATOR_ENABLED=true pnpm turbo run build --filter spotlight --force`
Expected: logo assets emit as `.webp`, ~70% smaller than the PNGs.

- [ ] **Step 5: Visual confirm transparency**

`pnpm --filter spotlight dev`; check logos on dark / blue / light backgrounds —
transparency preserved.

- [ ] **Step 6: Scoped CI + commit**

```bash
pnpm --filter spotlight run ci
git add apps/spotlight/vite.config.ts apps/spotlight/package.json apps/spotlight/src pnpm-lock.yaml
git commit -m "perf(spotlight): serve logos as build-time WebP"
```

---

## PR4 — Fetch-on-visible + footer portal link

**Worktree/branch:** `feat/spotlight-fetch-on-visible`.

**Files:**
- Create: `apps/spotlight/src/lib/use-async-on-visible.ts`
- Test: `apps/spotlight/src/lib/use-async-on-visible.test.ts`
- Create: `apps/spotlight/src/config/external-links.ts`
- Modify: below-fold section components (allies wall, showcase grid on home)
- Modify: `apps/spotlight/src/components/footer.tsx` (Sitio column)

### 4a. Fetch-on-visible hook

- [ ] **Step 1: Failing test**

`use-async-on-visible.test.ts` — assert the fetcher does NOT run until the
returned ref's element intersects (mock IntersectionObserver). On intersect, it
runs once and resolves `Async<T>`. Mirror the existing `useAsync` contract.

```ts
// pseudo: render hook, attach ref; observer not-intersecting → fetcher uncalled,
// state {data: empty, loading: true}. Trigger intersect → fetcher called once →
// state {data, loading:false}.
```

- [ ] **Step 2: Run test, confirm FAIL** (`pnpm --filter spotlight test use-async-on-visible`).

- [ ] **Step 3: Implement the hook**

Wrap `useAsync` semantics with an IntersectionObserver gate: return `{ ref,
...Async<T> }`. Until first intersection, stay `loading:true` + empty, no fetch.
On first intersect, fetch once (disconnect after). Preserve the `alive` cleanup
pattern from `lib/use-async.ts`.

- [ ] **Step 4: Run test, confirm PASS.**

- [ ] **Step 5: Apply to below-fold home sections only**

Allies wall + showcase grid: attach `ref` to the section wrapper, swap
`useAsync`→`useAsyncOnVisible`. Keep `useSiteConfig` (above-fold) eager. Do not
regress existing empty-state/skeleton rendering.

- [ ] **Step 6: External-links config + footer link**

`src/config/external-links.ts`:

```ts
export const BACKSTAGE_URL = "https://jcioriente-backstage.web.app";
```

In `footer.tsx`, add to the **Sitio** column (`<h4>Sitio</h4>` list, after
Programas) a plain external anchor — not SPA `navigate()`, not via `safeHref`:

```tsx
<li>
  <a href={BACKSTAGE_URL}>Portal de miembros</a>
</li>
```

- [ ] **Step 7: Build, manual check, scoped CI**

`pnpm --filter spotlight run ci`. In dev, confirm below-fold reads fire only on
scroll (Network tab) and the footer shows "Portal de miembros" → backstage URL.

- [ ] **Step 8: Commit**

```bash
git add apps/spotlight/src/lib apps/spotlight/src/config apps/spotlight/src/components/footer.tsx apps/spotlight/src
git commit -m "perf(spotlight): defer below-fold reads; add member-portal footer link"
```

---

## Integration (orchestrator, after subagents finish)

- [ ] Per branch: `/code-review` on the diff → apply findings → `/simplify` → re-run scoped CI.
- [ ] Dispatch `bundle-budget-watcher` after PR1/PR2/PR3 (asset/dep deltas).
- [ ] Open PRs **sequentially** via `gh pr create` (avoid parallel pr-create gate / emulator-port races); run `pnpm pr-tests` per branch.
- [ ] No `/security-review` trigger (no beacon/rules/auth touched; PR1 is reductive).
- [ ] After merges, `git worktree remove` each `.worktrees/<slug>`.

## Self-Review

- **Spec coverage:** PR1↔firebase bundle, PR2↔fonts, PR3↔images, PR4a↔fetch-on-visible, PR4b↔footer link. All four spec targets mapped. ✓
- **Placeholders:** font `latin`-subset import and imagetools query syntax are flagged as "confirm against installed package" — deliberate (exact API string is version-specific, verified at implementation, not guessed from memory). All other steps concrete. ✓
- **Type consistency:** hook named `useAsyncOnVisible` (file `use-async-on-visible.ts`) consistently; `BACKSTAGE_URL` constant consistent across config + footer. ✓
