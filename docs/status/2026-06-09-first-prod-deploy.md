# First Production Deploy — Runbook (I4)

**Date:** 2026-06-09
**Project:** `jci-oriente` (Firebase)
**Scope:** First production deploy of Firestore rules + indexes, beacon Cloud Functions, and both Hosting targets (spotlight + backstage).

## What ships

| Target | Source | Firebase target |
|--------|--------|-----------------|
| Spotlight (public site) | `apps/spotlight/dist` | `hosting:jcioriente` |
| Backstage (admin) | `apps/backstage/dist` | `hosting:jcioriente-backstage` |
| Functions (beacon) | `apps/beacon` (`awardPoints`, `setUserRoles`, `provisionMemberLogin`) | `functions:beacon` |
| Firestore rules + indexes | `firestore.rules`, `firestore.indexes.json` | `firestore` |
| Storage rules | `storage.rules` | `storage` |

## Build / env model

- **Firebase web config is public** (client identifiers, not secrets) — committed in each app's `.env.production`.
- Vite inlines `VITE_*` at **build** time. A developer's `.env.local` has `VITE_FIREBASE_EMULATOR_ENABLED=true`; `deploy:hosting` **forces `VITE_FIREBASE_EMULATOR_ENABLED=false`** on the shell (highest Vite priority) so an emulator-pointed bundle can never reach prod.
- The turbo `build` task is keyed on `VITE_FIREBASE_EMULATOR_ENABLED` (`turbo.json` `env`), so an emulator-on (`build:local`) artifact and the emulator-off prod artifact never share a cache entry.

## Deploy scripts (root `package.json`)

```bash
pnpm deploy:rules            # firebase deploy --only firestore,storage
pnpm deploy:functions        # firebase deploy --only functions (predeploy builds beacon)
pnpm deploy:hosting          # builds both apps (emulator off) + deploys both hosting targets
pnpm deploy:all              # rules → functions → hosting, in that order
```

## Pre-deploy checklist

- [x] `pnpm turbo run ci` green for backstage / spotlight / ui / beacon / firebase (178 backstage tests + 59 beacon).
- [x] `pnpm knip` — clean (config hints only).
- [x] `pnpm audit --audit-level=high` — passes (1 pre-existing **moderate**, tracked as I5; below the high gate).
- [x] Prod builds verified: `VITE_FIREBASE_EMULATOR_ENABLED` inlines `false`; `jci-oriente` config present.
- [ ] **Java not installed locally** → `firestore-rules-tests` cannot run (issue **I2**). Rules unchanged by this PR; verify rules in Firebase Console **Rules Playground** after deploy, or enable Java in CI (I2) before relying on the suite.
- [ ] Logged in: `firebase login` (and `firebase use jci-oriente`).
- [ ] Confirm Blaze plan is active (Cloud Functions require it).

## Owner-ops runbook (interactive / credentialed — run by a project owner)

1. **Authenticate** (in this session, prefix with `!`):
   ```
   ! firebase login
   ! firebase use jci-oriente
   ```
2. **Deploy rules first** (cheapest, reversible, surfaces auth problems before code):
   ```
   pnpm deploy:rules
   ```
   Verify in Console → Firestore → Rules Playground that a signed-out read of `members` is denied and `board` is allowed.
3. **Deploy functions:**
   ```
   pnpm deploy:functions
   ```
   Check Console → Functions: `awardPoints` (Firestore trigger), `setUserRoles`, `provisionMemberLogin` deployed on nodejs24.
4. **Deploy hosting:**
   ```
   pnpm deploy:hosting
   ```
   Open both live URLs. On backstage: sign in, confirm it talks to **prod** (not emulator), members table loads, leaderboard renders.

## Post-deploy hardening (follow-ups, not blockers)

- **App Check (G4):** create a reCAPTCHA v3 site key, set `VITE_APPCHECK_SITE_KEY` in `apps/*/.env.production`, rebuild + redeploy hosting, then flip **enforcement** in Console → App Check for Firestore + Functions. Rules already role-guard every collection, so App Check is defense-in-depth.
- **I2:** enable Java in CI so `firestore-rules-tests` runs on every PR.
- **I5:** resolve the moderate Dependabot advisory.
- First-admin bootstrap: ensure at least one user has the `Admin` role claim (`setUserRoles`) so the console is manageable.

## Rollback

- **Hosting:** Console → Hosting → target → **Release history** → roll back to the previous release (instant). Or `firebase hosting:rollback`.
- **Functions:** redeploy the previous commit (`git checkout <prev> -- apps/beacon && pnpm deploy:functions`), or delete a bad function in Console.
- **Rules:** re-deploy the prior `firestore.rules`/`storage.rules` from git history: `git checkout <prev> -- firestore.rules storage.rules && pnpm deploy:rules`.
