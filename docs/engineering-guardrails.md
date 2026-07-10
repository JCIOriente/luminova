# Engineering Guardrails — Luminova

Recurring mistake classes from the 2026-07 full audit (`docs/status/2026-07-02-full-audit.md`,
items 1–15, all shipped) — for each: the mistake, a real example from this repo, the rule,
and the guard that enforces it. Read before writing code; these are the ways we've
actually broken things, not hypotheticals.

Grounded in the repo as of 2026-07 (`main`, post-#147). Line numbers verified against
that state.

---

## 1. Duplicate / parallel code

**The mistake.** The same logic gets built a second (or fifth) time because nobody
searched for the first — then the copies drift independently.
*(Audit items 4, 5, 7, 8, 9, 12.)*

| Duplicate that shipped | Consolidated into |
|---|---|
| Card shell (`rounded-card border border-line bg-surface …`) hand-rolled ~41× | `Card` — `packages/ui/src/components/card.tsx` |
| Backstage programs/projects repos + hooks byte-identical ×2 | `InitiativeRepository` — `apps/backstage/src/features/initiatives/repositories/initiative-repository.ts` |
| `use-activity-photos` vs `use-initiative-photos`, ~90% shared | `usePhotoCrud(PhotoSource)` — `apps/backstage/src/lib/use-photo-crud.ts` |
| Spotlight datetime helpers parallel to backstage `lib/datetime.ts` | `@luminova/utils` — `packages/utils/src/datetime.ts` (one Bolivia UTC pin) |
| Per-page SWR/localStorage fetch logic in spotlight | `apps/spotlight/src/lib/cached-resource.ts` |

**RULE.** Rule of three, applied early: the moment the same logic appears in a **2nd**
place, extract or parameterize — never paste a 3rd. When you touch code that already
has a sibling copy, consolidate it in the same PR (consolidate-when-touched).
Before building anything UI-shaped, check the catalog first.

**GUARD.**
- UI: `docs/reuse-first-ui.md` (component quick-index + pre-add checklist) backed by the
  `eslint.config.js` raw-element / raw-hex / sub-18px-type rules — start there, it's the
  canonical UI reuse doc; this section doesn't repeat it.
- Non-UI (repositories, hooks, utils): **human review + `/simplify`** — no mechanical guard.

## 2. Rules lagging code

**The mistake.** A write-invariant enforced only in a client repository, never mirrored
into `firestore.rules` — so any direct Firestore write (console, script, compromised
client) bypasses it. *(Audit items 1, 2, 3.)*

| Invariant that was client-only | Now mirrored in rules |
|---|---|
| Only Admin/PM may set `featured` | `firestore.rules:155` `canCurateFeatured()` + `:158` `initiativeCreateAllowed()` (create arm — a doc must not be **born** featured) + `:182` `featuredUpdateSafe()` |
| Activity `category`/`startAt`/`parentId` frozen once check-ins exist | `firestore.rules:337` `activityLockSafe()` (incl. beacon-owned `hasCheckIns` never client-writable) |
| Point award derivation trusted client fields | recomputed server-side in `awardPoints` — `apps/beacon/src/index.ts:100` |

**RULE.** Every repository write-invariant MUST have (a) a mirrored `firestore.rules`
assertion and (b) a rules test in `tests/firestore-rules/`. Audit **create** paths with
the same rigor as update — the K4 forged-`assignedBy` escalation lived in an ungated
create rule. Never rely on "the form doesn't send that field".

**GUARD.** `firestore-security-reviewer` agent (checklist item 10, rules ⇄ client
invariant parity) + `.claude/hooks/security-review-gate.sh` (hard-blocks `gh pr create`
on any beacon/rules/auth diff without a fresh `Security-Reviewed:` trailer).

## 3. Missing `isError` branch

**The mistake.** A TanStack Query result checked only for `isLoading`/`!data` — a
transient or permission-denied fetch error then renders an infinite skeleton or a
misleading "no encontrado". The audit found 7 such sites. *(Items 10, 13, 12.)*

**Example (the fixed pattern, now canonical):** `apps/backstage/src/routes/_app.me.tsx:65-66` —

```tsx
if (isLoading) return <p className="text-ink-3">Cargando…</p>;
if (isError) return <QueryErrorState error={error} onRetry={() => refetch()} />;
// …only then the genuine not-found copy
```

**RULE.** Every data-fetching view MUST handle three distinct states — loading /
**error** / data-absent — with the `isError` branch **between** `isLoading` and the
`!data` check (both copies stay meaningful). Use the shared `ErrorState`
(`packages/ui/src/components/error-state.tsx`) or the backstage `QueryErrorState`
wrapper (`apps/backstage/src/components/query-error-state.tsx`, selects
permission-vs-transient via `isPermissionDenied`). Permission-denied = **no** retry
button; transient = retry wired to `refetch()`. Never leak error internals into copy.

**GUARD.** **Human review + `react-best-practices` only — there is no eslint rule for
this.** Treat any `!data`-only guard in a review diff as a finding.

## 4. Missing shared primitives

Same root cause as #1, from the other direction: the primitive (ErrorState, Card,
SearchInput, datetime util) didn't exist yet, so every feature improvised one. The fix
is the same rule — extract on the 2nd occurrence, register it (barrel + `DESIGN.md`),
then adopt. See section 1 and `docs/reuse-first-ui.md`; not repeated here.

