# Firebase Tooling Setup — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feat/firebase-tooling`

## Goal

Stand up the Firebase tooling for the Luminova monorepo: config files, emulators, a
shared client package, App Check, an auth provider, a functions scaffold, and a clean
production project. This session delivers **tooling and scaffolding only** — real
Firestore schema, real `awardPoints` logic, and App Check enforcement are deferred.

## Locked decisions

| Topic | Decision |
|-------|----------|
| App split | Option 1 — separate builds/deploys. No runtime composition. spotlight ships zero Firebase by default; dynamic `import()` only on dynamic routes. |
| Hosting sites | spotlight → `jcioriente`; backstage → `jcioriente-backstage`. Default `jci-oriente` site left untouched. |
| Web app registrations | Two. spotlight uses the existing web app (`appId …8b4acf`); backstage gets a new web app registered via CLI. Same project, same DB. |
| Auth | Email/Password provider only. |
| App Check | reCAPTCHA v3. Code + debug-token support written now; real site keys added later; enforcement stays OFF until keys exist. |
| Production data | Wipe all existing Firestore documents and Storage objects as part of setup (irreversible; executed only after explicit per-command confirmation). |
| Functions | None deployed currently. Scaffold only. |

## Architecture

```
Firebase project: jci-oriente   (one project, one Firestore, one Auth, one Storage)
│
├── Web app "spotlight"   appId …8b4acf   → Hosting site jcioriente
│     └── default bundle: NO Firebase. Dynamic import() of @luminova/firebase
│         only inside dynamic-route loaders (projects, board).
│
├── Web app "backstage"   appId NEW        → Hosting site jcioriente-backstage
│     └── imports @luminova/firebase at boot (auth-gated admin SPA).
│
└── Cloud Functions (beacon)               → awardPoints scaffold, nodejs24
```

Both web apps share Firestore / Auth / Storage. App Check is registered per web app so
enforcement can be toggled independently later.

## Components

### 1. Root Firebase config files
- `firebase.json` — hosting targets (`jcioriente`, `jcioriente-backstage`), emulator
  ports (Auth 4030, Firestore 4010, Functions 4020, Hosting 4000, UI 4100), functions
  block (source `apps/beacon`, runtime `nodejs24`, codebase `beacon`).
- `.firebaserc` — default project `jci-oriente`; hosting target aliases mapping
  `jcioriente`→site and `jcioriente-backstage`→site.
- `firestore.rules` — public read on designated public collections (e.g. projects,
  board); authenticated writes; App Check assertion clauses (inert until enforced).
- `firestore.indexes.json` — starter index (`members`: `active` ASC + `name` ASC).
- `storage.rules` — authenticated read/write under `members/**`.

### 2. `@luminova/firebase` package
Lazy, tree-shakeable client singleton.
- Exports `getFirebase()` initializing app + auth + firestore + storage + App Check on
  first call; memoized.
- Reads `VITE_FIREBASE_*` env for config; App Check uses `ReCaptchaV3Provider` with
  `VITE_APPCHECK_SITE_KEY`; dev debug token via `VITE_APPCHECK_DEBUG_TOKEN`.
- Emulator wiring (`connect*Emulator`) when `VITE_FIREBASE_EMULATOR_ENABLED=true`.
- **backstage**: static import at boot. **spotlight**: never static-imports; dynamic
  `import('@luminova/firebase')` inside dynamic-route loaders only.

### 3. Beacon functions scaffold
- Add `firebase-functions` + `firebase-admin` via `secure-dep-vetting`.
- `onDocumentWritten('/events/{id}')` skeleton for `awardPoints` per
  `apps/beacon/CLAUDE.md`. Helper signatures stubbed, bodies deferred.
- Admin SDK only — never the client SDK.
- Reconcile beacon build: `tsc --noEmit` → real `tsc` emit so functions can deploy.

### 4. Env templates
- `.env.local.example` in spotlight and backstage with their distinct app configs,
  App Check placeholders, and the emulator flag.
- Populate real `.env.local` values from `firebase apps:sdkconfig` where possible;
  App Check site keys pasted in later by the user.

### 5. Emulators + seed
- Emulator suite on the ports above; import/export wired for persistence.
- `tools/scripts/seed-emulator.mjs` to load sample members / events / pointRules for
  local dev.

### 6. Production wipe (executed with explicit confirmation)
- Firestore: `firebase firestore:delete --all-collections` (or equivalent).
- Storage: delete all objects in the project bucket.
- Exact commands and bucket name shown to the user; each destructive command runs only
  after a final explicit "yes".

### 7. Manual console checklist (generated for the user to execute)
- Enable Email/Password provider.
- Create reCAPTCHA v3 site keys for spotlight + backstage; register App Check; paste
  keys into `.env.local`.
- Create the initial admin user.

### 8. Documentation updates
- Refresh `docs/firebase-setup.md` and `docs/architecture.md`: two web apps, App Check,
  lazy-Firebase-in-spotlight, seed script. Keep `jcioriente-backstage` naming.

## Out of scope (deferred)
- Real `awardPoints` logic and real Firestore schema/collections build.
- App Check enforcement toggle (stays OFF).
- CI deploy automation.

## Risks
- **Irreversible wipe.** Mitigated by per-command confirmation; prod collections are not
  yet relied upon by any built feature.
- **Beacon build change.** Switching from `--noEmit` to emit may surface tsconfig
  issues; validate with `pnpm --filter beacon build`.
- **App Check lockout.** Enforcement is deliberately left OFF; turning it on before keys
  are configured would break both apps. Documented in the console checklist.

## Verification
- `firebase emulators:start` boots all five services.
- `pnpm --filter backstage build` and `pnpm --filter spotlight build` succeed; spotlight
  default bundle contains no Firebase (verify via bundle inspection).
- `pnpm --filter beacon build` emits.
- Seed script populates the Firestore emulator.
