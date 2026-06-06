# A1 — Point Rules Admin — Design

_Date: 2026-06-06 · Branch: `feat/point-rules-admin` · Status: approved_

## Goal

A backstage admin surface to **view and tune the Mejor Miembro Individual point
matrix** (`docs/reference/points-matrix.md`). An Admin opens `/point-rules`,
sees the 16 fixed matrix rows for the current term, and edits each row's **points**
value inline. First in the Recognition Engine §A slice; consumes the F3 model
(`@luminova/types` `PointRule` / `PointRuleCode` / `DEFAULT_POINT_VALUES`).

**Not** general CRUD: `PointRuleCode` is a fixed 16-value enum, so this is
**seed-the-16 → list → edit-points**. No add/delete; labels are fixed.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Term identity | **Doc id = year** (`terms/2026`); `Term.year` field **dropped** (redundant); `conventionDate`/`pointsCutoffAt` → **nullable** (unknown at term start). |
| Term context | **Bootstrap a current-year Term** — `seed` ensures `terms/{year}` exists; no Term admin UI yet. Current term = `String(new Date().getFullYear())`. |
| Seeding | **Explicit "Inicializar" action** in an `EmptyState` (Admin-gated). Creates term + 16 rules from `DEFAULT_POINT_VALUES` + `POINT_RULE_LABELS`. No write-on-read. |
| Edit scope | **Points only** (int ≥ 0); label fixed/read-only (derived from the matrix). |
| Edit UX | **Inline per-row** points input with a save (✓) affordance; Admin-gated via `<Can I="update" a="PointRule">`. |
| Auth | `PointRule` subject already exists; Admin `manage all` covers it. **No `@luminova/auth` change.** |

## `@luminova/types` amendment (F3 follow-up)

`PointRule`/`PointRuleCode`/`DEFAULT_POINT_VALUES` already shipped (F3). This adds:

1. **`Term` reshape** (`packages/types/src/engine/term.ts`):
   - Remove `year: number` (the doc id is the year).
   - `conventionDate: Timestamp | null`, `pointsCutoffAt: Timestamp | null`.
   - Keep `id`, `label?`, `board`, `bestMemberId`, `status`.
   - Update `eligibility.test.ts` term factory (drop `year`).
2. **`POINT_RULE_LABELS`** (`packages/types/src/engine/point-rule.ts`): a pure
   `Record<PointRuleCode, string>` of the canonical Spanish matrix labels, parallel
   to `DEFAULT_POINT_VALUES`. Exported from the root + `./engine` barrels. Used by
   seeding (and available to A2/A5 later).

```ts
export const POINT_RULE_LABELS: Record<PointRuleCode, string> = {
  DirectProgram: "Dirección de programa",
  CoDirectProgram: "Codirección de programa",
  DirectProject: "Dirección de proyecto",
  CoDirectProject: "Codirección de proyecto",
  DirectActivity: "Dirección de actividad",
  CoDirectActivity: "Codirección de actividad",
  ProgramProjectTeam: "Equipo de programa o proyecto",
  AttendAssembly: "Asistencia a asamblea",
  AttendCourse: "Asistencia a curso oficial o libre",
  AttendActivity: "Asistencia a actividad o proyecto",
  AttendNationalEvent: "Asistencia a evento nacional",
  AttendAnniversary: "Asistencia a aniversario (Local o Nacional)",
  AttendTM: "Asistencia a TM (Local o Nacional)",
  HeadTrainer: "Fungir como Head Trainer",
  AssistantTrainer: "Fungir como Assistant Trainer",
  PaymentPlanAdhesion: "Adhesión a un plan de pago",
};
```

## firestore.rules

`pointRules` is **already governed** (F1: `read: signedIn()`, `create, update:
hasAnyRole(['Admin'])`, `delete: if false`). Add the **`terms`** collection:

```
match /terms/{termId} {
  allow read: if signedIn();
  allow create, update: if hasAnyRole(['Admin']);
  allow delete: if false;
}
```

Rules tests (`tests/firestore-rules`): Admin can create/update a term; a non-Admin
signed-in user is denied; any signed-in user can read; delete denied. (pointRules
already covered by F1 tests.)

## Backstage feature — `apps/backstage/src/features/point-rules/`

