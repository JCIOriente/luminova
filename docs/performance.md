# Performance — budgets, targets & optimization playbook

Single source of truth for web performance across the frontends (`apps/spotlight`,
`apps/backstage`). Covers what's already optimized, the Core-Web-Vitals targets and bundle
budgets we hold the line on, the technique reference, the ranked backlog, and the **guardrails
Claude follows on every change** so the apps stay fast.

> Scope note: `spotlight` is the public marketing site — its load performance is user-facing and
> the priority. `backstage` is auth-gated (admin) — its first paint is a login screen behind a
> credential wall, so it gets the cheap infra wins (caching, preconnect) but is **monitored**, not
> aggressively tuned. `beacon` is Cloud Functions (server) — out of scope here.

---

## 1. Current state

Measured with `gzip -c` (the tool the CI gate uses) unless noted. **Eager JS** is
the honest metric: the entry `<script>` **plus** every `<link rel="modulepreload">`
in the built `dist/index.html`, summed — not just `index-*.js`. Rolldown hoists
chunks out of `index` and modulepreloads them separately (spotlight's firebase
`site-data` chunk, backstage's `icons` chunk), so an `index`-only number
understates what the browser fetches before paint.

| Lever | spotlight | backstage |
|-------|-----------|-----------|
| **Eager JS** (entry + modulepreloads) | **104 kB gz** | **278 kB gz** (icons chunk preloaded — PR2) |
| — of which `index-*.js` | 99 kB gz | 99 kB gz |
| Initial CSS (`index-*.css`) | 14.5 kB gz | 13 kB gz |
| Largest route chunk | `contact` 20 kB gz | `_app` 8 kB gz |
| Firebase SDK | `firestore-lite` + `app-check` ~38 kB gz `site-data` chunk, **fully async** (loads after paint on every route) | full SDK in the `index` shell |
| Fonts (woff2, self-hosted, latin only) | Jakarta 26 kB + Arvo reg/italic 16 kB ea. | none (system-ui — fastest) |

What's already in place (don't redo these):

- **Firebase lite SDK** on spotlight via `@luminova/firebase/lite` — read-only `getFirestoreLite()`,
  split into its own async `site-data` chunk (378 kB→~38 kB gz public firebase). `useSiteConfig`
  **dynamic-imports** the firestore reader inside its effect, so the shell (`Footer`) no longer drags
  firebase + App Check into the eager graph — it loads off the critical path, after first paint.
  This dropped spotlight eager JS from **140 kB → 104 kB gz** (−36 kB).
- **Latin-only self-hosted fonts** + `font-display: swap`; the above-the-fold sans woff2 is
  **preloaded** by the `preloadJakartaLatin()` Vite plugin in `apps/spotlight/vite.config.ts`.
- **Route + SDK code-splitting** — TanStack `autoCodeSplitting: true`; each route is its own chunk.
- **WebP logos** — spotlight-scoped `vite-imagetools` rewrites shared PNG logos to WebP at build.
- **Below-fold data deferral** — `useAsyncOnVisible` (IntersectionObserver) gates showcase/ally reads.
- **Images** — every `<img>` is `loading="lazy"` and media containers set `aspect-ratio` (no CLS).
  LCP on spotlight is hero **text** (no raster hero) → gated by font+CSS, which the preload covers.
- **Immutable asset caching + preconnect** — `firebase.json` pins `/assets/**` to
  `public, max-age=31536000, immutable` and HTML/routes to `no-cache`; both apps `preconnect` to the
  Firebase origins they hit (Firestore + Storage on spotlight; auth + Firestore + Storage on backstage).

---

## 2. Targets & budgets

**Core Web Vitals** (field targets, mobile, deployed site):

| Metric | Target | Primary levers |
|--------|--------|----------------|
| **LCP** (Largest Contentful Paint) | < 2.5 s | preload LCP resource, immutable assets, font subset+swap |
| **FCP** (First Contentful Paint) | < 1.8 s | render-blocking budget, preconnect, (future) SSG |
| **CLS** (Cumulative Layout Shift) | < 0.1 | `aspect-ratio`/`width`+`height` on media, reserved space |
| **INP** (Interaction to Next Paint) | < 200 ms | code-split, lazy heavy components, small main-thread bundle |

**Bundle budgets** (gzip). The **eager-JS + initial-CSS budgets are a hard CI gate** —
`tools/scripts/check-bundle-budget.sh` runs in the CI `checks` job (see `docs/ci-cd.md`
section 2) and fails on any breach. The gate sums **eager JS** (entry `<script>` +
every `modulepreload` in the built `index.html`), so it is no longer blind to
chunks hoisted out of `index`. The route-chunk and new-dep lines are not
machine-enforced yet — hold them by judgment + `bundle-budget-watcher`:

