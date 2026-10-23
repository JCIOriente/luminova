# Brand configuration — build-time white-labeling

Status: approved design, not yet implemented
Date: 2026-10-22
Plan: `docs/plans/2026-10-22-brand-config.md`

## 1. Problem

Luminova is single-tenant by design: one deployment per chapter, forked. Adopting it means
replacing every JCI Oriente value in the source, and that manual hunt fails. The README
adoption list has been incomplete more than once, and it still omits the Firebase web
config in `apps/*/.env.production`, the backstage copy, and the spotlight page copy (section 4).

A chapter that follows every documented step today still ships:

| Leak | Effect |
|---|---|
| `BACKSTAGE_URL` (`apps/spotlight/src/config/external-links.ts:4`) | "Ingresar" sends their members to our admin login |
| `apps/*/.env.production` | Their production bundle talks to **our** Firebase project |
| `PREFIX = "jcioriente:member:"` (`apps/backstage/src/lib/member-qr.ts:1`) | One chapter's member QR validates at another chapter's door |
| ~45 name, city and founding-year literals in `.tsx` | Our name and city on their public site and member portal |
| Logos, icons and OG image | Our marks on their home screen and on every WhatsApp share |

Configuration must replace enumeration: a value that lives in one typed place cannot be
half-replaced, and a build that cannot find a value or file must stop.

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Unit of configuration | A **brand profile**: `brand/<slug>/` with `brand.json` and `site-content.json` | Purely additive. A fork adds its own folder and never edits a tracked shared file, so `git pull upstream main` stays conflict-free |
| D2 | Text and config values | **Committed** JSON in the profile, validated by a zod schema; JSON Schema generated from it for editor autocompletion | Every value is public anyway (it ends up in HTML, the manifest or the bundle). Committed means reviewable, diffable, and readable by `jq` in CD with no build step. JSON over TS so non-developers can edit it and Node scripts load it without a loader |
| D3 | Image assets for real deployments | **Out of git**, in one gitignored root folder `brand-assets/` with fixed generic names (section 5.4) | Owner decision. An adopter's marks never enter the public repo, and the folder is the one obvious place to look |
| D4 | Committed example profile | `brand/jci-oriente/`, **with** its assets in `brand/jci-oriente/assets/` | Owner decision: `pnpm dev` works with zero setup for contributors |
| D5 | Trademark trade-off | The JCI Oriente logos and icons, which carry the JCI mark, stay in the public repo as the example profile. `NOTICE` keeps the carve-out, re-pointed at the new paths | Owner decision, accepted with its exposure: the files are already public today, and the carve-out states that the Apache-2.0 grant does not cover them |
| D6 | Stop an adopter shipping the example by accident | **Release mode** (section 5.6): a deploy build must name its profile explicitly, read assets only from `brand-assets/` pulled from that project's bucket, and target the Firebase project the profile names | Binding the profile to its own `projectId` makes the example undeployable anywhere but JCI Oriente's project, with no special case for JCI Oriente |
| D7 | Deployment asset storage | One private Cloud Storage bucket per Firebase project, `<projectId>-brand-assets`, read-only to the CD service account (section 5.7) | Owner decision. About 1 MB of files; cost is effectively zero (section 5.7) |
| D8 | No asset inheritance | A selected asset source is used complete or not at all; there is no per-file fallback between sources or profiles | A fallback is exactly how a chapter that forgot one logo would ship ours, silently |
| D9 | Hosting target names | Rename `jcioriente` / `jcioriente-backstage` to `spotlight` / `backstage`; site ids live in `brand.json` | `firebase.json` cannot read the brand config, so its target names must be chapter-neutral |
| D10 | `.firebaserc` | Generated (gitignored) from `brand.json` by `pnpm brand:apply`: the root `prepare` script on every install that links packages, plus explicit calls where a stale or missing file breaks something (the emulator script and the CD setup action; spike in section 5.9) | Its project id, site ids and storage bucket are brand values. Generated, it cannot point a fork at someone else's project. pnpm skips `prepare` on an "Already up to date" install, so `prepare` alone cannot be the only call site |
| D11 | Firebase web config | Moves from `apps/*/.env.production` into `brand.json` (`firebase.web`); the Vite plugin feeds it to Vite's env for production builds. `.env.production` keeps only `VITE_FIREBASE_EMULATOR_ENABLED=false` | The leak with the worst effect in section 1. The keys are public client identifiers (standing decision in `docs/roadmap.md`), so committing them in the profile changes nothing about secrecy |
| D12 | OG image URL | Content-hashed: `og-image.<sha256-8>.png`. A profile may list `og.legacyPaths`; `jci-oriente` lists `og-image-v3.png`, so the URL scrapers already cached keeps resolving | A new image gets a new URL automatically, which is the rule `apps/spotlight/CLAUDE.md` asks humans to follow by hand today. No query-string bust |
| D13 | Icon generation from one master | **In scope as an authoring helper** (`pnpm brand:icons`), not a build step | `@vite-pwa/assets-generator` and `sharp` are already in both apps' devDependencies and in `allowBuilds` (`pnpm-workspace.yaml:128-131`), so the native-build gate is already paid. Keeping it out of the build keeps CD free of image processing; the build still requires the explicit files of section 5.4 |
| D14 | Sitemap routes | Stay in `apps/spotlight/seo-files.ts` | Routes are app structure, not chapter identity. Only the origin comes from the profile |
| D15 | `qrPrefix` for JCI Oriente | Stays `jcioriente` | Member credentials already issued must keep scanning |
| D16 | Design tokens | Unchanged (`--color-jci-*` in `packages/ui/src/theme.css`) | The JCI palette is shared by JCI chapters, the primary adopters. Only `themeColor` (meta, manifest) is per profile |
| D17 | Chapter prose | Configuration, not i18n: every sentence that states a chapter fact is a template over profile tokens (`name`, `locality`, `foundedYear`, `movementName`, `stats.nationalOrganizations`) | An adopter's site must be correct on day one; waiting for i18n would ship our facts under their name |
| D18 | Selecting a profile locally | `BRAND_PROFILE` environment variable only, else the `jci-oriente` default. No selection file; `brand:init` prints the `export` line to add to the shell profile or `.envrc` | A gitignored selection file would change every build invisibly, and turbo does not hash it, so a cached build for another profile could be replayed. An env var is visible in the command and is part of turbo's task hash |

