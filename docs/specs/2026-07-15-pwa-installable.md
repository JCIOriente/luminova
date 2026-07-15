# Spec — Installable PWA for spotlight & backstage

**Date:** 2026-07-15
**Status:** Draft (pre-implementation)
**Author:** Claude (research-backed; sources cited inline)

## Goal

Make both frontends installable PWAs:

- `apps/spotlight` (public marketing, no auth) — installable + offline-capable app shell.
- `apps/backstage` (admin, auth + Firestore + App Check) — installable + app-shell only; **no authed-data caching**.

Deploy targets unchanged: `jcioriente` / `jcioriente-backstage`.

## Decisions (locked with user 2026-07-15)

1. **Backstage scope:** installable + app-shell precache only. Firestore/auth requests stay **network-only** — zero authed data at rest in Cache Storage.
2. **Icons:** generated from `apps/spotlight/public/favicon.svg` (square JCI mark, `#0097D7` bg). Same mark both apps for v1.
3. **Update/install UX:** `registerType: 'prompt'` → reload toast ("Nueva versión disponible"); native browser install (no custom `beforeinstallprompt` button in v1).

## Research basis (2025-2026, primary-source verified)

- **Tooling:** `vite-plugin-pwa@1.3.0` (latest). Vite peer `^6 || ^7 || ^8`; **no React peer** (React 19 fine — hook is `useState`-only). Default strategy `generateSW` (Workbox). `workbox-window` needed as dev dep for the React register module. [npm registry, plugin source]
- **`generateSW` does NO runtime caching by default** — Firebase endpoints (`firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `firebasestorage`) are untouched unless a `runtimeCaching.urlPattern` matches them. **Do not add a broad `googleapis.com` wildcard.** [Workbox docs]
- **Cache Storage is same-origin JS-readable, ignores `no-store`, persists past logout** → never cache authed response bodies. [MDN, web.dev, OWASP WSTG]
- **`cacheableResponse.statuses` defaults to `[200]`** → App Check 401/403 never cached for free; don't widen it. [workbox-cacheable-response]
- **Precache = all hashed `css/js/html`.** The firebase manualChunk lands in precache (fine — hashed, `cleanupOutdatedCaches` on). A chunk `> 2 MiB` **fails the build**; bound via `maximumFileSizeToCacheInBytes` or `globIgnores`. [vite-pwa FAQ]
- **`navigateFallback: 'index.html'` is the plugin default** (correct for TanStack Router SPA). Add `navigateFallbackDenylist` for Firebase `/__/auth/*`. [plugin source]
- **iOS quirks:** Safari ignores manifest for splash + icon precedence → supply `apple-touch-icon` 180×180 in `<head>`; keep `apple-mobile-web-app-capable` / `mobile-web-app-capable`. [web.dev, MDN]
- **Maskable:** `purpose:"maskable"` **separate** entry from `"any"`, opaque bg, content in 80%-diameter safe circle. Source SVG already satisfies this. [MDN, web.dev]
- **Lighthouse PWA category removed (v12, 2024-04)** → verify installability via DevTools → Application → Manifest, not Lighthouse. SW-with-fetch-handler **no longer required** for menu-install (Chrome 108/112+); ambient `beforeinstallprompt` still wants one. [Lighthouse release notes, Chrome blog]
- **`devOptions.enabled` = false by default** → SW off in dev; set true only to test locally. [vite-pwa docs]

## Firebase Hosting — already mostly correct

`firebase.json` `hosting` is a per-target array. **Both targets already have** `**` → `Cache-Control: no-cache` and `/assets/**` → `immutable`. That already satisfies the SW / `index.html` / `manifest` no-cache rule (they fall under `**`). Minimal change:

- Add `manifest.webmanifest` → `Content-Type: application/manifest+json` (Firebase default MIME unverified).
- Optional: `/workbox-*.js` → immutable (it's hashed but emitted at root, currently caught by `**` no-cache — safe, just re-fetched each load).

No structural rewrite needed. Low conflict risk between the two apps' changes.

## Per-app implementation

### Shared (both apps)
- Dep: `vite-plugin-pwa@1.3.0` (per-app `devDependencies`); `workbox-window`, `@vite-pwa/assets-generator` dev. Vet via `secure-dep-vetting`.
- Icon set generated from `favicon.svg`: `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon-180x180.png`, plus `favicon` fallbacks.
- Reload toast: shared `@luminova/ui` component `PWAReloadPrompt` (extract-don't-copy — used by both apps) wrapping `useRegisterSW`. Renders `needRefresh` → toast with "Recargar" calling `updateServiceWorker(true)`, and `offlineReady` → brief "Listo para usar sin conexión".

### spotlight (`apps/spotlight`)
- `VitePWA({ registerType: 'prompt', manifest: {...}, workbox: { globPatterns, navigateFallbackDenylist } })` in `vite.config.ts`.
- Manifest: name "JCI Oriente", short_name "JCI Oriente", `theme_color #0097D7`, `background_color`, `display standalone`, `start_url /`, icons (192/512/maskable), `lang es`.
- Mount `<PWAReloadPrompt/>` at root layout.
- `index.html`: `apple-touch-icon`, `theme-color` meta.
- Offline: app-shell precache is enough (static marketing content). Optional offline fallback route.

### backstage (`apps/backstage`)
- Same plugin wiring, **but**:
  - No `runtimeCaching` for any Firebase/authed origin. Leave `runtimeCaching` empty (shell precache only).
  - `navigateFallbackDenylist: [/^\/__\/auth\//]` (Firebase auth handler paths).
  - Keep `cacheableResponse.statuses` default `[200]`.
- Manifest: name "JCI Backstage" / short_name "Backstage" so the install is distinguishable from spotlight on the home screen. Needs `public/` dir (currently none) for icons + manifest source.
- Mount `<PWAReloadPrompt/>` in the authed app layout.
- **Security-sensitive:** SW is a new trust surface → `/security-review` on the diff + `firestore-security-reviewer` sanity (no rules change expected, but confirm no data-caching sneaks in).

## Verification

- `pnpm --filter <app> build` succeeds (no `maximumFileSizeToCacheInBytes` build error from the firebase chunk).
- `bundle-budget-watcher` — note `index`-chunk gz delta (Workbox register adds a little; precache manifest inflates the SW, not the entry).
- Manual: DevTools → Application → Manifest shows installable, no warnings; install; offline-boot the shell; trigger an update → toast appears.
- backstage: DevTools → Application → Cache Storage after login shows **no** Firestore/token responses.
- `/security-review` on backstage diff.

## Open / follow-up

- Real branded icons (v1 uses the JCI mark for both; backstage could get a distinct accent so installs don't visually collide).
- `apple-touch-startup-image` splash screens (per-device) — deferred, cosmetic.
- Custom `beforeinstallprompt` "Instalar app" button — deferred (v1 uses native).
- Offline fallback page for spotlight — optional.

## Plan of record

One worktree `feat/pwa` off `main`. Shared infra (deps, icons, `@luminova/ui` PWAReloadPrompt, `firebase.json`) done centrally; per-app wiring (spotlight vs backstage) fanned out to parallel **fable** subagents (independent app dirs). One PR (scoped commits: `feat(spotlight)`, `feat(backstage)`, `feat(ui)`, `chore(hosting)`), or split into two stacked PRs per app if review prefers.
