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

Baseline measured on `main` (gzip transfer sizes unless noted):

| Lever | spotlight | backstage |
|-------|-----------|-----------|
| Initial JS (`index-*.js`) | **91 kB gz** | **104 kB gz** |
| Initial CSS (`index-*.css`) | 12 kB gz | 11 kB gz |
| Largest route chunk | `about` 21 kB gz | `_app` 8 kB gz |
| Firebase SDK | `firestore-lite` 39 kB gz, **lazy** (data routes only) | full SDK in the `index` shell |
| Fonts (woff2, self-hosted, latin only) | Jakarta 26 kB + Arvo reg/italic 16 kB ea. | none (system-ui — fastest) |

What's already in place (don't redo these):

- **Firebase lite SDK** on spotlight via `@luminova/firebase/lite` — read-only `getFirestoreLite()`,
  split into its own lazy chunk (378 kB→40 kB gz public firebase).
- **Latin-only self-hosted fonts** + `font-display: swap`; the above-the-fold sans woff2 is
  **preloaded** by the `preloadJakartaLatin()` Vite plugin in `apps/spotlight/vite.config.ts`.
- **Route + SDK code-splitting** — TanStack `autoCodeSplitting: true`; each route is its own chunk.
- **WebP logos** — spotlight-scoped `vite-imagetools` rewrites shared PNG logos to WebP at build.
- **Below-fold data deferral** — `useAsyncOnVisible` (IntersectionObserver) gates showcase/ally reads.
- **Images** — every `<img>` is `loading="lazy"` and media containers set `aspect-ratio` (no CLS).
  LCP on spotlight is hero **text** (no raster hero) → gated by font+CSS, which the preload covers.
- **Immutable asset caching + preconnect** — `firebase.json` pins `/assets/**` to
  `public, max-age=31536000, immutable` and HTML/routes to `no-cache`; both apps `preconnect` to the
  Firebase origins they hit (Storage on spotlight; auth + Firestore + Storage on backstage).

---

## 2. Targets & budgets

**Core Web Vitals** (field targets, mobile, deployed site):

| Metric | Target | Primary levers |
|--------|--------|----------------|
| **LCP** (Largest Contentful Paint) | < 2.5 s | preload LCP resource, immutable assets, font subset+swap |
| **FCP** (First Contentful Paint) | < 1.8 s | render-blocking budget, preconnect, (future) SSG |
| **CLS** (Cumulative Layout Shift) | < 0.1 | `aspect-ratio`/`width`+`height` on media, reserved space |
| **INP** (Interaction to Next Paint) | < 200 ms | code-split, lazy heavy components, small main-thread bundle |

**Bundle budgets** (gzip; CI is task-runner-based — these are enforced by judgment +
`bundle-budget-watcher`, not yet a hard gate):

| Budget | spotlight | backstage |
|--------|-----------|-----------|
| Initial JS (`index` chunk) | ≤ **100 kB gz** (now 91) | ≤ **115 kB gz** (now 104, monitor) |
| Initial CSS | ≤ 15 kB gz (now 12) | ≤ 15 kB gz (now 11) |
| Any single route chunk | ≤ 40 kB gz | ≤ 40 kB gz |
| New runtime dependency | justify if it adds > 10 kB gz to any initial chunk | same |

Breaching a budget is not automatically a blocker — but it **must** be a conscious, noted decision
in the PR, with the `bundle-budget-watcher` report attached.

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
| Code-split routes + lazy heavy components | Less main-thread parse/exec | ✅ routes; ⚠️ lightbox (backlog) |
| Tree-shake / drop unused deps (`knip`) | Smaller, faster bundle | ✅ knip-gated |
| Defer below-fold work (IntersectionObserver) | Main thread free at load | ✅ `useAsyncOnVisible` |
| Subpath / lite SDK imports | Drops unused vendor code | ✅ firebase/lite |

---

## 4. Backlog (ranked — next perf efforts, NOT yet done)

| # | Lever | Effort | Impact |
|---|-------|--------|--------|
| 1 | `rollup-plugin-visualizer` → crack the ~91–104 kB-gz `index` shell, then trim (e.g. `clsx` in header, audit `@luminova/ui` barrel pull-in) | S→M | Med (INP, download) |
| 2 | Lazy-load `yet-another-react-lightbox` on `/impacto/$id` (open-on-demand) | S | Low-Med |
| 3 | `decoding="async"` on the lazy `<img>`s | XS | Low |
| 4 | SSG / prerender static routes (TanStack Start or `vite-plugin-ssg`) — ship real HTML instead of a blank div + JS render | L | **High (FCP/LCP on slow devices)** |
| 5 | Inline critical CSS / cut the render-blocking CSS | M | Low-Med |

Pick from the top; measure before and after (§6).

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
  delta against §2 budgets. Record the result in the PR.

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
- **Per-chunk gz quickcheck:** `for f in apps/<app>/dist/assets/index-*.js; do gzip -c "$f" | wc -c; done`.
- **Cache headers (e2e):** `firebase emulators:exec --only hosting --project jci-oriente` then
  `curl -sI <local-url>/assets/<file>` (expect `immutable`) and `<local-url>/` (expect `no-cache`).
  The hosting emulator serves each target on its own port (printed at startup); free port 4000 first
  (kill any running dev emulator) or override `emulators.hosting.port` transiently.
- **Field/lab Core Web Vitals:** Lighthouse / PageSpeed Insights against the deployed site
  (`https://jcioriente.web.app`), mobile profile.
