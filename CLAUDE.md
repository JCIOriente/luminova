# Luminova — Claude Code Guide

**JCI Oriente** platform (Junior Chamber International, Eastern Bolivia chapter): two frontends and one serverless backend on Firebase. Each app and package below has its own `CLAUDE.md` that loads when you work there.

| Path | Purpose |
| --- | --- |
| `apps/spotlight` | Public marketing site, no auth. Hosting target `jcioriente` |
| `apps/backstage` | Admin dashboard, auth required. Hosting target `jcioriente-backstage` |
| `apps/beacon` | Firebase Cloud Functions backend |
| `packages/ui` (`@luminova/ui`) | Bespoke token-driven components (Tailwind utilities); shadcn/Radix only for complex widgets |
| `packages/firebase` (`@luminova/firebase`) | Firebase client singleton (auth, firestore, storage) |
| `packages/types` (`@luminova/types`) | Shared TypeScript types and zod schemas |
| `packages/auth` (`@luminova/auth`) | CASL roles, permissions, ability builder |
| `packages/utils` (`@luminova/utils`) | Intl-only helpers, no runtime deps (es-BO datetime with the Bolivia UTC pin) |

Stack: React 19, TypeScript 6 strict, TanStack Router (file-based) + Query v5, React Hook Form + Zod, Tailwind v4, Lucide, Firebase, Turborepo + pnpm workspaces. Node 24 and pnpm are pinned (`.nvmrc`, `engines.node`, `packageManager`).

## Commands

```bash
pnpm install
pnpm dev                                    # emulators + seed + all apps
pnpm --filter backstage dev                 # one app (also: build, lint, typecheck)
pnpm build | pnpm lint | pnpm typecheck
pnpm turbo run build --filter="./packages/*"  # fresh worktree: build packages before app vitest/typecheck
pnpm pr-tests                               # the full local gate
firebase emulators:start
```

Emulator ports: Auth 4030, Firestore 4010, Functions 4020, Hosting 4000, Storage 9199, UI 4100. Each frontend needs `.env.local` with `VITE_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID,VAPID_KEY}` and `VITE_FIREBASE_EMULATOR_ENABLED` (`true` connects to the emulators). The flag is read at runtime, so a normal `pnpm build` served by the Hosting emulator (:4000) logs in against **prod** Auth; for local auth use `pnpm dev` or `pnpm build:local` / `preview:local`.

## Conventions

- **TypeScript strict**: no `any`, no `as` casts without justification.
- **No barrel files in features**: import directly from the file, not an `index.ts` re-export.
- **shadcn/ui**: add components with `pnpm dlx shadcn@latest add <component>`, run from `packages/ui`.
- **No comments** unless the WHY is non-obvious.
- **English identifiers, Spanish values.** Types, fields, functions and enum _names_ are English without diacritics (`PascalCase` types, `camelCase` fields). Only user-facing enum values and labels may be Spanish (`membershipStatus` holds `"Activo" | "Inactivo" | "Desafiliado"`). Expand acronyms (`isExecutiveCommittee`, not `isCEL`); translate domain terms (`gestión` → `term`). Never mix languages in one identifier.
- **pnpm only**: never npm or yarn.
- **Latest secure versions**: never type a version from memory; run `secure-dep-vetting` before adding, upgrading or removing any dependency. Pin security-critical deps (firebase, auth, crypto, zod) exact; caret-range everything else.

## Skill Workflow

The `feature-flow` skill drives this sequence end to end. Per feature, in order:

1. **Explore intent** before any creative work: `superpowers:brainstorming`. Ask, never assume.
2. **Plan**: `superpowers:writing-plans`, saved to a plan file.
3. **Design** (UI only): `frontend-design` first, then `ui-ux-pro-max` to validate palette, type, a11y and contrast. Never the reverse.
4. **Isolate**: a worktree, before the first edit (see Worktree-first).
5. **Dependencies**: `secure-dep-vetting`.
6. **Implement**: TDD (`superpowers:test-driven-development`); `react-best-practices` on `.tsx`.
7. **Debug** when something breaks: `superpowers:systematic-debugging`.
8. **Cleanup**: `/simplify` on the diff, only once the feature is functionally done.
9. **Verify**: `superpowers:verification-before-completion`. Run commands, show the output.
10. **Security**: `/security-review`, required for auth, Firestore rules and Cloud Functions.
11. **Review**: the set the review router prints (see Review routing).
12. **Finish**: `superpowers:finishing-a-development-branch`; `/security-review` once more on the full branch before the PR.

