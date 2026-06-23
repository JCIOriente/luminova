# Spotlight UI polish — 2026-06-22

Branch `feat/spotlight-ui-polish` · PR #98 (base `main`).

## Shipped

- **Hero motto config-driven.** New top-level `hero {motto, submotto}` on `SiteConfig`.
  Home hero (`apps/spotlight/src/routes/index.tsx`) reads it; default is the JCI Oriente
  essence **"Se ve, se siente, el espíritu de Oriente."** (dropped term-specific
  "Inspira / A fire shared never dies" and the English "Inspire." eyebrow). Editable in
  backstage `/config` new **Portada** section.
- **Social + external links.** Added `contact.socials {instagram,facebook,tiktok,linkedin}`
  + `contact.mapUrl` to config. Footer + contact page render them via a shared
  `SocialIconLinks` component (`apps/spotlight/src/components/social-icon-links.tsx`,
  list in `config/social-links.ts`), guarded by `safeHref`. Real URLs seeded in
  `defaults.ts`; JCI Bolivia footer link → `https://jcibolivia.org/`. "Red JCI" stays a
  heading (no link), per request. Backstage **Contacto** section gains social + map inputs.
- **Legal pages.** New `/privacidad` + `/terminos` routes with real Spanish copy via a
  shared `LegalPage` component; footer links wired (were dead `#`).
- **Sede → Google Maps.** Contact "Sede" row + map card link to `contact.mapUrl`
  (default = `https://maps.app.goo.gl/VtmEnphZxKmfD4bA9`).
- **Navbar contrast.** `header.tsx` `overToneFor` now uses a route tone table:
  `/programas` + `/impacto` (dark heroes) → white nav text; `/about` + `/impacto/:id`
  (blue) → white; trailing-slash normalized. Comment warns to extend the table for new
  colored-hero routes.

Plumbing: type (`packages/types/src/site-config.ts`) + zod schema + spotlight reader
(`use-site-config.ts`) + defaults + backstage form + mapper + `BLANK_CONFIG`.

## Verification

- `pnpm typecheck` 11/11 · `pnpm lint` 7/7.
- spotlight ci 30/30 · backstage ci 82 files / 351 · types ci 121 · beacon ci 147.
- `pnpm --filter spotlight build` green (routeTree regenerated for the 2 new routes).
- /simplify: 4 cleanup agents → applied shared `SocialIconLinks`, `CONTACT_SOCIALS`
  derived from `SOCIAL_LABELS`, hoisted Sede `safeHref` + footer year, header tone
  table, `SiteSocials` JSDoc. Skipped enlaces-socials merge (divergent key sets) and
  useMemo/legal-prose (render-once pages).
- /security-review: clean. All new admin-URL sinks via `safeHref` + zod `safeUrl`/
  `optionalSafeUrl`; motto rendered as escaped text; no raw-HTML render sinks;
  `siteConfig/current` rule unchanged (world-read / Admin-write). Stamped `efe0e85`.
- `pnpm pr-tests`: **firestore-rules-tests failed — port taken by the running dev
  emulator** (PID held `emulators:start --import`), NOT this diff (touches no rules/beacon).
  Re-run with the dev emulator stopped to get a fully green pr-tests.

## Decisions

- `contact.socials` (flat object, 4 platforms) is intentionally separate from
  `linktree.socials` (ordered array, 6 platforms) — different surfaces. Noted in a type
  comment. URL edited in two places if both used; acceptable for now.
- No migration: dev phase, prod siteConfig doc not seeded (per user). New fields fall
  back to defaults via `?? SITE_CONFIG_DEFAULTS.hero` in the reader and
  `?? { motto:"", submotto:"" }` in the mapper.

## Deferred / follow-ups

- Real legal copy is starter text — review before public launch (not lawyer-vetted).
- Backstage `/config` not re-reviewed for the new form fields with a UX/a11y pass
  (form pattern mirrors existing sections).
- Full `pnpm pr-tests` green requires stopping the dev emulator (standing limitation).
