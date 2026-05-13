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

## Apps

### spotlight (Public Site)
- Static React app, no Firebase client
- Three routes: `/`, `/about`, `/contact`
- No authentication required
- Contact form is client-side only (no backend)
- Deployed to Firebase Hosting target `jcioriente`

### backstage (Admin Dashboard)
- React SPA with Firebase Auth + Firestore
- All routes except `/login` require authentication
- CRUD operations on members, events, point rules, allies
- Member profile pictures stored in Firebase Storage
- Deployed to Firebase Hosting target `jcioriente-backstage`

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
Single Firebase app initialization. Both frontend apps import from here.
Handles emulator connection when `VITE_FIREBASE_EMULATOR_ENABLED=true`.

### @luminova/ui
shadcn/ui component library. Components are copied into the package (not installed as dependency).
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
