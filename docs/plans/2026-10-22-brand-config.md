# Plan — build-time brand configuration

Spec: `docs/specs/2026-08-19-brand-config-design.md` (read it first; section numbers below
refer to it). Every file:line in the spec was verified at `520ae5c`; re-grep before editing a
cited line, since `main` moves.

TDD throughout: write the test, run it, **see it fail for the expected reason**, then
implement. Checkpoint-commit at each "Commit" line; never more than 10 files in one commit.
Never leave a commit whose `pnpm --filter <touched> run ci` fails (runtime 404s on icons
between tasks 1.8 and 1.9 are acceptable; a red build is not).

## Shape: four PRs

| PR | Branch | Content | Why split here |
|---|---|---|---|
| 0 | `feat/brand-config` (this worktree, `.worktrees/brand-config`) | Spec, this plan, roadmap rows | Docs only, lighter review; lets the owner approve before code |
| 1 | `feat/brand-profiles` | `@luminova/brand`, both profiles, consumers, site-content consolidation, Firebase web config move, CI guards | CD keeps working unchanged: a non-release build defaults to `jci-oriente` with committed assets, which is exactly today's output |
| 2 | `feat/brand-release-assets` | Release mode, `.firebaserc` generation, target rename, bucket scripts, CD changes, `brand:init`/`brand:icons` | All deploy/IAM surface in one hard-gated review; needs the owner ops of part B first |
| 3 | `chore/brand-adopter-docs` | `docs/adopting.md`, README/README.es, issue template | Written against shipped behaviour, so it states truth |

Each PR starts from a fresh worktree off `origin/main` (Worktree-first, CLAUDE.md):

```bash
git fetch && git worktree add .worktrees/brand-profiles -b feat/brand-profiles origin/main
cd .worktrees/brand-profiles && pnpm install && pnpm turbo run build --filter="./packages/*"
```

Do not reuse `.worktrees/brand-config` for code: it carries PR 0. Remove each worktree after
its PR merges (`git worktree remove .worktrees/<slug>`).

Subagent models: Opus for the plugin, release mode, CD and every review; Sonnet for the
copy-token sweep (tasks 1.10, 1.11) and asset moves. Subagents edit and stop; the
orchestrator commits, stamps and opens PRs.

---

## PR 1 — profiles, plugin, consumers, guards

### 1.1 Package skeleton

**Files (6):** `packages/brand/package.json`, `tsconfig.json`, `vitest.config.ts`,
`src/schema.ts` (stub), `src/schema.test.ts`, `knip.json`.

- Run `secure-dep-vetting` for `zod` in the new package: same exact pin as
  `packages/types/package.json` (4.4.3) unless vetting finds an advisory.
