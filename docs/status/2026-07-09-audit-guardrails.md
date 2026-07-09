# Audit → engineering guardrails — handoff

**Date:** 2026-07-09
**PR:** #148 `chore/audit-guardrails` (OPEN, CI green). **Merge after #147.**

Turns the 2026-07 full audit (`docs/status/2026-07-02-full-audit.md`, items 1–15, all shipped) into durable anti-repeat guards, so the same mistake-classes don't recur. Three parallel Explore agents mapped the findings → root causes, inventoried existing guards (to avoid duplication), and extracted uncodified lessons; they triangulated on **7 recurring patterns**.

**Decision (user):** written guardrails + reviewer strengthening — **no new eslint/CI**. Fragile custom rules (an `isError` AST check, jscpd copy-paste report) were declined for false-positive cost. The doc is explicit about which patterns have **no** mechanical guard.

## Shipped

- **`docs/engineering-guardrails.md` (NEW)** — one section per pattern: the mistake, a grep-verified real example, the MUST-rule, the enforcing guard. Closing table maps each to the real guard and flags patterns 3 (missing `isError`) + 5 (error-swallowing) as **review-only, no mechanical guard** — which is exactly how they shipped 7×/2×.
- **`CLAUDE.md`** — "Recurring pitfalls (2026-07 audit)" subsection under Cross-Cutting Discipline (6 one-line rules; pattern 4 folds into 1) + a Reference Docs link.
- **`.claude/agents/firestore-security-reviewer.md`** — new item 10 "Rules mirror client invariants" (repo-only write-invariant → must be enforced in `firestore.rules` + a rules test; distinct from the existing CREATE-path-parity item 3).
- **`.claude/agents/firebase-functions-reviewer.md`** — new items 12 "Bounded fan-out" (`chunk()` at 300 / `where` / `.limit`) + 13 "Update-path guards" (create/delete-only triggers must reconcile identity-field updates).

## The 7 patterns

1. Duplicate/parallel code (items 4,5,7,8,9,12) — rule of three / consolidate-when-touched; UI → `reuse-first-ui.md`.
2. Rules lagging code (1,2,3b) — repo invariant must be mirrored in rules + rules test → `firestore-security-reviewer`.
3. Missing `isError` branch (10,13,12) — three-state loading/error/absent; `ErrorState`/`QueryErrorState`. **No lint rule.**
4. Missing shared primitives — folds into #1.
5. Error swallowing (12,13) — never silent catch; log or justify. **No lint rule.**
6. Unbounded queries / `getAll` (12,15) — bound at source → `firebase-functions-reviewer`.
7. Config/policy drift (6,10,11,14) — a claimed guard must actually exist + be wired.

## GOTCHAs / decisions

- **Branched off STALE local `main` (12dcf4c); rebased onto `origin/main` (4718f20)** — local main lagged, missing merged #145+#146. After rebase, `apps/beacon/src/chunk.ts` is present so the fan-out citations resolve in-tree; section 6 was rewritten from "lands in #145" to the merged state (getRolesByIds already chunked; onRoleWritten early-returns via `roleClaimsChanged`).
- **Two forward-refs to #147 (open):** `docs/reuse-first-ui.md` + the `raw-hex` eslint rule. Disclosed in the doc header + PR as a merge-order prerequisite (#147 first). All other file:line refs verified against `main` @ #146.
- **No `/security-review`** — diff is docs + `.claude/agents/*.md` + `CLAUDE.md`; no `apps/beacon`/`firestore.rules`/auth/`repositories` code, so the `security-review-gate.sh` hook did not trip (and correctly didn't false-match on the `firebase-functions-reviewer.md` filename).
- Gates: fable-drafted (grounded, self-verified refs) → 2 review agents (doc accuracy + conventions/de-dup) all applied → `pnpm pr-tests` EXIT=0 → CI `checks`+`emulator` green (docs-only skip-pass).

## Follow-ups (noted, not built)

- The declined mechanical guards remain open options if false-positive tuning is later worth it: a custom eslint rule for `!data`-only query guards (pattern 3), and a jscpd copy-paste CI report (pattern 1).
