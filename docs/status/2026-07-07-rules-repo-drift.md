# Handoff — Rules/repo drift cleanup (audit item 14)

**Date:** 2026-07-07
**Branch:** `fix/rules-repo-drift` → PR (to open)
**Audit:** `docs/status/2026-07-02-full-audit.md` row 55 (item 14), detail row 123 (`firestore.rules:194`, Low\*, confirmed). SENSITIVE (firestore.rules).
**Spec:** `docs/superpowers/specs/2026-07-07-rules-repo-drift-design.md`

## What shipped

Removed the orphaned, **world-readable** `match /board/{boardId}` block from `firestore.rules`. Board now falls through to the `match /{document=**}` deny-all (read + write denied for every caller). Kills a latent unused privilege.

`events`, `positions`, `roles` left unchanged (see decisions). No app/beacon/auth code touched.

## Decisions (user, 2026-07-07)

| # | Collection / question | Decision | Why |
|---|----|----|----|
| 1 | `board` — remove or implement | **REMOVE** | World-read orphan, no consumer/subject/type. Re-add when a real feature needs it. |
| 2 | `events` — remove or implement | **KEEP as-is** | Perm-gated (not world-read). The `Event` CASL subject is woven through `permission.ts` + `ability.ts` (Member `read:Event`) + 3 roles in `role-definition.ts` + ~8 tests; removing the collection alone would orphan the subject (worse drift), full subject removal is high-churn across the auth trust boundary + seed-contract guards — not justified. |
| 3 | `positions`/`roles` bare-Member read (Low) | **KEEP readable** | Intentional per the rules comment (admin UI renders role names + effective-perms preview). RBAC map is policy, not credentials. |

## Orphan evidence (proves board/events truly unused)

Explore agent (61 tool calls) + independent ripgrep over `apps/*` + `packages/*`, 2026-07-07. For **each** of `board` and `events`:

- No `collection(db,…)` / `doc(db,…)` read or write in any app.
- No repository class, no beacon trigger write, no callable.
- No TanStack query key, no type / Zod doc-schema, no composite index in `firestore.indexes.json`.
- Only references: `tests/firestore-rules/rules.test.ts`.

`board`-specific: genuinely referenced only at the flipped test. `rules.test.ts:385` "allows board roles to read" is a **false positive** — governance board (ExecutiveCommittee reading `members`), unrelated to the collection. Governance board (CEL/JDL) is modeled via the `positions` collection + `members.positions.<term>` → Auth claims, never the `board` collection.

## Tests (rules-only)

TDD flip of the board test in `rules.test.ts` (public + deny-all suite):
- Was: `it("allows anonymous read of board")` → `assertSucceeds`.
- Now: `it("denies read of the removed board collection (falls through to deny-all)")` → asserts **anon read fails** AND **signed-in Admin read fails**.
- RED verified against the pre-edit rules (still world-read → `assertFails` failed with "Expected request to fail, but it succeeded"). GREEN after removal.
- Full suite: **221 passed** (`firebase emulators:exec --only firestore`, port 4010 confirmed free).

## Gates

- `/simplify` — N/A (pure deletion).
- `/code-review high` — `[]` (no findings).
- `/security-review` — no findings. Change is strictly more restrictive; no `board` cross-reference remains in rules (only substring is `leaderboard` comment); no scope creep.
- `firestore-security-reviewer` subagent (opus) — **CLEAN, ship**. All 5 adversarial checks pass: no rule `get()/exists()` references board (only cross-refs resolve positions/activities/programs/projects/members); removal is strictly more restrictive; every `board` hit in app code is a false positive (the `Term.board` governance-array field or leaderboard/dashboard naming); flipped test locks deny-all; no scope creep. Raised one Low (test asserted read-denial only) → addressed by adding the Admin write-denial assertion.
- `Security-Reviewed:` trailer stamped before `gh pr create` (gate requirement).

## Test detail (final)

`it("denies read + write of the removed board collection (falls through to deny-all)")` — asserts anon read fails, Admin read fails, AND Admin write fails (board was Admin-writable pre-removal). Full suite **221 passed**.

## Diff

```
firestore.rules                     | 6 ------
tests/firestore-rules/rules.test.ts | 5 +++--
```

## Follow-up

Numbered backlog: **1–14 shipped after this merges**. Only **item 15** remains — a grab-bag of smaller items; suggest splitting into sensitive (beacon, needs `/security-review`) vs non-sensitive (dedup/trim) sub-PRs. After item 15 the numbered backlog is COMPLETE.
