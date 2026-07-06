# Handoff — Audit item 7: fold programs/projects into one initiative layer

Date: 2026-07-06 · Branch: `feat/initiative-merge` · PR: #137 · Status: OPEN
Design doc: `docs/specs/2026-07-06-initiative-fold.md`

## What shipped

The byte-identical `apps/backstage/src/features/{programs,projects}` feature folders
(1 repository class + `*-keys` + create/update/by-term hooks each — 10 files) were folded
into one parameterized layer under `features/initiatives`:

| New file | Role |
|---|---|
| `lib/initiative-kind.ts` | `INITIATIVE_CONFIG` (type→{type,kind,collection}) + `INITIATIVE_TYPE` (kind→type inverse) |
| `repositories/initiative-repository.ts` | `InitiativeRepository`, ctor takes `type`, resolves collection from config |
| `hooks/initiative-keys.ts` | `initiativeKeys(collection)` factory + relocated `initiativeDetailKey` |
| `hooks/use-create-initiative.ts` | replaces `useCreateProgram`/`useCreateProject` |
| `hooks/use-update-initiative.ts` | replaces update hooks; **also invalidates detail key** |
| `hooks/use-initiatives-of-type.ts` | single-kind list; replaces `use{Programs,Projects}ByTerm` |

Rewired consumers (7): `use-initiative.ts`, `use-initiatives-by-term.ts`,
`use-initiative-photos.ts`, `use-complete-initiative.ts`, `activity-detail-hero.tsx`,
routes `_app.initiatives.tsx` / `_app.initiatives_.$type.$id.tsx` / `_app.activities.tsx` /
`_app.activities_.$id.tsx`.

## Delta table — what defined the folded layer's parameters

Byte-diff of programs vs projects (naming-normalized `diff`) → **5 file pairs diff to empty**.
The ONLY real deltas, which became the layer's parameters:

| Delta | programs | projects | Folded into |
|---|---|---|---|
| Firestore collection | `"programs"` | `"projects"` | `INITIATIVE_CONFIG[type].collection` |
| Kind / CASL subject / label | `"Program"` | `"Project"` | `INITIATIVE_CONFIG[type].kind` |
| Query-key namespace | `["programs",…]` | `["projects",…]` | `initiativeKeys(collection)` (collection = key head) |
| Route/UI vocabulary | `"program"` | `"project"` | `INITIATIVE_CONFIG` key (`type`) |
| Doc-comment (types) | "distinct point codes" | "C2 dossier fields pending" | N/A — comment only, no code diff |

## Delete-policy note (CORRECTION to the task premise — read this)

The task brief asserted "programs/projects are hard-deletable by design; preserve the
two-tier delete policy." **Inventory found the opposite and the fold reflects the correct
read:** neither repository ever had a delete method (8 methods each), and `firestore.rules`
denies `delete: if false` for **both** `programs` (line ~368) and `projects` (line ~200) —
symmetric, same as members/positions/board. There is no hard-vs-soft divergence. This is
exactly why the audit's line-77 "soft-delete divergence" finding was **REFUTED**. The fold
adds **no** delete method and **no** soft-delete flag — preserving the current symmetric
no-delete behavior. Outcome matches the brief's intent (no delete path) for the correct reason.

## Consumers left un-migrated (deliberate — verified, not assumed)

- **Spotlight** — no change. Reads the projected world-readable `showcase` collection via
  `firebase/firestore/lite`; zero import coupling to backstage, no TanStack Query. It never
  touches `programs`/`projects` directly.
- **Beacon** — no change. Reads `programs`/`projects` via admin SDK and is **already
  parameterized** (`initiativeTrigger(collection: "programs"|"projects")`, `index.ts:130`).
  It is the model this fold imitated.
- **`@luminova/types`** — no change. `Program`/`Project` already alias `InitiativeCore`;
  `ProgramInput`/`ProjectInput` alias `InitiativeInput`; one shared `initiativeDocSchema`.
- **`firestore.rules`** — no change. `initiativeCreateAllowed`/`initiativeUpdateAllowed`
  already parameterized on kind. Audit-item-1 `featured` create-gate (line 165) preserved.

## Preserved invariants

Two collections · two showcase kinds · two routes · symmetric no-delete · item-1 featured gate.

## Review trail

- Opus factory-API review (APPROVE-WITH-CHANGES) — all applied: ctor takes `type` not raw
  collection; `initiativeDetailKey` relocated to `initiative-keys.ts`; detail-key
  invalidation added to update; 7th call site `activity-detail-hero.tsx` swept; kept two
  literal hook calls (rules-of-hooks) in the merge hook.
- `/simplify` (3 agents) — applied: collapsed redundant dual `useUpdateInitiative`
  instantiation in the detail route (type is statically known there); `INITIATIVE_TYPE[item.kind]`
  table lookup in the list route. Skipped: deriving `INITIATIVE_TYPE` from config (would add
  an `as` cast — kept the cast-free 2-entry map, guarded by the round-trip test).
- `/code-review high` (3 finder angles) — no correctness bugs. One conventions fix: documented
  the `InitiativeRepository` one-class-covers-two-collections exception in `apps/backstage/CLAUDE.md`.
- `/security-review` — clean. `firestore-security-reviewer` — SHIP (rules⇄repo aligned,
  delete-policy + item-1 gate preserved, cache namespace provably isolated).

## Guardrails / verification

- RED-first vitest: `initiative-keys.test.ts` (cross-kind key isolation, proven RED on missing
  module) + `initiative-kind.test.ts` (both-kind config round-trip).
- `pnpm --filter backstage run ci` — eslint + tsc + **447 tests** green.
- knip: zero NEW unused exports (pre-existing unused exports are all in untouched files).
- `pnpm pr-tests`: green end-to-end (exit 0 — turbo ci across all packages + node:test lock/rules suites).

## Follow-ups / next in chain

- Audit **item 8** — photo-stack dedup (`use-activity-photos`/`use-initiative-photos` ~90%
  shared + 3 storage upload/delete reimplementations → a generic `photo-storage.ts`). Touches
  Storage — mind the storage-delete rules gotcha (never gate Storage delete/write on
  `request.resource.*`). See the chaining prompt handed to the next session.