## 5. Error swallowing

**The mistake.** An async fetcher catches an error and drops the error **object** —
no `console.error`, nothing to inspect. A prod rules/index regression then degrades
silently: the UI shows an empty/error state but no dev can see *why*. *(Items 12, 13.)*

**Example:** `apps/spotlight/src/lib/use-async.ts:23` —

```ts
.catch(() => {
  if (alive) setState({ data: emptyRef.current, loading: false, error: true });
});
```

The failure surfaces to the UI as a boolean, but the caught error itself is discarded —
permission-denied vs missing-index vs network failure are indistinguishable in prod.

**RULE.** Never swallow a caught error silently. Log it (`console.error(context, err)`)
or propagate it alongside any state you set — beacon's per-member re-sync `catch`
(`apps/beacon/src/index.ts:268`, `console.error("onRoleWritten member re-sync failed", …)`)
is the shape to copy. An intentional swallow MUST carry a one-line comment justifying it
(see the "Swallow + log" comment at `apps/beacon/src/index.ts:277`).

**GUARD.** **Human review only — no lint rule.** Grep the diff for `catch (` / `.catch(`
and check each body logs or surfaces.

## 6. Unbounded queries / getAll fan-out

**The mistake.** A collection query with no `where`/`.limit`, or `db.getAll(...refs)`
splatting an unbounded ref list — fine at 40 docs, a cost/timeout bomb at 4,000.
*(Items 12, 15.)*

