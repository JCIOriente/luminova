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
│  │           beacon / awardPoints                    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Both web apps (spotlight and backstage) are registered as separate Firebase web app entries
within the same project and share one Firestore database and one Storage bucket
(`jci-oriente.firebasestorage.app`). Each app has its own App Check configuration.

## Apps

### spotlight (Public Site)
- React SPA deployed to Firebase Hosting target `jcioriente`
- Ships **no Firebase client in its default bundle** — dynamic routes (e.g. projects, board)
  lazy-load `@luminova/firebase` via dynamic `import()` only when those routes are visited
- Public routes do not require authentication
- Contact form is client-side only (no backend)
- Firebase web app registration: `1:953870918238:web:63d0034740735d618b4acf`

### backstage (Admin Dashboard)
- React SPA with Firebase Auth + Firestore, deployed to Firebase Hosting target `jcioriente-backstage`
- Imports `@luminova/firebase` at boot (always included in the bundle)
- All routes except `/login` require authentication
- CRUD operations on members, events, point rules, allies
- Member profile pictures stored in Firebase Storage
- Firebase web app registration: `1:953870918238:web:acbd53d377846bd88b4acf`

### beacon (Cloud Functions)
- Node.js 24 Firebase Cloud Functions (runtime: `nodejs24`)
- Single function: `awardPoints`
- Triggered by Firestore writes to `/events/{id}`
- Reads `pointRules`, writes `memberPoints`
- Uses Firebase Admin SDK (server-side only)

## Data Flow: Point Calculation

```
Admin creates/edits event in Backstage
  → Writes to Firestore /events/{id}
  → beacon awardPoints function triggers
  → Reads pointRules for event.type
  → Calculates points per member role
  → Writes to /memberPoints/{year}/{month}/{eventId}
  → Dashboard in Backstage reads memberPoints
```

## Shared Packages

### @luminova/firebase
Memoized `getFirebase()` client singleton with App Check + emulator wiring.
Initializes Firebase app, Auth, Firestore, and Storage on first call; subsequent calls return
the cached instance. Optionally initializes App Check (reCAPTCHA v3) when
`VITE_APPCHECK_SITE_KEY` is set. Connects all services to emulators when
`VITE_FIREBASE_EMULATOR_ENABLED=true`. Both frontend apps import from this package;
spotlight does so lazily (dynamic import on dynamic routes only).

### @luminova/ui
Bespoke token-driven component library built on Tailwind CSS utilities.
shadcn/Radix UI components are added for complex widgets via `pnpm dlx shadcn@latest add`.
Both Spotlight and Backstage consume from here.

### @luminova/types
TypeScript interfaces for all Firestore documents.
Shared between frontend apps. Beacon uses its own types (admin SDK).

### @luminova/utils
`cn()` utility (clsx + tailwind-merge). Shared across all apps.

## Monorepo Task Orchestration (Turborepo)

```
build
  └── depends on: ^build (packages build before apps)

dev
  └── cache: false, persistent: true

deploy:hosting
  └── depends on: build

deploy:functions
  └── depends on: build
```

## Local Development

1. Start Firebase emulators: `firebase emulators:start`
2. Start apps: `pnpm dev`
3. Backstage at `http://localhost:5173`
4. Spotlight at `http://localhost:5174`
5. Emulator UI at `http://localhost:4100`
