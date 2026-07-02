# Luminova — JCI Oriente Platform

> **Inspire** — _A fire shared never dies._

Monorepo for the Junior Chamber International (Eastern Bolivia) platform: two web apps
and a serverless backend, deployed to Firebase.

| App | Purpose | Live |
|-----|---------|------|
| `apps/spotlight` | Public marketing site (no auth) | https://jcioriente.web.app |
| `apps/backstage` | Admin dashboard (auth required) | https://jcioriente-backstage.web.app |
| `apps/beacon` | Firebase Cloud Functions (recognition engine) | — |

Shared packages: `@luminova/ui`, `@luminova/firebase`, `@luminova/types`, `@luminova/utils`.

**Stack:** React 19 · TypeScript · TanStack Router + Query · Tailwind CSS v4 · Firebase
(Auth, Firestore, Storage, Functions, Hosting) · Turborepo + pnpm.

## Prerequisites

- **Node 24** — `nvm use` (pinned in `.nvmrc`)
- **pnpm** — `corepack enable` (pinned via `packageManager` in `package.json`)
- **Firebase CLI** — `npm i -g firebase-tools` then `firebase login`
- **Java (JRE)** — required by the Firestore emulator. macOS (Apple Silicon):
  `brew install openjdk` and add it to PATH:
  ```bash
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  ```

## Setup

```bash
pnpm install
cp apps/spotlight/.env.local.example apps/spotlight/.env.local
cp apps/backstage/.env.local.example apps/backstage/.env.local
```

Each app reads its Firebase config from `apps/<app>/.env.local`. The web API keys are
already filled (they are public client identifiers). Set
`VITE_FIREBASE_EMULATOR_ENABLED=true` for local development against the emulators. See
[`docs/firebase-setup.md`](docs/firebase-setup.md) for the console checklist and App Check.

## Run locally

```bash
pnpm dev
```

One command brings up the whole local stack: the Firebase emulator suite (functions are
rebuilt first so triggers are never stale), a one-time seed of Firestore + Auth, and both
app dev servers wired to the emulators.

| Surface | URL | Credentials |
|---------|-----|-------------|
| Spotlight (public) | http://localhost:5173 | — |
| Backstage (admin) | http://localhost:5174 | `admin@jci.test` / `Secret1` |
| Emulator UI | http://localhost:4100 | — |

Emulator state persists to `emulator-data/` (`--import` / `--export-on-exit`), so the
seeded Admin and your data survive restarts — `Ctrl-C` exports, the next `pnpm dev`
re-imports. Ports: Firestore 4010 · Functions 4020 · Auth 4030 · Storage 9199 · Hosting 4000.

To verify a production-like build against the emulators (no HMR, static bundles at
:4173 / :4174):

```bash
pnpm preview:local
```

## Quality gate

```bash
pnpm build       # build all (Turborepo)
pnpm lint
pnpm typecheck
pnpm test
pnpm pr-tests    # full gate: format + ci + knip + audit + seed — run before every PR
```

The Firestore rules suite starts its own emulator, so it needs Java on PATH.

## Deploy

Deployment is **continuous and keyless** — no credentials are stored anywhere. Merging to
`main` runs CI, then the [Deploy workflow](.github/workflows/deploy.yml) authenticates via
Workload Identity Federation and, after a one-click approval, deploys only the surface that
changed (rules → functions → hosting). The full pipeline, trust model, and validation and
rollback runbooks live in **[`docs/ci-cd.md`](docs/ci-cd.md)**.

Manual deploys to the `jci-oriente` project (owner fallback) use the `pnpm deploy:*`
scripts:

```bash
pnpm deploy:rules       # firestore + storage rules
pnpm deploy:indexes     # firestore indexes
pnpm deploy:functions   # beacon (builds first)
pnpm deploy:hosting     # builds both apps (emulator wiring off) + deploys hosting
pnpm deploy:all         # rules → functions → hosting
```

## Documentation

| Doc | What |
|-----|------|
| [`CLAUDE.md`](CLAUDE.md) | Contributor + AI-agent workflow: conventions, skills, worktree/PR discipline |
| [`docs/architecture.md`](docs/architecture.md) | System overview and data flow |
| [`docs/data-models.md`](docs/data-models.md) | Firestore schemas, constraints, rules summary |
| [`docs/features.md`](docs/features.md) | Feature specs and UX flows |
| [`docs/firebase-setup.md`](docs/firebase-setup.md) | Emulator, App Check, console checklist |
| [`docs/ci-cd.md`](docs/ci-cd.md) | CI + keyless CD pipeline, infra inventory, deploy/rollback runbooks |
| [`docs/performance.md`](docs/performance.md) | Bundle budgets, Core-Web-Vitals targets, optimization playbook |
| [`docs/roadmap.md`](docs/roadmap.md) | Product roadmap and delivery status |

Design specs, implementation plans, and status handoffs live under `docs/specs/`,
`docs/plans/`, and `docs/status/`.
