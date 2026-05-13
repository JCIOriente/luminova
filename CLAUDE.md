# Luminova — Claude Code Guide

## Project

**JCI Oriente** platform — Junior Chamber International, Eastern Bolivia chapter.

Two public-facing and admin apps + one serverless backend, deployed to Firebase.

## Apps

| App | Purpose | URL target |
|-----|---------|-----------|
| `apps/spotlight` | Public marketing site (no auth) | Firebase Hosting: `jcioriente` |
| `apps/backstage` | Admin dashboard (auth required) | Firebase Hosting: `jcioriente-backstage` |
| `apps/beacon` | Firebase Cloud Functions backend | — |

## Packages

| Package | Name | Purpose |
|---------|------|---------|
| `packages/ui` | `@luminova/ui` | shadcn/ui components shared across apps |
| `packages/firebase` | `@luminova/firebase` | Firebase client singleton (auth, firestore, storage) |
| `packages/types` | `@luminova/types` | Shared TypeScript types and data models |
| `packages/utils` | `@luminova/utils` | Shared utilities (cn, etc.) |

## Stack

- **React 19** + **TypeScript 5.7** (strict mode)
- **TanStack Router** (file-based routing)
- **TanStack Query v5** (server state)
- **React Hook Form** + **Zod** (forms + validation)
- **shadcn/ui** + **Radix UI** + **Tailwind CSS v4**
- **Lucide React** (icons)
- **Firebase** (Auth, Firestore, Storage, Functions, Hosting)
- **Turborepo** + **pnpm** workspaces

## Commands

```bash
# Install all dependencies
pnpm install

# Start all apps in dev mode
pnpm dev

# Start specific app
pnpm --filter backstage dev
pnpm --filter spotlight dev

# Build all
pnpm build

# Build specific app
pnpm --filter backstage build

# Lint all
pnpm lint

# Type check all
pnpm typecheck

# Start Firebase emulators (run before dev for local Firebase)
firebase emulators:start

# Deploy hosting
firebase deploy --only hosting

# Deploy functions
firebase deploy --only functions
```

## Firebase Emulators

| Service | Port |
|---------|------|
| Auth | 4030 |
| Firestore | 4010 |
| Functions | 4020 |
| Hosting | 4000 |
| Emulator UI | 4100 |

Set `VITE_FIREBASE_EMULATOR_ENABLED=true` in `.env.local` to connect to emulators.

## Environment Variables

Each frontend app needs a `.env.local`:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_EMULATOR_ENABLED=false
```

## Conventions

- **TypeScript strict** — no `any`, no `as` casts without justification
- **No barrel files in features** — import directly from the file, not an `index.ts` re-export
- **shadcn/ui** — add components via `pnpm dlx shadcn@latest add <component>` run from `packages/ui`
- **No comments** unless the WHY is non-obvious
- **pnpm only** — never use npm or yarn in this repo

## Skills to Use

| Task | Skill |
|------|-------|
| Scaffolding, architecture decisions | `superpowers` |
| React patterns, hooks, query | `react-best-practices` |
| Page layout, spacing, responsive | `frontend-design` |
| UX flows, interactions, polish | `ui-ux-pro-max` |

## Reference Docs

- `docs/architecture.md` — system overview and data flow
- `docs/data-models.md` — all Firestore schemas with constraints
- `docs/features.md` — feature specs and UX flows
- `docs/firebase-setup.md` — emulator and deploy instructions
