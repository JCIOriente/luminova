# Plan — build-time brand configuration

Spec: `docs/specs/2026-10-22-brand-config-design.md` (read it first; section numbers below
refer to it). Every file:line in the spec was verified at `520ae5c`; re-grep before editing a
cited line, since `main` moves.

TDD throughout: write the test, run it, **see it fail for the expected reason**, then
implement. Checkpoint-commit at each "Commit" line; never more than 10 files in one commit.
Never leave a commit whose `pnpm --filter <touched> run ci` fails.

## Shape: six PRs

| PR | Branch | Content | Why split here |
|---|---|---|---|
| 0 | `feat/brand-config` (`.worktrees/brand-config`) | Spec, this plan, roadmap rows | Docs only, lighter review; the owner approves before code |
| 1a | `feat/brand-profiles` | `@luminova/brand` (schema, loader, validator, plugin), both profiles, logo/icon/OG move, `LogoLockup`, build wiring, `.env.production` move | Output stays equivalent to today (task 1a.9 defines and checks it); CD unchanged; reviewable as plumbing alone |
| 1b | `feat/brand-copy-tokens` | Copy tokens, prose templates, `site-content.json` consolidation, seeds on the profile, `brand:guard` in CI | The visible text changes, and the guard that proves them complete |
| 2a | `feat/brand-release-assets` | Release mode, `prepare` + `.firebaserc`, `firebase.json` targets and `predeploy`, `brand:pull`/`push`/`provision`/`assert-dist`, CD | All hard-gated deploy/IAM surface in one review; needs part B (B1–B5) first |
| 2b | `feat/brand-adopter-tooling` | `brand:init`, `brand:check`, `brand:doctor`, `brand:icons` | Adopter convenience; not on the deploy path, so it does not ride the hard-gated review |
| 3 | `chore/brand-adopter-docs` | `docs/adopting.md`, README/README.es, issue template, `docs/ci-cd.md` parameterization | Written against shipped behaviour, so it states truth |

Each PR starts from a fresh worktree off `origin/main` (Worktree-first, CLAUDE.md):

```bash
git fetch && git worktree add .worktrees/brand-profiles -b feat/brand-profiles origin/main
cd .worktrees/brand-profiles && pnpm install && pnpm turbo run build --filter="./packages/*"
```

Do not reuse `.worktrees/brand-config` for code: it carries PR 0. Remove each worktree after
its PR merges (`git worktree remove .worktrees/<slug>`).

Subagent models: Opus for the plugin, release mode, CD and every review; Sonnet for the
copy-token sweep (1b.1, 1b.2), asset moves and `bundle-budget-watcher`. Subagents edit and
stop; the orchestrator commits, stamps and opens PRs.

Locally, a profile is selected only with `export BRAND_PROFILE=<slug>` (spec D18); unset
means `jci-oriente`.

## Unverified assumptions (each has a task or owner step that settles it)

| Assumption | Settled by |
|---|---|
| Setting `process.env.VITE_*` in the plugin's `config` hook reaches `import.meta.env` | 1a.5 step 4 spike |
| Turbo does or does not hash the gitignored `brand-assets/` | 1b.5 spike |
| pnpm 11 runs the root `prepare` on `pnpm install` and `--frozen-lockfile` | 2a.1 spike |
| `environment.url` accepts a step output | First CD run (B6) |
| `roles/storage.objectViewer` alone allows `gcloud storage objects list` and `cp` of `gs://…#<generation>` | B3 role check, then B6 |
| `gcloud storage buckets create` accepts `--public-access-prevention` | B1 (then `describe`) |

`hosting:channel:deploy` running hosting `predeploy` hooks is verified (spec section 5.6).

---

## PR 1a — package, profiles, plugin, build wiring

### 1a.1 Package skeleton

**Files (6):** `packages/brand/package.json`, `tsconfig.json`, `vitest.config.ts`,
`src/schema.ts` (stub), `src/schema.test.ts`, `knip.json`.

- `secure-dep-vetting` for `zod` in the new package: same exact pin as
  `packages/types/package.json` (4.4.3) unless vetting finds an advisory.
