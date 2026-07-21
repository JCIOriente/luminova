# Capability-first CASL authz migration — status & enforcement model

_2026-07-20 · backstage authz. Canonical home for the multi-PR migration that follows
the 2026-07-18 authorization audit (`docs/status/2026-07-18-authz-audit.md`) and PR #185._

## Why this migration exists

The audit + PR #185 surfaced two debts:

1. **Gate drift.** Backstage nav/route gating mixed capability probes with role-NAME
   allowlists. Nothing kept those gates in lock-step with `firestore.rules`, so drift was
   caught only by periodic audits (findings C1/C5/C8).
2. **No enforced reconciliation.** There was no CI-enforced guard that the CASL/nav gates
   and the server rules agree.

An initial "ACCESS_POLICY table + regex-parse the rules" design was **adversarially
rejected as unsound** — you can't parse authz through the rules' helper indirection, and
such a parser would false-green over write-integrity guards. The adopted design is two
**emulator-driven** checks plus capability-first gating.

## The enforcement model (two checks)

### Check A — `tests/firestore-rules/nav-equivalence.test.ts`

For every gated nav item × principal: **`navVisible ⟹ the emulator allows the route's
defining op`**. One principal fixture drives BOTH the nav ability (`buildAbility`) and the
emulator context (`as(uid, roles, perms)`), so the two can't silently diverge.

- Implication only — it never flags curation (a stricter-than-rules gate is fine) and
  verifies **nothing** about write-integrity (that stays in `rules.test.ts`).
- Includes an explicit **escalation probe**: a perms-only `manage:all` principal must
  never be offered a role-gated write route (the claims-mint trust anchors).
- Includes a "probe is exercised" assertion so a route that regresses to zero-visibility
  can't go silently untested.

### Check B — `tests/firestore-rules/rules-coverage.test.ts`

Scrapes rules collection **names** (not authz) → each must be surfaced by a route
(`ROUTE_GATING`) or explicitly listed in `KNOWN_UNSURFACED`. A stale-allowlist guard forces
cleanup when a collection is removed (this is what forced the `events` allowlist entry to be
deleted in PR-D).

### `ROUTE_GATING` (`apps/backstage/src/components/nav-config.ts`)

Declares which rules boundary each nav item's gate **claims to mirror** — `listRead`,
`write`, or `curationOnly` — never *who* is allowed. `curationOnly` routes gate on a
`read: if signedIn()` collection, so no single rules boundary mirrors them; Check A skips
them and their visibility is instead pinned by `nav-config.test.ts` (see below).

## The role-gate register

Three routes gate on a built-in **role** rather than a capability. A role gate is correct
**only** when no server-side capability cleanly names the viewer set:

| Route | Gate | Why not a perm gate |
|-------|------|---------------------|
| `/permisos` | `roles: ["Admin"]` | Mirrors the rules' `hasAnyRole(['Admin'])` write boundary on `roles/` — the claims-mint trust anchor. A perm gate is a self-elevation loop (the tool mints the perms). |
| `/config` | `roles: ["Admin"]` | Same, for `siteConfig/current`. |
| `/positions` | `roles + orCan(manage:Position)` | `positions` read is `signedIn()`, so the viewer set is definitionally a role set: `read:Position` is overloaded (every Member holds it for /me chip resolution), so no capability separates catalog curators from Members. `orCan` re-admits a dynamic custom role that manages the org chart. A `read:PositionCatalog` capability would mirror nothing server-side — kept `roles + orCan` by architect decision. |

Every **other** route gates on a capability (subject-read empty-instance probe), which
mirrors a real rules boundary and admits perms-only custom roles automatically. The
`curationOnly` routes' exact built-in visibility sets are pinned in
`nav-config.test.ts` (`/positions`, `/point-rules`, `/activities`, `/initiatives`), since
Check A excludes them.

## Roadmap & status (A–F)

