# Contributing to Luminova

Thanks for taking the time. This is the developer guide: how to get the stack
running, what the quality gate is, and how a change gets merged.

If you are here to adapt Luminova for your own chapter rather than to contribute
upstream, start with the "Adopting it for your chapter" section of the
[README](README.md).

## Prerequisites

| Tool | Version | How |
|------|---------|-----|
| Node | 24 | `nvm use` — pinned in `.nvmrc` |
| pnpm | pinned in `package.json` | `corepack enable` |
| Firebase CLI | latest | `npm i -g firebase-tools` then `firebase login` |
| Java (JRE) | 21+ | Required by the Firestore emulator |

pnpm only. Never `npm install` or `yarn` in this repo — the lockfile and the
workspace overrides in `pnpm-workspace.yaml` depend on it.

On macOS (Apple Silicon), Homebrew's OpenJDK is keg-only and not on `PATH` by
default:

```bash
brew install openjdk
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
```

`tools/scripts/emulators.sh` adds that path best-effort, so this is usually
handled for you. It is listed here for the case where it is not.

## Setup

```bash
pnpm install
cp apps/spotlight/.env.local.example apps/spotlight/.env.local
cp apps/backstage/.env.local.example apps/backstage/.env.local
```

Each app reads its Firebase config from `apps/<app>/.env.local`. The example files
ship with working values already filled in — the web API keys are public client
identifiers, not secrets (see [SECURITY.md](SECURITY.md)). They default to
`VITE_FIREBASE_EMULATOR_ENABLED=true`, so nothing you do locally touches
production.

## Run the stack

```bash
pnpm dev
```

One command brings up everything: the Firebase emulator suite (beacon is rebuilt
first so function triggers are never stale), a one-time seed of Firestore and
Auth, and both app dev servers wired to the emulators.

| Surface | URL | Credentials |
|---------|-----|-------------|
| Spotlight (public site) | http://localhost:5173 | — |
| Backstage (admin) | http://localhost:5174 | `admin@jci.cc` / `Secret1` |
| Emulator UI | http://localhost:4100 | — |

Ports: Firestore 4010 · Functions 4020 · Auth 4030 · Hosting 4000 · Storage 9199.

**First run:** the seed deliberately does not create the points matrix. Open
**Reglas de puntos** (`/point-rules`) in backstage and click **Inicializar** to
seed the current term. Until you do, check-ins record attendance but award zero
points.

Emulator state persists to `emulator-data/` via `--import` / `--export-on-exit`,
so the seeded admin and anything you create survive restarts. `Ctrl-C` exports;
the next `pnpm dev` re-imports.

To check a production-like build against the emulators — no HMR, real static
bundles, served at :4173 and :4174:

```bash
pnpm preview:local
```

## Quality gate

```bash
pnpm build        # build everything (Turborepo)
pnpm lint
pnpm typecheck
pnpm test
pnpm pr-tests     # the full gate — run this before opening a PR
```

`pnpm pr-tests` runs format, the per-package CI task, `knip` (unused exports and
dependencies), `pnpm audit`, the seed-script tests and the harness tests.

The Firestore and Storage rules suites under `tests/` start their own emulator, so
they need Java on `PATH`. They serialize machine-wide on the shared emulator port,
so do not run them alongside `pnpm dev`.

## Repository layout

| Path | What |
|------|------|
| `apps/spotlight` | Public site. No auth, no full Firebase SDK — reads public collections through `firebase/firestore/lite`. |
| `apps/backstage` | Admin dashboard. Auth required on every route except login and password reset. |
| `apps/beacon` | Cloud Functions. Firestore triggers and callables, Admin SDK only. |
| `packages/ui` | `@luminova/ui` — token-driven components shared by both apps. |
| `packages/types` | `@luminova/types` — TypeScript types and Zod schemas for every Firestore document. Built package; the `/engine` subpath is framework-free and safe for the Admin SDK. |
| `packages/auth` | `@luminova/auth` — CASL abilities, roles and permission codes. |
| `packages/firebase` | `@luminova/firebase` — memoized client singleton with App Check and emulator wiring. |
| `packages/utils` | `@luminova/utils` — Intl-only helpers (the Bolivia-pinned datetime module). |
| `tools/scripts` | Seeds, emulator wrappers, bundle-budget check. |
| `tests/` | Firestore and Storage security-rules suites. |

