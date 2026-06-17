# Handoff — firestore-security-reviewer CREATE-path parity (PR #70)

**Date:** 2026-06-13
**Branch:** `chore/reviewer-create-audit` → PR #70 (base `main`)
**Worktree:** `.worktrees/reviewer-create-audit`

Item **2 of 4** in the harness-hardening backlog. Item 1 (security-review hard
gate, PR #68) is MERGED to main (`afb4dfc`).

## Shipped

- **`.claude/agents/firestore-security-reviewer.md`** — new checklist item #3
  "CREATE-path parity": audit `create` rules with the same rigor as `update`.
  For any power/identity field (roles, claims, `assignedBy`, `uid`, cargo
  grants), verify create cannot forge it — no client-set `uid`, attribution
  self-stamped to `request.auth.uid`, non-privileged actors limited to empty
  grants. Critical if violated. Carries the K4 example. Items 4–9 renumbered.
- **`docs/tooling/skill-development-log.md`** — changelog entry.
- Markdown-only; no runtime code, no rules change.

## Verification

- `/code-review` (focused, sonnet): numbering contiguous 1–9, K4 facts accurate,
  changelog consistent, markdown well-formed — **clean**.
- No `/security-review` (no auth/rules/beacon code). No `pnpm pr-tests` (no
  code/deps surface).

## Follow-up discovered (NOT in this PR) — gate-on-worktree gap

While shipping this via a worktree, found a limitation in the **item-1 gate**
(`security-review-gate.sh`, already merged): it `cd`s to `$CLAUDE_PROJECT_DIR`
(the main checkout, which stays on `main`) and diffs there, rather than the
worktree the `gh pr create` actually runs from. So for **worktree-based PRs**
(which `feature-flow` mandates) the gate inspects the wrong tree (`main...main`
= empty) → it never fires. It still works for in-place branch switching in the
main checkout.

Fix options for a future PR: resolve the repo dir from the hook's invocation cwd
(the directory the Bash command runs in) instead of `$CLAUDE_PROJECT_DIR`, or
derive the branch/range from `gh`'s context. **This should be prioritized — it
materially weakens item 1 under the repo's own worktree-first workflow.**

## Backlog remaining (in order; CI-red LAST per user)
- **(new, high)** Gate-on-worktree fix — see above. Arguably do before item 3.
3. **pr-tests port race** — turbo `ci` rules-emulator port non-serialized; pin/
   lock per run (see `feedback-pnpm-overrides-location`).
4. **CI-red merge block (LAST)** — hook checks `gh pr checks <pr>` green before
   `gh pr merge`. Confirm scope with user before building.
