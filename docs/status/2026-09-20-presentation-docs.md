# Presentation & onboarding documentation (status)

_Date: 2026-09-20 · Branch: `chore/presentation-docs` · Worktree: `.worktrees/presentation-docs` · PR: [#226](https://github.com/JCIOriente/luminova/pull/226)_

Goal: material for presenting the engineering to other developers, plus a Spanish set
for the Directiva.

## Shipped

- **`docs/diagrams/` — five Mermaid sources**, embedded into `architecture.md` in place
  of its ASCII art: `container.mmd` (the Admin-SDK trust boundary), `checkin-points.mmd`
  (the transactional recompute), `authz.mmd` (two claim streams into CASL, mirrored by
  the rules), `data-model.mmd` (ERD with write tiers), `pipeline.mmd` (three gates,
  keyless deploy). `architecture.md` also gained Authorization, Data Model and Delivery
  Pipeline sections.
- **`docs/decisions/` — ten ADRs + index.** README explains *what*, CONTRIBUTING
  explains *how*; nothing explained *why*. Each cites the spec, handoff or code it came
  from; two declare `rationale not recorded` rather than inventing a motivation.
- **`docs/README.md`** — a map of `docs/` itself: living reference vs. historical
  record, the diagram index, where `negocio/` fits. Deliberately not a second copy of
  CONTRIBUTING's doc table.
- **`docs/negocio/` — four Spanish docs** for the Directiva: `capacidades-por-rol.md`,
  `manual-administracion.md`, `impacto.md`, `costos-y-continuidad.md`.
- **Slides deck** (private Artifact, not in-repo — a public Apache-2.0 repo is the wrong
  home for a private link): <https://claude.ai/artifact/5VJdJvyADyz4RK843B6Vhg> —
  13 slides, built on the repo's own locked brand tokens.

## Verification

- **Mermaid v11 parser**, not a header regex: 5/5 `.mmd` sources parse, and 5/5 fenced
  blocks in `architecture.md` parse.
- **ADR citations:** 10 ADRs, 25 cited paths all exist, 2 declared unsourced.
- **Relative links:** 19 files, 77 links, zero broken.
- **Git-hook claim** (ADR 0010): no `.husky`, no `prepare` script, no husky dep, only
  `.sample` hooks — the "session hooks, not git hooks" statement is true.
- `pnpm format` clean · `pnpm run ci` **15/15 successful** (all cache hits, which is the
  proof a docs-only diff touches no CI input) · `pnpm knip` clean.
- `pnpm audit` fails on **15 pre-existing repo-wide advisories**; GitHub independently
  reports 14 on the default branch. Not introduced here — no dependency or lockfile
  change.
- Review router: `lighter review allowed (docs-only diff)`. `Review-Exception` and the
  gate table are in the PR body.

## Decisions / notes

- **Phase 1 (onboarding guide) cancelled mid-implementation.** The spec claimed "no
  onboarding path" and "nothing addressed to a non-engineer"; both were false, because
  the problem statement was written before reading the repository root. `README.md`,
  `README.es.md`, `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` all ship.
  `CONTRIBUTING.md` is the better guide — it has the Java 21+ emulator requirement, the
  `.env.local.example` files, the correct fresh-worktree build filter, and the honest
  note that `branch-guard.sh` only fires inside a Claude Code session.
  A draft `docs/onboarding.md` was written and **deleted before commit**: it contradicted
  CONTRIBUTING on the env values and described the hooks as blocking all contributors,
  which is the false-guard failure guardrail 6 names. Spec and plan amended in `09528dd`.
- **Business track re-scoped** against `README.es.md`: `resumen.md` and `hoja-de-ruta.md`
  dropped as redundant.
- **`erDiagram` rejects `%%` comments anywhere in the block**, unlike `flowchart` and
  `sequenceDiagram`. `data-model.mmd` would have shipped broken had it only been checked
  with a header regex; its tier commentary moved into `architecture.md`.
  `docs/README.md` records the constraint for future editors.
- **Role matrix taken from code, not the spec.** `BUILT_IN_ROLE_PERMS` carries
  `update:Showcase` on `ProjectManager`, which the table in
  `docs/specs/builtin-role-set.md` omits.
- **ADR 0005 corrected before merge.** An earlier draft asserted a production reseed
  incident "across five roles" — unsourced. Replaced with the mechanism as
  `docs/specs/position-assignment-lane.md` documents it.
- The mermaid validator ran from the scratchpad and was **not** added as a devDependency
  — dependency scope creep on a docs PR, and it would pull in `secure-dep-vetting`.

## Deferred

- **Runbook screenshots.** 10 greppable `<!-- SCREENSHOT: … -->` slots in
  `manual-administracion.md`. An emulator-driven capture pass is a discrete follow-up.
- **Firebase billing figures.** Not in the repo. `costos-y-continuidad.md` carries a
  marked **Datos pendientes** block naming exactly what is needed (plan, 3-month spend,
  whether a budget alert exists, custom domain).
- **Owner action, unrelated to this branch but surfaced by it:** configure a GCP budget
  alert on `jci-oriente`. It is free, and it is the only defence against a runaway gen2
  trigger loop — the single real billing risk.
