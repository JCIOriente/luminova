# docs/

Reference material for Luminova. This page maps the directory — it does not restate
what the documents say.

**Coming from outside?** Start at the root [README](../README.md) for what Luminova is
and a quickstart, or [CONTRIBUTING](../CONTRIBUTING.md) for setup, conventions and the
quality gate. Those two are the front door; everything here is depth behind it.

## Living reference

Always describes the system as it is now. If one of these disagrees with a spec or a
status handoff, **this wins** — the others are historical.

| Doc | What it answers |
|---|---|
| [architecture.md](architecture.md) | What runs where, how a check-in becomes points, how a role becomes an enforced permission, what stands between an edit and production |
| [data-models.md](data-models.md) | Every Firestore collection, field by field, with its constraints |
| [features.md](features.md) | Acceptance criteria and UX flows, screen by screen |
| [firebase-setup.md](firebase-setup.md) | Console checklist, App Check, emulator setup |
| [ci-cd.md](ci-cd.md) | The pipeline, its trust model, validation and rollback runbooks |
| [performance.md](performance.md) | Bundle budgets, Core Web Vitals targets, the optimization playbook |
| [engineering-guardrails.md](engineering-guardrails.md) | The mistakes this repo has already made, each with the rule and the guard that came out of it |
| [reuse-first-ui.md](reuse-first-ui.md) | Colour tokens, the component quick-index, the pre-add checklist |
| [roadmap.md](roadmap.md) | What is planned, and why |

Read [engineering-guardrails.md](engineering-guardrails.md) before your first
substantial change. It is much cheaper than rediscovering those mistakes in review.

## Decisions

[decisions/](decisions/) — architecture decision records, one page each. README and
CONTRIBUTING explain *what* the system is and *how* to work on it; these explain **why**
the shape is what it is.

Every ADR cites the spec, handoff or commit it was derived from. Where the record does
not preserve the rationale, it says so rather than inventing one.

## Diagrams

[diagrams/](diagrams/) holds the Mermaid sources. All five are embedded in
[architecture.md](architecture.md) and render inline on GitHub.

| Diagram | Answers |
|---|---|
| [container.mmd](diagrams/container.mmd) | What runs where, and where the trust boundary sits |
| [checkin-points.mmd](diagrams/checkin-points.mmd) | How one check-in becomes a member's points |
| [authz.mmd](diagrams/authz.mmd) | How a role becomes an enforced permission |
| [data-model.mmd](diagrams/data-model.mmd) | Which collections exist and who may write them |
| [pipeline.mmd](diagrams/pipeline.mmd) | What stands between a local edit and production |

The fenced block in `architecture.md` is a **copy** of the `.mmd` file. Edit the source,
then re-embed — change only one and the two drift.

Note for editors: mermaid's `erDiagram` grammar rejects `%%` comments anywhere in the
block, unlike `flowchart` and `sequenceDiagram`. That is why `data-model.mmd` carries no
comment header and its write-tier commentary lives in `architecture.md` instead.

## Historical records

These are written once and **not** updated as the system moves on. They record what was
true and what was decided at a point in time.

| Path | Holds | Add when |
|---|---|---|
| [specs/](specs/) | Designs, `YYYY-MM-DD-<topic>-design.md` | Starting work that clears the spec threshold in `CLAUDE.md` |
| [plans/](plans/) | Implementation plans derived from a spec | Breaking a spec into executable steps |
| [status/](status/) | Handoffs — what shipped, what is still pending, what bit us | Finishing a workstream, or finding something the next person needs |

## Source material and process

| Path | Holds |
|---|---|
| [reference/](reference/) | External inputs the code must honour — JCI award criteria, the points matrix, dues config |
| [tooling/](tooling/) | Harness and skill history, Claude Design handoff notes |
| [negocio/](negocio/) | Spanish documentation for the Directiva — operating the platform, not building it |
| [superpowers/](superpowers/) | Specs and plans produced by the superpowers skill workflow |

## For the Directiva

[negocio/](negocio/) is written in Spanish for the people who run the chapter rather
than the codebase: what each role can do, how to perform the common admin tasks, what
the platform can report, and what it costs to keep running.

For a Spanish overview of the product itself, see [README.es.md](../README.es.md).
