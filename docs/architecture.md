# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Firebase Project                      │
│                    (jci-oriente)                         │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │  Firestore   │   │  Firebase    │   │  Firebase   │ │
│  │  Database    │   │  Auth        │   │  Storage    │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬──────┘ │
│         │                  │                   │        │
│  ┌──────┴───────────────────────────────────────────┐   │
│  │              Firebase Hosting                     │   │
│  │  ┌────────────────┐    ┌────────────────────┐    │   │
│  │  │   spotlight     │    │     backstage       │    │   │
│  │  │ (jcioriente)   │    │ (jcioriente-       │    │   │
│  │  │                │    │  backstage)         │    │   │
│  │  └────────────────┘    └────────────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Firebase Cloud Functions                │   │
│  │        beacon (triggers + callables)              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Both web apps (spotlight and backstage) are registered as separate Firebase web app entries
within the same project and share one Firestore database and one Storage bucket
(`jci-oriente.firebasestorage.app`). Each app has its own App Check configuration.

## Apps

### spotlight (Public Site)
- React SPA deployed to Firebase Hosting target `jcioriente`
- Ships **no full Firebase client** — public data (`siteConfig`, `showcase`,
  `allyShowcase`) is read through the lightweight `firebase/firestore/lite` subpath via
  `@luminova/firebase/lite` (no Auth, no realtime)
- Public routes do not require authentication
- Contact form is client-side only (no backend)
- Firebase web app registration: `1:953870918238:web:63d0034740735d618b4acf`

### backstage (Admin Dashboard)
- React SPA with Firebase Auth + Firestore, deployed to Firebase Hosting target `jcioriente-backstage`
- Imports `@luminova/firebase` at boot (always included in the bundle)
- All routes except `/login`, `/forgot-password`, and `/reset` require authentication
- CRUD/admin surfaces: members, positions, initiatives (programs/projects), activities
  + QR check-in, point rules, allies, roles/permissions (`/permisos`), site config (`/config`)
- Member profile pictures and initiative/activity photos stored in Firebase Storage
- Firebase web app registration: `1:953870918238:web:acbd53d377846bd88b4acf`

### beacon (Cloud Functions)
- Node.js 24 Firebase Cloud Functions (runtime: `nodejs24`, functions codebase `beacon`)
- Firestore triggers: `awardPoints` (`checkIns/{id}` — the Recognition Engine),
  `onProgramWritten` / `onProjectWritten` (roster → participation reconciliation +
  `showcase` projection), `onActivityWritten` (photo roll-up into the showcase),
  `onMemberWritten` (custom-claims sync: roles + perms), `onRoleWritten` (role-definition
  claims re-sync), `onAllyWritten` (`allyShowcase` public projection)
- Callables: `setUserRoles`, `seedRoles`, `recomputeAllClaims`, `provisionMemberLogin`
- Uses Firebase Admin SDK (server-side only)

## Data Flow: Point Calculation

```
Admin/PM/Scanner registers a check-in in Backstage
  → Writes to Firestore /checkIns/{id}
  → beacon awardPoints function triggers
  → Reads the activity + pointRules/{termId__code}
  → Derives the participations/{activityId__memberId__role} ledger row
  → Recomputes /memberPoints/{memberId__termId} (transactional)
  → Mirrors members.totalPoints
  → Backstage leaderboard + member profiles read memberPoints
```

## Shared Packages

### @luminova/firebase
Memoized `getFirebase()` client singleton with App Check + emulator wiring.
Initializes Firebase app, Auth, Firestore, and Storage on first call; subsequent calls return
the cached instance. Optionally initializes App Check (reCAPTCHA v3) when
`VITE_APPCHECK_SITE_KEY` is set. Connects all services to emulators when
`VITE_FIREBASE_EMULATOR_ENABLED=true`. Both frontend apps import from this package;
spotlight uses the `@luminova/firebase/lite` subpath (`firebase/firestore/lite`, no Auth)
to keep the public bundle small.

### @luminova/ui
Bespoke token-driven component library built on Tailwind CSS utilities.
shadcn/Radix UI components are added for complex widgets via `pnpm dlx shadcn@latest add`.
Both Spotlight and Backstage consume from here.

### @luminova/types
TypeScript interfaces + Zod schemas for all Firestore documents (built package, emits
`dist/`). Shared by the frontend apps **and** beacon: pure engine types + helpers live
under the `@luminova/types/engine` subpath (framework-free, admin-SDK safe).

### @luminova/utils
`cn()` utility (clsx + tailwind-merge). Shared across all apps.

## Monorepo Task Orchestration (Turborepo)

```
build / typecheck / ci
  └── depends on: ^build (packages build before apps)

dev / preview
  └── cache: false, persistent: true

lint / test
  └── no dependencies
```

Deploys are **not** turbo tasks: manual deploys run via the root `pnpm deploy:*` scripts
(`deploy:rules`, `deploy:indexes`, `deploy:functions`, `deploy:hosting`, `deploy:all`),
and the normal path to production is the keyless, approval-gated CD pipeline — see
`docs/ci-cd.md`.

## Local Development

1. Start everything: `pnpm dev` — boots the Firebase emulators, waits for them, seeds
   the emulator (`pnpm seed:emulator`), then starts all apps
2. Spotlight at `http://localhost:5173`
3. Backstage at `http://localhost:5174`
4. Emulator UI at `http://localhost:4100`
