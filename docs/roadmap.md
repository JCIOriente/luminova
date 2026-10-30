# JCI Oriente — Product Roadmap

Living doc. **Last synced: 2026-09-29**, with every PR through #238 merged (`main` at `f148ee9`).

How to read it:

- **Section 1 is the work queue.** One row is one session and one PR, done in priority
  order unless the row says otherwise. Work that is not a row here is not scheduled; a
  session that notices something new reports it and does not act on it.
- **Section 2** holds what only the owner can do: decisions and console operations. Some
  rows in section 1 wait on them.
- **Section 3** is the product backlog: epics not yet broken into sessions.
- **Section 4** records what shipped. **Section 5** is the product reference the epics
  are designed against.

Every row follows CLAUDE.md: worktree first, route the diff (`.claude/hooks/route.sh`), run
every review it lists, stamp, `gh pr create`, `pnpm pr-tests`. The review set in each row is
what the rubric (`.claude/review-routing.json`) mandates for the paths the row touches; the
router's output for the real diff wins if they differ. Mark the row ✅ with its PR number in
this file, in the same PR.

**Status legend:** ✅ done · 🟡 partial · ⬜ not started · ⏸ waiting on section 2.

## 1. Work queue

| # | Item | Scope | Owner | Review set (router) | Ordering |
|---|------|-------|-------|---------------------|----------|
| R2 ⬜ | **Docs accuracy sweep** | (a) `docs/firebase-setup.md:623` quotes the ATTESTATION_BLOCKED copy as "…y avisa a la directiva."; the app says "…y avísanos." — copy it byte-for-byte from `apps/backstage/src/features/auth/lib/invite-error.ts`. (b) `docs/performance.md`: the section-1 eager-JS row (spotlight "104", backstage "278 kB gz") and the budget table's "now" values are stale — measure with a build and write the current figures (last measured: spotlight 109,232 B gz ≈ 106.7 kB; backstage ≈ 159 kB). (c) `docs/specs/invite-link-onboarding.md:558` quotes the old forgot-password copy "Pídele a la directiva…" — replace with the shipped login copy. Facts only, no "corrected" framing. | Agent | Lighter review (docs only): `Review-Exception` + correctness gate | Any time |
| R3 ⬜ | **Orphaned auth users keep their claims** | `recomputeAllClaims` iterates `members`, so an auth user whose member doc is gone is never revisited and keeps its custom claims (reported 2026-09: two stale test accounts with extra perms). `apps/beacon/src/issue-member-invite.ts:165` already names the risk ("An orphaned account may still hold org roles (even Admin)"). Build an Admin-only reconciliation that lists auth users, diffs against member docs, and clears the claims of orphans, with a dry-run mode that reports first. Spec first (auth + Cloud Functions). | Agent; owner runs it in prod | security-review (hard), firebase-functions-reviewer, code-review, simplify | security-review (hard), firebase-functions-reviewer, code-review, simplify; + react-best-practices if it adds a backstage `.tsx` |
| R4 ⏸ | **Phone rule consistency** | (a) `firestore.rules` `leads` create checks only `phone.size()` 1–20 while the client requires `^[23467][0-9]{7}$`: mirror the pattern and add a rules test (guardrail 2, rules mirror code). (b) `normalizeBoliviaPhone` (`packages/types/src/phone.ts`, submit backstop) strips a leading `591` but not `00591`, unlike `sanitizeBoliviaPhoneInput`: align them, with tests. Staff member/ally lanes stay unshaped (deliberate). | Agent | security-review (hard), firestore-security-reviewer, code-review, simplify | After Q1 |
| R5 ⬜ | **Callable counts in prose point at the list** | Replace "five authenticated callables" / "four declare no enforceAppCheck" with a pointer to `APP_CHECK_ENFORCED_CALLABLES` and the deploy list ("enumerated in `deploy.yml` and pinned by a test", never "derived"): `.github/workflows/deploy.yml:218-219`, `.github/scripts/assert-deployed-env-clean.sh:9,164`, `.github/scripts/assert-deployed-env-clean.test.mjs:236`, `apps/beacon/src/redeem-invite.test.ts:784`, `docs/specs/structural-oncall-guard.md:59,70`, `apps/beacon/src/token-verification-bypass.ts:88-90`. Comments and prose only; no behavior change. The word "derived" at `assert-deployed-env-clean.sh:29,90` means something else and stays. | Agent | security-review (hard), firebase-functions-reviewer; code-review + simplify only if ≥ 15 source lines change | Any time |
| R6 ⬜ | **A deploy parked on approval blocks CD silently** | `deploy.yml` `concurrency: deploy-production` with a run waiting on `production` approval holds the group; every later run queues and is cancelled, and `notify` is cancelled with it. Happened Aug 12–15 2026: about three days, thirteen cancelled runs. Make a parked or cancelled deploy visible — alert on a run waiting past a threshold, or fail fast instead of parking. | Agent | security-review (hard), code-review, simplify | Any time |
| R7 ⬜ | **Role-permission drift detection** | Prod drifted across five built-in roles unseen. `reseedBuiltInRolePerms {dryRun:true}` already returns the exact diff. Run it on a schedule and alert when the preview is non-empty. Beacon has no scheduled function yet, so this is the first one. | Agent | security-review (hard), firebase-functions-reviewer, code-review, simplify | After R3 (same claims area) |
| R8 ⬜ | **Scheduled dependency audit** | Advisory ranges widen under existing overrides, so `pnpm audit` starts failing every PR at once (fixed twice after the fact: #223, #236). Add a scheduled workflow that runs the audit and reports on its own, so it no longer surprises an unrelated PR. Renovate is out of scope. | Agent | code-review, simplify (≥ 15 source lines) | Any time |
| R9 ⬜ | **Hook text-match false positives** | (a) `.claude/hooks/pre-commit.sh:17` treats `[[:space:]]-n` as `--no-verify`, so `… \| tail -n 5` skips the lint gate. (b) The branch-guard / pre-commit regex floor fires on quoted text (a PR body mentioning "git commit") from the primary checkout. Both pre-existing. | Agent | security-review (hard), code-review, simplify | Any time |
| R10 ⬜ | **Hooks follow-ups** | (a) `git switch main && git commit` in one command from a worktree cwd is not caught. (b) `git commit && gh pr create` judges the pre-commit HEAD. Low priority: the GitHub ruleset on `main` already stops either commit from landing. | Agent | security-review (hard), code-review, simplify | After R9 |
| R11 ⬜ | **Locked-fields parser comments** | `tools/scripts/lib/rules-locked-fields.mjs` strips whole-line `//` comments but not trailing ones, and its other two parsers strip none. Handle both, with fixtures in `rules-locked-fields.test.mjs`. | Agent | code-review, simplify (≥ 15 source lines) | Any time |
| R12 ⬜ | **Owner-op tooling — spec only** | The owner-op sequence (seedRoles → grant → reseed → recompute → verify the claim) is rebuilt by hand each time and needs a temporary IAM token-creator grant. Write `docs/specs/` for putting it behind Admin buttons in `/permisos`, where R3's and R7's checks can live too. The spec is the deliverable; building it is a later row. | Agent | Lighter review (docs only) | After R3 and R7 |
| R13 ⏸ | **Legacy phone backfill** | Only if Q2 = backfill: a one-shot script (dry-run first) normalizing stored member/ally phones that start 0/1/5/8/9 or carry a country code, so forms save again and WhatsApp links return. | Agent; owner runs it in prod | code-review, simplify (named `tools/scripts/seed-*.mjs` or placed in beacon, it becomes auth surface: + security-review) | After Q2 and R4 |
| R14 ✅ | **firebase-functions 7.4 / express 5** (with firebase 13, firebase-admin 14) | Done in the firebase major-upgrade PR: beacon moved from `firebase-functions` 7.2.5 to 7.4.0 (express `^5.2.1`), the express-4 and body-parser-1 overrides were dropped, and the beacon emulator suites re-ran green. Side effect: firebase 13 (Firestore 4.18+) grows backstage's lazy `db` chunk 76 → 142 kB gz and spotlight's async `site-data` 39.5 → 47.8 kB gz; trimming that is a follow-up. | Agent | secure-dep-vetting, security-review (hard), firebase-functions-reviewer, bundle-budget-watcher | Done |
| R15 ✅ | **Route-export lint and bounded getMemberUids** (#241) | ESLint `ROUTE_EXPORT_SELECTORS`: backstage and spotlight route files export only `Route` (spotlight `LinktreePage` moved to `components/`). Beacon `getMemberUids` reads in `chunk(ids, 300)` batches. `CONTRIBUTING.md` names the public backstage routes. This table's R4/R13/R14 cells. | Agent | security-review (hard), firebase-functions-reviewer, code-review, simplify, react-best-practices, bundle-budget-watcher | — |
| R16 ✅ | **Brand profiles and build wiring** (#254) | Plan PR 1a (`feat/brand-profiles`): `@luminova/brand` (zod schema, loader, asset validator, Vite plugin, `virtual:luminova-brand`), profiles `brand/jci-oriente/` and `brand/fixture/`, logos/icons/OG moved into the example profile, `LogoLockup`, both apps' build wiring, Firebase web config out of `.env.production`. Output equivalent to today except the hashed OG URL; CD unchanged. | Agent; owner runs O9 after merge | code-review, simplify, react-best-practices, secure-dep-vetting, bundle-budget-watcher | Any time |
| R17 ✅ | **Brand copy tokens and neutrality guard** (#258) | Plan PR 1b (`feat/brand-copy-tokens`): every chapter literal and fact sentence in spotlight and backstage read from the profile, `site-content.json` replacing `site-config-seed-data.mjs`, seeds and tools scripts targeting the profile's project (`seed:production` requires an explicit, matching `--project`), `brand:guard` (fixture build must carry no needle from the example profile) wired into CI `checks`. | Agent | security-review (hard, `seed-*.mjs`), code-review, simplify, react-best-practices | After R16 |
| R18 ✅ | **Release-mode brand assets from the bucket** (#262) | Plan PR 2a (`feat/brand-release-assets`): release mode, dist marker + hosting `predeploy`, `.firebaserc` generated by the root `prepare`, hosting targets renamed `spotlight`/`backstage`, `brand:pull`/`push`/`provision`/`assert-dist`, `deploy.yml` pulls `brand-assets/` from the bucket before building. | Agent; owner runs O10 | security-review (hard), code-review, simplify | After R17 and O10 (B1–B5); O10 B6 right after merge |
| R19 ✅ | **Brand adopter tooling** | Plan PR 2b (`feat/brand-adopter-tooling`): `brand:init` (prompts or `--answers`, `--sdkconfig`), `brand:check [--release]`, `brand:doctor` (read-only), `docs/adopting.md` with README/README.es and the adoption issue template pointing at it; `locality.regionShort` optional, slug format checked before the path join. `brand:icons` deferred to R21. | Agent | code-review (adversarial Opus pass), simplify; secure-dep-vetting exempt (scripts only, no dependency delta) | After R18 |
| R20 ✅ | **Adopter guide: `docs/ci-cd.md` parameterized** (#262) | The rest of plan PR 3 after R19 shipped `docs/adopting.md`: `docs/ci-cd.md` line 11 and section 6 parameterized (`PROJECT_ID`, `GH_REPO`, `REVIEWER_ID`, JCI Oriente's values as the example). | Agent | Lighter review (docs only): `Review-Exception` + correctness gate | After R19 |
| R21 ✅ | **`brand:icons`** | `pnpm brand:icons` generates both apps' 12 icons from `brand-assets/icon-master.png` (square PNG, ≥ 512 px) and `themeColor` (opaque background for maskable/apple), checks everything before writing and never overwrites without `--force`; an adopter makes 4 images by hand. Calls `sharp` directly (now a devDependency of `@luminova/brand`): the `@vite-pwa/assets-generator` presets emit neither `favicon-16` nor `favicon-32`, and the generator, unused in both apps, was removed. Test: the generated set passes `validateAssets`. | Agent | secure-dep-vetting, code-review, simplify, bundle-budget-watcher (lockfile) | Any time |
| R22 ✅ | **Brand CLI guidance** | `feat/brand-cli-guidance`, stacked on R19: every brand command ends a failure with a "To fix:" block (the file to change, the command, where to run it) and a success with the next step of `docs/adopting.md`; `brand:doctor` orders its fixes by dependency; external CLI failures say how to install or sign in; `BRAND_PROFILE` hints name the shell's startup file, a direnv `.envrc` and the CD variable. | Agent | router set | After R19 |
| R23 ✅ | **Repo-contained configuration** | `feat/brand-repo-config`: committed `luminova.json` selects the profile (replaces the `BRAND_PROFILE` shell variable, spec D18); `brand.json` `deploy` holds CD's Workload Identity provider and service account, so `deploy.yml` reads no GitHub variables; `brand:ci-config`; `--profile` / `--assets` flags; schema descriptions on every field; `brand:provision` prints numbered steps with why, where and a check. Its follow-up, dev reading `firebase.web` from the profile, landed in R24. | Agent | router set | After R22 |
| R24 ✅ | **Local-first adoption** (#267) | `feat/brand-local-first`: `brand:init` starts a chapter local-only (`demo-<slug>` project, no cloud) and `--connect` attaches the real project later; dev reads the Firebase config from the profile and defaults to the emulators (no `.env` files needed; `.env.production` removed); Deploy skips with a notice until the profile has a real project and a `deploy` section (`.github/scripts/deploy-ready.sh`), and the first real deploy ships every surface; "Next" frames going live as a choice; `docs/adopting.md` splits into "try it" and "go live". Spec: `docs/specs/2026-10-25-local-first-adoption.md`. | Agent | router set | After R23 |
| R25 ✅ | **Profile discovery** (#270) | `fix/brand-profile-discovery`: the committed `luminova.json` is removed; `brand/` selects the profile (its one chapter profile, else the example `jci-oriente`; two stop every command), so a chapter's fork only adds `brand/<slug>/` and never edits a shared file. `brand:init` refuses a second chapter profile; `brand:doctor` warns about a leftover `luminova.json`; `deploy-ready.sh` applies the same rule in bash; upstream CI refuses a chapter folder. Spec: `docs/specs/2026-10-25-profile-discovery.md` (amends C1, C7). | Agent | router set | After R24 |
| R26 ✅ | **Tool setup for adopters** (#272) | `feat/brand-setup`: read-only `pnpm brand:setup` checks each tool a step needs (Node 24, pnpm, Java, Firebase CLI to try it; gh, gcloud and their sign-ins to go live) and prints the install command for the OS (macOS Homebrew, Linux apt or the vendor page; Windows through WSL 2, owner ruling); `brand:doctor` reuses the checks; `docs/adopting.md` gains "Before you start" with per-OS install and verify commands. Copy reviewed by a Fable pass. Spec: `docs/specs/2026-10-25-brand-setup.md`. | Agent | router set | Done |
| R27 ✅ | **Brand commands without flags** (#276, landed by `fix/brand-land-r27`) | `feat/brand-simple-commands`: no brand command takes a flag; one `pnpm brand:check` replaces `brand:setup`, `brand:doctor` and `brand:check` and prints tools, chapter, images and going live as sections; every command reads the images folder `brand:check` names (`brand:push` included); icons, provision and init ask instead of `--force`, `--apply`, `--connect`; `--profile` is gone. Spec: `docs/specs/2026-10-28-brand-simple-commands.md`. | Agent | router set | Done |
| R28 ⬜ | **Brand outside the repo** | A chapter's brand never lives in git: one neutral `brand/example/`, a short git-ignored `brand/local/brand.toml` (identity required, texts default from templates) pushed to the chapter's bucket, a `brand:pull` that keeps local work, CD from a fork reading repository variables, and JCI Oriente migrated the same way. Stacked PRs: spec, example profile, `brand.toml`, bucket and one local folder, (owner runbook), fork CD, JCI Oriente removal. Spec: `docs/specs/2026-10-29-brand-outside-repo.md`. | Agent; owner runs the migration runbook before the fork-CD PR merges | router set per PR | After R27 |

## 2. Owner decisions and operations

### Decisions

| # | Decision | Unblocks |
|---|----------|----------|
| Q1 | Confirm the Bolivian phone rule `^[23467][0-9]{7}$` (landlines 2/3/4, mobiles 6/7; 5 rejected). It is what `packages/types/src/phone.ts` and the member self lane enforce today. | R4 |
| Q2 | Legacy phones starting 0/1/5/8/9: backfill them, or leave them until each is edited? Until fixed, their forms won't save and their WhatsApp links don't render. | R13 |
| Q3 | ~~Upgrade to `firebase-functions` 7.4.0 (express 5), or stay on 7.2.5 + express 4.22.3 with overrides?~~ Decided 2026-10-22: upgrade (latest secure versions over bundle size). | R14 |
| Q4 ✅ | Build-time brand configuration: **proceed** (owner, 2026-10-22). Brand images for deployments live out of git in a private per-project Cloud Storage bucket that CD pulls; JCI Oriente stays the committed example profile, JCI marks included (NOTICE carve-out). Spec `docs/specs/2026-10-22-brand-config-design.md`, plan `docs/plans/2026-10-22-brand-config.md`. | R16–R21 |

### Operations

| # | Operation | Where | Status |
|---|-----------|-------|--------|
| O1 | Expired-link manual test: the invite issued 2026-09-28T10:52:14Z expires ~2026-09-30T10:52Z; redeem it after that and confirm the refusal. | `docs/firebase-setup.md`, owner op 3 | ⬜ time-boxed |
| O2 | Enable Web Push in production: Cloud Messaging API + VAPID key into `firebase.web.{spotlight,backstage}.vapidKey` in `brand/jci-oriente/brand.json` (both are blank today). | `docs/firebase-setup.md`, "Push Notifications" | ⬜ |
| O3 | Custom domains: all four hostnames in Auth → Authorized domains; stored URLs in backstage `/config` moved off `web.app`. reCAPTCHA keys are done. | `docs/domains.md` | ⬜ |
| O4 | Google Search Console for `jcioriente.org`, submit `/sitemap.xml`. | `docs/domains.md` | ⬜ deferred |
| O5 | Confirm the Password-reset action URL is back at the Firebase default. | `docs/firebase-setup.md`, owner op 1 | ⬜ unverified |
| O6 | Confirm prod `roles/Member` carries `read:Member` (fix in `/permisos`, not code). | backstage `/permisos` | ⬜ unverified |
| O7 | Confirm prod `siteConfig/current` has `contact.mapUrl` and `socials` (seed backfill, #155). | backstage `/config` | ⬜ unverified |
| O8 | Storage wipe of rewrite-era objects. | Firebase console | ⬜ |
| O9 | Brand profiles post-merge check (plan part B, B0): after R16 deploys, confirm both sites' source, manifest, `/og-image-v3.png`, backstage sign-in and a WhatsApp preview are unchanged. | `docs/plans/2026-10-22-brand-config.md`, part B | ⬜ |
| O10 | Brand assets bucket for `jci-oriente`: create it private and versioned, grant the deploy SA `roles/storage.objectViewer` on it (check the role's permissions), upload the 16 assets (B1–B4); after R23 merges, delete the four unread production variables (B5); dispatch Deploy and verify (B6). | `docs/plans/2026-10-22-brand-config.md`, part B | ⬜ |

### Standing decisions

- **Firestore App Check stays unenforced in prod.** Do not enable it or recommend enabling it.
  The enforced callables are `APP_CHECK_ENFORCED_CALLABLES`; Storage enforces App Check.
- Firebase web API keys in `brand/<slug>/brand.json` / `.env.local.example` are public client
  identifiers, not secrets, so they stay as they are.
- `/code-review` is user-invoked only. Sessions substitute an adversarial Opus pass and say so
  in the PR.
- The hooks match raw command text: keep the literal words
  "git commit" and "gh pr create" out of command text, heredocs included, except in the
  command that performs them.
- Subagents run with the primary checkout as cwd; the orchestrator commits, stamps and opens
  PRs. Model tiering: Opus for React, rules and complex logic; Sonnet for mechanical work;
  Fable for docs review.

## 3. Product backlog

Epics not yet split into sessions. When one is picked up it gets a spec, then its slices
become rows in section 1.

| # | Epic | State | Notes |
|---|------|-------|-------|
| J | **Finance & Treasury** (detail below) | ⬜ | The largest unbuilt epic. Closes the leaderboard's `duesStatus` eligibility gap: today points accrue to members who are not al día. Input ready: `docs/reference/dues-config.md`. |
| K2 | **Scheduled notification triggers** — birthdays → Membership + CEL, dues reminders/overdue, monthly report | ⬜ | Needs J4. Rides on the shipped inbox + push (#203–#208). K3 email / K4 WhatsApp later. |
| C | **Award dossier track** — C1-dossier (phases, budget vs actual, SDG tags), C2 dossier export per level, C3 recognition calendar | ⛔ | Blocked on `docs/reference/jci-award-criteria.md`. |
| L4 | **Prerender static spotlight routes** — real HTML before JS, biggest remaining FCP/LCP win | ⬜ | Approach open: build-time snapshot (recommended start), TanStack Start, or vite-react-ssg. Brainstorm → spec first. |
| L5 | Inline critical CSS on spotlight | ⬜ | Medium effort, low-medium impact. |
| FX7 | Design-system pass on the remaining backstage screens | 🟡 | Last listed as remaining: Members, Leaderboard, Allies, Initiatives. Re-check before starting. |
| D2 | Reports | ⬜ | Needs the J data. |
| D4 | Real Settings page (also known as N5) — profile, theme, org; home for role management | ⬜ | |
| G1 | Soft-delete write guard — pre-flight existence/`active` check in the member and ally repositories | ⬜ | |
| I1 | Codegen-drift CI gate for `@luminova/types` shared schemas | ⬜ | No CI step exists yet. |
| H4 | Real spotlight images — `ImgSlot` placeholders remain in `home-programs.tsx` and `showcase-card.tsx` | ⬜ | Needs photos from the chapter. |
| A4 | Offline check-in — queue scans, sync when back online | ⬜ | Low priority; `CheckInRepository.create` is the seam. |
| M6 | Spotlight dark mode | ⬜ | Only if the brand calls for it. |

### J. Finance & Treasury detail

Two money flows: **dues IN** (members → chapter, the v1 core) and the chapter's
**obligation OUT to JCI Bolivia** (USD + BOB, yearly — tracked as a reference
figure only). Payments are **ledger entries**, mirroring the points engine; member
dues are **BOB**; everything is **year-scoped** because tiers change yearly.

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| J1 | **Dues config** (year-scoped): named **tiers** `{name, amount, cadence}` (BOB) with **per-tier cadence** (monthly/semestral/yearly; some tiers exempt = 0), the 30/90 lapse thresholds, and the yearly JCI-Bolivia obligation (USD+BOB) | F2; ✅ dues-config | `[S]` | tiers + cadence vary per year; keep history |
| J2 | **Payment ledger** — Treasury records offline payments (date, amount, method, period/year, tier, recordedBy); append-only | J1 | `[S]` | `/security-review` + `firestore-security-reviewer` (Treasury-only writes). **Re-add here:** the inert `Payment` subject + `manage:Payment` Treasury grant were pruned as unbuilt scaffolding in the authz capability migration (PR #187, audit C9) — re-introduce the subject (`permission.ts`, `SUBJECT_LABELS`), the Treasury grant (`role-definition.ts` + `role-seed.mjs` mirror), and the `payments` `firestore.rules` block when this ships. |
| J3 | **Member ↔ tier assignment** per year (carry-over default) + derived `duesStatus` | J1, J2 | `[S]` | duesStatus computed, not stored mutable |
| J4 | **Auto-lapse** scheduled function (beacon cron) — overdue computed **per the member's tier cadence**; `Al día → Pendiente (30d) → Inactivo (90d)`; auto-reinstate on payment; fires reminders. Also **voids the lapsed month's points** + awards **+5 for joining a payment plan** (Finance→Points hooks) | J3, A2 | `[S]` | `firebase-functions-reviewer`; audited, reversible |
| J5 | **Treasury dashboard + monthly money-movement report** — collected vs outstanding by tier/member; export | J2 | `[S]` | export for the board |

## 4. Shipped

Everything below is merged and live. PR numbers are the record; `git log` has the detail.

| Track | What shipped | PRs |
|-------|--------------|-----|
| Foundations | Roles + CASL ability + role-aware rules (F1), `@luminova/types` with zod schemas (F2), recognition-engine data model (F3) | #12 and earlier |
| Recognition engine | Point rules admin, `awardPoints` engine, QR check-in, member profile + points history, leaderboard, roster → participation expansion, atomic points recompute | #13–#18, #23, #100, #103 |
| Member surface | `/me` home, role-aware board home, real dashboard, `/me` retention (upcoming events, birthdays, anniversaries), self-rename, public-profile consent (on by default) | #20, #45, #111, #115, #153, #210, #214, #215 |
| Initiatives | Events/activities CRUD, C1-lite (grid, detail, completion wizard, galleries), programs + projects folded into one initiative layer, finalized-initiative lock | #22, #49–#64, #137, #169 |
| Public site | Public showcase `/impacto` (absorbed `/programas`), president-editable site config, `/linktree`, allies wall, board showcase (Directiva), legal pages, lead capture hub with WhatsApp reach, editorial redesign, custom domains `jcioriente.org` / `admin.jcioriente.org` | #66, #69, #82, #83, #91, #149–#152, #157, #158, #164, #209, #211, #238 |
| Roles & governance | Dynamic permissions (`perms` claim), positions catalog, claims-sync, nine built-in roles + reseed callable, role lifecycle, position-assignment lane, delegable board-seat + member-login permissions | #52, #54, #84–#89, #107, #216, #219, #221, #222, #224, #225 |
| Authorization & page extraction | Route/nav ⟷ rules parity, capability migration, UI gate leak fix, emulator-driven parity tests | #183–#202 |
| Onboarding & App Check | Invite-link onboarding (replaced Firebase auth email), rate limit + 48 h TTL, App Check on the invite callables and `issueMemberInvite`, deploy-time assertion, token-verification bypass refusal; **G4** (App Check enforcement) done, smoke test passed 2026-09-28 | #227–#235 |
| Notifications | Model + rules + beacon fan-out, lazy messaging client, backstage compose + inbox + push opt-in, spotlight anonymous push opt-in | #203–#208 |
| UI & design system | `@luminova/ui` widgets (Combobox, MultiSelect, Popover, CommandPalette, DataTable, QR), dark mode, ⌘K, sidebar collapse, login redesign, DS polish, card/search/badge/dialog primitives, type scale, responsive shell + Drawer, installable PWAs | #21, #37–#39, #111–#117, #131–#136, #171, #173, #175–#177 |
| Performance | firebase/lite, font diet, WebP, deferred reads, immutable caching, lazy chunks, split Firebase SDK out of the login path | #93–#105, #172, #174 |
| Quality & audit | 2026-07 full audit and its 15 items, read mapper + parse-on-read, datetime consolidation, error states, engineering guardrails, test-quality guards | #123–#148, #160 |
| Infra & harness | CI PR gate, keyless CD (WIF/OIDC), deterministic review router, hooks that target the worktree, dependency audits | #104, #106, #113, #119, #154, #156, #189, #197, #207, #223, #236 |

## 5. Product reference

### Naming conventions

Identifiers in this doc and the code follow one rule to avoid mixed-language names:

- **Code identifiers** (types, fields, functions, enum *names*) → **English**, no
  diacritics; `PascalCase` types, `camelCase` fields/functions.
- **User-facing enum *values* / labels** → may stay **Spanish** (the product
  language), matching the shipped `MemberStatus` = `"Activo" | "Inactivo" |
  "Desafiliado"`. So `membershipStatus` (English key) holds Spanish values.
- **Expand acronyms** in identifiers for readability: `isExecutiveCommittee`, not
  `isCEL`.
- **`gestión` → `term`** in code (the annual cycle; likely a `Term` entity carrying
  year + board + convention date — points windows and "previous-term" eligibility
  reference it).
- Planned small renames when their feature lands (don't churn shipped code now):
  `member.status` → `membershipStatus` (once `duesStatus` coexists);
  consider `ally.personInCharge` → `contactPerson` (more idiomatic).

### Strategic frame

The product's job isn't "CRUD records" — it's **run the membership loop
(Recruit → Engage → Recognize → Retain) with little time, and survive the annual
board handover.** The spine is a **participation → points → recognition engine**:
members earn points for participation (attending activities/events/ceremonies,
directing or being on a project team), points drive recognition + retention.
Access is **multi-role (CASL + role-aware rules)**, not board-only (see Personas
below). **Projects** are not rows; they're **award-submission dossiers**
(National/Area/World) *and* public showcase content for Spotlight. Membership
**dues** are the financial backbone — Treasury records offline payments, status
lapses automatically, and money movement is reported — so a **Finance/Treasury
engine** and a cross-cutting **Notifications layer** are first-class, not extras.

### Personas & permissions

A **permission role ≠ a chapter title** (Presidenta is a title; *Admin* is a
permission). A person holds **multiple additive roles**. Model permissions with
CASL on the client and **mirror them in `firestore.rules`** server-side.

| Permission role | Who | Can |
|---|---|---|
| **Admin** | Presidency + one designated Admin (assigned per year) | Everything |
| **Membership** | Membership Director + Co-director | Create members; set **membershipStatus** (active/inactive); receives **birthday** notifications |
| **Treasury** | Tesorería | Record/manage dues & payments; view money reports; receives overdue + monthly-report notifications |
| **CEL (board)** | all Comité Ejecutivo Local members | Read dashboard for their area; receives **birthday** notifications |
| **Scanner** | designated **per event** | Check-in attendees for the assigned event only |
| **Member** | everyone | Own profile, personal QR, points/history, events; see own dues status |

**Status is two decoupled signals (do not share one field):**
- `membershipStatus` — `Activo / Inactivo / Desafiliado` — lifecycle, owned by Membership/Admin.
- `duesStatus` — derived from the payment ledger: `Al día → Pendiente` (after X overdue days) → a scheduled job flips `membershipStatus → Inactivo` (after Y more days). X/Y configurable; auto-reinstate on payment. Gives honest reporting ("left" vs "non-payment").

### Input artifacts

- ✅ **Points matrix** → `docs/reference/points-matrix.md` — received. It's the
  **"Mejor Miembro Individual"** evaluation (a monthly competition), richer than a
  counter — see "Recognition Engine — rules that shape the model" below.
- ✅ **Dues config (2026)** → `docs/reference/dues-config.md` — received (tiered,
  **per-tier cadence**; 30→Pendiente / 90→Inactivo; JCI-Bolivia obligation).
- ⛔ **JCI award criteria** → `docs/reference/jci-award-criteria.md` — still pending;
  gates the Project schema (C1) + dossier export (C2).

### Recognition Engine — rules that shape the model (from the points matrix)

The points system is the **Mejor Miembro Individual** competition. Design F3/A to these:

- **Hierarchy Programa → Proyecto → Actividad — `Program` and `Project` are
  DISTINCT entities** (different at their core), each producing **Activities** where
  attendance/points happen. "Actividad" = an execution instance (coordination
  meetings don't count). Roles: director / co-director / team.
- **Points are provisional, then confirmed by two gates** (v1 — the "aval"
  endorsement is **dropped for now**, it's an administrative/legal-advisor step):
  (a) director files the **final report** (conclusions + economic report if budget —
  this *is* the C-epic dossier), and (b) **attendance registered**. Plus a
  **punctuality factor** — ≤15 min after start = 100 %, later = 50 % (from the
  **QR check-in timestamp**). Ledger entry → `provisional | confirmed`, with factor +
  source/role + activity link.
- **Time-windowed:** monthly accrual (1st–last), convention cutoff **3 weeks before**,
  annual total. Leaderboard publishes **monthly (top 3 + Best of Month)** and annually.
- **Public & transparent:** the cumulative + monthly points table is **visible to all
  members** (not gated); monthly public breakdown; members can request clarification.
- **Finance → Points coupling:** only members **al día** are eligible; a **missed
  month voids that month's points** (restored on payment); **joining a payment plan =
  +5 pts**. The engine reads `duesStatus`.
- **Accrual ≠ eligibility:** flags `isExecutiveCommittee` (CEL — can't compete),
  `isPastPresident` (no accrual), `wonBestMemberPreviousTerm` (excluded next term).
  JDL directors *do* accrue + compete. (These may be derived from an award/term
  history rather than stored booleans — decide in the F3 brainstorm.)
- **Tiebreaker:** social media (like 1 / comment 2 / share 3) — **manual monthly entry,
  low-priority** (assess its value when the slice is built).
