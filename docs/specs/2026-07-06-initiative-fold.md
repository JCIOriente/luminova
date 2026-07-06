# Design — Fold `programs` + `projects` into one `initiative` code layer (audit item 7)

Status: proposed · Author: Claude (mastermind) · Date: 2026-07-06
Audit source: `docs/status/2026-07-02-full-audit.md` backlog row 7 (detail line 69)

## Problem

`apps/backstage/src/features/programs` and `apps/backstage/src/features/projects` are
byte-identical modulo a `Program`↔`Project` token swap. Inventory (two read-only agents)
confirmed **5 file pairs diff to empty** after a naming-normalized `diff`:

| programs | projects |
|---|---|
| `repositories/program-repository.ts` | `repositories/project-repository.ts` |
| `hooks/program-keys.ts` | `hooks/project-keys.ts` |
| `hooks/use-create-program.ts` | `hooks/use-create-project.ts` |
| `hooks/use-update-program.ts` | `hooks/use-update-project.ts` |
| `hooks/use-programs-by-term.ts` | `hooks/use-projects-by-term.ts` |

The only non-naming delta anywhere is a **doc-comment sentence** in
`packages/types/src/engine/program.ts:3` vs `project.ts:3` (Project mentions a pending
C2 dossier TODO). No code/behavior difference — both are `export type X = InitiativeCore`.

## Blast radius (verified, not assumed)

- **Only `apps/backstage` needs touching.**
  - **Spotlight** reads the projected world-readable `showcase` collection via
    `firebase/firestore/lite` — zero import coupling to backstage, no TanStack Query. No change.
  - **Beacon** reads `programs`/`projects` via admin SDK and is **already parameterized**
    (`initiativeTrigger(collection: "programs" | "projects")` at `apps/beacon/src/index.ts:130`).
    No change. (It is the model this fold imitates.)
  - **`@luminova/types`** already unified: `Program`/`Project` both alias `InitiativeCore`;
    `ProgramInput`/`ProjectInput` both alias `InitiativeInput`; one shared `initiativeDocSchema`,
    `programSchema`/`projectSchema` both re-export `initiativeFormSchema`. No change.
  - **`firestore.rules`** already unified: `initiativeCreateAllowed(kind)` /
    `initiativeUpdateAllowed(kind)` parameterized on the kind string. **No change** — in
    particular the audit-item-1 `featured` create-gate (rules ~165) is **preserved untouched**.

## Preserved invariants (do NOT flatten)

1. **Two distinct Firestore collections** `programs` + `projects` stay separate.
2. **Two showcase kinds** `Programa` / `Proyecto` (a single label ternary in shared UI +
   beacon projection) stay separate.
3. **Two routes** — already unified as `/initiatives` + `/initiatives/$type/$id` with a
   `type: "program" | "project"` URL param. No route file churn beyond hook-import swaps.
4. **Delete policy — CORRECTION to the task premise.** The brief said "programs/projects are
   hard-deletable by design; preserve the two-tier delete policy." Inventory found the
   opposite: **no delete method exists** in either repository (8 methods each: getByTerm,
   getById, create, update, complete, addPhoto, removePhoto, setCover, setCaption), and
   `firestore.rules` denies `delete: if false` for **both** collections (rules 194-200,
   364-368) — symmetric, same as members/positions/board. There is no hard-vs-soft
   divergence — which is exactly why audit line 77's "soft-delete divergence" is REFUTED.
   The fold therefore **adds no delete method and no soft-delete flag**; it preserves the
   current symmetric no-delete behavior. Outcome is identical to the brief's intent (no
   delete path added) but for the correct reason.

## Design — the folded layer (lives in `features/initiatives`)

### 1. One config source of truth — `initiatives/lib/initiative-kind.ts`

```ts
export type InitiativeType = "program" | "project";
export type InitiativeCollection = "programs" | "projects";

export interface InitiativeKindConfig {
  type: InitiativeType;
  kind: InitiativeKind;            // "Program" | "Project" — also the CASL subject + label key
  collection: InitiativeCollection;
}

export const INITIATIVE_CONFIG: Record<InitiativeType, InitiativeKindConfig> = {
  program: { type: "program", kind: "Program", collection: "programs" },
  project: { type: "project", kind: "Project", collection: "projects" },
};
```

