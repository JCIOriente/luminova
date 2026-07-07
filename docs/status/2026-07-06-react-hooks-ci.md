# Handoff — eslint-plugin-react-hooks in CI (audit item 11)

**Date:** 2026-07-06
**Branch:** `chore/react-hooks-ci` (off `main` @ b5abb2d)
**Commit:** a8207c4
**Audit row:** #11 (`docs/status/2026-07-02-full-audit.md` line 52; detail line 112; exec-summary blind-spot line 19)
**Nature:** Tooling/lint guardrail — **not** a behavior change. Surfaces existing latent hook violations at the CI gate.

## What shipped

Wired `eslint-plugin-react-hooks@^7.1.1` into the single shared flat config
(`eslint.config.js`) with **both** classic rules at `error`:

- `react-hooks/rules-of-hooks: error`
- `react-hooks/exhaustive-deps: error`

Applied to `apps/**/*.{ts,tsx}` + `packages/**/*.{ts,tsx}`. This feeds every
`*-ci` lint step and the CI `checks` job (`pnpm turbo run lint typecheck build`)
automatically — no ci.yml edit needed.

**Scope discipline:** only the two classic rules are wired. The plugin's
`recommended-latest` config additionally enables the React Compiler lint suite
(`immutability`, `purity`, `set-state-in-effect`, `use-memo`, …) — a separate,
larger initiative, deliberately out of scope for this guardrail.

## Enforcement decision (user-confirmed)

Presented the dry-run result and asked enforcement level. **User chose "Both
error (max teeth)."** Rationale surfaced to the user: `pnpm lint` runs bare
`eslint .` (no `--max-warnings 0`), so a `warn`-level rule exits 0 → **no CI
teeth**; only `error` blocks. Clean dry-run (below) made "both error" feasible
with zero follow-up debt.

## Dry-run violation harvest (monorepo-wide, before fixes)

| File | Line | Rule | Classification | Resolution |
|------|------|------|----------------|-----------|
| `apps/spotlight/src/lib/use-async.ts` | 29 | exhaustive-deps | **Intentional** — generic hook; `deps` is the caller-driven re-run trigger (mirrors useMemo/useCallback); `fetcher`/`empty` read from refs refreshed every render → no stale closure | inline `eslint-disable-next-line` + WHY |
| `apps/spotlight/src/lib/use-async-on-visible.ts` | 57 | exhaustive-deps | **Intentional** — same pattern; re-runs on `visible` + caller `deps`; refs hold fetcher/empty | inline `eslint-disable-next-line` + WHY |

**0 `rules-of-hooks` violations. 0 real bugs.** Both exhaustive-deps warnings
were the "can't statically verify" variant (non-array-literal / spread dep list)
in the two hand-rolled generic async hooks the audit named as suspects. Neither
hides a stale closure — verified by reading both hooks in full. The third named
suspect (`header.tsx` scroll listener) produced no violation.

No blanket rule-disable, no file-level disable. Each disable carries a one-line
WHY per the repo's disable-with-reason convention.

## Proof the gate is RED (has real teeth)

Deliberately introduced a conditional `useState` (rules-of-hooks) + a
missing-dep `useEffect` (exhaustive-deps) in a throwaway file, then deleted it:

- **From repo root** (`eslint apps/**...`): both fired as `error`, exit 1.
- **From inside `apps/spotlight` via `eslint .`** (the exact per-workspace
  invocation `turbo run lint` / CI uses): `rules-of-hooks` fired as `error`,
  exit 1. Confirms the root-config `files: ["apps/**"]` globs still match when
  eslint runs from a workspace subdir — the gate is **not** cosmetic.

## Verification (all green)

- `eslint` monorepo-wide: 0 problems (post-fix).
- `pnpm turbo run lint`: 8/8 workspaces pass.
- `pnpm turbo run typecheck`: 13/13 pass.
- `pnpm knip`: exit 0 — plugin (config-only ref) **not** flagged unused.
- `pnpm audit --audit-level=high`: no known vulnerabilities.
- secure-dep-vetting on the plugin: `7.1.1` latest stable, not deprecated,
  `engines.node >=18` (24 ✓), peer `eslint ^10` matches installed 10.4.1, caret
  range (not security-critical).

## Security gate

Not triggered — item 11 touches only `eslint.config.js`, `package.json`,
lockfile, and two spotlight `lib/` files (public, no-auth app; no beacon / rules
/ auth / repository). `/security-review` not required by the checklist.

## Files changed (5)

`eslint.config.js`, `package.json`, `pnpm-lock.yaml`,
`apps/spotlight/src/lib/use-async.ts`, `apps/spotlight/src/lib/use-async-on-visible.ts`.

## Code review

Adversarial opus review (focus: do the inline disables mask a real
stale-closure/missing-dep bug; is the config override-safe): **NO REAL
FINDINGS.** Confirmed both disables legitimate — `fetcherRef.current` /
`emptyRef.current` reassigned unconditionally every render, effects read only
refs + `visible` (which is in-deps) + effect-scoped locals, so no reactive value
is untracked; the "not an array literal" flag is exactly the generic-hook case
the disable targets; the variable-length-dep-array hazard is caller
responsibility and not introduced by the diff. Config block correct: both rules
`error`, scoped to apps+packages, and neither `eslint-config-prettier` nor the
later `no-restricted-*` blocks reset `react-hooks/*`.
