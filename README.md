# Luminova — JCI Oriente Platform

Monorepo for the Junior Chamber International (Eastern Bolivia) platform.

| App | Purpose | Hosting site |
|-----|---------|--------------|
| `apps/spotlight` | Public marketing site (no auth) | `jcioriente` → https://jcioriente.web.app |
| `apps/backstage` | Admin dashboard (auth required) | `jcioriente-backstage` → https://jcioriente-backstage.web.app |
| `apps/beacon` | Firebase Cloud Functions (`awardPoints`) | — |

Shared packages: `@luminova/ui`, `@luminova/firebase`, `@luminova/types`, `@luminova/utils`.

## Prerequisites

- **Node 24** (pinned in `.nvmrc`) — `nvm use`
- **pnpm** (pinned via `packageManager` in `package.json`) — `corepack enable`
- **Firebase CLI** — `npm i -g firebase-tools` then `firebase login`
- **Java (JRE)** — required by the Firestore emulator.
  macOS (Apple Silicon): `brew install openjdk` and add it to PATH:
  ```bash
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  ```

## Install

```bash
pnpm install
```

## Environment

Each frontend app reads its own Firebase config from `apps/<app>/.env.local`. Copy the
template and fill values (the Firebase web API keys are already filled — they are public
client identifiers):

```bash
cp apps/spotlight/.env.local.example apps/spotlight/.env.local
cp apps/backstage/.env.local.example apps/backstage/.env.local
```

Set `VITE_FIREBASE_EMULATOR_ENABLED=true` for local development against emulators.
App Check (reCAPTCHA v3) stays disabled until you set `VITE_APPCHECK_SITE_KEY`; for local
dev use `VITE_APPCHECK_DEBUG_TOKEN`. See `docs/firebase-setup.md` for the console checklist.

## Run the emulators

Start the full Firebase emulator suite:

```bash
firebase emulators:start
```

| Service | Port | |
|---------|------|--|
| Hosting | 4000 | http://localhost:4000 |
| Firestore | 4010 | |
| Functions | 4020 | |
| Auth | 4030 | |
| Storage | 9199 | |
| Emulator UI | 4100 | http://localhost:4100 |

Seed the **running** Firestore emulator with sample data (members, events, point rules):

```bash
pnpm seed:emulator
```

The seed script refuses to run unless `FIRESTORE_EMULATOR_HOST` is set, so it can never
touch production.

## Run the apps

```bash
pnpm dev                          # all apps
pnpm --filter spotlight dev       # public site
pnpm --filter backstage dev       # admin dashboard
```

Spotlight: http://localhost:5174 · Backstage: http://localhost:5173

## Build, lint, test

```bash
pnpm build        # build all (Turborepo)
pnpm lint
pnpm typecheck
pnpm test
pnpm pr-tests     # full gate: format + ci + knip + audit (run before every PR)
```

The Firestore rules suite (`@luminova/firestore-rules-tests`) starts its own emulator via
`firebase emulators:exec`, so it needs Java on PATH.

## Deploy

Deploys go to the Firebase project `jci-oriente`.

```bash
# Build first
pnpm build

# Hosting — both sites
firebase deploy --only hosting

# Hosting — a single site
firebase deploy --only hosting:jcioriente            # spotlight
firebase deploy --only hosting:jcioriente-backstage  # backstage

# Cloud Functions (beacon)
pnpm --filter beacon build
firebase deploy --only functions

# Firestore rules / indexes, Storage rules
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

## Documentation

- `docs/firebase-setup.md` — emulator, App Check, web apps, console checklist
- `docs/architecture.md` — system overview and data flow
- `docs/data-models.md` — Firestore schemas and rules summary
- `tools/scripts/wipe-prod.md` — production wipe runbook (destructive)