- `tsconfig.json`: `strict`, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`
  (so Node 24 can run the CLIs by type stripping); relative imports use `.ts` extensions.
- `package.json` exports `.` (schema, loader, validator), `./vite` (plugin),
  `./virtual` (types). Scripts: `test`, `typecheck`, `lint`, `ci` mirroring `packages/ui`.
- `knip.json`: workspace entry for `packages/brand` with `src/cli/*.ts` and `src/vite.ts` as entries.

**Test first:** `schema.test.ts` imports `brandSchema` and parses `{}` expecting failure → fails (stub exports nothing).

```bash
pnpm install && pnpm --filter @luminova/brand test   # red, then green after 1.2
```

### 1.2 Schema and JSON Schema generation

**Files (5):** `packages/brand/src/schema.ts`, `schema.test.ts`, `src/cli/schema.ts`,
`brand/brand.schema.json`, root `package.json` (`brand:schema` script).

**Test first:** table-driven rejects, one case per field in spec section 7 "Schema"; accepts
a full valid object. Reuse `normalizeSiteUrl` semantics (bare https origin) — move it from
`apps/spotlight/seo-files.ts` into `packages/brand/src/urls.ts` and re-export, rather than
copying (guardrail 1).

`brand:schema` writes `brand/brand.schema.json` with `z.toJSONSchema(brandSchema)`;
`--check` regenerates in memory and exits 1 on diff.

```bash
pnpm --filter @luminova/brand test
node --experimental-strip-types packages/brand/src/cli/schema.ts --check
```

**Commit:** `feat(brand): package skeleton and brand.json schema` (tasks 1.1–1.2, ≤ 10 files).

### 1.3 Profiles and loader

**Files (7):** `brand/jci-oriente/brand.json`, `brand/fixture/brand.json`,
`packages/brand/src/load-profile.ts`, `load-profile.test.ts`, `.gitignore`,
`.prettierignore` (only if prettier rewrites the schema file), root `package.json`.

- `jci-oriente/brand.json`: every value from spec section 4, copied byte-for-byte from the cited
  lines (titles, descriptions, colors, web config from both `.env.production`).
  `og.legacyPaths: ["og-image-v3.png"]`, `qrPrefix: "jcioriente"`.
- `fixture/brand.json`: name "Fixture Chapter", city "Springfield", urls
  `https://fixture.example.org` / `https://admin.fixture.example.org`, `qrPrefix: "fixture"`,
  project `demo-fixture`, `foundedYear` 2001, colors `#336699` / `#222222`.
- `.gitignore`: `brand-assets/`, `brand/.active`, `brand/*/assets/`,
  `!brand/jci-oriente/assets/`, `!brand/fixture/assets/`.

**Test first:** selection order env > `.active` > default (non-release); slug ≠ folder
fails; missing folder lists available profiles. Use a temp dir as repo root (injected).

### 1.4 PNG reader and asset validator

**Files (4):** `packages/brand/src/png.ts`, `png.test.ts`, `src/assets.ts`, `assets.test.ts`.

- `png.ts`: verify the 8-byte signature, read width/height from IHDR (bytes 16–23). No dependency.
- `assets.ts`: the contract table of spec section 5.4 as data (single source used by the
  validator, `brand:check`, `brand:init`'s README.txt and the tests). Returns **all** errors.

**Test first:** build tiny PNGs in-test (signature + IHDR + IDAT via `node:zlib`); cases from
spec section 7 "Assets".

**Commit:** `feat(brand): profiles, loader and asset validator` (tasks 1.3–1.4).

### 1.5 Example and fixture assets

Move with `git mv` so history follows. Three commits, each ≤ 10 files:

| Commit | Moves |
|---|---|
| a | `packages/ui/src/assets/logo-color.png` → `brand/jci-oriente/assets/logo-main.png`, `logo-on-dark.png` → same name, `logo-on-blue.png` → `logo-on-primary.png`, `apps/spotlight/public/og-image-v3.png` → `og-image.png`; delete `apps/spotlight/public/og-linktree.png` — **together with task 1.9's `logo-lockup.tsx` change**, so the ui build never breaks |
| b | the six `apps/spotlight/public/*` icons → `brand/jci-oriente/assets/spotlight/` |
| c | the six `apps/backstage/public/*` icons → `brand/jci-oriente/assets/backstage/` |

Fixture assets: a one-off generator `packages/brand/scripts/make-fixture-assets.ts` (solid
colour PNGs at contract sizes via `node:zlib`, logos 400×200). Its output is 16 files, so
commit it in two: (d) the script, the four root files and `spotlight/` (≤ 10 files);
(e) `backstage/`.

**Verify:** `node --experimental-strip-types packages/brand/src/cli/check.ts` (stub of 2.4 is
fine here, or a vitest that validates both committed profiles — keep it: it stops either
committed profile rotting).

### 1.6 URLs and ports

**Files (4):** `packages/brand/src/urls.ts`, `urls.test.ts`, `src/ports.ts`, `apps/spotlight/seo-files.ts` (import `normalizeSiteUrl` from the package).

**Test first:** the three rows of spec section 5.5; `seo-files.test.ts` keeps passing.

### 1.7 Vite plugin

**Files (≤ 8):** `packages/brand/src/vite.ts`, `vite.test.ts`, `src/stage-public.ts`,
`stage-public.test.ts`, `src/render-html.ts`, `render-html.test.ts`, `src/virtual.d.ts`.

Order inside the task, each test-first:

1. `stagePublic(appPublicDir, assetsDir, app, profile, outDir)` → copies `public/`, the app's
   icon set, `og-image.<sha256-8>.png`, each legacy alias, and the SW with `__BRAND_NAME__`
   replaced. Test: hash changes iff bytes change; alias bytes equal the hashed file.
2. `renderHtml(html, values)` → replaces every placeholder; throws on any leftover
   `__[A-Z_]+__`.
3. `brandPlugin({ app, profile? })`:
   - `config` hook: select + validate (throw one aggregated error), stage, return
     `{ publicDir }`; for `command === "build"` with the emulator flag not `"true"`, set
     `process.env.VITE_FIREBASE_*` / `VITE_APPCHECK_SITE_KEY` / `VITE_FIREBASE_VAPID_KEY`
     from `firebase.web`.
   - `resolveId`/`load` for `virtual:luminova-brand`: emit `import` statements for the three
     logos (absolute paths, so `imagetools` still applies) plus a JSON literal of the runtime subset and logo dimensions.
   - `transformIndexHtml` (order `pre`): `renderHtml`.
4. **Spike before wiring (30 min cap):** prove the env injection with a scratch build: build spotlight
   with the fixture profile and `grep -r demo-fixture apps/spotlight/dist/assets` must hit.
   If it does not, fall back to `brand:apply` writing `apps/*/.env.production` (gitignored)
   and record the change in the spec's section 5.5 before continuing.

**Commit:** `feat(brand): vite plugin, staged public dir and virtual module`.

### 1.8 Wire spotlight

**Files (≤ 9):** `apps/spotlight/vite.config.ts`, `vitest.config.ts`, `index.html`,
`public/firebase-messaging-sw.js`, `src/config/external-links.ts` (delete),
`src/components/header.tsx`, `src/components/footer.tsx` (URL imports only), `tsconfig.json`,
`package.json` (`@luminova/brand` workspace dep).

- Manifest fields from the profile; `imagetools` include
  `/(brand\/[^/]+\/assets|brand-assets)\/logo-[^/]+\.png$/`; ports from `ports.ts`.
- `index.html`: placeholders for every row of spec section 4 "HTML"; OG tags use `__OG_IMAGE__`.
- vitest: `brandPlugin({ app: "spotlight", profile: "fixture" })`.

**Verify:**

```bash
pnpm --filter spotlight run ci
pnpm --filter spotlight build && grep -c 'og-image\.[0-9a-f]\{8\}\.png' apps/spotlight/dist/index.html
ls apps/spotlight/dist/og-image-v3.png apps/spotlight/dist/favicon-16.png
```

### 1.9 Wire backstage and `@luminova/ui`

**Files (≤ 8):** `apps/backstage/vite.config.ts`, `vitest.config.ts`, `index.html`,
`public/firebase-messaging-sw.js`, `tsconfig.json`, `package.json`,
`packages/ui/vitest.config.ts`, `packages/ui/package.json`. `logo-lockup.tsx` itself lands
in commit 1.5a, with the logo move, so the ui build never breaks; write its test there
(alt equals the fixture name, width/height equal the fixture logo's 400×200).

`LogoLockup`: srcs, `alt={brand.name}`, real `width`/`height` from the virtual module.

```bash
pnpm --filter backstage run ci && pnpm --filter @luminova/ui run ci
```

**Commit(s):** `feat(spotlight): read brand from the profile`, `feat(backstage): …`.

### 1.10 Copy tokens — spotlight

**Files (≤ 10):** `footer.tsx`, `header.tsx`, `linktree-page.tsx`,
`showcase/impacto-page.tsx`, `notifications/push-prompt.tsx` + its test, `routes/about.tsx`,
`routes/index.tsx`, `routes/privacidad.tsx`, `routes/terminos.tsx`; `routes/contact.tsx` in a
second commit if the count is reached.

**Test first:** update `push-prompt.test.tsx` to expect `` `Recibe avisos de ${brand.name}` ``
with the fixture profile — it fails until the component reads the token.
Rule: route files export only `Route` (eslint); tokens come from the virtual module.

### 1.11 Copy tokens — backstage

**Files (≤ 10 per commit):** `brand-side.tsx`, `login-form.tsx`, `lead-table.tsx`,
`member-credential-card.tsx`, `member-milestones.tsx`, `self-profile-form.tsx`,
`config-page.tsx`, `site-config-form.tsx`, `lib/push-registration.ts`; then
`lib/member-qr.ts`, `member-qr.test.ts`, `check-in/components/activity-check-in.test.tsx`.

**Test first:** `member-qr.test.ts` parameterized on `brand.qrPrefix` (fixture → `fixture:member:`).

```bash
pnpm --filter backstage run ci
```

### 1.12 Site content consolidation

**Files (≤ 9):** `brand/jci-oriente/site-content.json`, `brand/fixture/site-content.json`,
`apps/spotlight/src/site-config/defaults.ts`, `defaults.test.ts`,
`apps/spotlight/src/test/seed-data.d.ts` (delete), `tools/scripts/seed-emulator.mjs`,
`tools/scripts/seed-production.mjs`, `tools/scripts/lib/site-config-seed-data.mjs` (delete),
`packages/brand/src/site-content.test.ts`.

- JSON copied from `site-config-seed-data.mjs` (it is the drift-tested twin of `defaults.ts`).
- Seeds read `brand/<profile>/site-content.json` with `import … with { type: "json" }`, the
  profile chosen by the same selection order (a tiny `.mjs` helper in `tools/scripts/lib/`;
  the seed must not depend on Vite).
- `currentYearsActive` reads `brand.foundedYear`.

**Test first:** both profiles' `site-content.json` parse with the `@luminova/types` site-config
schema; `pnpm test:seed` stays green. `seed-*.mjs` is hard-gated: security-review applies to PR 1.

### 1.13 Firebase web config out of `.env.production`

**Files (2):** `apps/spotlight/.env.production`, `apps/backstage/.env.production` → only
`VITE_FIREBASE_EMULATOR_ENABLED=false` and a comment pointing at `brand.json`.

**Verify:** `pnpm --filter spotlight build && grep -l 'jci-oriente' apps/spotlight/dist/assets/*.js` hits (injection works for the default profile).

### 1.14 Guards, turbo and CI

**Files (≤ 6):** `packages/brand/src/cli/guard.ts`, `guard.test.ts`, `turbo.json`,
`.github/workflows/ci.yml`, root `package.json`, `docs/engineering-guardrails.md`.

- `turbo.json` `build.env` += `BRAND_PROFILE`, `BRAND_RELEASE`, `BRAND_ASSETS_DIR`,
  `GCP_PROJECT_ID`; `build.inputs` = `["$TURBO_DEFAULT$", "$TURBO_ROOT$/brand/**"]`.
  Prove it: `pnpm turbo run build --filter spotlight --dry=json | jq '.tasks[0].hash'` changes
  after editing `brand/jci-oriente/brand.json`.
- `guard.ts`: inverse checks on the existing `dist` (spec section 7), then the fixture build, the
  grep, and the sha256 leak check. Pure checks unit-tested against fake dist dirs.
- `ci.yml` `checks`: `pnpm brand:schema --check` and `pnpm brand:guard` after the bundle
  budget step (the budget must measure the `jci-oriente` build).
- Guardrails doc: one row in "How these are enforced".

```bash
pnpm brand:guard; echo "exit $?"
```

Then break it on purpose: put "JCI Oriente" back into `footer.tsx`, run the guard, see it fail
naming the file, revert. Tests must bite.

### 1.15 Docs that move with PR 1

**Files (≤ 8):** `NOTICE` (paths → `brand/jci-oriente/`, drop `og-linktree.png`),
`README.md` / `README.es.md` (the branding bullets now name `brand/<slug>/`; full rewrite is
PR 3), `apps/spotlight/CLAUDE.md` (OG rule), `packages/ui/DESIGN.md:51-52`,
`docs/domains.md:21-47` (origins live in `brand.json`), `docs/performance.md` only if
budgets moved.

### 1.16 Verify, review, PR

```bash
pnpm pr-tests
bash tools/scripts/check-bundle-budget.sh
pnpm brand:guard
git grep -nE '[Jj][Cc][Ii][ -]?[Oo]riente|Santa Cruz' -- apps/*/src packages/ui/src ':!*.test.*'   # expect nothing
```

1. Dispatch `bundle-budget-watcher` (Sonnet) and record the `index` chunk gz delta for both
   apps in the PR body. A budget breach is a conscious, noted decision or a fix, never silent.
2. `/simplify` on the diff.
3. `.claude/hooks/route.sh` → run **every** listed review. Expected (router output wins):
   security-review (hard, `seed-*.mjs`), code-review (adversarial Opus substitute, say so in
   the PR), simplify, react-best-practices, secure-dep-vetting, bundle-budget-watcher.
   `firebase-functions-reviewer` only if `apps/beacon/` appears in the diff (it should not).
4. Stamp the `Reviews:` trailer in its own Bash call, then `gh pr create --body-file`, then
   `pnpm pr-tests`.

---

## PR 2 — release mode, bucket, CD

**Prerequisite:** part B steps B1–B4 done by the owner. Merge only after them.

### 2.1 Spike: who needs `.firebaserc`

In the worktree: `mv .firebaserc .firebaserc.bak`, then run
`pnpm --filter @luminova/firestore-rules-tests test`,
`pnpm --filter @luminova/storage-rules-tests test`, `pnpm --filter beacon test:emulator`, and
`pnpm dev` (stop after the emulators boot). Record which fail. Restore with
`mv .firebaserc.bak .firebaserc`. That list is where `brand:apply`
must run (expected: `emulators.sh`, the storage-rules suite, every deploy job).

### 2.2 Release mode

**Files (≤ 6):** `packages/brand/src/load-profile.ts`, `load-profile.test.ts`,
`src/release.ts`, `release.test.ts`, `src/vite.ts`, `vite.test.ts`.

**Test first:** every release row of spec section 5.6 and section 6, including the marker
contents `{ profile, projectId, assets }`.

### 2.3 `brand:apply`, `.firebaserc`, target rename

**Files (≤ 10):** `packages/brand/src/cli/apply.ts`, `apply.test.ts`, `.firebaserc` (git rm
`--cached`, gitignored), `.gitignore`, `firebase.json` (targets `spotlight`/`backstage`;
hosting `predeploy` → `pnpm -s brand:assert-dist spotlight|backstage`),
`packages/brand/src/cli/assert-dist.ts`, `assert-dist.test.ts`, `tools/scripts/emulators.sh`,
`tools/scripts/lib/default-project.mjs`, root `package.json` (`dev`, `preview:local`,
`deploy:*` call `brand:apply`; `deploy:hosting` sets `BRAND_RELEASE=1` and `--force`).

**Test first:** `apply` snapshot for `jci-oriente` equals today's `.firebaserc` with the two
target keys renamed. Second commit: the five tools scripts default their project via
`default-project.mjs` (hard-gated: `seed-*.mjs`).

### 2.4 `brand:check`

**Files (2):** `cli/check.ts`, `check.test.ts`. One row per contract entry; exit 1 on any error; `--release`.

### 2.5 gcloud seam, `brand:pull`, `brand:push`, `brand:provision`

**Files (≤ 8):** `cli/gcloud.ts` (execFile wrapper with an injectable runner), `pull.ts`,
`pull.test.ts`, `push.ts`, `push.test.ts`, `provision.ts`, `provision.test.ts`,
`brand/bucket-lifecycle.json`.

**Test first** (fake runner records argv; no real gcloud):

- `pull`: `gcloud storage objects list gs://<bucket> --format=json`, then `gcloud storage cp`
  of `gs://<bucket>/<name>#<generation>` per directory; writes `manifest.json` with profile,
  names, generations, md5; fails before downloading if a contract file is absent from the listing.