- `tsconfig.json`: `strict`, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`
  (so Node 24 runs the CLIs and the seeds import the loader by type stripping); relative
  imports use `.ts` extensions.
- `package.json` exports `.` (schema, loader, validator), `./vite` (plugin),
  `./virtual` (types). Scripts: `test`, `typecheck`, `lint`, `ci` mirroring `packages/ui`.
- `knip.json`: workspace entry for `packages/brand` with `src/cli/*.ts` and `src/vite.ts` as entries.

**Test first:** `schema.test.ts` imports `brandSchema` and parses `{}` expecting failure → red (stub exports nothing).

```bash
pnpm install && pnpm --filter @luminova/brand test
```

### 1a.2 Schema, URLs, ports, JSON Schema

**Files (9):** `packages/brand/src/schema.ts`, `schema.test.ts`, `src/urls.ts`,
`urls.test.ts`, `src/ports.ts`, `src/cli/schema.ts`, `brand/brand.schema.json`,
`apps/spotlight/seo-files.ts`, root `package.json` (`brand:schema`).

`urls.ts` is created here, once, with both `normalizeSiteUrl` (moved from
`apps/spotlight/seo-files.ts`, which now imports it — guardrail 1) and the three-row
resolver of spec section 5.5. The resolver takes the emulator flag as an argument; the plugin
reads it (1a.5).

**Test first:** schema rejects, one case per field in spec section 7 "Schema", and accepts a
full object; resolver rows; `seo-files.test.ts` stays green.

```bash
pnpm --filter @luminova/brand test && pnpm --filter spotlight test
node --experimental-strip-types packages/brand/src/cli/schema.ts --check
```

**Commit:** `feat(brand): package skeleton, schema and url resolution` (1a.1–1a.2; split at 10 files).

### 1a.3 Profiles and loader

**Files (6):** `brand/jci-oriente/brand.json`, `brand/fixture/brand.json`,
`packages/brand/src/load-profile.ts`, `load-profile.test.ts`, `.gitignore`, root `package.json`.

- `jci-oriente/brand.json`: every value of spec section 5.2, copied byte-for-byte from the
  cited lines (titles, descriptions, colors, web config from both `.env.production`);
  `og.legacyPaths: ["og-image-v3.png"]`, `qrPrefix: "jcioriente"`,
  `stats.nationalOrganizations: 18`.
- `fixture/brand.json`: name "Fixture Chapter", city "Springfield", urls
  `https://fixture.example.org` / `https://admin.fixture.example.org`, `qrPrefix: "fixture"`,
  project `demo-fixture`, `foundedYear` 2001, colors `#336699` / `#222222`, a different
  `movementName` and `stats.nationalOrganizations`.
- `.gitignore`: `brand-assets/`, `brand/*/assets/`, `!brand/jci-oriente/assets/`,
  `!brand/fixture/assets/`.

**Test first:** `BRAND_PROFILE` > default; slug ≠ folder fails; missing folder lists the
available profiles. Use an injected temp dir as repo root.

### 1a.4 PNG reader and asset validator

**Files (4):** `packages/brand/src/png.ts`, `png.test.ts`, `src/assets.ts`, `assets.test.ts`.

- `png.ts`: verify the 8-byte signature, read width/height from IHDR (bytes 16–23). No dependency.
- `assets.ts`: the contract of spec section 5.4 as data (one source for the validator, the
  CLIs and the tests). Returns **all** errors.

**Test first:** tiny PNGs built in-test (signature + IHDR + IDAT via `node:zlib`); cases from
spec section 7 "Assets".

**Commit:** `feat(brand): profiles, loader and asset validator` (1a.3–1a.4).

### 1a.5 Vite plugin, virtual module, turbo inputs

**Files (≤ 9):** `packages/brand/src/vite.ts`, `vite.test.ts`, `src/stage-public.ts`,
`stage-public.test.ts`, `src/render-html.ts`, `render-html.test.ts`, `src/virtual.d.ts`,
`turbo.json`.

Each step test-first:

1. `stagePublic(appPublicDir, assetsDir, app, profile, outDir)` → copies `public/`, the app's
   icon set, `og-image.<sha256-8>.png`, each legacy alias, and the SW with `__BRAND_NAME__`
   replaced. Test: hash changes iff bytes change; alias bytes equal the hashed file.
2. `renderHtml(html, values)` → replaces every placeholder; throws on any leftover `__[A-Z_]+__`.
3. `brandPlugin({ app, profile? })`:
   - `config(config, { command, mode })`: call Vite's exported `loadEnv(mode, envDir, "VITE_")`
     to read `VITE_FIREBASE_EMULATOR_ENABLED` (env files are not loaded yet at this hook);
     select + validate (one aggregated error); stage; return `{ publicDir }`. For
     `command === "build"` with the flag not `"true"`, set `process.env.VITE_FIREBASE_*` /
     `VITE_APPCHECK_SITE_KEY` / `VITE_FIREBASE_VAPID_KEY` from `firebase.web`.
   - `resolveId`/`load` for `virtual:luminova-brand`: `import` statements for the three logos
     (absolute paths, so `imagetools` still applies) plus a JSON literal of the runtime subset
     and the logo dimensions.
   - `transformIndexHtml` (order `pre`): `renderHtml`.
4. **Spike (30 min cap):** prove the env injection: build spotlight with the fixture profile
   once wired (1a.7) and `grep -r demo-fixture apps/spotlight/dist/assets` must hit. If it does
   not, fall back to generating gitignored `apps/*/.env.production` from `brand.json` and update
   spec section 5.5 before continuing.
5. `turbo.json`: `build.env` += `BRAND_PROFILE`, `BRAND_RELEASE`, `BRAND_ASSETS_DIR`,
   `GCP_PROJECT_ID`; `build.inputs` = `["$TURBO_DEFAULT$", "$TURBO_ROOT$/brand/**"]`. Prove it:
   `pnpm turbo run build --filter spotlight --dry=json | jq '.tasks[0].hash'` changes after
   editing `brand/jci-oriente/brand.json` and after changing `BRAND_PROFILE`.

**Commit:** `feat(brand): vite plugin, staged public dir and virtual module`.

### 1a.6 Logos, OG and `LogoLockup` — one commit

Lands after 1a.5 so `virtual.d.ts` exists. **Files (10):**

| Change |
|---|
| `git mv packages/ui/src/assets/logo-color.png brand/jci-oriente/assets/logo-main.png` |
| `git mv packages/ui/src/assets/logo-on-dark.png brand/jci-oriente/assets/logo-on-dark.png` |
| `git mv packages/ui/src/assets/logo-on-blue.png brand/jci-oriente/assets/logo-on-primary.png` |
| `git mv apps/spotlight/public/og-image-v3.png brand/jci-oriente/assets/og-image.png` |
| `git rm apps/spotlight/public/og-linktree.png` |
| `packages/ui/src/components/logo-lockup.tsx`: srcs, `alt={brand.name}`, real `width`/`height` from the virtual module |
| `packages/ui/src/components/logo-lockup.test.tsx` (new): alt = fixture name, width/height = fixture logo's 400×200 — red first |
| `packages/ui/tsconfig.json`: references `packages/brand/src/virtual.d.ts` |
| `packages/ui/vitest.config.ts`: `brandPlugin({ app: "spotlight", profile: "fixture" })` |
| `packages/ui/package.json`: `@luminova/brand` workspace devDependency (`packages/ui/src/assets.d.ts` stays if other PNG imports remain, else delete it in place of this row) |

The fixture logos must exist for the test: generate them first with
`packages/brand/scripts/make-fixture-assets.ts` (solid-colour PNGs at contract sizes via
`node:zlib`, logos 400×200) and commit the generator and its 16 outputs in two commits just
before this one: (a) the script, the four root files and `spotlight/`; (b) `backstage/`.

```bash
pnpm --filter @luminova/ui run ci
```

### 1a.7 Wire spotlight

**Files (≤ 9):** `apps/spotlight/vite.config.ts`, `vitest.config.ts`, `index.html`,
`public/firebase-messaging-sw.js`, `src/config/external-links.ts` (delete),
`src/components/header.tsx`, `src/components/footer.tsx` (URL imports only), `tsconfig.json`
(references `virtual.d.ts`), `package.json`.

- Manifest fields from the profile; `imagetools` include
  `/(brand\/[^/]+\/assets|brand-assets)\/logo-[^/]+\.png$/`; ports from `ports.ts`.
- `index.html`: placeholders for every row of spec section 4 "HTML"; OG tags use `__OG_IMAGE__`.
- vitest: `brandPlugin({ app: "spotlight", profile: "fixture" })`.

```bash
pnpm --filter spotlight run ci
pnpm --filter spotlight build && grep -c 'og-image\.[0-9a-f]\{8\}\.png' apps/spotlight/dist/index.html
```

### 1a.8 Wire backstage and move both icon sets

Three commits:

| Commit | Files |
|---|---|
| a (≤ 6) | `apps/backstage/vite.config.ts`, `vitest.config.ts`, `index.html`, `public/firebase-messaging-sw.js`, `tsconfig.json`, `package.json` |
| b (6) | `git mv` the six `apps/spotlight/public/*` icons → `brand/jci-oriente/assets/spotlight/` |
| c (6) | `git mv` the six `apps/backstage/public/*` icons → `brand/jci-oriente/assets/backstage/` |

Then `.env.production` (2 files): only `VITE_FIREBASE_EMULATOR_ENABLED=false` and a comment
pointing at `brand.json`.

```bash
pnpm --filter backstage run ci
ls apps/spotlight/dist/favicon-16.png apps/spotlight/dist/og-image-v3.png
```

### 1a.9 Equivalence check

Strict byte equality is impossible (chunk hashes depend on module paths that this PR moves),
so equivalence is checked on what users and crawlers receive. Build `origin/main` in a
scratch worktree and this branch, then compare:

| Compared | Must be |
|---|---|
| `index.html` after stripping `/assets/*` hashes | Identical except `og:image`, `og:image:secure_url`, `twitter:image` (now hashed) |
| `manifest.webmanifest` | Identical JSON |
| Every root public file (icons, SW, `sitemap.xml`, `robots.txt`, `og-image-v3.png`) | Byte-identical; `og-image.<hash>.png` added |
| Bundle | Contains the same `projectId`, `appId`, `apiKey` and App Check key strings |
| Visible text (`pnpm --filter spotlight preview` + `backstage`, home, about, login) | Unchanged |

Keep the comparison commands in the PR body.

### 1a.10 Docs that move with 1a, verify, review

**Docs (≤ 6):** `NOTICE` (paths → `brand/jci-oriente/`, drop `og-linktree.png`),
`README.md` / `README.es.md` (the branding bullets name `brand/<slug>/`; the rewrite is PR 3),
`apps/spotlight/CLAUDE.md:16` (OG hashing automatic, `og.legacyPaths`),
`packages/ui/DESIGN.md:51-52`, `docs/domains.md:21-47`.

```bash
pnpm pr-tests && bash tools/scripts/check-bundle-budget.sh
```

1. `bundle-budget-watcher`: record the `index` chunk gz delta for both apps in the PR body. A
   breach is a conscious, noted decision or a fix, never silent.
2. `/simplify` on the diff.
3. `.claude/hooks/route.sh` → run **every** listed review. Expected (router output wins):
   code-review (adversarial Opus substitute, say so in the PR), simplify,
   react-best-practices, secure-dep-vetting, bundle-budget-watcher.
4. Stamp the `Reviews:` trailer in its own Bash call, `gh pr create --body-file`, `pnpm pr-tests`.
5. After merge: owner step **B0**.

---

## PR 1b — copy tokens, site content, guard

### 1b.1 Copy tokens — spotlight

**Files (≤ 10):** `components/footer.tsx` (`:45`, `:128`, `JCI_BOLIVIA_URL`),
`components/header.tsx`, `components/linktree-page.tsx`, `components/showcase/impacto-page.tsx`,
`notifications/push-prompt.tsx` + its test, `routes/about.tsx`, `routes/index.tsx` (including
`:87`, `:163` with `stats.nationalOrganizations`, `:252`), `routes/privacidad.tsx`,
`routes/terminos.tsx`; `routes/contact.tsx` in a second commit.

Every sentence that states a chapter fact becomes a template over tokens (spec D17), for
example `` `Capítulo ${locality.city} de la ${movementName}. Formamos líderes desde ${foundedYear}.` ``.

**Test first:** `push-prompt.test.tsx` expects `` `Recibe avisos de ${brand.name}` `` with the
fixture profile — red until the component reads the token. Route files export only `Route`.

### 1b.2 Copy tokens — backstage

**Files (≤ 10 per commit):** `brand-side.tsx`, `login-form.tsx`, `lead-table.tsx`,
`member-credential-card.tsx` (`CHAPTER`, `CITY` → `locality.cityFormal` + `locality.country`),
`member-milestones.tsx`, `self-profile-form.tsx`, `config-page.tsx`, `site-config-form.tsx`,
`lib/push-registration.ts`; then `lib/member-qr.ts`, `member-qr.test.ts`,
`check-in/components/activity-check-in.test.tsx`.

**Test first:** `member-qr.test.ts` parameterized on `brand.qrPrefix` (fixture → `fixture:member:`).

```bash
pnpm --filter spotlight run ci && pnpm --filter backstage run ci
```

### 1b.3 Site content consolidation

**Files (≤ 8):** `brand/jci-oriente/site-content.json`, `brand/fixture/site-content.json`,
`apps/spotlight/src/site-config/defaults.ts`, `defaults.test.ts`,
`apps/spotlight/src/test/seed-data.d.ts` (delete), `tools/scripts/lib/site-config-seed-data.mjs`
(delete), `packages/brand/src/site-content.ts`, `site-content.test.ts`.

- JSON copied from `site-config-seed-data.mjs` (the drift-tested twin of `defaults.ts`).
- `currentYearsActive` reads `brand.foundedYear`.

**Test first:** both profiles' `site-content.json` parse with the `@luminova/types` site-config schema.

### 1b.4 Seeds and tools scripts on the profile

**Files (≤ 7):** `tools/scripts/seed-emulator.mjs`, `seed-production.mjs`, `e2e-check-in.mjs`,
`e2e-issue-invite.mjs`, `audit-soft-delete-shapes.mjs`, `tools/scripts/lib/seed-target.test.mjs`
(new), root `package.json` if a script line changes.

Each script imports `packages/brand/src/load-profile.ts` directly (Node 24 type stripping;
no `.mjs` twin) and follows spec section 5.10: `GCLOUD_PROJECT`, else the profile's
`firebase.projectId`; `seed-production` requires `--project` or `GCLOUD_PROJECT`, refuses unless
it equals the profile's `projectId`, and prints project and profile before the first write.

**Test first:** `seed-target.test.mjs` (run by `pnpm test:seed`): refusal without a project,
refusal on mismatch, accepted match — the target-resolution function is exported and tested
without Firestore. Hard-gated (`seed-*.mjs`): security-review applies to 1b.

```bash
pnpm test:seed
GCLOUD_PROJECT=someone-else pnpm seed:production; echo "exit $? (expect non-zero, before any write)"
```

### 1b.5 Guard and CI

**Files (≤ 5):** `packages/brand/src/cli/guard.ts`, `guard.test.ts`, `.github/workflows/ci.yml`,
root `package.json`, `docs/engineering-guardrails.md`.

- **Turbo spike first (5 min):** with `brand-assets/` holding a copy of the example assets,
  run `pnpm turbo run build --filter spotlight --dry=json | jq '.tasks[0].hash'`, change one
  byte of `brand-assets/logo-main.png`, run it again. Record whether the hash moved in the PR
  body and in spec section 5.5. Release builds use `--force` regardless.
- `guard.ts` (spec section 7): inverse checks on the existing `jci-oriente` `dist`; then the
  fixture build of spotlight and backstage; needles = every leaf string ≥ 6 chars of
  `brand/jci-oriente/brand.json` minus the reasoned exclusion list, plus the sha256 of every file
  in `brand/jci-oriente/assets/`; then the case-sensitive regex as the second net. Pure checks
  unit-tested against fake `dist` dirs; the exclusion list pinned by a test.
- `ci.yml` `checks`: `pnpm brand:schema --check` and `pnpm brand:guard` after the bundle-budget step.
- Guardrails doc: one row in "How these are enforced".

```bash
pnpm brand:guard; echo "exit $?"
```

Make it bite: put `953870918238` into a fixture-built string, and separately "JCI Oriente"
into `footer.tsx`; run the guard, see each fail naming file and needle; revert.

### 1b.6 Verify, review, PR

```bash
pnpm pr-tests && pnpm brand:guard
git grep -nE '[Jj][Cc][Ii][ -]?[Oo]riente|Santa Cruz|1993' -- apps/*/src packages/ui/src ':!*.test.*'   # expect nothing
```

Route → run every listed review. Expected: security-review (hard, `seed-*.mjs`), code-review,
simplify, react-best-practices. Stamp, PR, `pnpm pr-tests`.

---

## PR 2a — release mode, bucket, CD (hard-gated)

**Prerequisite:** part B steps B1–B5 done by the owner. Merge only after them.

### 2a.1 Spike: `prepare` and `.firebaserc`

On a fresh clone of the branch: delete `.firebaserc`, add the root `prepare` script, run
`pnpm install --frozen-lockfile`, and confirm `.firebaserc` appears. Then run
`pnpm --filter @luminova/firestore-rules-tests test`,
`pnpm --filter @luminova/storage-rules-tests test`, `pnpm --filter beacon test:emulator` and
`pnpm dev` (stop after the emulators boot). If `prepare` does not run under pnpm 11, stop
and record why before choosing another hook.

### 2a.2 Release mode

**Files (≤ 6):** `packages/brand/src/load-profile.ts`, `load-profile.test.ts`,
`src/release.ts`, `release.test.ts`, `src/vite.ts`, `vite.test.ts`.

**Test first:** every release row of spec sections 5.6 and 6, including the marker
`{ profile, projectId, assets }` and the `pull-manifest.json` profile check.

### 2a.3 `prepare`, `brand:apply`, target rename, `predeploy`

**Files (≤ 8):** `packages/brand/src/cli/apply.ts`, `apply.test.ts`,
`packages/brand/src/cli/assert-dist.ts`, `assert-dist.test.ts`, `.firebaserc`
(`git rm --cached`), `.gitignore`, `firebase.json` (targets `spotlight`/`backstage`; hosting
`predeploy` → `pnpm -s brand:assert-dist <app>`), root `package.json` (`prepare`,
`brand:apply`, `brand:assert-dist`; `deploy:hosting` sets `BRAND_RELEASE=1` and `--force`).

`prepare` is the only automatic call site; `brand:apply` stays for a profile switch without
reinstalling. A stale `.firebaserc` cannot ship: `predeploy` compares the marker with the
project the CLI is targeting.

**Test first:** `apply` snapshot for `jci-oriente` equals today's `.firebaserc` with the two
target keys renamed; `assert-dist` accepts the matching marker, rejects none / other project.

### 2a.4 gcloud seam, `brand:pull`, `brand:push`, `brand:provision`

**Files (≤ 8):** `cli/gcloud.ts` (execFile wrapper with an injectable runner), `pull.ts`,
`pull.test.ts`, `push.ts`, `push.test.ts`, `provision.ts`, `provision.test.ts`,
`brand/bucket-lifecycle.json`.

**Test first** (fake runner records argv; no real gcloud):

- `pull`: `gcloud storage objects list gs://<bucket> --format=json`, then `gcloud storage cp`
  of `gs://<bucket>/<name>#<generation>` per directory; writes `pull-manifest.json` (profile,
  names, generations, md5); fails before downloading if a contract file is absent.
