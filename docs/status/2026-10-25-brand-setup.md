# 2026-10-25 — Tool setup for adopters (R26)

Branch `feat/brand-setup`, PR #272. Spec `docs/specs/2026-10-25-brand-setup.md` (S1–S9), plan
`docs/plans/2026-10-25-brand-setup.md`.

## Shipped

- `pnpm brand:setup [--part try|live]`, read-only: one table per guide part with the
  version or account found for Node, pnpm, Java, the Firebase CLI (Part 1) and `gh`,
  `gcloud`, their sign-ins, Application Default Credentials and the Firebase CLI sign-in
  (Part 2), then a **To fix:** block with the install command for this OS (macOS
  Homebrew, Linux apt or the vendor page). Exit 1 on a failing row; the two optional
  sign-ins only warn. Runs before `pnpm install` as `node packages/brand/src/cli/setup.ts`.
- One table of checks (`packages/brand/src/cli/tools.ts`) and one of install commands
  (`install.ts`). `brand:doctor` opens with the Part 1 rows and checks `gh` and `gcloud`
  with their sign-ins before the bucket (skipped for a local-only profile, as before).
  `commandFailure`'s "not installed" remedy now comes from `install.ts`, so `brand:push`
  and the rest print the same per-OS command.
- Native Windows: `brand:setup` stops and `brand:doctor` shows one row, both pointing at
  WSL 2 (owner ruling, S7).
- Docs: `docs/adopting.md` "Before you start" (tool tables per part with a check command
  each, the sign-ins with the step that needs them), a **Needs:** line on steps 6–13, a
  first row in the steps table; README Quickstart runs `brand:setup --part try`. Roadmap
  R25 marked done (#270), R26 done.

## Verification

- `packages/brand` vitest 382/382; `pnpm pr-tests` exit 0 (turbo `ci` 17/17, knip clean,
  audit at high).
- Real runs: `pnpm brand:setup` on this Mac (all ok, exit 0); a copy without
  `node_modules` and a PATH holding only node and pnpm (Java via the Homebrew keg, the
  rest "not installed" with brew commands, exit 1); `--part nope` (exit 1);
  `GH_TOKEN=ghp_bogus` (`unset GH_TOKEN`, then `gh auth login`).
- Mutation checks bit: the java stub pattern, an npm import in a module `setup.ts` reaches.

## Decisions

- Windows means WSL 2: `pnpm dev` runs bash, and `execFile` cannot start the `.cmd` shims
  of `gcloud`, `firebase` and `pnpm` (owner ruling in session).
- `brand:doctor` now fails without `gh` and its sign-in on a connected profile. Step 9
  needs both, and step 11 already says every row passes after it.
- Homebrew's keg-only OpenJDK counts as Java on macOS, as `tools/scripts/emulators.sh`
  puts it first on `PATH`.
- The Firebase CLI version is only noted against CI's 15.22.1, never failed.
- `pnpm brand:setup` in a clone without `node_modules`: pnpm 11 installs the packages
  first. The guide says so and gives the `node …` form for a check before that.
- `/code-review` was replaced by adversarial Opus passes (full branch, then the fix
  delta), as the PR body says.

## Deferred

- Native Windows support for the brand CLIs (a `.cmd`-aware runner, no bash in `pnpm dev`).
- The Linux rows for `gh` and `gcloud` link to the vendors' apt instructions instead of
  printing them: both are multi-line repository setups that change upstream.