| Site | State |
|---|---|
| Spotlight `fetchFeatured` pulled the whole `showcase` collection, filtered client-side | Fixed (item 12): server-side `where("featured", "==", true)` — `apps/spotlight/src/showcase/showcase-firestore.ts:23` |
| `getRolesByIds` did `db.getAll(...refs)` on an uncapped `roleIds` list | Fixed (#145): chunk-at-300 via `chunk()` — `apps/beacon/src/claims-sync/firestore-deps.ts:91` batches over `apps/beacon/src/chunk.ts` |
| Beacon `onRoleWritten` built-in-role branch scans **all** members — `apps/beacon/src/index.ts:240` | Bounded (#145) by `roleClaimsChanged` early-return: a metadata-only edit skips the scan entirely; a real permission change still scans every holder **by design** — do NOT cap with `.limit()`, which would strand members beyond the cap with stale claims |

**RULE.** Bound every fan-out at the source: filter server-side with `where` (never
fetch-then-filter on the client), `.limit()` anything user-facing, and chunk `getAll`
ref lists at 300 (`apps/beacon/src/chunk.ts`) — but never use `.limit()` where
completeness is the invariant (claims sync must reach *every* holder; there, bound by
narrowing the trigger condition, as `roleClaimsChanged` does).

**GUARD.** `firebase-functions-reviewer` agent (checklist items 12 "Bounded fan-out" +
13 "Update-path guards") for beacon. Frontend: **human review only.**

## 7. Config / policy drift

**The mistake.** A guard or policy is *documented* but not actually *wired* — or a rule
exists with no consumer. Claim and reality diverge, and everyone trusts the claim.
*(Items 6, 10, 11, 14.)*

| Drift that shipped | Resolution |
|---|---|
| `CLAUDE.md` claimed `eslint-plugin-react-hooks` ran on every `.tsx` — it wasn't installed anywhere | Item 11: wired for real in root `eslint.config.js:32-33`, both rules `"error"` (only `error` blocks CI — `pnpm lint` is a bare `eslint .`, warnings exit 0) |
| `text-ui-*` type tokens defined, but arbitrary `text-[Npx]` still allowed everywhere | Item 6: 226-site sweep + the sub-18px selector in the `no-restricted-syntax` block (`eslint.config.js`, block head at :45) |
| `board` collection world-readable in `firestore.rules` with **zero** repository consumer | Item 14 (PR #144): removed; tests flipped to assert deny-all |
| Main-branch ruleset had correct required checks but `enforcement: "disabled"` — gated nothing | Flipped to `active`; verify `enforcement == active`, not just that checks are listed |

**RULE.** A guard named in `CLAUDE.md`/docs MUST actually exist and be wired in
CI/hook/eslint — when you cite one, verify claim == reality (open the config, run the
command). Orphaned `firestore.rules` match blocks (no repository/beacon consumer) get
removed or implemented, never left world-readable "just in case". Hand-maintained
mirrors (barrel vs `DESIGN.md` counts) are drift magnets — fix when touched
(`docs/reuse-first-ui.md` section 7 tracks the live example).

**GUARD.** Mostly **human review**. Mechanical spot-guards where the drift already bit
us: `packages/types/src/role-definition.mirror.test.ts` (role mirror vs canonical,
RED-on-perturb) and `tests/firestore-rules/seed-contract.test.ts` (seed producer ⊨
rules contract).

---

## How these are enforced

| # | Pattern | Mechanism | Where |
|---|---|---|---|
| 1 | Duplicate UI | raw-element + raw-hex + sub-18px-type `no-restricted-syntax` (all `"error"`) | `eslint.config.js`; runs in CI `checks` job (`.github/workflows/ci.yml`) |
| 1 | Duplicate UI (dead exports) | `pnpm knip` (unused exports) | CI `checks` job + `pnpm pr-tests` |
| 1 | Duplicate non-UI | **human review + `/simplify` only** | — |
| 2 | Rules lagging code | `firestore-security-reviewer` agent; `security-review-gate.sh` PR hard-gate; rules test suite | `.claude/agents/firestore-security-reviewer.md`; `.claude/hooks/security-review-gate.sh`; `tests/firestore-rules/` run by CI `emulator` job |
| 3 | Missing `isError` | **human review / `react-best-practices` only — no lint rule** | — |
| 5 | Error swallowing | **human review only — no lint rule** | — |
| 6 | Unbounded fan-out | `firebase-functions-reviewer` agent (beacon); **human review** (frontend) | `.claude/agents/firebase-functions-reviewer.md` |
| 7 | Config/policy drift | mirror + seed-contract tests; **human review** for doc claims | `packages/types/src/role-definition.mirror.test.ts`; `tests/firestore-rules/seed-contract.test.ts`; CI `checks` job |
| — | Hooks correctness (item 11) | `react-hooks/rules-of-hooks` + `exhaustive-deps`, both `"error"` | `eslint.config.js:32-33` via CI `checks` |
| — | firebase-lite discipline | `no-restricted-imports` (spotlight must use `firebase/firestore/lite`) | `eslint.config.js:101` |
| — | Bundle regressions | `bundle-budget-watcher` agent + budget script | `.claude/agents/bundle-budget-watcher.md`; `tools/scripts/check-bundle-budget.sh` in CI `checks` |
| — | Commit/PR hygiene | `branch-guard.sh`, `pre-commit.sh`, `post-pr-create.sh`, `stop.sh` | `.claude/hooks/` |

Honest gap summary: patterns **3** (missing `isError`) and **5** (error swallowing) have
**no mechanical guard** — they are review-culture-only, which is exactly how they
shipped 7× and 2× respectively. Treat them as standing review-checklist items until
someone writes the lint rules.