- `push`: validates the source dir with the library validator (refuses on any error); uploads
  with `gcloud storage cp` per file (never `rsync --delete-unmatched-destination-objects`);
  skips `pull-manifest.json`; prints `gh workflow run deploy.yml -f surface=hosting` without
  running it.
- `provision`: default prints the part B commands with values filled in, plus the
  `docs/ci-cd.md` section 6 block filled with the profile's project, `GH_REPO` and
  `REVIEWER_ID` (`gh api user -q .id`); `--apply` runs only the bucket steps, skipping each
  whose `describe` shows it done.

`brand/bucket-lifecycle.json`:

```json
{ "lifecycle": { "rule": [ { "action": { "type": "Delete" },
  "condition": { "isLive": false, "numNewerVersions": 3 } } ] } }
```

### 2a.5 CD

**Files (2):** `.github/workflows/deploy.yml`, `.github/actions/firebase-setup/action.yml`.

Exactly spec section 5.8. The action's `brand_profile` input is exported as `BRAND_PROFILE`
for the install step only, so `prepare` writes `.firebaserc`; it feeds nothing else. The
hosting build reads `vars.BRAND_PROFILE` through `env:`. Reuse the `setup-gcloud` pin
already in `deploy-functions` (`aa5489c8933f4cc7a4f7d45035b3b1440c9c10db # v3.0.1`). Inputs
flow through `env:`, never inline `${{ }}` in `run:`. A `brand` step writes `spotlight_url` to
`$GITHUB_OUTPUT` and the pulled generations to `$GITHUB_STEP_SUMMARY`. Validation is the
release build itself (the plugin), so no separate check step.

