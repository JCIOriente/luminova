# Spotlight — Claude Code Guide

Public marketing site for JCI Oriente. No authentication, no backend of its own.

## Rules

- **No auth** — never call `getFirebase()` (auth/storage/functions); import from `@luminova/firebase/lite`, never the `@luminova/firebase` barrel (eslint enforces).
- **No TanStack Query** — no `@tanstack/react-query` in this app.
- **Firestore is lite-SDK only** via `getFirestoreLite()`: one-shot reads (public `showcase` collection) plus exactly two **creates** — the contact form's `leads` doc and the push opt-in's `pushTokens/{token}` doc. No realtime listeners, no auth reads, no other collection written. The lite path initializes **App Check** (reCAPTCHA v3) via the shared `initAppCheck` so reads/writes carry a token under enforcement.
- **Contact form persists a lead** — validate with `leadSchema`, write one `leads` doc via `submitLead` (lite `addDoc`), then success toast + reset; the `leads` create rule (`firestore.rules`) is the trust boundary. Handle all three states (submitting / success / error) — never swallow the write error.
- **Push opt-in persists a token** — the soft prompt writes one anonymous `pushTokens/{token}` doc (`setDoc`, `{ createdAt }` only — no PII), gated by the `pushTokens` create rule. Reach it ONLY via dynamic `import("./notifications/push-registration")` so `firebase/messaging` (`@luminova/firebase/messaging`) stays in the lazy opt-in chunk — never on the eager shell or in `site-data` (loads on every page). See `docs/specs/2026-07-21-notifications-design.md`.
- **Route files export only `Route`** — any extra export silently disables auto-code-splitting for that route; put pages in component modules and have tests import those.
- **Real org data** — actual names, stats, content; no lorem ipsum.
- **Responsive** — mobile-first, all screen sizes.
- **Light-background route** → add it to `LIGHT_HERO_ROUTES` in `src/components/header.tsx`, or the header nav renders invisible.
- **OG image**: WhatsApp caches it by exact URL with no re-scrape. A new image gets a new file name (`og-image-v3.png`) updated in every `index.html` reference — never a query-string bust. Per-route OG images do nothing (SPA rewrite + non-JS crawlers) without a crawler-serving function.
- **Public jargon** — umbrella word "proyectos"; "programa" only for annual institutional programs; "iniciativa" banned (eslint `no-restricted-syntax`, spotlight-only). "programa" misuse isn't lintable — review by hand. See `docs/specs/2026-07-10-impacto-unification-design.md`.

## Harness

- **CI.** `pnpm --filter spotlight run ci` (eslint → tsc → vitest; rolled into `pnpm pr-tests`). Eager-JS and index-CSS budgets are gated by `tools/scripts/check-bundle-budget.sh` (CI `checks` job only, not `pr-tests`); the route-chunk budget (≤ 40 kB gz) is not gated — after `pnpm --filter spotlight build`, measure each `apps/spotlight/dist/assets/*.js` with `gzip -c <f> | wc -c` (`bundle-budget-watcher` does not measure chunk sizes yet).
- **Performance** — load perf is the priority. Budgets (source of truth: `docs/performance.md`): eager JS ≤ 108 kB gz, index CSS ≤ 17 kB gz, any route chunk ≤ 40 kB gz. LCP is hero **text** (no raster hero); the sans woff2 is preloaded by `preloadJakartaLatin()` in `vite.config.ts` — don't duplicate. Keep fonts latin-only, below-fold reads on `useAsyncOnVisible`. Dispatch `bundle-budget-watcher` after dep/route changes.
