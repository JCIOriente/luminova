# 0002. A pnpm + Turborepo monorepo

**Status:** Accepted
**Date:** 2026-06-05
**Source:** `docs/specs/2026-06-05-firebase-tooling-setup-design.md` (the monorepo is
assumed throughout, including the shared-client-package goal); `docs/architecture.md`
"Monorepo Task Orchestration"; root `package.json`, `pnpm-workspace.yaml`.
**Rationale for the monorepo itself is not recorded** — the spec treats it as settled
and documents only how Firebase tooling fits into it.

## Context

Three deployables ([0003](0003-three-deployables.md)) that must agree on the shape of
every Firestore document. If the admin dashboard and the Cloud Functions disagree about
what a `CheckIn` is, the recognition engine writes the wrong points and nothing catches
it until a member complains.

`apps/beacon` runs on the Admin SDK in Node and cannot import browser code. So a shared
types package has to be importable from both sides without dragging a framework along.

## Decision

One repository, pnpm workspaces, Turborepo for task orchestration.

- `apps/` — `spotlight`, `backstage`, `beacon`
- `packages/` — `ui`, `types`, `auth`, `firebase`, `utils`

`@luminova/types` carries a framework-free `/engine` subpath specifically so the
functions can import the same schemas the apps use.

Turborepo's `^build` dependency makes packages build before apps for `build`,
`typecheck` and `ci`. `dev` and `preview` are `cache: false, persistent: true`. Deploys
are deliberately **not** turbo tasks — they run from root `pnpm deploy:*` scripts.

pnpm is mandatory, not preferred: the lockfile and the workspace-wide overrides in
`pnpm-workspace.yaml` depend on it, and a foreign lockfile breaks the frozen-install CI
gate.

## Consequences

**Easy:** a schema change and every consumer of it move in one commit and one review;
CI sees the whole graph, so a breaking type change fails at the PR rather than in
production; one dependency policy for everything.

**Hard:**

- **Built packages have a cold-start trap.** `@luminova/types`, `@luminova/auth` and
  `@luminova/utils` are compiled. In a fresh clone or worktree, app-level vitest cannot
  resolve them until `pnpm turbo run build --filter="./packages/*"` has run. The failure
  looks like a broken import in your own code and is not. This has cost enough time to
  be documented in `CONTRIBUTING.md`.
- **A stale `dist/` is the same trap wearing a different hat.** Change a shared type,
  forget to rebuild, and tests fail against the old shape.
- **Every native-build dependency is a CI gate.** `allowBuilds` in
  `pnpm-workspace.yaml` is hard-enforced — any native-build dep, including a transitive
  one, fails a frozen install until it is allowlisted.

**Ruled out:** independently versioned and published packages. Nothing here is consumed
outside the repo, so nothing is versioned; `workspace:*` everywhere.