**Verify locally:** `actionlint` if installed; otherwise a YAML parse and a careful read. CD
cannot run before merge — that is what B6 is for.

### 2a.6 Docs that move with 2a

**Files (≤ 5):** `docs/ci-cd.md` (bucket in the inventory, the bucket-level grant,
`BRAND_PROFILE`, hosting flow, cost line), `docs/firebase-setup.md` (targets; `.firebaserc`
is generated), `docs/architecture.md`, `CLAUDE.md` (app table targets),
`docs/domains.md:10-11` (target column).

### 2a.7 Verify, review, PR

```bash
pnpm pr-tests && pnpm brand:guard
BRAND_PROFILE=fixture BRAND_RELEASE=1 pnpm turbo run build --filter spotlight --force
BRAND_PROFILE=jci-oriente BRAND_RELEASE=1 GCP_PROJECT_ID=someone-else pnpm turbo run build --filter spotlight --force
```

Acceptance: each build exits non-zero; the first error list names `fixture`, the second's
contains `GCP_PROJECT_ID`.

Route → run every listed review. Expected: **security-review (hard: `firebase.json`,
`.firebaserc`, `deploy.yml`, `firebase-setup`)**, code-review (adversarial Opus substitute),
simplify. `firebase-functions-reviewer` only if beacon changed. `/security-review` once more on
the full branch before `gh pr create`.

