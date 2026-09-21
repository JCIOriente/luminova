# Presentation & Onboarding Documentation — Design

**Date:** 2026-09-20
**Status:** Proposed
**Branch:** `chore/presentation-docs`

## Problem

The repo has a documentation **surplus**, not a deficit: ~4,000 lines across 13
top-level docs, ~30 specs, ~24 plans, ~34 status handoffs. What it lacks is a way
*in*:

- No index. A newcomer facing `docs/` has no idea which of 13 files answers their
  question.
- No onboarding path. Nothing takes a reader from "cloned the repo" to "opened a PR."
- No rendered diagrams. `docs/architecture.md` carries ASCII art that cannot be
  embedded in a deck, zoomed, or maintained.
- No decision record. The *why* behind Firestore, the `perms` claim, the lite SDK,
  worktree-first lives in scattered specs, status handoffs and PR threads.
- Nothing addressed to a non-engineer. The Directiva cannot read `data-models.md`.

The unstated driver for both audiences is the same: **JCI boards rotate annually.**
"Can a new volunteer ramp up without the current maintainer" and "what happens when
this board leaves" are one question asked twice.

## Goals

1. An engineer new to the project can make their first correct PR from documentation
   alone.
2. An engineer reviewing the architecture can see the real trust boundaries and read
   why each major call was made.
3. The build can be presented to an engineering audience without writing slides from
   scratch each time.
4. A Directiva member can understand what the platform does, what their role can do in
   it, and what it costs to keep running — in Spanish, without GitHub.

## Non-goals

- Restating `data-models.md`, `features.md`, `ci-cd.md` or `firebase-setup.md`. Every
  new artifact either links to them or draws a view onto them.
- Reconstructing rationale from code. An ADR with no recoverable source records that
  fact instead of inventing a story.
- Translating the existing engineering docs into Spanish.
- Screenshots captured by driving the live production app.

## Language

Per decision on 2026-09-20:

| Track | Language | Rationale |
|-------|----------|-----------|
| Engineering | English | Matches the repo convention (English identifiers) and every existing doc. |
| Business | Spanish | The Directiva audience. Matches the user-facing-values half of the naming convention. |

## Deliverables

### Phase 0 — Shared core

Built once; every later phase and both tracks consume it.

| Artifact | Path | Notes |
|----------|------|-------|
| Container + trust boundary | `docs/diagrams/container.mmd` | Client SDK vs Admin SDK, spotlight's `firebase/lite` read-only path, the single public write (`leads`). |
| Check-in → points sequence | `docs/diagrams/checkin-points.mmd` | The flagship domain flow; currently prose in `architecture.md`. |
| Authorization chain | `docs/diagrams/authz.mmd` | `roles/*` doc → `perms` custom claim (cap 30, fail-closed) → CASL ability → `<Can>` gates → the `firestore.rules` mirror. |
| Firestore ERD | `docs/diagrams/data-model.mmd` | Source-of-truth collections visually separated from public projections (`showcase`, `allyShowcase`, `boardShowcase`). |
| Delivery pipeline | `docs/diagrams/pipeline.mmd` | hooks → review router → hard gate → GH Actions → WIF/OIDC → preview → smoke → promote. |
| Docs router | `docs/README.md` | Task-oriented ("I want to X → read Y, run Z"), not a table of contents. |

**Format:** Mermaid, checked into the repo. It renders natively in GitHub *and* in
Claude Artifacts, so one source feeds the docs, the deck and the business one-pager
without a second copy. `architecture.md` ASCII art is replaced by embedded Mermaid.

### Phase 1 — Recruit contributors

| Artifact | Path | Contents |
|----------|------|----------|
| Onboarding guide | `docs/onboarding.md` | Node 24 / `.nvmrc`, `pnpm install`, `.env.local`, emulator ports, the first-run trap (`@luminova/auth`, `types`, `utils` must be built before app vitest in a fresh worktree), worktree-first, branch naming, review-router stamp, PR body template. |
| Front door | `CONTRIBUTING.md` | Thin; points at `docs/onboarding.md` and `docs/README.md`. |

Success test: a reader who has never seen the repo follows it end-to-end and lands on
a green `pnpm pr-tests`.

### Phase 2 — Architecture review

