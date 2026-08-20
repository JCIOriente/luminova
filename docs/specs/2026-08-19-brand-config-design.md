# Brand configuration — build-time white-labeling

Status: approved design, not yet implemented
Date: 2026-08-19
Branch: `feat/brand-config`

## Problem

Luminova is single-tenant by design: one deployment per chapter, forked. Adopting it
therefore means replacing every JCI Oriente value in the source. Today that is a manual
hunt, and the hunt demonstrably fails — the adoption instructions shipped in `#220` were
themselves incomplete twice, and a third gap (`external-links.ts`) was found immediately
after merge.

The failures are not cosmetic. A chapter that follows every documented step still ships:

- a public site whose "Ingresar" button sends **their** members to **our** admin login
  (`apps/spotlight/src/config/external-links.ts`)
- `rel=canonical` and `og:url` claiming their site is a copy of ours, so every WhatsApp
  share renders our image and search engines deduplicate them away
- member QR credentials prefixed `jcioriente:member:`, which means an Oriente member's
  QR code validates at their door

Configuration must replace enumeration. A value that lives in one typed place cannot be
half-replaced.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Repo identity | Chapter-neutral for text and URLs | Adopters never edit tracked shared files, so `git pull upstream main` stays conflict-free |
| Scope of neutrality | Enforced on production builds only | `vite serve` still defaults to the `jci-oriente` profile so `pnpm dev` needs no setup. Neutrality is a release guarantee, not a local-dev inconvenience |
| Default assets | JCI Oriente's own | Adds no new trademark exposure — those files are already committed and already carved out in `NOTICE`. Shipping a bare JCI mark would be the escalation, since that mark belongs to JCI Inc and a public Apache-2.0 repo grants reproduction rights we do not hold |
| Asset organisation | One directory per chapter under `brand/` | Purely additive, so a fork's profile folder can never conflict with upstream |
| Adopter registry | Text-only, and out of scope here | 888 KB of PNGs per chapter against a 5.27 MiB repo; a text registry gives the same social proof at ~2 KB and redistributes nobody's trademark |
| Icon generation | Deferred | Would reduce required assets from nine to four, but needs a native image dependency, which is a hard `allowBuilds` CI gate. Separate PR |

## Non-goals

- **i18n string extraction.** 116 `.tsx` files carry Spanish literals and no i18n library
  is installed. Its own PR, and it must land before inviting translation contributions —
  nobody volunteers to extract strings, but translating a finished `es.json` is a good
  first contribution.
- **Icon generation from a master image.**
- **The `chapters.json` adopter registry.** That is a policy decision about accepting
  outside contributions, not a build change.
- **Layer 1 runtime content.** Chapter history, mission, vision, values, stats, contacts,
  socials and linktree already live in `siteConfig/current`, editable at `/config` with no
  deploy. Untouched here.

## Inventory

Every hardcoded chapter value, verified by grep on `36bad45`. This list is the
implementation checklist.

**Build config**

- `apps/spotlight/vite.config.ts` — PWA `name`, `short_name`, `description`, `lang`,
  `theme_color`, `background_color`; `imagetools` include pattern pointing at
  `packages/ui/src/assets/logo-*.png`
- `apps/backstage/vite.config.ts` — same manifest fields
- `firebase.json` — hosting target names `jcioriente`, `jcioriente-backstage`
- `.firebaserc` — default project, hosting targets, storage target

**Static HTML and files**

- `apps/spotlight/index.html` — `theme-color`, `rel=canonical`, `description`, `<title>`,
  `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:url`, `og:image`,
  `og:image:secure_url`, `og:image:alt`, `twitter:title`, `twitter:description`,
  `twitter:image`
- `apps/backstage/index.html` — `theme-color`, `<title>`
- `apps/spotlight/public/sitemap.xml` — seven absolute URLs
- `apps/spotlight/public/robots.txt` — `Sitemap:` line
- `apps/spotlight/public/firebase-messaging-sw.js:16` and
  `apps/backstage/public/firebase-messaging-sw.js:19` — notification fallback title

**Source**