---

## PR 2b — adopter tooling

### 2b.1 `brand:check`

**Files (2):** `cli/check.ts`, `check.test.ts`. One row per contract entry; exit 1 on any
error; `--release` applies the release rules.

### 2b.2 `brand:doctor`

**Files (2):** `cli/doctor.ts`, `doctor.test.ts`. One table, every row always reported (spec
section 5.9): profile and its source, schema, assets, `.firebaserc` in sync with the profile,
`gcloud` signed in, bucket readable (`objects list`, read-only), `BRAND_PROFILE` set, Node and
pnpm versions. Exit 1 if any row fails. Tested through the fake runner.

### 2b.3 `brand:init`

**Files (≤ 4):** `cli/init.ts`, `init.test.ts`, `src/prompts.ts`, root `package.json`.

`node:readline/promises`; `--answers <file>` for non-interactive use (the test path). Writes
`brand/<slug>/brand.json` (validated before writing), copies `site-content.json` from
`jci-oriente`, creates `brand-assets/README.txt` from the contract data, and prints
`export BRAND_PROFILE=<slug>` with a note to add it to the shell profile or `.envrc`.
Optional: `firebase apps:sdkconfig WEB <appId> --project <id>` per app to fill `firebase.web`
(read-only, through the runner seam).

### 2b.4 `brand:icons` (separable)