Working on a package that an app imports? `packages/*` are built packages —
`turbo` handles `^build` ordering, but a fresh worktree needs
`pnpm turbo run build --filter="./packages/*"` before app-level `vitest` will
resolve them.

## Conventions

- **TypeScript strict.** No `any`. No `as` casts without a comment justifying them.
- **No barrel files inside features.** Import from the file, not an `index.ts`
  re-export.
- **No comments** unless the *why* is non-obvious.
- **English identifiers, Spanish values.** Types, fields and functions are English
  with no diacritics. Only user-facing strings and enum *values* are Spanish —
  e.g. `membershipStatus` (English key) holds `"Activo" | "Inactivo" | "Desafiliado"`.
  Never mix languages inside one identifier. The product language is Spanish; the
  codebase language is English.
- **Reuse before adding.** Check `packages/ui` and
  [`docs/reuse-first-ui.md`](docs/reuse-first-ui.md) before writing a new
  component. Colors come from tokens; raw hex is blocked by eslint.
- **Dependencies.** Never type a version from memory. Latest secure version,
  compatible with Node 24, no known advisories. Security-critical deps (firebase,
  auth, crypto, zod) are pinned exact; everything else uses a caret range.
  Workspace-wide overrides live in `pnpm-workspace.yaml`.

## Making a change

1. **Branch off `main`.** Prefixes: `feat/`, `fix/`, `chore/`, `migration/`.
   Committing directly to `main` is blocked by a local hook.
2. **Conventional Commits with a module scope** — `feat(backstage): …`,
   `fix(beacon): …`, `chore: …`.
3. **Write the test first** where there is something to assert. There are ~250 test
   files; new behavior is expected to come with coverage.
4. **Run `pnpm pr-tests`.**
5. **Open the PR with `gh pr create`.** Body:

   ```
   ## Summary
   - <what changed>
   - <why>

   ## Test plan
   - [ ] pnpm pr-tests passes
   ```

6. **Anything touching `firestore.rules`, `storage.rules`, auth or `apps/beacon`
   needs a rules test.** A write invariant enforced only in client code is not
   enforced — a direct SDK write bypasses it. Mirror it in the rules and prove it
   in `tests/firestore-rules/`.

CI runs on every PR: lint, typecheck, build, bundle-size budgets, unit tests, knip
and the seed tests. Changes under `apps/beacon`, `tests/`, `tools/scripts` or the
rules files additionally trigger the emulator suites. Docs-only PRs skip the heavy
jobs by design.

Maintainers working inside this repo follow some extra process — isolated git
worktrees per change and a review router that computes which reviews a diff owes.
That lives in [`CLAUDE.md`](CLAUDE.md) and is not required of outside contributors.

## Where the deeper docs are

| Doc | What |
|-----|------|
| [`docs/architecture.md`](docs/architecture.md) | System overview, data flow, package responsibilities |
| [`docs/data-models.md`](docs/data-models.md) | Every Firestore collection with its constraints |
| [`docs/features.md`](docs/features.md) | Feature specs and UX flows, screen by screen |
| [`docs/firebase-setup.md`](docs/firebase-setup.md) | Console checklist, App Check, emulators |
| [`docs/ci-cd.md`](docs/ci-cd.md) | CI and the keyless deploy pipeline, with rollback runbooks |
| [`docs/performance.md`](docs/performance.md) | Bundle budgets and Core Web Vitals targets |
| [`docs/engineering-guardrails.md`](docs/engineering-guardrails.md) | Recurring mistake classes and the guard that catches each |
| [`docs/roadmap.md`](docs/roadmap.md) | What is planned and why |
| [`packages/ui/DESIGN.md`](packages/ui/DESIGN.md) | Design-system tokens and component catalog |

## Questions

Open a [Discussion](https://github.com/JCIOriente/luminova/discussions) for
questions and adoption help, an [Issue](https://github.com/JCIOriente/luminova/issues)
for bugs and proposals. Security reports go through the process in
[SECURITY.md](SECURITY.md), never a public issue.

By contributing, you agree that your contributions are licensed under the
Apache License 2.0.