Rules:

- **Never decide the review set by judgment**: run the router and run what it lists.
- **Never skip `secure-dep-vetting`** or **`/security-review`** where they apply.
- When several tools apply: process skills (brainstorming, debugging) → domain skills → review subagents (`*-reviewer`, `*-watcher`) → cross-stack review (`/security-review`, `/code-review`).
- `/code-review` is user-invoked only. When the router lists it, run an adversarial Opus review subagent instead and say so in the PR.
- Heaviest skills per area: spotlight → `frontend-design`, `ui-ux-pro-max`; backstage → `react-best-practices`, `security-review`, `ui-ux-pro-max` (a11y of tables/forms); beacon → `security-review`, `secure-dep-vetting`; `packages/ui` → `react-best-practices`, `ui-ux-pro-max`.
- **Subagent models**: choose `model` on every dispatch. Opus for React, rules, security and complex logic; Sonnet for mechanical work; Fable to review docs-heavy PRs.

## Tooling Index

Subagents (`.claude/agents/`, read-only, report only): `firebase-functions-reviewer` for any `apps/beacon` change; `firestore-security-reviewer` for `firestore.rules`, repositories or auth-guarded routes; `bundle-budget-watcher` after frontend changes that add deps or routes.

Hooks (`.claude/hooks/`, wired in `.claude/settings.json`), all judging the tree the Bash call runs in (its cwd), not `CLAUDE_PROJECT_DIR`:

- `branch-guard.sh` (before a commit): hard-blocks commits on `main`/`master`, `--no-verify` included; warns on branch names outside `feat/ fix/ chore/ migration/`.
- `pre-commit.sh` (before a commit): auto-formats and re-stages, then lint + typecheck; blocks only if still failing. Honors `--no-verify` with a warning.
- `review-gate.sh` (before PR creation): **hard gate**. Blocks the PR unless a fresh review trailer covers every rule the rubric marks `gate: "hard"`.
- `review-router.sh` (after PR creation): prints the mandated review set (ENFORCED vs REQUIRED) and the stamp command. Advisory.
- `stop.sh`: prints `git status`; nudges a checkpoint commit past 10 files.

Hook traps:

- Until roadmap R1 merges, the hooks match raw command text. Keep the literal words for committing and for opening a PR out of every command's text, heredocs included, except in the command that performs them. Pass PR bodies with `--body-file`.
- Hooks read the Bash tool's persistent cwd, not an inline `cd`. Before committing in a worktree, run a standalone `cd .worktrees/<slug>` call first.
- Hooks run from the primary checkout's working tree: a merged hook or rubric change is inactive until the primary checkout is pulled, and a PR that adds a gate is not gated by it.
- Subagents cannot commit in a worktree (their cwd resets to the primary checkout, so the guard blocks them, and `git -C` skips every hook). Brief them to edit and stop; the orchestrator commits, stamps and opens the PR.

MCP servers: none. GitHub goes through `gh`; Firebase through the emulators.

### Review routing (BINDING — no judgment call)

Which reviews a diff needs is computed from `.claude/review-routing.json` by `.claude/hooks/review-route.mjs`. Same diff, same review set. Before opening any PR:

1. **Route the diff** yourself: `.claude/hooks/route.sh`. Routing after the PR is open is late.
2. **Run every review it lists**, ENFORCED and REQUIRED alike. The rubric already accounts for size through its line thresholds.
3. **Stamp the evidence** on a commit in range: one `Reviews:` trailer with exactly the token set the router printed (it prints the command). Keep the trailer in the commit message's **last** paragraph. Stamp in its own Bash call before PR creation. A stamp holds only while nothing in that review's scope changes after its sha; re-review and re-stamp after later commits touching those paths.
4. **Mirror it in the PR body** under `## Reviews`.
5. **Lighter review** (verdict `lighter` or `minor`): the skills may be skipped, never silently. Follow the exception terms the router prints, verbatim.

Only the `hard` class is shell-enforced. A mandated review that was neither run nor excepted is a process failure. Never hand-write a review assessment in place of running the mandated skill. Changing the rubric changes the contract: edit `.claude/review-routing.json` and its fixture tests together (`node --test .claude/hooks/review-route.test.mjs`).