## 3. Non-goals

| Not in this work | Where it goes |
|---|---|
| i18n string extraction (UI stays Spanish; `locale` only drives `lang` and `og:locale`) | Follow-up 2 |
| Country localisation: the Bolivian phone rule (`packages/types/src/phone.ts`), `es-BO` datetime and the UTC pin (`packages/utils`) | Follow-up 3 |
| Per-profile design tokens / palette | Follow-up 4 |
| Runtime content already in `siteConfig/current` (history, mission, stats, contacts, socials, linktree), editable at `/config` | Unchanged. Only its seed and fallback move into the profile (section 5.3) |
| A `chapters.json` adopter registry | Follow-up 5; a policy decision, not a build change |
| Multi-tenancy | Never; one deployment per chapter |

## 4. Inventory

Every chapter value in source, verified by `git grep` at `520ae5c` (`origin/main`). This is the
implementation checklist; the CI guard (section 7) proves it complete.

**Build and deploy config**

| File:line | Value | Becomes |
|---|---|---|
| `apps/spotlight/vite.config.ts:8,64` | `SITE_URL` import → `seoFiles(SITE_URL)` | `seoFiles(brand.urls.spotlight)` from the resolved profile |
| `apps/spotlight/vite.config.ts:59` | `imagetools` include `packages/ui/src/assets/logo-*` | Include the resolved asset dir's `logo-*.png` |
| `apps/spotlight/vite.config.ts:67`, `apps/backstage/vite.config.ts:18` | PWA `includeAssets` | Unchanged names, served from the staged public dir (section 5.5) |
| `apps/spotlight/vite.config.ts:69-74`, `apps/backstage/vite.config.ts:20-25` | manifest `name`, `short_name`, `description`, `lang`, `theme_color`, `background_color` | `brand.json` |
| `apps/spotlight/vite.config.ts:101-102`, `apps/backstage/vite.config.ts:51-52` | ports 5173/4173, 5174/4174 | `packages/brand/src/ports.ts`, shared with URL resolution |
| `apps/spotlight/.env.production:4-12`, `apps/backstage/.env.production:5-13` | Firebase web config + App Check site key | `brand.json` `firebase.web` (D11) |
| `firebase.json:23,45` | hosting targets `jcioriente`, `jcioriente-backstage` | `spotlight`, `backstage` (D9) |
| `.firebaserc:1-21` | project, hosting targets, storage target | Generated (D10) |
| `.github/workflows/deploy.yml:266` | `environment.url: https://jcioriente.org` | Step output from `brand.json` |
| `.github/workflows/deploy.yml:332-333` | `promote jcioriente jcioriente` / `promote jcioriente-backstage …` | `promote spotlight <site>` with site ids from `brand.json` |
| `turbo.json:8-12` | `build.env` lacks the brand variables; `brand/` is outside every package's inputs | Add `BRAND_*`, `GCP_PROJECT_ID` to `env`; `$TURBO_ROOT$/brand/**` to `inputs` |
| `tools/scripts/seed-emulator.mjs:34`, `seed-production.mjs:29`, `e2e-check-in.mjs:10`, `e2e-issue-invite.mjs:14`, `audit-soft-delete-shapes.mjs:125` | default project `"jci-oriente"` | The profile's `firebase.projectId` (section 5.10) |

**HTML and static files**

| File:line | Value |
|---|---|
| `apps/spotlight/index.html:2` | `lang="es"` |
| `apps/spotlight/index.html:8` | `theme-color` `#0097D7` |
| `apps/spotlight/index.html:19,21` | `description`, `<title>` (both name the movement and the city) |
| `apps/spotlight/index.html:25-27,30,40` | `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:image:alt` |
| `apps/spotlight/index.html:33-34,50` | `og-image-v3.png` (×3) |
| `apps/spotlight/index.html:45,48` | `twitter:title`, `twitter:description` |
| `apps/backstage/index.html:2,6,16` | `lang`, `theme-color` `#130F2D`, `<title>` |
| `apps/spotlight/public/firebase-messaging-sw.js:16`, `apps/backstage/public/firebase-messaging-sw.js:19` | notification fallback title |

`rel=canonical`, `og:url`, `sitemap.xml` and `robots.txt` are already stamped from one origin
by `apps/spotlight/seo-files.ts`; only that origin's source changes.

**Source — identity values shipped in the bundle**