- `push`: validates the source dir first (refuses on any error); uploads with
  `gcloud storage cp` per file (never `rsync --delete-unmatched-destination-objects`); skips
  `manifest.json`; prints `gh workflow run deploy.yml -f surface=hosting` without running it.
- `provision`: default prints the part B commands with values filled in; `--apply` runs them,
  skipping each step whose `describe` shows it is already done.

### 2.6 `brand:init`

**Files (≤ 4):** `cli/init.ts`, `init.test.ts`, `src/prompts.ts`, root `package.json`.

`node:readline/promises`; `--answers <file>` for non-interactive use (the test path).
Writes `brand/<slug>/brand.json` (validated before writing), copies `site-content.json` from
`jci-oriente`, writes `brand/.active`, creates `brand-assets/README.txt` from the contract
data. Optional step: `firebase apps:sdkconfig WEB <appId> --project <id>` per app to fill
`firebase.web` (read-only command, through the gcloud-style runner seam).

### 2.7 CD

**Files (2):** `.github/workflows/deploy.yml`, `.github/actions/firebase-setup/action.yml`.

Exactly spec section 5.8. Reuse the `setup-gcloud` pin already in `deploy-functions`
(`aa5489c8933f4cc7a4f7d45035b3b1440c9c10db # v3.0.1`). Inputs flow through `env:`, never
inline `${{ }}` in `run:` (the file's existing rule). Add a `brand` step that writes
`spotlight_url` to `$GITHUB_OUTPUT` and the pulled generations to `$GITHUB_STEP_SUMMARY`.

**Verify locally:** `actionlint` if installed; otherwise `node -e` YAML parse plus a careful
read. CD cannot be exercised before merge — that is what part B step B6 is for.

### 2.8 `brand:icons` (separable)

**Files (≤ 5):** `cli/icons.ts`, `icons.test.ts`, root `package.json`,
`apps/spotlight/package.json`, `apps/backstage/package.json`.

`secure-dep-vetting` for moving `@vite-pwa/assets-generator` from both apps to the root
devDependencies (no new package; `sharp` already in `allowBuilds`). Uses the generator's API
with `themeColor` as the opaque background for maskable/apple icons. Test: the generated set
passes the asset validator. If the API fights for more than an hour, drop this task to a
follow-up row; nothing else depends on it.

### 2.9 Docs that move with PR 2

**Files (≤ 6):** `docs/ci-cd.md` (inventory row for the bucket and the bucket-level grant,
`BRAND_PROFILE` variable, hosting flow, cost line), `docs/firebase-setup.md` (targets,
`brand:apply` before manual CLI use), `docs/architecture.md`, `CLAUDE.md` (app table targets),
`docs/domains.md:10-11` (target column).

### 2.10 Verify, review, PR

```bash
pnpm pr-tests && pnpm brand:guard
BRAND_PROFILE=fixture BRAND_RELEASE=1 pnpm turbo run build --filter spotlight --force; echo "exit $? (expect non-zero: fixture refused)"
BRAND_PROFILE=jci-oriente BRAND_RELEASE=1 GCP_PROJECT_ID=someone-else pnpm turbo run build --filter spotlight --force; echo "exit $? (expect non-zero: project mismatch)"
```

Route → run every listed review. Expected: **security-review (hard: `firebase.json`,
`.firebaserc`, `deploy.yml`, `firebase-setup`, `seed-*.mjs`)**, code-review (adversarial Opus
substitute), simplify, secure-dep-vetting. `firebase-functions-reviewer` only if beacon
changed. Run `/security-review` once more on the full branch before `gh pr create`.

---

## PR 3 — adopter documentation

**Files (≤ 5):** `docs/adopting.md` (new), `README.md`, `README.es.md`,
`.github/ISSUE_TEMPLATE/chapter_adoption.yml`, `docs/roadmap.md` (mark rows ✅).

`docs/adopting.md`, in order, each step with its exact command and who runs it:

1. Fork; clone; `pnpm install`; `pnpm dev` works on the example profile.
2. Create the Firebase project (Blaze), two web apps, the second hosting site — console steps from `docs/firebase-setup.md`.
3. `pnpm brand:init` (answers + optional `apps:sdkconfig` fill); edit `site-content.json`.
4. Put the 16 files in `brand-assets/` (or `brand-assets/icon-master.png` + `pnpm brand:icons`); `pnpm brand:check`.
5. Commit `brand/<slug>/` in the fork (never `brand-assets/`).
6. WIF + deploy SA per `docs/ci-cd.md` section 6 (adopter runs).
7. `pnpm brand:provision` → review → `pnpm brand:provision --apply` (adopter runs).
8. `pnpm brand:push` (adopter runs).
9. `gh variable set BRAND_PROFILE --env production --body <slug>` plus the three WIF variables.
10. Merge to `main` or dispatch Deploy; check the verification list (canonical URL, OG preview in WhatsApp, PWA install name, QR prefix, "Ingresar" target).
11. `pnpm seed:production` for the first admin.

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
| B1 | Before merging PR 2 | Create the bucket: `gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT_ID" --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention` |
| B2 | Before merging PR 2 | Versioning and lifecycle: `gcloud storage buckets update "gs://$BUCKET" --versioning` then `gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=brand/bucket-lifecycle.json` |
| B3 | Before merging PR 2 | Read-only grant for CD: `gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$DEPLOY_SA_EMAIL" --role=roles/storage.objectViewer`. Check: `gcloud storage buckets describe "gs://$BUCKET" --format="yaml(public_access_prevention,uniform_bucket_level_access,versioning_enabled,lifecycle_config)"` and `gcloud storage buckets get-iam-policy "gs://$BUCKET"` (only owners + the deploy SA as viewer; no `allUsers`) |
| B4 | Before merging PR 2 | Upload JCI Oriente's assets (from the PR 2 worktree): `BRAND_PROFILE=jci-oriente pnpm brand:push --from brand/jci-oriente/assets`; then `gcloud storage ls -a "gs://$BUCKET/**"` lists 16 objects |
| B5 | Before merging PR 2 | `gh variable set BRAND_PROFILE --env production --body jci-oriente` |
| B6 | Right after PR 2 merges | `gh workflow run deploy.yml -f surface=all`; approve; confirm the run summary lists the pulled generations, then open `https://jcioriente.org` and `https://admin.jcioriente.org`, view source (canonical, hashed OG, theme colour), and fetch `https://jcioriente.org/og-image-v3.png` (200) |

B1–B3 equal `pnpm brand:provision --apply`; either path is fine. If B6 fails in
`deploy-hosting`, live hosting is untouched (preview → smoke → promote); fix forward or revert PR 2.

---

## Done when

- [ ] `BRAND_PROFILE=fixture` builds of spotlight, backstage and beacon contain no match for the guard pattern and no byte-identical JCI Oriente asset; wired in CI `checks`, and seen failing on a planted literal.
- [ ] The `jci-oriente` build's `index.html`, manifest, sitemap, SW title and bundle `projectId` equal production today; `og-image-v3.png` still served.
- [ ] A release build fails, naming every missing file, when `brand-assets/` lacks any of the 16; fails for `fixture`, `demo-*`, `BRAND_ASSETS_DIR`, or a project mismatch.
- [ ] `firebase deploy --only hosting` on a non-release `dist` is refused by `predeploy`.
- [ ] `.firebaserc` and Firebase web config come only from `brand.json`; `apps/*/.env.production` hold only the emulator flag.
- [ ] `pnpm dev` works from a fresh clone with no brand setup.
- [ ] CD pulls from the private bucket with a bucket-scoped `objectViewer` grant and deploys both sites; B6 passed.
- [ ] `brand:init`, `brand:check`, `brand:apply`, `brand:pull`, `brand:push`, `brand:provision`, `brand:schema`, `brand:guard` exist with tests; `brand:icons` exists or has a roadmap row.
- [ ] `site-config-seed-data.mjs` and `external-links.ts` are gone; `git grep` of spec section 4 "Source" literals in `apps/*/src`, `packages/ui/src` (tests excluded) is empty.
- [ ] `docs/adopting.md` exists; README/README.es, NOTICE, `docs/ci-cd.md`, `docs/firebase-setup.md`, `docs/domains.md`, `CLAUDE.md` state the shipped behaviour.
- [ ] `bundle-budget-watcher` delta recorded in PR 1; every router-listed review run and stamped on PRs 1–3.