**Files (≤ 5):** `cli/icons.ts`, `icons.test.ts`, root `package.json`,
`apps/spotlight/package.json`, `apps/backstage/package.json`.

`secure-dep-vetting` for moving `@vite-pwa/assets-generator` from both apps to the root
devDependencies (no new package; `sharp` already in `allowBuilds`). `themeColor` is the opaque
background for maskable/apple icons. Test: the generated set passes the validator. If the API
fights for more than an hour, drop this task to a roadmap row; nothing depends on it.

### 2b.5 Verify, review, PR

`pnpm pr-tests`; route → run every listed review (expected: code-review, simplify,
secure-dep-vetting, bundle-budget-watcher for the lockfile). Stamp, PR, `pnpm pr-tests`.

---

## PR 3 — adopter documentation

**Files (≤ 6):** `docs/adopting.md` (new), `README.md`, `README.es.md`,
`.github/ISSUE_TEMPLATE/chapter_adoption.yml`, `docs/ci-cd.md` (line 11 and section 6
parameterized: `PROJECT_ID`, `GH_REPO`, `REVIEWER_ID`, with JCI Oriente's values as the
example), `docs/roadmap.md` (rows ✅).

`docs/adopting.md`, in order, each step with its exact command and who runs it:

1. Fork; clone; `pnpm install`; `pnpm dev` works on the example profile.
2. Create the Firebase project (Blaze), two web apps, the second hosting site — console steps from `docs/firebase-setup.md`.
3. `pnpm brand:init` (answers + optional `apps:sdkconfig` fill); add the printed `export BRAND_PROFILE=…`; edit `site-content.json`.
4. Put the 16 files in `brand-assets/` (or `brand-assets/icon-master.png` + `pnpm brand:icons`); `pnpm brand:check`.
5. `pnpm brand:doctor` until every row passes except the bucket rows.
6. Commit `brand/<slug>/` in the fork (never `brand-assets/`).
7. WIF + deploy SA per `docs/ci-cd.md` section 6, or the block `pnpm brand:provision` prints (adopter runs).
8. `pnpm brand:provision` → review → `pnpm brand:provision --apply` (adopter runs).
9. `pnpm brand:push` (adopter runs); `pnpm brand:doctor` now passes every row.
10. `gh variable set BRAND_PROFILE --env production --body <slug>` plus the three WIF variables.
11. Merge to `main` or dispatch Deploy; check the verification list (canonical URL, OG preview in WhatsApp, PWA install name, QR prefix, "Ingresar" target).
12. `pnpm seed:production --project <id>` for the first admin.