| File:line | Value | Token |
|---|---|---|
| `apps/spotlight/src/config/external-links.ts:3-4` | `SITE_URL`, `BACKSTAGE_URL` | `urls` (resolved, section 5.5) |
| `apps/spotlight/src/components/footer.tsx:8,128` | `JCI_BOLIVIA_URL`, "© … JCI Oriente" | `parentOrganization`, `name` |
| `apps/spotlight/src/components/footer.tsx:45` | "Capítulo Santa Cruz de la Cámara Junior Internacional. Formamos líderes desde 1993." | `locality.city`, `movementName`, `foundedYear` |
| `apps/spotlight/src/components/header.tsx:115,166` | "Únete a JCI Oriente" | `name` |
| `apps/spotlight/src/components/linktree-page.tsx:258` | "JCI Oriente · Desde 1993" | `name`, `foundedYear` |
| `apps/spotlight/src/components/showcase/impacto-page.tsx:37` | name in intro | `name` |
| `apps/spotlight/src/notifications/push-prompt.tsx:116` | "Recibe avisos de JCI Oriente" | `name` |
| `apps/spotlight/src/routes/about.tsx:44,67-68,79,185,335,364` | name, "Santa Cruz", "Oriente boliviano", 1993 | `name`, `locality`, `foundedYear` |
| `apps/spotlight/src/routes/index.tsx:33,87,99,120,144,152,163,246,252,372` | name, city, region, movement, 1993, "18 organizaciones en Bolivia" (`:163`) | `name`, `locality`, `movementName`, `foundedYear`, `stats.nationalOrganizations` |
| `apps/spotlight/src/routes/privacidad.tsx:16,44,112`, `terminos.tsx:17,37,76,97` | operator name, movement | `name`, `legalName`, `movementName` |
| `apps/spotlight/src/routes/contact.tsx:256`, `apps/backstage/src/features/site-config/components/site-config-form.tsx:414` | "Difusión Oriente" | `broadcastChannelName` |
| `apps/spotlight/src/site-config/defaults.ts:3-95,106` | fallback site content, `FOUNDING_YEAR` | `site-content.json`, `foundedYear` |
| `apps/backstage/src/features/auth/components/brand-side.tsx:11,31` | name, "Santa Cruz · Bolivia", "Desde 1993" | `name`, `locality`, `foundedYear` |
| `apps/backstage/src/features/auth/components/login-form.tsx:44,63` | name, `tu.nombre@jcioriente.bo` | `name`, `backstage.emailPlaceholder` |
| `apps/backstage/src/features/leads/components/lead-table.tsx:166` | WhatsApp greeting | `name` |
| `apps/backstage/src/features/members/components/member-credential-card.tsx:5-6` | `CHAPTER`, `CITY = "Santa Cruz de la Sierra, Bolivia"` | `name`, `locality.cityFormal`, `locality.country` |
| `apps/backstage/src/features/members/components/member-milestones.tsx:15` | "Tu primer año en JCI Oriente" | `name` |
| `apps/backstage/src/features/members/components/self-profile-form.tsx:108` | "jcioriente.org" | host of `urls.spotlight` |
| `apps/backstage/src/features/site-config/components/config-page.tsx:58,95` | "Capítulo JCI Oriente" | `name` |
| `apps/backstage/src/lib/member-qr.ts:1` | `jcioriente:member:` | `qrPrefix` |
| `apps/backstage/src/lib/push-registration.ts:68` | foreground fallback title | `name` |
| `packages/ui/src/components/logo-lockup.tsx:2-4,27-29` | logo imports, `alt`, `width/height` 600×600 (the files are 674×326) | Logo URLs, `name`, real dimensions from the virtual module |
| `tools/scripts/lib/site-config-seed-data.mjs` | a hand-kept second copy of `defaults.ts` | Deleted; seeds read `site-content.json` |

"Cámara Junior Internacional" (`index.html:19,21,27,45`, `footer.tsx:45`, `index.tsx:87,152`)
is the movement's Spanish name. It is the same for every Spanish-speaking JCI chapter but
not for a non-JCI adopter, so it is the token `movementName`.

**Assets** (952 KB in total)

| Today | Size | Becomes (section 5.4) |
|---|---|---|
| `packages/ui/src/assets/logo-color.png`, `logo-on-dark.png`, `logo-on-blue.png` | 674×326 each | `logo-main.png`, `logo-on-dark.png`, `logo-on-primary.png` |
| `apps/{spotlight,backstage}/public/favicon-16.png`, `favicon-32.png`, `apple-touch-icon-180x180.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` | 12 files | Same names under `spotlight/` and `backstage/` |
| `apps/spotlight/public/og-image-v3.png` | 1200×630, 121 KB | `og-image.png` |
| `apps/spotlight/public/og-linktree.png` | 1200×630 | **Deleted.** Referenced only by a comment (`vite.config.ts:91`), `NOTICE:33`, `README.md:227`, `README.es.md:155` |

**Docs that name these paths:** `NOTICE:27-36`, `README.md:206-246`, `README.es.md:135-185`,
`.github/ISSUE_TEMPLATE/chapter_adoption.yml:14,16`, `CLAUDE.md` (app table, hosting
targets), `apps/spotlight/CLAUDE.md:16` (OG rule), `packages/ui/DESIGN.md:51-52` (also lists a
`logo-black.png` that does not exist), `docs/domains.md:10-11,21-47`, `docs/ci-cd.md:11`
(project and repo line) and section 6 (provisioning block with hardcoded project, repo and
reviewer id), `docs/firebase-setup.md`, `docs/architecture.md`.

**Deliberately not configured:**