- `apps/spotlight/src/config/external-links.ts:1` — `BACKSTAGE_URL`
- `apps/backstage/src/lib/member-qr.ts:1` — `PREFIX = "jcioriente:member:"`
- `packages/ui/src/components/logo-lockup.tsx:27` — `alt="JCI Oriente"`
- `apps/backstage/src/features/auth/components/login-form.tsx:63` and
  `forgot-password-form.tsx:74` — `tu.nombre@jcioriente.bo` placeholder
- `apps/backstage/src/features/members/components/self-profile-form.tsx:105` —
  "sección Directiva de jcioriente.org"

**Assets** — `packages/ui/src/assets/logo-{color,on-dark,on-blue}.png`, and in both
apps' `public/`: `favicon-16`, `favicon-32`, `apple-touch-icon-180x180`, `pwa-192x192`,
`pwa-512x512`, `maskable-icon-512x512`; spotlight also has `og-image-v2.png` and
`og-linktree.png`.

`og-linktree.png` is referenced by nothing — no meta tag, no code, only a comment. It is
dead weight and gets deleted.

## Architecture

### Brand profile

```
brand/
  jci-oriente/
    brand.config.ts
    logo-color.png  logo-on-dark.png  logo-on-blue.png
    favicon-16.png  favicon-32.png  apple-touch-icon-180x180.png
    pwa-192x192.png  pwa-512x512.png  maskable-icon-512x512.png
    og-image-v2.png                                (optional; filename comes from the
                                                    config, not a fixed convention —
                                                    see Risks on OG cache invalidation)
  fixture-chapter/          1x1 placeholder PNGs, for the CI guard
```

`BRAND_PROFILE` selects one at build. Both apps declare a single Vite alias:

```
"@brand"  ->  <repo>/brand/${BRAND_PROFILE}
```

`@luminova/ui` is source-consumed (`main: "./src/index.ts"`, `build: "tsc --noEmit"`), so
the apps' Vite compiles its TSX directly and the alias resolves imports inside
`packages/ui` with no package-build plumbing.

### Config shape

Typed, so structured values stay structured:

```ts
export const brand = {
  slug: "jci-oriente",
  name: "JCI Oriente",
  shortName: "JCI Oriente",
  description: "Junior Chamber International Oriente",
  locale: "es",
  ogLocale: "es_BO",
  urls: {
    spotlight: { production: "https://jcioriente.web.app",
                 development: `http://localhost:${DEV_PORTS.spotlight}`,
                 preview:     `http://localhost:${PREVIEW_PORTS.spotlight}` },
    backstage: { production: "https://jcioriente-backstage.web.app",
                 development: `http://localhost:${DEV_PORTS.backstage}`,
                 preview:     `http://localhost:${PREVIEW_PORTS.backstage}` },
  },
  qrPrefix: "jcioriente",
  themeColor: { spotlight: "#0097D7", backstage: "#130F2D" },
  seo: { title, ogTitle, ogDescription, ogImageAlt, contactEmailPlaceholder },
  routes: ["/", "/about", "/impacto", "/contact", "/linktree", "/privacidad", "/terminos"],
} satisfies BrandConfig;
```

`routes` feeds the generated sitemap so it stops drifting from the router. `qrPrefix`
becomes chapter-scoped, closing the cross-chapter QR collision.

### Ports

A port is not chapter-specific, so it does not belong in a brand profile. One shared
module owns the numbers, which today exist only in the two Vite configs:

```ts
// config/dev-ports.ts — the only place these exist
export const DEV_PORTS = { spotlight: 5173, backstage: 5174 };
export const PREVIEW_PORTS = { spotlight: 4173, backstage: 4174 };
```

Both Vite configs read it for `server.port` / `preview.port`; brand configs compose their
local URLs from it. Changing a port moves the server and the URL together.

### URL resolution

`preview:local` already runs `build:local`, which sets
`VITE_FIREBASE_EMULATOR_ENABLED=true`. That existing signal distinguishes all three cases
without inventing a new Vite mode:

| Condition | URLs used |
|---|---|
| `vite serve` | `development` (5173 / 5174) |
| `vite build` with the emulator flag on | `preview` (4173 / 4174) |
| `vite build` otherwise | `production` |

This also fixes a live bug: `BACKSTAGE_URL` is hardcoded to production today, so a
contributor running emulators who clicks "Ingresar" lands on the real admin app.

### Consumers

| Consumer | Mechanism |
|---|---|
| App and UI source | `@brand` alias, plain import |
| PWA manifest | `VitePWA({ manifest })` built from the config object |
| `index.html` meta | `transformIndexHtml` plugin — the hook `preloadJakartaLatin` already uses |
| `sitemap.xml`, `robots.txt` | Generated into `dist/` from `urls` + `routes`; static files deleted |
| `firebase-messaging-sw.js` title | `__BRAND_NAME__` placeholder substituted at build |

The service worker is copied verbatim from `public/` and cannot import a module, so it
gets placeholder substitution rather than generation — the file stays readable and
debuggable as-is.

`index.html` keeps literal values as defaults so the file still renders standalone; the
plugin overwrites them at build. A broken plugin then shows as stale-but-valid meta
rather than an empty `<title>`.

## Validation and failure modes

The point of this PR is that a misconfigured fork fails loudly instead of shipping our
branding.

| Situation | Behaviour |
|---|---|
| `BRAND_PROFILE` unset, `vite serve` | Default to `jci-oriente`, log a warning. `pnpm dev` needs no setup |
| `BRAND_PROFILE` unset, `vite build` | Hard error |
| Profile directory missing | Hard error listing available profiles |
| Config fails schema validation | Hard error naming the field. Zod, matching the repo's parse-on-read convention |
| Required asset missing | Hard error naming the file |
| Optional OG image missing | Warn, omit the OG image tags rather than emit a 404 URL |

**No asset inheritance between profiles.** If a profile could fall back to another's
assets, a chapter forgetting their logo ships ours, silently, in production — the exact
failure this PR exists to prevent. Every profile must be complete or the build stops.

This is not in tension with the dev default above: an unset `BRAND_PROFILE` in `vite serve`
selects the `jci-oriente` profile *whole*. It never fills a gap in another profile. A
selected profile is always used complete or not at all.

## Testing

Unit:

- schema validation accepts a good config, rejects each malformed field
- URL resolution returns the right host for all three modes
- sitemap generation matches `routes`
- `member-qr` tests parameterized on the configured prefix instead of the literal

Build-level — the decisive guard, and the one that would have caught every error in `#220`:

```
BRAND_PROFILE=fixture-chapter pnpm build
grep -ri "jcioriente\|JCI Oriente" apps/*/dist/     # must return nothing
```

Wired into CI so it cannot rot, per `docs/engineering-guardrails.md` #6 — a guard named in
docs must actually exist and be wired.

Paired with the inverse: build with `jci-oriente` and assert the meta, manifest and
sitemap still carry our real values, so the refactor cannot quietly change our own
deployment.

## Documentation

The README / README.es adoption sections switch from enumerating paths to describing
configuration. `NOTICE` updates to match, since its branded-asset list is normative and
names specific paths that move.

## Risks

- Moving logos out of `packages/ui/src/assets/` changes the `imagetools` webp conversion
  on the public site. Dispatch `bundle-budget-watcher` afterward and note the `index`
  chunk gz delta.
- `packages/ui/tsconfig.json` and both apps need matching `paths` for `@brand`, or
  `tsc --noEmit` fails where Vite succeeds. `build` runs `tsc --noEmit && vite build`.
- `packages/ui/vitest.config.ts` needs the alias, or tests rendering `LogoLockup` break.
- `knip` may flag the new modules as unused if they are only reachable from
  `vite.config.ts`.
- `firebase.json` hosting target names are chapter-specific but cannot read the brand
  config — the Firebase CLI parses that file directly. **Decision: rename the targets to
  `spotlight` / `backstage`**, which confines chapter identity to `.firebaserc`. This is in
  scope. It touches deploy, so it must be verified against `docs/ci-cd.md` and the deploy
  workflow's target references before merge — a stale target name breaks CD, not the build,
  so CI will not catch it.

- **`og-image-v2.png` must not be renamed to `og-image.png` without thought.** WhatsApp and
  other scrapers cache OG images by URL. Renaming makes every previously shared link point
  at a file that 404s, silently losing the preview image on links already circulating. Keep
  the existing filename in the `jci-oriente` profile, and let the config name the file
  rather than hardcoding a convention. New profiles may use any name.

## Follow-ups

1. Icon generation from a single master, cutting required assets to four.
2. i18n string extraction, `es` as the reference locale.
3. `chapters.json` adopter registry plus a showcase rendering from it.