| Budget | spotlight | backstage |
|--------|-----------|-----------|
| Eager JS (entry + modulepreloads) | ≤ **108 kB gz** (now 104) | ≤ **285 kB gz** (now 278 — provisional, PR2 re-baselines after trimming the eager `icons` chunk) |
| Initial CSS (`index` chunk) | ≤ 15 kB gz (now 14.5) | ≤ 15 kB gz (now 13) |
| Any single route chunk | ≤ 40 kB gz | ≤ 40 kB gz |
| New runtime dependency | justify if it adds > 10 kB gz to eager JS | same |

Breaching the eager-JS budget fails CI. A deliberate breach means raising the budget **both**
here and in `tools/scripts/check-bundle-budget.sh` (the script hardcodes these numbers — keep the
two in sync), as a conscious, noted decision in the PR with the `bundle-budget-watcher` report
attached. Route-chunk/dep breaches aren't CI-blocked but need the same conscious note.

---

## 3. Optimization techniques reference

By metric — technique → what it does → status here.

### LCP (load)

| Technique | Effect | Status |
|-----------|--------|--------|
| Preload the LCP resource (font/hero image) | Fetched before CSS/layout discovers it | ✅ sans woff2 preloaded |
| `fetchpriority="high"` on the LCP image | Nothing queues ahead of it | n/a (LCP is text) |
| Never `loading="lazy"` the above-fold/LCP image | Lazy delays LCP | ✅ no above-fold raster |
| Responsive `srcset`/`sizes` + WebP/AVIF | Smallest bytes per viewport | ✅ WebP logos (partial) |
| Self-host fonts, subset, `font-display: swap` | Text paints immediately, no 3rd-party RTT | ✅ all three |
| Immutable cache for hashed assets | Instant repeat/nav loads | ✅ `firebase.json` |

### FCP / TTFB

| Technique | Effect | Status |
|-----------|--------|--------|
| SSR / SSG / prerender static routes | HTML paints before JS hydrates | ❌ backlog (biggest FCP win) |
| `preconnect` / `dns-prefetch` critical origins | Warms DNS+TLS before first use | ✅ both apps |
| Inline critical CSS, defer the rest | Removes a render-blocking round-trip | ⚠️ partial (Tailwind v4 makes it hard) |
| Brotli/gzip compression | Smaller transfer | ✅ Firebase Hosting auto |
| Minimal render-blocking `<head>` JS | Faster first paint | ✅ single module script |

### CLS

| Technique | Effect | Status |
|-----------|--------|--------|
| `aspect-ratio` or `width`+`height` on media | Reserves space, no reflow | ✅ set on media |
| Reserve space for async/injected content | No late push-down | ✅ skeletons |
| Font fallback metric matching (`size-adjust`) | No shift on font swap | ⚠️ minor swap shift |

### INP / TBT

| Technique | Effect | Status |
|-----------|--------|--------|
| Code-split routes + lazy heavy components | Less main-thread parse/exec | ✅ routes + lightbox (lazy on first open) |
| Tree-shake / drop unused deps (`knip`) | Smaller, faster bundle | ✅ knip-gated |
| Defer below-fold work (IntersectionObserver) | Main thread free at load | ✅ `useAsyncOnVisible` |
| Subpath / lite SDK imports | Drops unused vendor code | ✅ firebase/lite |

---

## 4. Backlog (ranked — next perf efforts)

| # | Lever | Effort | Impact | Status |
|---|-------|--------|--------|--------|
| 1 | **Backstage: lazy-load `QrCode`** (`@luminova/ui/qr-code`). `qrcode.react` was eager in the backstage `index` shell because two routes (`_app.me`, `_app.members_.$memberId`) imported it statically → rolldown hoisted it shared. Made it `lazy()` + `<Suspense>` (176×176 placeholder, no layout shift) like the sibling `QrScanner`. Result: `qrcode.react` now in its own `qr-code` chunk (6.1 kB gz), loaded only when a QR renders. **Index `index-*.js` 108.66 → 102.88 kB gz (−5.78).** | S | **Med (−5.78 kB gz off every backstage page)** | ✅ done |
| 2 | Lazy-load the `/impacto/$id` lightbox (open-on-demand) | S | Low-Med | ✅ done |
| 3 | `decoding="async"` on the lazy `<img>`s (+ `fetchPriority="high"` on the impacto detail hero) | XS | Low | ✅ done |
| 4 | SSG / prerender static routes (TanStack Start or `vite-plugin-ssg`) — ship real HTML instead of a blank div + JS render | L | **High (FCP/LCP on slow devices)** | open |
| 5 | Inline critical CSS / cut the render-blocking CSS | M | Low-Med | open |
| — | ~~Trim the spotlight `index` shell~~ | — | **Dropped** | measured: ~85% react-dom + TanStack Router (irreducible); `@luminova/ui` only ~24 kB src. No worthwhile cut — don't pursue. |