| Where | Why |
|---|---|
| Literal values in test files (`*.test.*`, beacon emulator tests, `.github/scripts/*.test.mjs`) | Fixtures, not shipped |
| Comments: `packages/ui/src/theme.css:2`, `ripple.tsx:18`, `check-in/lib/attendance.ts:2`, `packages/types/src/member-name.ts:10` | Not shipped |
| Emulator sample data: `tools/scripts/seed-emulator.mjs:116,134,149-151` | Local dev data only, never in a production project |
| Upstream links in `.github/ISSUE_TEMPLATE/config.yml` and `feature_request.yml` | Must keep pointing at upstream |
| `apps/*/.env.local.example` | The example profile's local config |

## 5. Architecture

### 5.1 Layout

```
brand/
  brand.schema.json           generated from the zod schema (codegen-drift checked)
  bucket-lifecycle.json       lifecycle policy applied to every assets bucket
  jci-oriente/                committed — the example profile (D4)
    brand.json
    site-content.json
    assets/                   committed for this profile only
  fixture/                    committed — neutral profile for the CI guard; never deployable
    brand.json  site-content.json  assets/
  <adopter-slug>/             committed in the adopter's fork: brand.json + site-content.json
brand-assets/                 gitignored — deployment assets (section 5.4)
packages/brand/               @luminova/brand — schema, loader, validator, Vite plugin, CLIs
```

`.gitignore` adds `brand-assets/`, `.firebaserc`, and `brand/*/assets/` with
`!brand/jci-oriente/assets/` and `!brand/fixture/assets/`, so a fork cannot commit its
marks by accident.

### 5.2 `brand.json`

```jsonc
{
  "$schema": "../brand.schema.json",
  "slug": "jci-oriente",                       // must equal the folder name
  "name": "JCI Oriente",
  "shortName": "JCI Oriente",                  // ≤ 12 chars recommended (home-screen label)
  "legalName": "Cámara Junior Internacional Oriente",
  "movementName": "Cámara Junior Internacional",
  "description": "Junior Chamber International Oriente",
  "locality": { "city": "Santa Cruz", "cityFormal": "Santa Cruz de la Sierra",
                "region": "el Oriente boliviano", "country": "Bolivia" },
  "foundedYear": 1993,
  "stats": { "nationalOrganizations": 18 },
  "parentOrganization": { "name": "JCI Bolivia", "url": "https://jcibolivia.org/" },
  "broadcastChannelName": "Difusión Oriente",
  "locale": "es",
  "ogLocale": "es_BO",
  "urls": { "spotlight": "https://jcioriente.org", "backstage": "https://admin.jcioriente.org" },
  "qrPrefix": "jcioriente",                    // [a-z0-9-]+, no ":"
  "themeColor": { "spotlight": "#0097D7", "backstage": "#130F2D" },
  "seo": { "title": "…", "description": "…", "ogTitle": "…", "ogDescription": "…",
           "ogImageAlt": "…", "twitterDescription": "…" },
  "backstage": { "title": "JCI Oriente — Portal de miembros", "emailPlaceholder": "tu.nombre@jcioriente.bo" },
  "og": { "legacyPaths": ["og-image-v3.png"] },
  "firebase": {
    "projectId": "jci-oriente",
    "storageBucket": "jci-oriente.firebasestorage.app",
    "sites": { "spotlight": "jcioriente", "backstage": "jcioriente-backstage" },
    "web": {
      "authDomain": "jci-oriente.firebaseapp.com",
      "messagingSenderId": "953870918238",
      "spotlight": { "apiKey": "…", "appId": "…", "appCheckSiteKey": "…", "vapidKey": "" },
      "backstage": { "apiKey": "…", "appId": "…", "appCheckSiteKey": "…", "vapidKey": "" }
    }
  },
  "assetsBucket": "jci-oriente-brand-assets"
}
```

`urls` hold production origins only (bare `https` origin, validated by the existing
`normalizeSiteUrl`); local origins are derived (section 5.5). `stats.nationalOrganizations`
is a build-time fact about the national organisation; it changes yearly at most, so it
lives here rather than in the runtime `siteConfig.stats`, which would need a Firestore
schema change. The zod schema is the single definition: the Vite plugin, the CLIs and
`brand.schema.json` all come from it.

### 5.3 `site-content.json`

The default `siteConfig/current` document (minus `version`/`updatedAt`): the emulator and
production seeds write it, and spotlight renders it as the pre-Firestore fallback. It
replaces both `apps/spotlight/src/site-config/defaults.ts` content and
`tools/scripts/lib/site-config-seed-data.mjs`, removing a hand-kept duplicate and the drift
test that guarded it. Validated by the existing `@luminova/types` site-config schema.

### 5.4 Asset contract

Sixteen required files with fixed names. The same layout applies to `brand-assets/` and to
the committed `brand/<slug>/assets/`.

| Path | Rule | Used for |
|---|---|---|
| `logo-main.png` | PNG; the three logos share one size; height ≥ 184 px | Logo on light backgrounds |
| `logo-on-dark.png` | same | Logo on dark backgrounds |
| `logo-on-primary.png` | same | Logo on the primary brand color |
| `og-image.png` | PNG, exactly 1200×630; warn above 300 KB | Share preview |
| `spotlight/favicon-16.png`, `backstage/favicon-16.png` | 16×16 | Favicon |
| `spotlight/favicon-32.png`, `backstage/favicon-32.png` | 32×32 | Favicon |
| `spotlight/apple-touch-icon-180x180.png`, `backstage/…` | 180×180 | iOS home screen |
| `spotlight/pwa-192x192.png`, `backstage/…` | 192×192 | PWA icon |
| `spotlight/pwa-512x512.png`, `backstage/…` | 512×512 | PWA icon |
| `spotlight/maskable-icon-512x512.png`, `backstage/…` | 512×512, full-bleed | Android adaptive icon |
| `icon-master.png` or `.svg` | optional; never read by the build | Input to `brand:icons` |
| `pull-manifest.json` | written by `brand:pull`; never uploaded | Profile name + object generations |

