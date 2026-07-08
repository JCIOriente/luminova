# Rules/repo drift cleanup (audit backlog item 14)

**Date:** 2026-07-07
**Branch:** `fix/rules-repo-drift`
**Audit source:** `docs/status/2026-07-02-full-audit.md` row 55 (item 14), detail row 123 (`firestore.rules:194`, Low\*, confirmed)
**Sensitivity:** SENSITIVE — touches `firestore.rules` (security-review gate fires on `gh pr create`)

## Problem

Two Firestore collections are defined in `firestore.rules` with **zero consumer anywhere in the monorepo** (rules-vs-repo drift, latent unused privilege):

- `match /board/{boardId}` — **world-readable** (`allow read: if true`), Admin-write. No repository, beacon trigger, spotlight lite-read, backstage query, `Board` CASL subject, type, query-key, or index. The world-read makes it the real latent-privilege concern.
- `match /events/{eventId}` — signed-in read, `canDo(...,'Event')` write. No collection consumer, BUT the `Event` CASL subject is woven through `packages/types/permission.ts`, `packages/auth/ability.ts` (Member gets conditional `read:Event`), 3 roles' default perms in `role-definition.ts`, and ~8 auth tests.

### Evidence (monorepo consumer grep — Explore agent + ripgrep, 2026-07-07)

Both collections orphaned. For **each**: no `collection(db,…)` / `doc(db,…)` read or write in `apps/*` or `packages/*`; no repository class; no beacon trigger write; no TanStack query key; no type/Zod schema; no composite index in `firestore.indexes.json`. Only references are in `tests/firestore-rules/rules.test.ts`.

- `board`: genuinely referenced only at test lines 1069–1070 (`getDoc(doc(anon(), "board/b1"))`). Line 385 "allows board roles to read" is a **false positive** — governance board (ExecutiveCommittee reading `members`), unrelated to the collection.
- `events`: referenced at test line 57 (seed `events/e1`), the `events` describe block (559–569), and 2 reconciliation tests (1730 `manage:all` superuser vehicle, 1767 `EC-can-create-events`).

## Decisions (user, 2026-07-07)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | `board` — remove or implement | **REMOVE** | World-readable orphan = latent unused privilege. No subject/type/consumer. YAGNI — re-add when a real board feature exists. Governance board (CEL/JDL) is modeled via the `positions` collection + `members.positions.<term>`, **not** this collection — nothing governance-related touches it. |
| 2 | `events` — remove or implement | **KEEP as-is** | Perm-gated (not world-read), low risk. The `Event` subject is already integrated across the auth fabric; a calendar/events feature is plausible. Removing the collection alone would orphan the `Event` subject (worse drift); full subject removal is a high-churn change across the auth trust boundary + seed-contract guards, not justified here. |
| 3 | `positions`/`roles` bare-Member readability (Low) | **KEEP readable** | Intentional per the rules comment — the admin UI renders role names + per-member effective-perms preview. The RBAC map is policy, not credentials. No behavior change. |

## Change set (firestore.rules + its tests ONLY)

1. **`firestore.rules`** — delete the `match /board/{boardId}` block. Board then falls through to the `match /{document=**}` deny-all → no read, no write.
2. **`tests/firestore-rules/rules.test.ts`** — TDD-flip the board test (1069–1071):
   - Was: `it("allows anonymous read of board")` → `assertSucceeds`.
   - Now: `it("denies read of the removed board collection (falls through to deny-all)")` → assert **anon read fails** AND **signed-in read fails**. RED before the rules edit (still world-read) → GREEN after (denied). Locks the removal and guards against re-adding a world-read orphan.
   - Line 385 untouched (false positive).
3. **No changes** to `events`, `positions`, `roles`, or any app/beacon/auth code.

## Testing / guardrails

- Run firestore-rules tests on a **bumped emulator port** (dodge a running dev emulator on 4010).
- Full `pnpm pr-tests` green.
- Security: `/security-review` + `firestore-security-reviewer` subagent + `Security-Reviewed:` trailer before `gh pr create` (gate blocks otherwise).

## Out of scope

Deferred members-guards; the 9 refuted audit findings; the `Event`-subject removal; any `positions`/`roles` tightening.