```
lib/current-term.ts            # currentTermId(now?) -> String(year)
repositories/
  point-rule-mapper.ts         # toSeedRules(termId) -> SeededRule[] (pure)
  point-rule-repository.ts      # getAllByTerm / seed / updatePoints
hooks/
  point-rule-keys.ts            # ['pointRules', termId]
  use-point-rules.ts            # query
  use-seed-point-rules.ts       # mutation
  use-update-point-rule.ts       # mutation (points only)
components/
  point-rule-table.tsx          # inline points edit, Can-gated
```

**`point-rule-mapper.ts` (pure):** `toSeedRules(termId)` maps each `POINT_RULE_CODES`
entry to `{ id: ${termId}__${code}, termId, code, points: DEFAULT_POINT_VALUES[code],
label: POINT_RULE_LABELS[code] }`. Deterministic ids make seeding idempotent.

**`point-rule-repository.ts`:**
- `getAllByTerm(termId): Promise<PointRule[]>` — `where('termId','==',termId)`;
  return sorted by `POINT_RULE_CODES` index (matrix order).
- `seed(termId): Promise<void>` — one `writeBatch`: `set(terms/{termId},
  {status:'Activo', conventionDate:null, pointsCutoffAt:null, board:[],
  bestMemberId:null}, {merge:true})` + `set(pointRules/{id}, rule)` for each of the
  16 (deterministic ids → re-init is safe).
- `updatePoints(id, points): Promise<void>` — `updateDoc(pointRules/{id},{points})`.

**Hooks:** mirror members — `pointRuleKeys.byTerm(termId)`; `usePointRules(termId)`
queries; `useSeedPointRules` + `useUpdatePointRule` invalidate `byTerm` on success.

**`point-rule-table.tsx`:** `Table` with columns **Regla** (label, read-only) and
**Puntos**. Points cell: if `ability.can('update','PointRule')`, render an editable
number `Input` seeded from the row value; a ✓ save button appears when the value
changes and is valid (`pointRuleSchema.shape.points.safeParse`), calling
`useUpdatePointRule`; ✗/blur reverts. Non-admins see a plain number. Rows render in
matrix order.

## Route + navigation

- **`routes/_app.point-rules.tsx`:** `const termId = currentTermId();`
  `usePointRules(termId)`. Loading → skeleton/“Cargando…”; error → message; empty →
  `<EmptyState>` ("No hay reglas de puntos para {termId}.") with an "Inicializar"
  action gated `<Can I="create" a="PointRule">` → `seedPointRules.mutate(termId)`;
  otherwise `<PointRuleTable rules termId>`. `PageHeader` eyebrow like members/allies.
- **`components/nav-config.ts`:** add `{ to: "/point-rules", label: "Reglas de
  puntos", icon: "target", subject: "PointRule" }` to the "Gestión" group; extend the
  `NavItem.to` union and `NavItem.subject` union (`"PointRule"`). The sidebar already
  filters by `ability.can('read', subject)`, so the item is Admin-only (only Admin has
  PointRule ability). Update `nav-config.test.ts`.

A non-Admin who deep-links `/point-rules` can read the rubric (rules allow signed-in
read) but sees no edit controls and cannot write (rules deny).

## Testing strategy

- **mapper:** 16 rules, correct points (matches `DEFAULT_POINT_VALUES`), correct
  labels, deterministic ids, all `termId` set.
- **repository:** unit via mocked firestore boundary (the members repo has no repo
  test, but the mapper + hooks are tested) — cover `getAllByTerm` sort order and
  `updatePoints`/`seed` payloads through the mapper + a thin firestore mock if
  practical; otherwise assert the pure mapper + hook wiring.
- **table:** renders 16 rows in matrix order; Admin sees editable input + save path
  (mock mutation); non-admin sees read-only; invalid points disables save.
- **nav-config:** the new item is present with `subject: "PointRule"`.
- **rules tests:** `terms` create/update Admin-only, read signed-in, delete denied.
- Gates: `pnpm --filter backstage run ci`, `pnpm --filter @luminova/types run ci`,
  rules tests, `/security-review` + `firestore-security-reviewer`, `pnpm pr-tests`.

## Out of scope / deferred

- Full **Term admin** (board roster, convention dates, closing a term, multi-term
  selection) — A1 only bootstraps a single active current-year term.
- **Label editing**, points **history/audit**, change-notification (matrix's 7-day
  notice rule) — future.
- **A2** `awardPoints` consumption of these rules (separate slice).
- Member-facing **rubric visibility** (A5/A6 decide whether members see point rules).