`KIND` / `INITIATIVE_TYPE` maps currently in `use-initiative.ts` collapse into this.

### 2. One repository — `initiatives/repositories/initiative-repository.ts`

```ts
export class InitiativeRepository {
  private readonly collection: CollectionReference;
  constructor(collectionName: InitiativeCollection) {
    this.collection = collection(getFirebase().db, collectionName);
  }
  // the 8 methods verbatim from program-repository.ts, typed on
  // InitiativeCore / InitiativeInput (NOT Program/Project — removes the name dependency)
}
```

Class (not factory fn) to match the existing `new XRepository()` idiom → smallest call-site
diff. No `any`, no unjustified `as`. Type-safe on `InitiativeCollection` union.

### 3. One query-key factory — `initiatives/hooks/initiative-keys.ts`

```ts
export const initiativeKeys = (collection: InitiativeCollection) => ({
  all: [collection] as const,
  byTerm: (termId: string) => [collection, "term", termId] as const,
});
```

**Query-key isolation is the load-bearing correctness property.** The `collection` string is
the key HEAD, so `["programs","term",t]` and `["projects","term",t]` share no prefix →
TanStack prefix-match invalidation of one kind can never touch the other. Guarded by a
RED-first vitest (`initiative-keys.test.ts`) asserting: heads differ, equal the collection,
and neither `byTerm` key is a prefix of the other.

### 4. Parameterized hooks (replace the 6 per-kind hooks)

| new | replaces |
|---|---|
| `useCreateInitiative(type, termId)` | `useCreateProgram` + `useCreateProject` |
| `useUpdateInitiative(type, termId)` | `useUpdateProgram` + `useUpdateProject` |
| `useInitiativesByKind(type, termId, opts?)` | `useProgramsByTerm` + `useProjectsByTerm` |

Existing `use-initiatives-by-term.ts` (merge), `use-initiative.ts` (detail),
`use-initiative-photos.ts`, `use-complete-initiative.ts` lose their
`type === "program" ? …Program… : …Project…` ternaries and instead read
`INITIATIVE_CONFIG[type].collection` → `new InitiativeRepository(collection)` +
`initiativeKeys(collection)`. Hook call order stays stable (both kinds' hooks still called
unconditionally where they were).

### 5. Delete both shell folders

`features/programs/**` + `features/projects/**` (10 files) removed. `knip` must show zero new
unused exports after.

## Call-site rewiring (6 points)

Routes: `_app.initiatives.tsx`, `_app.initiatives_.$type.$id.tsx`, `_app.activities.tsx`,
`_app.activities_.$id.tsx`. Internal: `use-initiative-photos.ts`, `use-complete-initiative.ts`,
`use-initiative.ts`, `use-initiatives-by-term.ts`. All mechanical import/name swaps.

## Testing / guardrails

- RED-first `initiative-keys.test.ts` — cross-kind key isolation (proven RED against a
  naive shared-literal key factory).
- Round-trip type/behavior test: both kinds construct a repo + keys through the one layer,
  assert collection wiring + key namespace per kind.
- `pnpm --filter backstage typecheck` + `test` + `lint`; `knip` zero unused; prettier on
  every written file.
- `bundle-budget-watcher` after the batch (net-neutral-to-favorable — deleting duplication).

## Alternatives considered

- **Factory fn returning an object** vs class — class chosen: matches existing `new` idiom,
  minimal call-site churn.
- **Keep per-kind thin wrappers** re-exporting the folded layer — rejected: leaves the
  duplicate folders alive, defeats the dedup; knip would also flag them.
- **Fold into beacon-style `collection` param only (drop `type`)** — rejected: the UI/routes
  speak `type: "program"|"project"` (URL param); config maps `type`→`collection`/`kind` in
  one place, so both vocabularies coexist without scattering ternaries.
