# Plan: tool setup for adopters (R26)

Spec: `docs/specs/2026-10-25-brand-setup.md`. Branch `feat/brand-setup`, worktree
`.worktrees/brand-setup`. Each task is test-first: a failing vitest, then the code.

1. **`packages/brand/src/cli/tools.ts`**: the tool checks (S2, S3, S8, S9) as
   `toolRows({ parts, platform, run, exists, env, home, repoRoot, nodeVersion })`, install
   remedies per platform (S6), the WSL row for `win32` (S7). Reads `package.json` without
   zod (S4). Tests: `tools.test.ts` with a fake runner and `exists`.
2. **`gcloud.ts`**: the runner learns `java`; `commandFailure`'s "not installed" remedy
   comes from `installRemedy` in `tools.ts` (S5).
3. **`setup.ts`** + `brand:setup` script: parts from `--part`, one table per part, the
   **To fix:** block, exit 1 on a failing row, a **Next:** line when all pass. Tests:
   `setup.test.ts`, including the import-graph test (S4).
4. **`doctor.ts`**: Part 1 rows first; Part 2 rows in place of `gcloud account`, skipped
   for a local-only profile (S5). Update `doctor.test.ts`.
5. **Docs**: `docs/adopting.md` "Before you start" and the tool links in steps 6–13,
   README Quickstart, `packages/brand` README/CLAUDE.md command lists, roadmap R26,
   status handoff. Fable writing pass.
6. `/simplify`, vitest, `pnpm pr-tests`, `route.sh` and the reviews it lists, PR.