## Cross-Cutting Discipline

- **Spec threshold.** Open a `docs/specs/` design doc when **≥2** of: new route/endpoint, new cross-boundary contract, >3 files touched, touches auth/Firestore-rules/Cloud-Functions, user-facing copy/flow change, measurable perf impact, schema/migration-coupled.
- **Prompt-refine default.** Non-trivial request (>1 file, opens a PR, changes a contract, edits CI/hooks, invokes a project skill): first reply with a refined prompt (1–3 lines), a numbered tool plan and a one-line proceed/adjust question, then wait. Bypass words: `auto`, `go`, `just do it`.
- **Checkpoint commits.** Commit per milestone; never batch >10 modified files.
- **PR workflow.** Always `gh pr create`, never the web UI. Run `pnpm pr-tests` right after opening. Body:
  ```
  ## Summary
  - <what changed>
  - <why>

  ## Test plan
  - [ ] <stack>-ci pass

  ## Reviews
  - [ ] <every token the review router mandated for this diff>
  <!-- or, for a lighter-review diff: -->
  Review-Exception: <reason> — <correctness gate run + invariant asserted>
  ```
- **Worktree-first (MANDATORY).** Every feature or fix, tooling and docs included, runs in its own worktree created before the first edit:
  `git fetch && git worktree add .worktrees/<slug> -b <branch> origin/main` (local `main` lags `origin/main`). Use `.worktrees/`, never `.claude/worktrees/` (so not the `EnterWorktree` tool). Never edit, build or test in the primary checkout. Remove the worktree after the PR merges.
- **Branch per feature.** Off `main`, before the first edit; never commit feature work to `main`/`master`. Prefixes `feat/ fix/ chore/ migration/`. Conventional Commits with module scope (`feat(backstage): …`). `master` is always deployable. Check the branch before committing: the user may switch it underneath you.
- **Codegen-drift gate.** Any artifact generated on one boundary and consumed on another (`@luminova/types` shared schemas, generated Firestore types) gets a CI check that regenerates and fails on diff.
- **Performance budget.** Frontend changes hold the budgets and Core Web Vitals targets in `docs/performance.md`. After any dep or route change, dispatch `bundle-budget-watcher` and note the `index`-chunk gz delta; a budget breach must be a conscious, noted decision.
- **Docs layout.** `docs/specs/` (designs), `docs/plans/` (impl plans), `docs/status/` (handoffs), `docs/tooling/skill-development-log.md` (skill history), `docs/roadmap.md` (the work queue and owner decisions).
- **Recurring pitfalls (2026-07 audit): guardrails.** Detail, examples and the enforcing guard for each are in `docs/engineering-guardrails.md`.
  1. **Extract, don't copy.** Same logic in 2+ places → parameterize or extract (rule of three), consolidate when touched.
  2. **Rules mirror code.** Any repository write-invariant (a locked/gated field, soft delete) MUST also be enforced in `firestore.rules` with a rules test. Dispatch `firestore-security-reviewer`.
  3. **Three query states.** Every data view handles loading / **error** / absent; never gate on `!data` alone. Use `ErrorState` / backstage `QueryErrorState`; permission-denied = no retry.
  4. **No silent catch.** Never swallow a caught error: `console.error` or surface it; an intentional ignore needs a one-line justifying comment.
  5. **Bound every query.** Server-side `where`/`.limit`; batch `getAll` fan-out with `chunk()` at 300 (`apps/beacon/src/chunk.ts`). Dispatch `firebase-functions-reviewer` for beacon.
  6. **Claim == reality.** A guard named in CLAUDE.md or docs MUST exist and be wired (CI, hook, eslint); orphaned `firestore.rules` collections with no consumer get removed.

## Reference Docs

`docs/architecture.md` (system overview) · `docs/data-models.md` (Firestore schemas) · `docs/features.md` · `docs/firebase-setup.md` (emulators, deploy, owner ops) · `docs/domains.md` (custom domains and fallback) · `docs/ci-cd.md` (CI, keyless CD, rollback) · `docs/performance.md` · `docs/engineering-guardrails.md` · `docs/reuse-first-ui.md` (color tokens, component index, type scale; backed by eslint guards) · `packages/ui/DESIGN.md` (design-system manifest for Claude Design) · `docs/roadmap.md`.
