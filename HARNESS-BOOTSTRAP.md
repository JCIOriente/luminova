# Claude Code Harness Bootstrap Kit

> **What this is.** A portable, tech-agnostic blueprint of a mature Claude Code harness
> (the one running in the Buildify AI repo) plus a driver prompt that rebuilds an
> equivalent harness in **any** repository, on **any** stack.
>
> **How to use.**
> 1. Copy this single file to the root of the target repository.
> 2. Open Claude Code in that repo.
> 3. Copy **Part A — Driver Prompt** below and paste it as your first message.
> 4. Claude scans the stack, confirms it with you, then builds the harness tier-by-tier,
>    asking before each step. It reads **Part B** of this same file as the blueprint.
>
> Nothing here depends on the Buildify AI repo being present. The Rust/React bits are
> labeled **`[reference]`** — concrete examples to pattern-match against, not requirements.

---

# Part A — Driver Prompt

> Paste everything inside the fenced block as your first message in the new repo.

```
You are bootstrapping this repository's Claude Code harness. A file named
HARNESS-BOOTSTRAP.md sits in the repo root. It has two parts: Part A (this prompt)
and Part B (the harness blueprint). Read Part B in full before acting.

Follow this procedure. Do not skip the confirmations.

STEP 0 — Prerequisites.
Read Part B section B0. Check which external plugins and MCP servers are installed
(list what you can detect). Produce a checklist of what's MISSING and what each is
used for. Do NOT auto-install anything. Tell me what to install and pause if any
hard prerequisite is absent.

STEP 1 — Scan the stack (read-only).
Detect everything about this repo without changing anything:
  - Languages + versions (toolchain files: rust-toolchain.toml, .nvmrc, .python-version,
    go.mod, .ruby-version, .tool-versions, etc.).
  - Frameworks (web, ORM, test, build) from manifests: package.json, Cargo.toml,
    go.mod, pyproject.toml / requirements.txt, pom.xml / build.gradle, composer.json,
    Gemfile, *.csproj, mix.exs, etc.
  - Package manager + lockfile (npm/pnpm/yarn/bun, cargo, pip/poetry/uv, go, maven/gradle...).
  - Test runner, linter, formatter, type checker.
  - Database + how migrations are run, if any.
  - Existing task runner: Makefile / Taskfile.yml / justfile / npm scripts / package.json scripts.
  - Existing CI: .github/workflows, .gitlab-ci.yml, etc.
  - Existing .claude/ directory (agents, skills, hooks, settings.json), .mcp.json, CLAUDE.md.
  - Top-level structure: monorepo? which top-level stack dirs (e.g. backend/, frontend/, services/*)?

STEP 2 — Report + confirm.
Present the detected stack as a table (component | detected value | how I detected it).
Use AskUserQuestion to let me confirm or correct: language versions, which dirs are
distinct "stacks", whether there's a DB, and which task runner to standardize on.
DO NOT build anything until I confirm.

STEP 3 — Honor what exists.
If a .claude/ harness, CLAUDE.md, or task runner already exists, diff against the
blueprint and propose MERGES, never clobbers. Show me what you'd add/change per file.

STEP 4 — Build the harness, tier-by-tier, interactive.
For EACH tier below, in order: (a) propose the concrete artifacts mapped to my
confirmed stack — show file paths, names, and the key content; (b) wait for my
confirm/adjust; (c) then create them. One tier at a time. Use the naming conventions
and patterns from Part B.

  Tier 1 — CLAUDE.md (root cross-stack + one scoped file per stack dir).
  Tier 2 — CI gates (task-runner targets: <stack>-ci chains + pr-tests; HITL DB rule).
  Tier 3 — Hooks (.claude/settings.json + .claude/hooks/*: pre-commit auto-fmt/lint,
           post-pr security routing, stop checkpoint nudge).
  Tier 4 — Custom skills (.claude/skills/*/SKILL.md): prompt-refine + a domain skill
           per recurring multi-step task you and I identify in this repo.
  Tier 5 — Subagents (.claude/agents/*.md): read-only reviewers for the stack's
           riskiest surfaces (handlers/queries/migrations/bundles/etc.).
  Tier 6 — MCP servers (.mcp.json): read-only DB introspection (if DB) + read-only GitHub.

STEP 5 — Verify (Part B section B4).
Run the acceptance checklist: files exist, hooks executable + valid, settings.json is
valid JSON, the *-ci targets actually run, MCP servers reachable, and the CLAUDE.md
Tooling Index matches the files you actually created. Report results with evidence.

Throughout: propose, then act. I stay the decision-maker. Prefer reusing existing repo
conventions over inventing new ones. Keep the root CLAUDE.md lean — push stack detail
into the scoped files to preserve context budget.
```

