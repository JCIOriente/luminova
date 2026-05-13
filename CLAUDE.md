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

## Runtime

- **Node 24** (LTS) — pinned via `.nvmrc` and `engines.node` in root `package.json`
- **pnpm** — pinned via `packageManager` field in root `package.json`

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
- **Latest secure versions** — never type a version from memory. Use the `secure-dep-vetting` skill before adding or upgrading any dependency. Pin security-critical deps (firebase, auth, crypto, zod) exact; caret-range everything else.

## Skill Workflow

Skills are stage-specific. Don't invoke them all at once — map each to its phase.

### Skill catalog

**Suite skills** (multiple sub-skills under one namespace):

| Skill | Publisher | Auto-trigger? |
|-------|-----------|---------------|
| `superpowers:*` (14 sub-skills) | community | Mostly manual; `using-superpowers` triggers on conversation start |

**Single-purpose skills:**

| Skill | Publisher | What it does | Auto-trigger? |
|-------|-----------|--------------|---------------|
| `secure-dep-vetting` | local (this repo) | Vets npm packages: latest secure version, Node 24 compat, CVE block | Auto on dep changes |
| `react-best-practices` | Vercel | 70 React perf checks: barrel imports, re-renders, async waterfalls | Auto on `.tsx` edits |
| `frontend-design:frontend-design` | Anthropic | Distinctive aesthetic direction: bold type, palettes, layouts, animations | Manual |
| `ui-ux-pro-max:ui-ux-pro-max` | community | Design database: 161 palettes, 57 font pairings, accessibility (a11y) validation | Manual |
| `simplify` | Anthropic (bundled) | Post-write cleanup: redundant vars, unused imports, dead defensive code | Manual |
| `security-review` | Anthropic (bundled) | Vulnerability scan on diff: auth flaws, injection, secret leaks | Manual |

### Superpowers sub-skills — which one when

| Sub-skill | When to invoke |
|-----------|----------------|
| `superpowers:brainstorming` | **Before** any creative work — new feature, new component, behavior change. Explore intent before designing. |
| `superpowers:writing-plans` | After brainstorming — have a spec, need to break into multi-step plan before code |
| `superpowers:executing-plans` | Have a written plan, executing in a separate session with review checkpoints |
| `superpowers:subagent-driven-development` | Executing a plan with independent tasks in the **same** session |
| `superpowers:test-driven-development` | Implementing any feature or bugfix — write test first |
| `superpowers:dispatching-parallel-agents` | 2+ independent tasks with no shared state — run them in parallel |
| `superpowers:using-git-worktrees` | Starting feature work that needs isolation from current workspace |
| `superpowers:systematic-debugging` | Hit a bug, test failure, or unexpected behavior — before proposing fixes |
| `superpowers:verification-before-completion` | About to claim work is done — must run verification commands and confirm output |
| `superpowers:requesting-code-review` | Completing a task, before merge — verify work meets requirements |
| `superpowers:receiving-code-review` | Got code review feedback — apply with rigor, not blind agreement |
| `superpowers:finishing-a-development-branch` | All tests pass, deciding how to integrate (merge vs PR vs cleanup) |
| `superpowers:writing-skills` | Creating or editing skills |
| `superpowers:using-superpowers` | Auto: establishes how to find/use skills |

### Full workflow (in order, per feature)

```
1. EXPLORE INTENT (before any creative work)
   → superpowers:brainstorming
   Ask the user about goals, constraints, edge cases. Never assume.

2. PLAN
   → superpowers:writing-plans
   Multi-step plan saved to a plan file.

3. DESIGN (UI work only — skip for pure-logic features)
   → frontend-design first   → aesthetic vision, layout, palette direction
   → ui-ux-pro-max  second   → validate palette, typography, a11y, contrast

4. ISOLATE WORKSPACE (optional — for risky/long features)
   → superpowers:using-git-worktrees

5. ADD DEPENDENCIES
   → secure-dep-vetting (auto on package.json edit)
   Never type a version from memory.

6. IMPLEMENT
   → superpowers:test-driven-development     (write test first)
   → superpowers:executing-plans             (if separate session)
   → superpowers:subagent-driven-development (if same session, parallel tasks)
   → superpowers:dispatching-parallel-agents (if 2+ independent jobs)
   → react-best-practices (auto on .tsx edits)

7. DEBUG (only when something breaks)
   → superpowers:systematic-debugging

8. CLEANUP (before claiming done)
   → /simplify on the diff

9. VERIFY (before claiming done)
   → superpowers:verification-before-completion
   Run commands. Confirm output. Evidence before assertions.

10. SECURITY (REQUIRED for auth, Firestore rules, Cloud Functions)
    → /security-review on the diff

11. REVIEW
    → superpowers:requesting-code-review
    → superpowers:receiving-code-review (when feedback arrives)

12. FINISH
    → superpowers:finishing-a-development-branch
    → /security-review one more time on full branch (before PR)
```

### Per-app skill emphasis

| App | Heaviest use |
|-----|--------------|
| `apps/spotlight` (public site) | `frontend-design`, `ui-ux-pro-max` (heavy aesthetic work, brand identity) |
| `apps/backstage` (admin) | `react-best-practices`, `security-review` (auth, Firestore writes), `ui-ux-pro-max` (a11y validation for admin tables/forms) |
| `apps/beacon` (functions) | `security-review`, `secure-dep-vetting` (server-side trust boundary) |
| `packages/ui` | `react-best-practices`, `ui-ux-pro-max` (component-level a11y) |

### Rules

- **Never skip `secure-dep-vetting`** — it auto-triggers, do not override.
- **Never skip `/security-review`** when touching auth, Firestore rules, or Cloud Functions code.
- **`frontend-design` before `ui-ux-pro-max`** — vision first, validation second. Reversing creates "designed by committee" results.
- **`/simplify` is for post-feature cleanup**, not for code under active iteration. Run it when the feature is functionally done.

## Reference Docs

- `docs/architecture.md` — system overview and data flow
- `docs/data-models.md` — all Firestore schemas with constraints
- `docs/features.md` — feature specs and UX flows
- `docs/firebase-setup.md` — emulator and deploy instructions