**Measurement note (2026-06-24):** the shells were broken down via the sourcemap `sourcesContent` (source-map-explorer fails on rolldown's Vite-8 sourcemaps — `generated column Infinity`). Spotlight `index` ≈ react-dom 533k + router 238k + `@luminova/ui` 24k (src bytes). Backstage `index` adds TanStack Query (~85k, needed); `qrcode.react` (44k src) was split out via item 1 (now its own `qr-code` chunk). Pick from the top; measure before and after (6).

---

## 5. Claude guardrails — keeping performance at peak

Apply on **every** frontend change. These are the rules, not aspirations.

**Dependencies**
- Run `secure-dep-vetting` before adding any dep (also weigh its bundle cost).
- Prefer **subpath / lite** imports (`firebase/firestore/lite`, not the full SDK) and named imports
  over namespace (`import *`) so tree-shaking works.
- A heavy dep used on one route or below the fold must be **lazy** (`lazy(() => import(...))` or a
  dynamic `import()`), never in a shared/initial chunk.
- After any dep or route change, **dispatch `bundle-budget-watcher`** and check the `index`-chunk gz
  delta against the section-2 budgets (CI enforces the index budgets via
  `tools/scripts/check-bundle-budget.sh`). Record the result in the PR.

**Code-splitting & main thread**
- Keep TanStack `autoCodeSplitting` on; don't collapse routes into the shell.
- Lazy-load rarely-used / below-fold components (modals, lightboxes, charts, editors).
- Defer below-fold data with `useAsyncOnVisible`; keep above-fold reads eager.

**Images**
- `loading="lazy"` + `decoding="async"` + an `aspect-ratio` (or `width`+`height`) on every `<img>`.
- **Never** lazy-load the LCP / above-fold image; give it `fetchpriority="high"` if it's an image.
- Serve WebP/AVIF; size to the viewport with `srcset`/`sizes`.

**Fonts**
- Self-host, **latin subset only** (the site is EN+ES), `font-display: swap`.
- Preload **only** the above-the-fold face (spotlight: the sans via `preloadJakartaLatin()`); never
  preload below-fold faces (Arvo) — they're `swap`-gated and shouldn't compete with the LCP fetch.
- Don't add a webfont to backstage — it renders in `system-ui` on purpose (zero font cost).

**Network / caching**
- Hashed assets (`/assets/**`) → `immutable, max-age=31536000`; HTML + SPA routes → `no-cache`
  (already in `firebase.json` — mirror it for any new hosting target).
- `preconnect` the cross-origin hosts a page hits on the critical path; keep it to ≤ ~4. Use
  `crossorigin` for CORS fetch/XHR (auth, Firestore), omit it for `<img>` (Storage images).

**Before cutting JS**
- Measure with `rollup-plugin-visualizer` first — never guess what's in a chunk. The route chunks
  and `firestore-lite` are already split; the lever is the shared shell.

---

## 6. How to measure

- **Bundle composition:** add `rollup-plugin-visualizer` to the app's `vite.config.ts` (dev-only),
  build, open the treemap. Identify what's eager in the `index` chunk before trimming.
- **Size report / dead code:** dispatch the `bundle-budget-watcher` subagent (build + size + `knip`).
- **Budget gate (same check CI runs):** build the frontends, then
  `bash tools/scripts/check-bundle-budget.sh` — compares each `index-*` chunk gz against section 2.
- **Per-chunk gz quickcheck:** `for f in apps/<app>/dist/assets/index-*.js; do gzip -c "$f" | wc -c; done`.
- **Cache headers (e2e):** `firebase emulators:start --only hosting --project jci-oriente`, then in another shell
  `curl -sI <local-url>/assets/<file>` (expect `immutable`) and `<local-url>/` (expect `no-cache`).
  The hosting emulator serves each target on its own port (printed at startup); free port 4000 first
  (kill any running dev emulator) or override `emulators.hosting.port` transiently.
- **Field/lab Core Web Vitals:** Lighthouse / PageSpeed Insights against the deployed site
  (`https://jcioriente.web.app`), mobile profile.