Each app gets its own icon set so the two installed PWAs are distinguishable. Icon file
names are the existing ones, so `index.html` and the manifest keep their paths. PNG checks
read the IHDR header directly; no image dependency.

### 5.5 Build integration

`@luminova/brand` exports `brandPlugin({ app: "spotlight" | "backstage" })`, used by both
Vite configs and both vitest configs (vitest pins `profile: "fixture"`, so a component test
that hardcodes our name fails).

| Concern | Mechanism |
|---|---|
| Profile and asset selection | `config` hook: select the profile (section 5.6), validate config and assets, and stop the build with **every** error listed at once |
| Reading the emulator flag | The `config` hook runs before Vite loads env files, so the plugin calls Vite's exported `loadEnv(mode, envDir, "VITE_")` itself to read `VITE_FIREBASE_EMULATOR_ENABLED` |
| Runtime values | Virtual module `virtual:luminova-brand`: the resolved runtime subset (name, locality, urls, qrPrefix, stats, …) plus logo URLs and dimensions. Typed by `packages/brand/src/virtual.d.ts`, which every consumer's tsconfig (both apps, `packages/ui`) references. Logo imports pass through `imagetools` on spotlight as today |
| Icons, OG, service worker | The plugin stages a public dir under `node_modules/.cache/luminova-brand/<app>/public`: the app's own `public/`, the app's icon set, `og-image.<sha256-8>.png` and each `og.legacyPaths` alias, and `firebase-messaging-sw.js` with `__BRAND_NAME__` substituted. It sets Vite's `publicDir` to it, so `VitePWA` `includeAssets` and the dev server work unchanged. Asset changes need a dev-server restart |
| `index.html` | Placeholders (`__BRAND_TITLE__`, `__OG_IMAGE__`, `__THEME_COLOR__`, `__LANG__`, …) beside the existing `__SITE_URL__`. After `transformIndexHtml` the plugin fails the build if any `__[A-Z_]+__` token remains |
| PWA manifest | Built from the profile in each `vite.config.ts` |
| Firebase web config | In a production build (`vite build`, emulator flag off) the `config` hook sets `process.env.VITE_FIREBASE_*` / `VITE_APPCHECK_SITE_KEY` from `firebase.web` before Vite loads env (Vite's `runConfigHook` runs before `loadEnv`, and process env wins over `.env.production`). `vite serve` and `build:local` keep reading `.env.local` |
| Turbo cache | `turbo.json` `build.env` gains `BRAND_PROFILE`, `BRAND_RELEASE`, `BRAND_ASSETS_DIR`, `GCP_PROJECT_ID`; `build.inputs` gains `$TURBO_ROOT$/brand/**` and `$TURBO_ROOT$/brand-assets/**`. Spike (PR 1b): without the second glob, `spotlight#build`'s hash did not move on a `brand-assets/` byte change; with it, the hash moves on every byte change and returns to the baseline when the folder is removed. Release builds run with `--force` anyway |

URL resolution reuses the existing emulator flag; no new Vite mode:

| Condition | `urls` resolve to |
|---|---|
| `vite serve` | `http://localhost:5173` / `:5174` (`DEV_PORTS`) |
| `vite build`, `VITE_FIREBASE_EMULATOR_ENABLED=true` (`build:local`, `preview:local`) | `http://localhost:4173` / `:4174` (`PREVIEW_PORTS`) |
| `vite build` otherwise | the profile's production origins |

This also fixes a live bug: `BACKSTAGE_URL` is production-only today, so "Ingresar" on a
local build lands on the real admin app.

### 5.6 Profile selection and release mode

**Release mode** is `BRAND_RELEASE=1`. CD's hosting build and the root `deploy:hosting`
script set it; nothing else does.

| Input | Non-release (`pnpm dev`, `pnpm build`, CI) | Release (deploy) |
|---|---|---|
| Profile | `BRAND_PROFILE`, else `jci-oriente` with a one-line warning | `BRAND_PROFILE` required |
| Asset source | `BRAND_ASSETS_DIR` if set; else `brand-assets/` if it exists; else `brand/<slug>/assets/` | `brand-assets/` only; `BRAND_ASSETS_DIR` is an error |
| `brand-assets/pull-manifest.json` | If present, its profile must match | Required (written by `brand:pull`); profile must match |
| Profile restrictions | none | `fixture` and any `demo-*` project id rejected |
| Target project | — | `GCP_PROJECT_ID`, when set, must equal `firebase.projectId` (CD always sets it) |
| Output marker | none | `dist/.brand-release.json` `{ profile, projectId, assets: <pull-manifest sha256>, indexHtml: <index.html sha256> }`. `indexHtml` ties the marker to its build: turbo restores a cached `dist` on top of `dist/` without deleting the old marker, so `brand:assert-dist` recomputes the digest (PR 2a review) |

The marker closes the manual path. `firebase.json` gains a hosting `predeploy` that runs
`brand:assert-dist <app>`, comparing the marker with `$GCLOUD_PROJECT` (set by firebase-tools
for hooks). A non-release `dist` (no marker) or one built for another project cannot be
deployed. `hosting:channel:deploy` runs hosting `predeploy` hooks: it calls the same
`deploy(["hosting"], …)` that runs lifecycle hooks (verified in the firebase-tools 15.19.1
source, `lib/commands/hosting-channel-deploy.js:91` → `lib/deploy/index.js:108`). CD still
runs the assert as its own step, so a future change in hook behaviour cannot open the gap.
The file starts with a dot, so the existing hosting `ignore` (`**/.*`) keeps it off the CDN.

How this answers D6:

| Who | What happens |
|---|---|
| JCI Oriente CD | `BRAND_PROFILE=jci-oriente`, `GCP_PROJECT_ID=jci-oriente`, assets pulled from `jci-oriente-brand-assets` → passes |
| Adopter who forgot `BRAND_PROFILE` | Release build fails: profile required |
| Adopter who set `BRAND_PROFILE=jci-oriente` | Fails: `jci-oriente` ≠ their `GCP_PROJECT_ID`; their CD also cannot read our bucket |
| Adopter with their profile but missing logos | Fails, naming each missing file |
| Anyone running `firebase deploy` on a `pnpm build` output | `predeploy` fails: no release marker |

### 5.7 Asset bucket

| Property | Value | Reason |
|---|---|---|
| Name | `brand.json` `assetsBucket`; `brand:init` proposes `<projectId>-brand-assets` | Project ids are globally unique, so the default is almost always free; explicit in config so scripts and CD read one value |
| Location / class | `us-central1`, Standard | Same region as the gen2 functions; inside the Cloud Storage always-free regions |
| Access | Uniform bucket-level access; public access prevention enforced | Never public. Hosting serves the built copies; the bucket is only a build input |
| CD identity | `roles/storage.objectViewer` granted **on the bucket**, to the existing deploy SA (`firebase-deployer@…`) | Read-only (`storage.objects.get`, `storage.objects.list`), scoped to one bucket; no project-level storage grant. That the role carries exactly the permissions `brand:pull` needs is checked in owner step B3 and proven by B6 |
| Writers | Project owner / adopter, with their own credentials via `brand:push` | CD never writes |
| Versioning | On, lifecycle keeps the 3 newest noncurrent generations (`brand/bucket-lifecycle.json`) | A bad logo upload rolls back with `gcloud storage cp gs://B/<file>#<generation> gs://B/<file>` |
| Generation pinning | Not pinned. `brand:pull` downloads the generations it listed and records them in `pull-manifest.json`; CD prints them to the job summary | Pinning in git would force a commit per asset change and undo D3. The job summary is the audit trail of which file shipped |

**Cost.** About 1 MB (JCI Oriente's set is 952 KB; with 3 noncurrent versions, under 4 MB).
At Standard pricing of roughly US$0.02 per GB-month that is about US$0.0001 a month, and a
deploy reads about 20 objects. Both sit far inside the Cloud Storage always-free tier
(5 GB-months and 50,000 Class B operations a month in US regions), so the expected bill is
US$0.00. Figures are order of magnitude; the free tier is the reason the exact price does not matter.

**An asset change does not trigger CD**, which diffs git. After `brand:push`, the owner
dispatches Deploy with `surface=hosting`; `brand:push` prints that command and does not
run it.

### 5.8 CD flow

`deploy.yml` changes, all within the existing keyless WIF model (`docs/ci-cd.md` section 4):

| Where | Change |
|---|---|
| `production` environment variables | Add `BRAND_PROFILE` (beside `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`) |
| `filter` job | `^brand/` triggers spotlight and backstage |
| `.github/actions/firebase-setup` | New input `brand_profile`, exported as `BRAND_PROFILE` for the `pnpm install` step so `prepare` writes the right `.firebaserc`. It is used for `.firebaserc` only; the hosting build reads `vars.BRAND_PROFILE` itself |
| `deploy-hosting` | Add pinned `setup-gcloud` (same SHA as `deploy-functions`) → `brand:pull` → build with `BRAND_RELEASE=1` and `--force` (the release build is the validation; it fails on any asset or config error) → `brand:assert-dist` per app → `promote spotlight <sites.spotlight>` / `promote backstage <sites.backstage>` (site ids via `jq` on `brand.json`) |
| `environment.url` | `${{ steps.brand.outputs.spotlight_url }}` |
| Rules / functions jobs | Nothing beyond the shared action (`.firebaserc` resolves the storage target) |

### 5.9 Scripts

Root `package.json` scripts, implemented in `packages/brand/src/cli/` as TypeScript run by
Node 24's type stripping (precedent: `apps/beacon` `seed:roles`). External commands run
through `execFile` with argument arrays, never a shell string. No new dependencies beyond
`zod` (already pinned at 4.4.3 in the repo); `@vite-pwa/assets-generator` moves from both
apps to the root.

| Script | Does | Touches prod? |
|---|---|---|
| `prepare` (pnpm lifecycle) | Runs `brand:apply` on every install that links packages (not on "Already up to date") | No |
| `brand:apply` | Writes `.firebaserc` from the selected profile | No |
| `brand:init` | Prompts for every `brand.json` value (or reads `--answers <file>`), writes `brand/<slug>/brand.json`, copies `site-content.json` from the example for editing, creates `brand-assets/` with a `README.txt` of the contract, and prints the `export BRAND_PROFILE=<slug>` line. Offers to fill `firebase.web` from `firebase apps:sdkconfig WEB <appId>` (read-only) | No |
| `brand:check [--release]` | Runs the same validator as the build and prints one row per asset (found, dimensions, verdict) | No |
| `brand:doctor` | One table: selected profile and where it came from, schema verdict, asset verdict, `.firebaserc` in sync, `gcloud` signed in, bucket readable (read-only list), `BRAND_PROFILE` set, Node and pnpm versions. Never fails fast; every row reports | Reads only |
| `brand:pull` | Lists the bucket, downloads those generations into `brand-assets/`, writes `pull-manifest.json` | Reads only |
| `brand:push [--from <dir>]` | Validates first, then uploads to the bucket; prints the Deploy dispatch command | **Yes — owner/adopter runs it** |
| `brand:provision [--apply]` | Prints (default) or runs the idempotent bucket setup: create, versioning, lifecycle, IAM grant to the deploy SA. Also prints the `docs/ci-cd.md` section 6 block with the profile's project, repo and reviewer id filled in | **Yes — owner/adopter runs it** |
| `brand:icons` | Generates both apps' icon sets from `brand-assets/icon-master.*` and `themeColor` | No |
| `brand:assert-dist <app>` | Checks the release marker against `$GCLOUD_PROJECT` / `GCP_PROJECT_ID` | No |
| `brand:schema [--check]` | Regenerates `brand/brand.schema.json`; `--check` fails on drift (CI) | No |
| `brand:guard` | The neutrality and inverse guards (section 7) | No |

Claude never runs `brand:push`, `brand:provision --apply`, or the Deploy dispatch; the
docs and the scripts' own output say so.

**`prepare` spike (PR 2a, pnpm 11.5.1, firebase-tools 15.19.1).** On a fresh clone with
`.firebaserc` untracked, `pnpm install --frozen-lockfile` ran `prepare` and wrote it. A
second install that printed "Already up to date" did **not** run `prepare`, even with a
different `BRAND_PROFILE`, so an existing checkout that pulls the untracking commit (git
deletes the file) is left without one. The emulator suites do not need the file: the
firestore-rules (594), storage-rules (41) and `beacon test:emulator` (51) tests pass without
it, since each passes a `demo-*` `--project`. `pnpm dev` does: without the file the
emulators fall back to `demo-no-project` and exit while starting hosting; with the
generated file and the renamed targets they boot on `jci-oriente`. Hence D10's two explicit
`brand:apply` call sites: `tools/scripts/emulators.sh` (dev and `preview:local`) and the
`firebase-setup` action after install (CD does not depend on a lifecycle detail).

### 5.10 Seeds and tools scripts

The `.mjs` scripts in `tools/scripts/` import `packages/brand/src/load-profile.ts` directly
through Node 24 type stripping; there is no `.mjs` twin of the loader.

| Script | Project |
|---|---|
| `seed-emulator.mjs`, `e2e-*.mjs`, `audit-soft-delete-shapes.mjs` | `GCLOUD_PROJECT` if set, else the selected profile's `firebase.projectId`. Never `.firebaserc` |
| `seed-production.mjs` | Requires `--project <id>` or `GCLOUD_PROJECT`; refuses unless it equals the selected profile's `firebase.projectId`; prints the target project and profile before the first write |

## 6. Validation and failure modes

Every error names the profile, the field or file, and the fix. The validator collects all
errors before failing.

| Situation | Behaviour |
|---|---|
| Profile unset, non-release | `jci-oriente`, one warning line |
| Profile unset, release | Error |
| Profile folder missing | Error listing available profiles |
| `slug` ≠ folder name | Error |
| `brand.json` fails the schema | Error per field (zod path) |
| `site-content.json` fails the site-config schema | Error per field |
| Any required asset missing | Error listing **each** missing path and its expected dimensions |
| Wrong dimensions, not a PNG, logos of unequal size | Error per file |
| `og-image.png` over 300 KB | Warning (WhatsApp may skip large previews) |
| `brand-assets/pull-manifest.json` profile ≠ selected profile | Error |
| Release with `BRAND_ASSETS_DIR`, `fixture`, a `demo-*` project, or a `GCP_PROJECT_ID` mismatch | Error |
| Placeholder left in `index.html` | Error naming the token |
| Hosting deploy of a dist without a matching release marker | `predeploy` / CD step error |
| Bucket unreadable in CD | `brand:pull` fails before any build; live hosting untouched |
| `seed:production` without a project, or with one ≠ the profile's | Error before any write |

## 7. Testing

**Unit** (`packages/brand`, vitest; the Node CLIs through injected seams):

| Area | Cases |
|---|---|
| Schema | Both committed profiles parse; each malformed field rejects (non-https or pathful URL, bad hex, `qrPrefix` with `:`, `foundedYear` out of range, missing `firebase.web` key) |
| Selection | env > default; release requires env; release rejects `fixture`, `demo-*`, `BRAND_ASSETS_DIR`, project mismatch |
| Assets | Missing files all reported in one error; wrong dimensions; non-PNG; unequal logos; manifest mismatch; OG size warning |
| URLs | The three rows of section 5.5, with the emulator flag read through `loadEnv` |
| Staging | Icons, hashed OG and legacy aliases, SW substitution; hash changes iff bytes change |
| HTML | Every placeholder replaced; a leftover token fails |
| CLIs | `apply` output snapshot; `pull`/`push`/`provision`/`doctor` build the expected `gcloud` argv through a fake runner (no real gcloud); `assert-dist` accepts/rejects |
| Seeds | `seed-production` refuses without a project and on a mismatch, before any write |
| Consumers | `member-qr` parameterized on `qrPrefix`; component tests read values from the virtual module (fixture profile) |

**Neutrality guard** (`pnpm brand:guard`, wired into the CI `checks` job after the bundle
budget gate, so the claim is enforced per guardrail 7). It builds spotlight and backstage
with `BRAND_PROFILE=fixture`, then searches both `dist` trees with two nets:

1. **Needles derived from `brand/jci-oriente/brand.json`:** every leaf string of 6 or more
   characters, as a literal. That covers the Firebase web config (sender id
   `953870918238`, `jci-oriente.firebaseapp.com`, API keys, app ids, App Check keys), the
   URLs and hosts (`jcibolivia.org`, `jcioriente.bo`), the name and every copy token. Keys
   whose values are shared by design are excluded by an explicit list in `guard.ts`
   (`$schema`; `themeColor.*`, because the palette is shared per D16; `locale`, `ogLocale`;
   `locality.country`, because the Bolivian phone rule is product-wide until follow-up 3),
   each with its reason, and a unit test pins that list. Plus the sha256 of
   every file under `brand/jci-oriente/assets/`: no `dist` file may match one, which
   catches an image leak no text search can see.
2. **A case-sensitive regex** as a second net for text the profile does not hold:

```
grep -rIE '[Jj][Cc][Ii][ -]?[Oo]riente|\bOriente\b|Santa Cruz' apps/{spotlight,backstage}/dist   # must print nothing
```

The regex is case-sensitive on purpose: a case-insensitive `oriente` matches the English
"oriented" inside third-party code. Beacon is not built by the guard: it reads no brand
value, and building it adds minutes for nothing.

**Inverse guard** (same script, on CI's normal `jci-oriente` build): `index.html` carries
`https://jcioriente.org/` as canonical, `og-image.<hash>.png` exists and `og-image-v3.png` is
emitted, the manifest says "JCI Oriente" with `#0097D7` / `#130F2D`, the sitemap lists
`https://jcioriente.org`, and the bundle carries `projectId` `jci-oriente`. The refactor
cannot quietly change our own deployment.

## 8. Documentation

| Doc | Change |
|---|---|
| `docs/adopting.md` (new) | Step-by-step adopter guide: fork → `brand:init` → Firebase project and apps → `brand:check` / `brand:doctor` locally → `brand:provision` → `brand:push` → WIF/CD per `docs/ci-cd.md` section 6 → `BRAND_PROFILE` variable → first deploy → seed the first admin → verification checklist. Owner-only steps marked |
| `README.md` / `README.es.md` | Adoption sections shrink to a summary pointing at `docs/adopting.md` |
| `.github/ISSUE_TEMPLATE/chapter_adoption.yml` | Link `docs/adopting.md` |
| `NOTICE` | Carve-out re-pointed at `brand/jci-oriente/` |
| `docs/ci-cd.md` | Bucket in the infrastructure inventory, the IAM grant, `BRAND_PROFILE`, the hosting flow, cost. Line 11 and section 6 become parameterized (`PROJECT_ID`, `GH_REPO`, `REVIEWER_ID`), with JCI Oriente's values shown as the example |
| `docs/firebase-setup.md`, `docs/domains.md`, `docs/architecture.md`, `CLAUDE.md` | Targets `spotlight`/`backstage`; origins live in `brand.json`; `.firebaserc` is generated |
| `apps/spotlight/CLAUDE.md` | OG rule: hashing is automatic; `og.legacyPaths` keeps old URLs |
| `packages/ui/DESIGN.md` | Logos come from the brand profile |
| `docs/engineering-guardrails.md` | "How these are enforced" row for the brand guard |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Turbo replays a cached `dist` built for another profile | Brand variables in `build.env` and `brand/**` in `inputs` (section 5.5); a 5-minute spike settles whether gitignored `brand-assets/` is hashed; release builds run with `--force` |
| `prepare` does not run, or runs before the profile is set | Verified in the plan on a fresh clone and in CI; `brand:doctor` reports a stale or missing `.firebaserc`; `brand:apply` regenerates it |
| Target rename breaks CD, which CI does not exercise | Lands in the same PR as the `deploy.yml` change; verified by a `workflow_dispatch` run right after merge, with the owner ops done first |
| First CD run after the release PR merges has no bucket or variable | Owner ops (plan, part B) are a merge prerequisite |
| Logo move changes `imagetools` output | `bundle-budget-watcher` after the move; note the `index` chunk gz delta |
| Virtual module unresolved in `tsc --noEmit` or vitest | `virtual.d.ts` referenced from each consumer's tsconfig in the same commit as the first import; the plugin in every vitest config |
| `knip` flags CLI entries reachable only from scripts | Add `packages/brand` entries to `knip.json` |
| A needle excluded from the guard hides a real leak | The exclusion list is short, reasoned per key, and pinned by a unit test; the regex net still runs |

## 10. Follow-ups

1. Generation pinning for assets, if an audit ever needs a deploy reproducible from git alone.
2. i18n string extraction (`es` as the reference locale).
3. Country localisation: phone rule, datetime locale and time zone per profile.
4. Per-profile design tokens.
5. `chapters.json` adopter registry and a showcase rendered from it.