| PR | Scope | Status |
|----|-------|--------|
| **A** (#186) | Two-check enforcement harness + capability-first gating; type-only `IconKey` decouple so the isolated rules-test package can import `nav-config` | **Merged** |
| **C** (#187) | Drop the orphaned `Payment` subject (no rules collection) | **Merged** |
| **D** (#188) | Fully drop the orphaned `Event` subject + `/events` rules block; add a deny-all rules test (audit C8) | Open |
| **E** (#190–#195) | Extract every backstage route-page component into `features/<area>/components/*-page.tsx` so route files export only `Route` (autoCodeSplitting invariant) → makes the page-level authz gates unit-testable; adds component-level gate tests. Six sub-PRs by area (E1 permissions, E2 recognition-lite, E3 activities, E4 initiatives, E5 dashboard/allies/leads, E6 config/members) | Open |
| **F** (this PR) | Formalize the role-gate register (nav-config comments), pin the `curationOnly` visibility sets in `nav-config.test.ts`, and write this canonical roadmap | Open |
| **B** | Remove `buildAbility`'s `BUILT_IN_ROLE_PERMS` fallback (`claims.perms ?? []`) | Open |

### PR-B — outcome

Done. `buildAbility` now trusts exactly one input for coarse abilities: the resolved
`perms` claim; an absent `perms` grants none. This eliminated a latent
`navVisible ⟹ rules-allow` drift vector — `firestore.rules` already read an absent
`perms` as `[]` (deny) via `.get('perms', [])`, while `buildAbility` re-derived from the
role table, so a hypothetical roles-only token would have seen UI the rules deny. Removing
the fallback closes that gap; it never existed in production because `claims-sync` always
mints `perms`.

The ~10 roles-only fixtures that expected coarse abilities now derive perms the production
way via a shared `roleClaims(...roles)` helper (`@luminova/auth/test-helpers`) — a thin
adapter over `resolveEffectivePerms` mirroring `permsForRoles` in `role-seed.mjs`.
Deliberate absence/role-gate fixtures stay roles-only.

## Guardrails this migration hardened

- **Claim == reality** (guardrail #6): orphaned rules collections with no consumer are
  removed (Payment, Event); a removed collection must leave `KNOWN_UNSURFACED` too.
- **Rules mirror code** (guardrail #2): Check A enforces `navVisible ⟹ rules-allow` on every
  gated route; write-integrity stays in `rules.test.ts`.

## Coherence contract — what must move together (and the guard that enforces it)

`firestore.rules` is the authority; the UI gates, the seed, and the shared types are all
**derived from or cross-checked against it** so a change on one side can't silently drift from
another. Every coupling below is enforced by an emulator or unit test — none is a convention you
have to remember. When you change the left column, the guard fails until the right column agrees.

| Coupling | Derived / cross-checked by | Enforcing test | If you change the rules… |
|---|---|---|---|
| Gated nav route ↔ the rules op it claims to mirror | one principal fixture drives both the nav ability (`buildAbility`) and the emulator context | **Check A** `nav-equivalence.test.ts` (`navVisible ⟹ rules-allow`) | a new capability path needs a principal fixture (e.g. the `read:Lead` custom added here) or `/leads`-style paths go un-cross-checked |
| The set of rules collections ↔ the routes/allowlist that surface them | lexical scrape of `match /<coll>/` names | **Check B** `rules-coverage.test.ts` (`ROUTE_GATING` ∪ `KNOWN_UNSURFACED` == rules collections) | add/remove a collection → update `ROUTE_GATING` or `KNOWN_UNSURFACED` or Check B fails |
| `activityLockSafe()` locked fields ↔ client `ACTIVITY_LOCKED_FIELDS` (`@luminova/types`) | `parseActivityLockedFields(rules)` | `activity-locked-fields.rules.test.ts` (canonical ⇔ parsed) + the per-field deny loop in `rules.test.ts` | add/remove a locked field → change the canonical set or the parity fails |
| Collections whose client delete is a flat deny ↔ the delete-denial coverage | `parseDeleteDeniedCollections(rules)` (`tools/scripts/lib/rules-delete-denied.mjs`) | `rules.test.ts` "no drift" parity test | add a `delete:if false`/`write:if false` collection, or loosen one → parity fails until coverage is updated (a loosened delete is a red flag to review) |
| Built-in role perms ↔ the seed ↔ claims-sync | `BUILT_IN_ROLE_PERMS` (`role-definition.ts`) mirrored by `permsForRoles` (`role-seed.mjs`); rules tests build claims via the **real** seed producer | `role-definition.mirror.test.ts` + the whole `rules.test.ts` suite (`seed-output ⊨ rules`) | change a role's perms → change both mirrors or the mirror test fails |
| Coarse UI abilities ↔ the `perms` claim (PR-B) | `buildAbility` reads `claims.perms ?? []` (no role-table fallback); tests mint perms via `roleClaims(...)` | `packages/auth/src/ability.test.ts` | absent `perms` grants zero coarse — a roles-only fixture is correct only for absence / role-name gates |
| `curationOnly` route visibility (Check A excludes these) | CASL ability unit level only (collections are `read:signedIn()`) | pinned exact role-sets in `nav-config.test.ts` | changing one of these gates → update its pinned set |

The parse-driven guards (`parseActivityLockedFields`, `parseDeleteDeniedCollections`) live in
`tools/scripts/lib/` with their own unit tests so a rules **format** change surfaces in one place,
not as silent under-coverage. Adding a new "rules deny X unconditionally" invariant should follow
the same shape: a small parser + a parity test, never a hand-maintained mirror list.