README sections become a five-line summary and a link. Lighter review: `Review-Exception`
with the correctness gate `git grep -n 'packages/ui/src/assets\|og-linktree' -- '*.md' NOTICE` → nothing.

---

## Part B — owner-only operations (Claude never runs these)

Run from the repo root with owner credentials (`gcloud auth login`). Values for JCI Oriente:

```bash
export PROJECT_ID=jci-oriente
export BUCKET=jci-oriente-brand-assets
export DEPLOY_SA_EMAIL=firebase-deployer@jci-oriente.iam.gserviceaccount.com
```

| # | When | Step |
|---|---|---|
| B0 | Right after PR 1a merges (CD deploys it with the default profile) | Approve the Deploy run; then on `https://jcioriente.org` and `https://admin.jcioriente.org`: view source (title, description, canonical, theme colour, hashed `og:image`), open `manifest.webmanifest` (name "JCI Oriente", colours), fetch `/og-image-v3.png` and `/favicon-32.png` (200), sign in to backstage (Firebase config intact), and check a WhatsApp share preview of the home page |
| B1 | Before merging PR 2a | Create the bucket: `gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT_ID" --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention` |
| B2 | Before merging PR 2a | Versioning and lifecycle: `gcloud storage buckets update "gs://$BUCKET" --versioning` then `gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=brand/bucket-lifecycle.json` |
| B3 | Before merging PR 2a | Read-only grant for CD: `gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$DEPLOY_SA_EMAIL" --role=roles/storage.objectViewer`. Check the role carries what `brand:pull` needs: `gcloud iam roles describe roles/storage.objectViewer --format="value(includedPermissions)"` lists `storage.objects.get` and `storage.objects.list`. Check the bucket: `gcloud storage buckets describe "gs://$BUCKET" --format="yaml(public_access_prevention,uniform_bucket_level_access,versioning_enabled,lifecycle_config)"` and `gcloud storage buckets get-iam-policy "gs://$BUCKET"` (owners plus the deploy SA as viewer; no `allUsers`) |
| B4 | Before merging PR 2a | Upload JCI Oriente's assets (from the PR 2a worktree): `BRAND_PROFILE=jci-oriente pnpm brand:push --from brand/jci-oriente/assets`; then `gcloud storage ls -a "gs://$BUCKET/**"` lists 16 objects |
| B5 | Before merging PR 2a | `gh variable set BRAND_PROFILE --env production --body jci-oriente` |
| B6 | Right after PR 2a merges | `gh workflow run deploy.yml -f surface=all`; approve; confirm `brand:pull` succeeded with the deploy SA (proves `objectViewer` suffices) and the run summary lists the pulled generations; then repeat the B0 checks |

