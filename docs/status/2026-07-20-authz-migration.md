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
| **B** | Remove `buildAbility`'s `BUILT_IN_ROLE_PERMS` fallback (`claims.perms ?? []`) | **Deferred** |

### PR-B deferred — rationale

Removing the pre-backfill fallback breaks ~10 backstage test files that build **roles-only**
claims (no `perms`). It has low value while nothing is deployed and `claims-sync` always
mints perms. Revisit near go-live with a shared `roleClaims(...roles)` test helper that
mints the perms the way production does.

## Guardrails this migration hardened

- **Claim == reality** (guardrail #6): orphaned rules collections with no consumer are
  removed (Payment, Event); a removed collection must leave `KNOWN_UNSURFACED` too.
- **Rules mirror code** (guardrail #2): Check A enforces `navVisible ⟹ rules-allow` on every
  gated route; write-integrity stays in `rules.test.ts`.