---

# Part B — Harness Blueprint

The reference Claude reads to build the harness. Patterns are stack-agnostic;
`[reference]` examples come from the Buildify AI repo (Rust + Axum + SQLx backend,
React + Vite + Tailwind frontend, Postgres).

## B0 — Prerequisites checklist (external plugins & MCP)

Much of the harness *routes to* these. Without them, the CLAUDE.md Tooling Index points
at tools that don't exist. Confirm presence; list missing; do not auto-install.

| Prerequisite | Role in harness | Hard / optional |
|---|---|---|
| **superpowers** plugin | Process skills: `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `using-git-worktrees`, `dispatching-parallel-agents`, `requesting-code-review` / `receiving-code-review` / `finishing-a-development-branch`, `security-review`, `skill-creator`, `init`. | **Hard** — the workflow ordering depends on these |
| **caveman** comms plugin | `caveman` (terse mode), `caveman-commit`, `caveman-review`, `compress`. Optional house style. | Optional |
| Stack design/quality skills | Pick equivalents for the new stack. `[reference]`: `frontend-design`, `ui-ux-pro-max`, `react-best-practices` / `vercel-react-best-practices` for React. For a Vue/Svelte/mobile/backend-only repo choose the matching skill or skip. | Optional, stack-dependent |
| **DB introspection MCP** (read-only) | Schema introspection, EXPLAIN, SELECT against local dev DB. Only if the repo has a DB. `[reference]`: `postgres` (crystaldba/postgres-mcp), `POSTGRES_MCP_ACCESS_MODE=restricted`. Use a stack-appropriate server for MySQL/Mongo/etc. | Optional (if DB) |
| **GitHub MCP** (read-only) | Browse issues/PRs/releases. `[reference]`: `@modelcontextprotocol/server-github`, `GITHUB_READ_ONLY=1`, scoped toolsets. Writes stay manual via `gh` CLI. | Optional |
| **`gh` CLI** | All PR operations go through `gh`, never the web UI. | **Hard** (if using GitHub) |

## B1 — Harness philosophy (tech-agnostic — copy near-verbatim)

- **North Star: correctness over velocity.** A change shipped through plan → test → audit
  → review is cheaper over a quarter than a "quick" one reopened three times. When a
  skill, spec, or gate applies, use it.
- **1% skill-invocation rule.** If there's even a 1% chance a skill applies, invoke it
  first, then act. Announce: *"Using `<skill>` to `<purpose>`."*
- **Scoped CLAUDE.md to protect context budget.** Root holds cross-stack rules only.
  Per-stack detail lives in scoped files loaded only when the task touches that stack.
  (Loading backend rules to fix frontend = wasted tokens.)
- **Process skills before implementation skills.** "Let's build X" → brainstorming first.
  "Fix this bug" → systematic-debugging first. Then domain skills.
- **Communication mode** is a per-repo choice (e.g. caveman terse). Optional.

## B2 — The seven harness tiers

Each tier: *what → when → naming → `[reference]` example → how to translate.*

### Tier 1 — Scoped CLAUDE.md
- **What.** A root `CLAUDE.md` (cross-stack rules + the Tooling Index) plus one scoped
  `CLAUDE.md` per top-level stack directory.
- **When.** Always. First thing built.
- **Naming.** `/CLAUDE.md`, `/<stack-dir>/CLAUDE.md`.
- **`[reference]`.** Root + `frontend/CLAUDE.md` (React, perf budgets, form errors,
  design-skill routing) + `backend/CLAUDE.md` (Rust toolchain, Axum/SQLx invariants,
  validation, error codes, layer boundaries). Root says: *"Read the scoped file that
  matches your task. Do not load the other unless the task spans both."*
- **Translate.** One scoped file per distinct stack dir the user confirmed in Step 2.
  A single-stack repo gets just the root file. Each scoped file documents: toolchain +
  versions, key invariants, validation rules, layer boundaries, the stack's CI gate name.

### Tier 2 — Tooling Index (lives in root CLAUDE.md)
- **What.** Single source of truth listing every skill, subagent, hook, MCP — with a
  *when to invoke* column — plus a tool-routing quick-reference and an ordering rule for
  when several tools apply.
- **When.** Built alongside root CLAUDE.md; updated whenever a tool is added.
- **`[reference]`.** Tables grouped: process/meta skills, domain skills, communication
  skills, subagents, hooks, MCP servers; then a "If the task is… → reach for…" quick-ref;
  then ordering: (1) process skills, (2) domain skills, (3) review subagents,
  (4) cross-stack review last.
- **Translate.** Same structure. Populate only with tools that actually exist after the
  build (verify in B4). Reference tools explicitly when prompting so the right one fires.

### Tier 3 — CI gates (task runner)
- **What.** Per-stack `*-ci` target that chains every gate, plus an all-suites `pr-tests`
  target. Standardize on one runner (Make / Task / just / npm scripts).
- **When.** Early — hooks and the PR workflow call these targets.
- **Naming.** `<stack>-<phase>` (e.g. `backend-fmt`, `frontend-lint`, `backend-ci`).
- **Gate chain (map each to the stack's actual tool):** format-check → lint → type-check
  → unit/integration test → dependency audit (CVEs) → unused-dependency check →
  bundle-size / artifact budget → generated-artifact drift check.
- **`[reference]`.**
  - `backend-ci` = fmt + clippy + check + sqlx-offline-check + test + **gen-error-codes**
    (drift) + audit (cargo-audit) + deny (cargo-deny) + machete (unused deps). ~12 checks.
  - `frontend-ci` = prettier-check + tsc + build + test + knip (unused) + npm-audit +
    size-limit + i18n-check. ~8 checks.
  - `pr-tests` = full backend + frontend suites; run right after `gh pr create`.
  - Auto-fix variants: `backend-fmt-fix`, `frontend-format-fix` (called by the pre-commit hook).
- **HITL DB rule.** If a step needs the dev DB, Claude must first run a container check
  (e.g. `docker ps | grep <project>`), and if absent, **stop and ask** the user to start
  it — never start it automatically.
- **Translate.** Substitute the stack's tools: e.g. Go → `gofmt`/`golangci-lint`/`go test`/
  `govulncheck`; Python → `ruff`/`mypy`/`pytest`/`pip-audit`; Node-only → `prettier`/
  `eslint`/`tsc`/`vitest`. Keep the chain shape and the `*-ci` / `pr-tests` names.

### Tier 4 — Hooks (`.claude/settings.json` + `.claude/hooks/*`)
- **What.** Shell scripts wired to Claude Code events that automate discipline.
- **When.** After CI targets exist (hooks call them).
- **The three reference hooks:**
  1. **pre-commit** — `PreToolUse` on `Bash` matching `git commit`. Auto-runs the
     stack's format-fix targets, re-stages, then runs fmt + lint. Blocks only if checks
     still fail post-fix. Prints `git diff --cached --stat`. Honors `--no-verify` with a warning.
  2. **post-pr-create** — `PostToolUse` on `Bash` matching `gh pr create`. Path-based
     routing: if the branch diff vs main touches sensitive paths (auth, payments,
     migrations, middleware, upload handlers), leads output with a `security-review`
     prompt naming the module. Always reminds to run `pr-tests`.
  3. **stop** — `Stop` event. Prints `git status -sb` + uncommitted count; warns if
     >10 modified files (checkpoint-commit nudge). Read-only, never blocks.
- **`settings.json` shape (`[reference]`):**
  ```json
  {
    "hooks": {
      "PreToolUse":  [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-commit.sh" }] }],
      "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-pr-create.sh" }] }],
      "Stop":        [{ "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/stop.sh" }] }]
    },
    "enabledPlugins": { "<plugin>@<source>": true }
  }
  ```
- **Translate.** Swap the format/lint commands for the stack's. Swap the sensitive-path
  globs for this repo's risky dirs. `chmod +x` the scripts. Keep the matcher/event shape.

### Tier 5 — Custom skills (`.claude/skills/<name>/SKILL.md`)
- **What.** Repo-specific multi-step procedures captured as skills.
- **When to author.** The same manual steps recur 3+ times.
- **Frontmatter shape:**
  ```markdown
  ---
  name: <kebab-case-slug>
  description: <what it does> + a RICH set of trigger phrases users actually type,
    so it fires reliably. State when NOT to use it too.
  ---
  ```
  The description's trigger-phrase richness is what makes auto-invocation work — list
  many concrete phrasings.
- **`[reference]` skills & their generalizable shape:**
  - `prompt-refine` — restate request + list planned tools before executing; bypass on
    "auto"/"go"/"just do it". **Port this near-verbatim — stack-agnostic.**
  - `migration-create` — scaffold next sequential DB migration with header + rollback notes.
    → translate to the repo's ORM/migration tool.
  - `secure-dep-vetting` — pick latest secure dep version, block on CVEs before adding.
    → translate to the repo's package manager (`npm view`+`npm audit`, `pip-audit`, etc.).
  - `commission-recalc-trace` — trace a domain entity through its pipeline citing file:line.
    → translate to this repo's core domain flow (the thing that breaks and needs tracing).
  - `release-notes` — reshape conventional commits in a range into grouped notes.
    **Mostly stack-agnostic — port it.**
- **Translate.** Always port `prompt-refine` + `release-notes`. Then, with the user,
  name 1–3 recurring tasks in *this* repo and scaffold a skill each (use `skill-creator`).

### Tier 6 — Subagents (`.claude/agents/<name>.md`)
- **What.** Read-only specialist reviewers dispatched to audit risky surfaces. Report
  findings; never edit.
- **When.** Reviewing 1+ files on a risky surface; before reporting "done"; broad audits
  (parallelize one per module).
- **Naming.** kebab-case with `-reviewer` / `-watcher` suffix.
- **`[reference]`:**
  - `rust-axum-readiness-reviewer` — walks an 11-item production-readiness checklist on
    handler/repo files; ranks findings Critical/High/Medium/Low.
  - `bundle-budget-watcher` — runs build + size + unused-export checks after frontend
    changes; reports budget breaches.
  - `db-migration-reviewer` — audits a new migration for numbering, transaction wrapping,
    idempotency, locking risk, rollback notes, codegen drift.
- **Translate.** Build a stack-specific *readiness checklist skill* (e.g.
  `go-http-production-readiness`, `django-view-readiness`) and a matching `-reviewer`
  subagent that walks it. Add a size/artifact `-watcher` if the repo ships a bundle.

### Tier 7 — MCP servers (`.mcp.json`)
- **What.** Read-only data access. Writes stay manual via CLI.
- **When.** Repo has a DB (introspection) and/or uses GitHub (browse issues/PRs).
- **`.mcp.json` shape (`[reference]`):**
  ```json
  {
    "mcpServers": {
      "postgres": { "type": "sse", "url": "http://localhost:8050/sse",
        "description": "Read-only Postgres MCP, restricted access mode. Schema, EXPLAIN, SELECT." },
      "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}",
                 "GITHUB_TOOLSETS": "issues,pull_requests,repos", "GITHUB_READ_ONLY": "1" },
        "description": "Read-only GitHub. Browse issues/PRs/releases. Writes via gh CLI." }
    }
  }
  }
  ```
- **Translate.** Use the DB-appropriate MCP and a read-only access mode. Keep GitHub
  read-only with a fine-grained, repo-scoped PAT. Never grant write access by default.

## B3 — Cross-cutting discipline (stack-agnostic — copy near-verbatim into root CLAUDE.md)

- **Spec threshold.** Open a design spec when **≥2** of: new route/endpoint, new
  cross-boundary contract, >3 files touched, touches auth/payments/sensitive logic,
  user-facing copy/flow change, measurable perf impact, migration-coupled. Single-file
  polish / typos don't need a spec.
- **Prompt-refine default.** Non-trivial request (touches >1 file, opens a PR, runs a
  migration, invokes a project skill, changes a contract or CI/hooks) → respond first
  with: (1) refined prompt (1–3 lines), (2) numbered tool plan, (3) one-line
  proceed/adjust question. Then wait. Trivial → just do it. Bypass words: `auto`, `go`,
  `just do it`.
- **Checkpoint commits.** Commit per milestone; never batch >10 modified files. The stop
  hook nudges this. Conventional Commits with module scope (`feat(auth): …`).
- **PR workflow.** Always via CLI (`gh pr create`), never the web UI. Body template:
  ```
  ## Summary
  - <what changed>
  - <why>

  ## Test plan
  - [ ] <stack>-ci pass
  - [ ] security-review run (if triggers match)
  ```
  Run `pr-tests` locally right after opening.
- **Worktrees.** Use for parallel/isolated branches; prune after merge so they don't
  accumulate.
- **Branch / commit naming.** Branches `feat/ fix/ chore/ migration/`. Commits =
  Conventional Commits with module scope. `main` always deployable. Never batch multiple
  features into one commit.
- **Codegen-drift gate (generalize).** Any artifact generated on one side of a boundary
  and consumed on the other (error codes, API types, OpenAPI clients, GraphQL types) gets
  a CI check that regenerates and fails on diff. `[reference]`: `gen-error-codes`
  regenerates `error-codes.generated.ts` from the Rust source; CI blocks stale PRs.
- **Docs layout.** `docs/specs/` (designs), `docs/plans/` (impl plans), `docs/status/`
  (handoffs), `docs/tooling/skill-development-log.md` (skill history + pending training).
  `[reference]` uses `docs/superpowers/{specs,plans,status}/`.

## B4 — Generation acceptance checklist (run in Step 5)

Claude verifies, with evidence, that:

- [ ] Root `CLAUDE.md` exists + one scoped file per confirmed stack dir.
- [ ] Root CLAUDE.md Tooling Index lists **only** tools that actually exist on disk.
- [ ] Task runner has `<stack>-ci` per stack + `pr-tests`; each `*-ci` target **runs** (invoke it).
- [ ] `.claude/settings.json` is valid JSON; hook events/matchers correct.
- [ ] `.claude/hooks/*.sh` exist, are `chmod +x`, and reference real `*-ci` / fmt targets.
- [ ] `.claude/skills/*/SKILL.md` exist for `prompt-refine` + each agreed domain skill; frontmatter valid.
- [ ] `.claude/agents/*.md` exist for each agreed reviewer; read-only tools only.
- [ ] `.mcp.json` servers (if any) are read-only and reachable (ping / list).
- [ ] Existing repo files were merged, not clobbered (show diffs).
- [ ] A dry-run of the PR workflow (`gh pr create` → hook fires → `pr-tests`) is wired.

---

*End of bootstrap kit. This file is self-contained: Part A references only Part B.*