`docs/decisions/NNNN-<slug>.md`, one page each, plus an index in `docs/README.md`.

Candidate set (final list confirmed against the record during implementation):

1. Firestore over a relational database
2. Turborepo + pnpm workspaces monorepo
3. Three deployables: spotlight / backstage / beacon
4. `firebase/firestore/lite` for spotlight
5. Custom `perms` claim over Firebase built-in roles (cap 30, fail-closed)
6. CASL for ability modelling
7. Bespoke `@luminova/ui` over shadcn-first
8. Server-side projections (`showcase`, `allyShowcase`, `boardShowcase`) over client joins
9. Keyless deploy via WIF/OIDC
10. Worktree-first + computed review routing

**Sourcing rule (binding):** each ADR cites the spec, status handoff, or PR it was
derived from. Where the record does not preserve the rationale, the ADR says
"rationale not recorded" rather than supplying one.

### Phase 3 — Showcase

A 16:9 deck built on the **Slides** Artifact type, reusing the Phase 0 diagrams.

Spine: the problem (an annually-rotating volunteer board running on spreadsheets) →
the three surfaces → the Recognition Engine as the flagship flow → the authorization
chain → **the practices story** (computed review routing, the shell-enforced PR gate,
reviewer subagents) → what rotation-proofing actually required.

The practices story is the differentiated material for an engineering audience; the
React/Firebase stack is not.

Visual direction may be authored via Claude Design, drawing on
`docs/brand-research.md`, `docs/design-brief.md` and the `@luminova/ui` tokens.
DesignSync is **not** used here — it targets `@luminova/ui` components, not documents.

### Business track (Spanish) — parallel-safe

| Artifact | Path | Purpose |
|----------|------|---------|
| `resumen.md` | `docs/negocio/` | One page: three apps, three audiences, plain language. |
| `capacidades-por-rol.md` | `docs/negocio/` | What a President / Secretary / PM / Member can actually do today. |
| `impacto.md` | `docs/negocio/` | The buy-in doc: Recognition Engine, participation ledger, `/impacto`, Directiva showcase, leads capture — framed as what the chapter can now report upward. |
| `manual-administracion.md` | `docs/negocio/` | Non-technical runbook: invite a member, run a QR check-in, edit site config, publish an ally. |
| `hoja-de-ruta.md` | `docs/negocio/` | Roadmap as outcomes. No PR numbers, no `C1-lite` shorthand. |
| `costos-y-continuidad.md` | `docs/negocio/` | Firebase spend, who can deploy, where secrets live, bus factor. |

## Resolved gaps

Three gaps were raised on 2026-09-20. Defaults taken, revisable:

1. **Runbook screenshots** — authored with explicit marked slots
   (`<!-- SCREENSHOT: ... -->`) rather than blocking on capture. A later emulator-driven
   capture pass can fill them; the document is useful before that happens.
2. **Cost figures** — no access to Firebase billing. `costos-y-continuidad.md` carries
   a clearly marked data-needed block with the exact figures required, and the
   structure around it is complete.
3. **Business docs location** — `docs/negocio/` is the versioned source of truth;
   `resumen` and `impacto` are additionally published as Artifacts so the Directiva can
   read them without GitHub. Source in one place, distribution in another.

## Order of work

Phase 0 first — it is the only phase the others depend on. Phases 1, 2 and the business
track are independent of each other and parallel-safe once Phase 0 lands. Phase 3 is
last: the deck reuses Phase 0 diagrams and Phase 2 rationale.

Checkpoint commit per phase; no batch exceeds 10 modified files.

## Risks

| Risk | Mitigation |
|------|-----------|
| Docs drift from code, becoming the lie CLAUDE.md guardrail 6 warns about | Every artifact links to the live source rather than copying it; diagrams live next to the code they describe. |
| ADRs invent rationale | The sourcing rule above, enforced by citation. |
| The business track over-promises | `impacto.md` describes only shipped behaviour; roadmap items stay in `hoja-de-ruta.md`. |
| Runbook slots never get filled | Marked slots are greppable (`SCREENSHOT:`); a follow-up capture pass is a discrete task. |

## Review routing

Docs-only diff. The review router is run before the PR and whatever it prints is run
and stamped; this spec does not pre-judge the review set.