B1–B3 equal `pnpm brand:provision --apply`; either path is fine. If B6 fails in
`deploy-hosting`, live hosting is untouched (preview → smoke → promote); fix forward or revert 2a.

---

## Done when

- [ ] B0 passed: PR 1a changed nothing users or crawlers see except the hashed OG URL.
- [ ] `BRAND_PROFILE=fixture` builds of spotlight and backstage contain no needle derived from `brand/jci-oriente/brand.json`, no byte-identical JCI Oriente asset, and no regex match; wired in CI `checks`, and seen failing on planted values.
- [ ] The `jci-oriente` build's `index.html`, manifest, sitemap, SW title and bundle `projectId` equal production; `og-image-v3.png` still served.
- [ ] A release build fails, naming every missing file, when `brand-assets/` lacks any of the 16; fails for `fixture`, `demo-*`, `BRAND_ASSETS_DIR`, or a project mismatch (error list contains `GCP_PROJECT_ID`).
- [ ] `firebase deploy --only hosting` on a non-release `dist` is refused by `predeploy`.
- [ ] `.firebaserc` and the Firebase web config come only from `brand.json`; `apps/*/.env.production` hold only the emulator flag.
- [ ] `pnpm install && pnpm dev` works from a fresh clone with no brand setup.
- [ ] `seed:production` refuses without an explicit project or on a mismatch, before any write.
- [ ] CD pulls from the private bucket with a bucket-scoped `objectViewer` grant and deploys both sites; B6 passed.
- [ ] `brand:apply`, `pull`, `push`, `provision`, `assert-dist`, `schema`, `guard`, `init`, `check`, `doctor` exist with tests; `brand:icons` exists or has a roadmap row.
- [ ] `site-config-seed-data.mjs` and `external-links.ts` are gone; the 1b.6 `git grep` is empty.
- [ ] `docs/adopting.md` exists; README/README.es, NOTICE, `docs/ci-cd.md` (parameterized section 6), `docs/firebase-setup.md`, `docs/domains.md`, `CLAUDE.md` state the shipped behaviour.
- [ ] `bundle-budget-watcher` delta recorded in 1a; every router-listed review run and stamped on every PR.
