# Point Rules Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/point-rules` in `apps/backstage` — an Admin views the 16 fixed Mejor Miembro matrix rows for the current term and edits each row's points inline; a first-visit "Inicializar" action seeds the term + 16 rules.

**Architecture:** Amend the F3 `Term` (doc-id = year, nullable dates) and add `POINT_RULE_LABELS` in `@luminova/types`. New `point-rules` backstage feature (mapper + repository + hooks + table) mirroring members. Add `terms` to `firestore.rules` (`pointRules` already governed by F1). Admin gating via the existing `<Can>`/CASL `PointRule` subject.

**Tech Stack:** React 19, TanStack Router/Query, firebase 12, zod 4.4.3, `@luminova/types`, `@luminova/ui`, vitest 4 + RTL.

---

## File structure

```
packages/types/src/engine/
  term.ts                         # MODIFY: drop year, nullable dates
  point-rule.ts                   # MODIFY: + POINT_RULE_LABELS
  point-rule.test.ts              # CREATE: labels coverage
  eligibility.test.ts             # MODIFY: drop year from factory
  index.ts                        # MODIFY: export POINT_RULE_LABELS
firestore.rules                   # MODIFY: + terms block
tests/firestore-rules/rules.test.ts # MODIFY: + terms seed + describe
docs/data-models.md               # MODIFY: Term reshape note
apps/backstage/src/
  features/point-rules/
    lib/current-term.ts           # currentTermId(now?)
    lib/current-term.test.ts
    repositories/point-rule-mapper.ts        # toSeedRules / byMatrixOrder
    repositories/point-rule-mapper.test.ts
    repositories/point-rule-repository.ts     # getAllByTerm / seed / updatePoints
    hooks/point-rule-keys.ts
    hooks/use-point-rules.ts
    hooks/use-seed-point-rules.ts
    hooks/use-update-point-rule.ts
    components/point-rule-table.tsx
    components/point-rule-table.test.tsx
  routes/_app.point-rules.tsx     # route
  components/nav-config.ts         # MODIFY: + item, unions
  components/nav-config.test.ts    # MODIFY
```

---

## Task 1: Amend `Term` (doc-id = year, nullable dates)

**Files:**
- Modify: `packages/types/src/engine/term.ts`
- Modify: `packages/types/src/engine/eligibility.test.ts`

- [ ] **Step 1: Reshape `Term` in `term.ts`**

Replace the `Term` interface (keep `BoardSeat`, `TERM_STATUSES`, `TermStatus` unchanged):

```ts
/** Annual cycle (gestión). The doc id IS the year (e.g. `terms/2026`). */
export interface Term {
  id: string;
  label?: string;
  board: BoardSeat[];
  conventionDate: Timestamp | null; // unknown at term start
  pointsCutoffAt: Timestamp | null; // unknown at term start
  bestMemberId: string | null;
  status: TermStatus;
}
```

- [ ] **Step 2: Drop `year` from the `eligibility.test.ts` factory**

In `eligibility.test.ts`, the `term()` factory currently sets `year: 2026`. Remove that line. Also update the two `term({ id: "t2025", year: 2025, ... })` call sites to drop `year` (keep `id`):

```ts
function term(overrides: Partial<Term> = {}): Term {
  return {
    id: "t2026",
    board: [
      { memberId: "cel-1", title: "Presidenta", isExecutiveCommittee: true },
      { memberId: "dir-1", title: "Director de Proyectos", isExecutiveCommittee: false },
    ],
    conventionDate: ts,
    pointsCutoffAt: ts,
    bestMemberId: null,
    status: "Activo",
    ...overrides,
  };
}
```

And the two previous-term cases become `term({ id: "t2025", bestMemberId: "dir-1" })` and `term({ id: "t2025", bestMemberId: "someone-else" })`.

- [ ] **Step 3: Typecheck + test**

Run: `pnpm --filter @luminova/types exec tsc --noEmit && pnpm --filter @luminova/types exec vitest run src/engine/eligibility.test.ts`
Expected: PASS (8 tests; `year` no longer referenced anywhere).

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/engine/term.ts packages/types/src/engine/eligibility.test.ts
git commit -m "feat(types): Term doc-id = year (drop year field), nullable convention dates"
```

---

## Task 2: Add `POINT_RULE_LABELS` (TDD)

**Files:**
- Create: `packages/types/src/engine/point-rule.test.ts`
- Modify: `packages/types/src/engine/point-rule.ts`
- Modify: `packages/types/src/engine/index.ts`
- Modify: `packages/types/src/index.ts` (root barrel already does `export * from "./engine"` — verify `POINT_RULE_LABELS` flows through; no edit needed if so)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "./point-rule";

describe("POINT_RULE_LABELS", () => {
  it("has a non-empty Spanish label for every code", () => {
    for (const code of POINT_RULE_CODES) {
      expect(POINT_RULE_LABELS[code]).toBeTruthy();
      expect(typeof POINT_RULE_LABELS[code]).toBe("string");
    }
  });

  it("covers exactly the 16 codes (parallel to DEFAULT_POINT_VALUES)", () => {
    expect(Object.keys(POINT_RULE_LABELS).sort()).toEqual(Object.keys(DEFAULT_POINT_VALUES).sort());
  });

  it("matches the matrix wording for a sample", () => {
    expect(POINT_RULE_LABELS.DirectProgram).toBe("Dirección de programa");
    expect(POINT_RULE_LABELS.PaymentPlanAdhesion).toBe("Adhesión a un plan de pago");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/point-rule.test.ts`
Expected: FAIL — `POINT_RULE_LABELS` is not exported.

- [ ] **Step 3: Add `POINT_RULE_LABELS` to `point-rule.ts`**

Append after `DEFAULT_POINT_VALUES`:

```ts
/** Canonical Spanish matrix labels (parallel to DEFAULT_POINT_VALUES). */
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

- [ ] **Step 4: Export it from the engine barrel**

In `packages/types/src/engine/index.ts`, change the point-rule value export line to include the new const:

```ts
export { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "./point-rule";
```

(The root `src/index.ts` does `export * from "./engine"`, so it re-exports automatically.)

- [ ] **Step 5: Run test + full package CI**

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (eslint + tsc + all vitest, incl. the new 3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/engine/point-rule.ts packages/types/src/engine/point-rule.test.ts packages/types/src/engine/index.ts
git commit -m "feat(types): add POINT_RULE_LABELS matrix labels"
```

---

## Task 3: `terms` firestore rule + rules test

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Add the failing rules test**

In `rules.test.ts` beforeAll seed block (inside `withSecurityRulesDisabled`), add a seed term doc after the `pointRules/r1` line:

```ts
    await setDoc(doc(db, "terms/2026"), { status: "Activo" });
```

Add a new describe block after the `pointRules` describe:

```ts
describe("firestore.rules — terms", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "terms/2026")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "terms/2026")));
  });
  it("allows Admin to create a term", async () => {
    await assertSucceeds(setDoc(doc(as("u", ["Admin"]), "terms/2027"), { status: "Activo" }));
  });
  it("allows Admin to update a term", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "terms/2026"), { status: "Cerrado" }));
  });
  it("denies a non-Admin write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "terms/2028"), { status: "Activo" }));
  });
  it("denies delete even for Admin", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "terms/2026")));
  });
});
```

- [ ] **Step 2: Run rules tests to verify the new ones fail**

Run (an emulator must be on :4010; if not, start one): `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: the new `terms` tests FAIL (no rule yet → `terms` falls through to `deny all`, so reads/writes that should succeed fail).

- [ ] **Step 3: Add the `terms` rule**

In `firestore.rules`, add after the `pointRules` match block:

```
    match /terms/{termId} {
      allow read: if signedIn();
      allow create, update: if hasAnyRole(['Admin']);
      allow delete: if false;
    }
```

- [ ] **Step 4: Run rules tests to verify they pass**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (all rules tests, incl. the 6 new `terms` cases).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): terms collection — Admin write, signed-in read"
```

---

## Task 4: `currentTermId` helper (TDD)

**Files:**
- Create: `apps/backstage/src/features/point-rules/lib/current-term.ts`
- Test: `apps/backstage/src/features/point-rules/lib/current-term.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { currentTermId } from "./current-term";

describe("currentTermId", () => {
  it("returns the calendar year of the given date as a string", () => {
    expect(currentTermId(new Date("2026-06-06T12:00:00Z"))).toBe("2026");
    expect(currentTermId(new Date("2031-12-31T23:00:00Z"))).toBe("2031");
  });

  it("defaults to the current year", () => {
    expect(currentTermId()).toBe(String(new Date().getFullYear()));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/lib/current-term.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/** The active term id. v1 convention: the term doc id IS the calendar year. */
export function currentTermId(now: Date = new Date()): string {
  return String(now.getFullYear());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/lib/current-term.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/point-rules/lib/current-term.ts apps/backstage/src/features/point-rules/lib/current-term.test.ts
git commit -m "feat(backstage): currentTermId helper"
```

---

## Task 5: Point-rule mapper (TDD)

**Files:**
- Create: `apps/backstage/src/features/point-rules/repositories/point-rule-mapper.ts`
- Test: `apps/backstage/src/features/point-rules/repositories/point-rule-mapper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "@luminova/types";
import type { PointRule } from "@luminova/types";
import { toSeedRules, byMatrixOrder } from "./point-rule-mapper";

describe("toSeedRules", () => {
  it("produces 16 rules with matrix points, labels, deterministic ids and termId", () => {
    const rules = toSeedRules("2026");
    expect(rules).toHaveLength(16);
    const direct = rules.find((r) => r.code === "DirectProgram")!;
    expect(direct).toEqual({
      id: "2026__DirectProgram",
      termId: "2026",
      code: "DirectProgram",
      points: DEFAULT_POINT_VALUES.DirectProgram,
      label: POINT_RULE_LABELS.DirectProgram,
    });
  });

  it("covers every code exactly once", () => {
    const codes = toSeedRules("2026").map((r) => r.code).sort();
    expect(codes).toEqual([...POINT_RULE_CODES].sort());
  });
});

describe("byMatrixOrder", () => {
  it("sorts rules into POINT_RULE_CODES order regardless of input order", () => {
    const shuffled: PointRule[] = [
      { id: "x", termId: "2026", code: "AttendTM", points: 6, label: "TM" },
      { id: "y", termId: "2026", code: "DirectProgram", points: 10, label: "P" },
    ];
    expect(shuffled.slice().sort(byMatrixOrder).map((r) => r.code)).toEqual([
      "DirectProgram",
      "AttendTM",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/repositories/point-rule-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "@luminova/types";
import type { PointRule, PointRuleCode } from "@luminova/types";

/** The 16 rules to seed for a term, with deterministic ids (idempotent re-seed). */
export function toSeedRules(termId: string): PointRule[] {
  return POINT_RULE_CODES.map((code) => ({
    id: `${termId}__${code}`,
    termId,
    code,
    points: DEFAULT_POINT_VALUES[code],
    label: POINT_RULE_LABELS[code],
  }));
}

const ORDER = new Map<PointRuleCode, number>(POINT_RULE_CODES.map((code, i) => [code, i]));

/** Comparator that orders rules by their matrix position. */
export function byMatrixOrder(a: PointRule, b: PointRule): number {
  return (ORDER.get(a.code) ?? 0) - (ORDER.get(b.code) ?? 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/repositories/point-rule-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/point-rules/repositories/point-rule-mapper.ts apps/backstage/src/features/point-rules/repositories/point-rule-mapper.test.ts
git commit -m "feat(backstage): point-rule seed mapper + matrix-order comparator"
```

---

## Task 6: Point-rule repository

**Files:**
- Create: `apps/backstage/src/features/point-rules/repositories/point-rule-repository.ts`

No standalone test (mirrors `MemberRepository`, which is untested; its logic lives in the tested mapper). Verified via typecheck + the route/table tests.

- [ ] **Step 1: Implement the repository**

```ts
import { collection, doc, getDocs, query, where, writeBatch, updateDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { PointRule } from "@luminova/types";
import { toSeedRules, byMatrixOrder } from "./point-rule-mapper";

export class PointRuleRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "pointRules");

  /** Rules for a term, in matrix order. */
  async getAllByTerm(termId: string): Promise<PointRule[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PointRule, "id">) }))
      .sort(byMatrixOrder);
  }

  /** Bootstrap the term doc (if missing) + the 16 rules. Idempotent (deterministic ids). */
  async seed(termId: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(
      doc(this.db, "terms", termId),
      { status: "Activo", conventionDate: null, pointsCutoffAt: null, board: [], bestMemberId: null },
      { merge: true },
    );
    for (const rule of toSeedRules(termId)) {
      const { id, ...data } = rule;
      batch.set(doc(this.collection, id), data);
    }
    await batch.commit();
  }

  async updatePoints(id: string, points: number): Promise<void> {
    await updateDoc(doc(this.collection, id), { points });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/features/point-rules/repositories/point-rule-repository.ts
git commit -m "feat(backstage): PointRuleRepository (getAllByTerm/seed/updatePoints)"
```

---

## Task 7: Hooks

**Files:**
- Create: `apps/backstage/src/features/point-rules/hooks/point-rule-keys.ts`
- Create: `apps/backstage/src/features/point-rules/hooks/use-point-rules.ts`
- Create: `apps/backstage/src/features/point-rules/hooks/use-seed-point-rules.ts`
- Create: `apps/backstage/src/features/point-rules/hooks/use-update-point-rule.ts`

- [ ] **Step 1: Keys**

```ts
export const pointRuleKeys = {
  all: ["pointRules"] as const,
  byTerm: (termId: string) => ["pointRules", termId] as const,
};
```

- [ ] **Step 2: Query hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function usePointRules(termId: string) {
  return useQuery({
    queryKey: pointRuleKeys.byTerm(termId),
    queryFn: () => new PointRuleRepository().getAllByTerm(termId),
  });
}
```

- [ ] **Step 3: Seed mutation**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function useSeedPointRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (termId: string) => new PointRuleRepository().seed(termId),
    onSuccess: (_data, termId) =>
      queryClient.invalidateQueries({ queryKey: pointRuleKeys.byTerm(termId) }),
  });
}
```

- [ ] **Step 4: Update-points mutation**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function useUpdatePointRule(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, points }: { id: string; points: number }) =>
      new PointRuleRepository().updatePoints(id, points),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pointRuleKeys.byTerm(termId) }),
  });
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backstage/src/features/point-rules/hooks/
git commit -m "feat(backstage): point-rule query + seed + update hooks"
```

---

## Task 8: Point-rule table with inline edit (TDD)

**Files:**
- Create: `apps/backstage/src/features/point-rules/components/point-rule-table.tsx`
- Test: `apps/backstage/src/features/point-rules/components/point-rule-table.test.tsx`

The table is presentational: it takes `rules` + an `onSave(id, points)` callback and gates editing on `ability.can('update','PointRule')`. The route wires `onSave` to the mutation. This keeps the component free of query/mutation internals (testable like `MemberTable`).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import type { PointRule } from "@luminova/types";
import { PointRuleTable } from "./point-rule-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";

const rules: PointRule[] = [
  { id: "2026__DirectProgram", termId: "2026", code: "DirectProgram", points: 10, label: "Dirección de programa" },
  { id: "2026__AttendTM", termId: "2026", code: "AttendTM", points: 6, label: "Asistencia a TM (Local o Nacional)" },
];

function renderWith(roles: string[], ui: ReactElement) {
  return render(
    <AbilityProvider claims={{ roles }} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("PointRuleTable", () => {
  it("renders every rule label and points value", () => {
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    expect(screen.getByText("Dirección de programa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("saves the edited points for a row (Admin)", async () => {
    const onSave = vi.fn();
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={onSave} isSaving={false} />);
    const input = screen.getByLabelText(/puntos de dirección de programa/i);
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.click(screen.getByRole("button", { name: /guardar dirección de programa/i }));
    expect(onSave).toHaveBeenCalledWith("2026__DirectProgram", 12);
  });

  it("disables save when the value is unchanged or invalid", async () => {
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    const input = screen.getByLabelText(/puntos de dirección de programa/i);
    // unchanged -> no save button visible yet
    expect(screen.queryByRole("button", { name: /guardar dirección de programa/i })).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "-3");
    expect(screen.getByRole("button", { name: /guardar dirección de programa/i })).toBeDisabled();
  });

  it("renders read-only for a role without update access", () => {
    renderWith(["Treasury"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    expect(screen.queryByLabelText(/puntos de dirección de programa/i)).toBeNull();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/components/point-rule-table.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the table**

```tsx
import { useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Input, Button } from "@luminova/ui";
import { pointRuleSchema } from "@luminova/types";
import type { PointRule } from "@luminova/types";
import { useAbility } from "../../../lib/authz/ability-context";

interface PointRuleTableProps {
  rules: PointRule[];
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}

const pointsSchema = pointRuleSchema.shape.points;

export function PointRuleTable({ rules, onSave, isSaving }: PointRuleTableProps) {
  const ability = useAbility();
  const canEdit = ability.can("update", "PointRule");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Regla</TableHead>
          <TableHead>Puntos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <PointRuleRow key={rule.id} rule={rule} canEdit={canEdit} onSave={onSave} isSaving={isSaving} />
        ))}
      </TableBody>
    </Table>
  );
}

function PointRuleRow({
  rule,
  canEdit,
  onSave,
  isSaving,
}: {
  rule: PointRule;
  canEdit: boolean;
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState(String(rule.points));

  if (!canEdit) {
    return (
      <TableRow>
        <TableCell>{rule.label}</TableCell>
        <TableCell>{rule.points}</TableCell>
      </TableRow>
    );
  }

  const parsed = pointsSchema.safeParse(Number(value));
  const changed = value.trim() !== "" && Number(value) !== rule.points;
  const valid = parsed.success;

  return (
    <TableRow>
      <TableCell>{rule.label}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            className="w-24"
            value={value}
            aria-label={`Puntos de ${rule.label}`}
            onChange={(e) => setValue(e.target.value)}
          />
          {changed && (
            <Button
              size="sm"
              disabled={!valid || isSaving}
              aria-label={`Guardar ${rule.label}`}
              onClick={() => valid && onSave(rule.id, parsed.data)}
            >
              Guardar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
```

If `Button` has no `size` prop, drop it. Confirm prop names against `packages/ui/src/components/button.tsx` and `input.tsx` before finalizing.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/point-rules/components/point-rule-table.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/point-rules/components/point-rule-table.tsx apps/backstage/src/features/point-rules/components/point-rule-table.test.tsx
git commit -m "feat(backstage): PointRuleTable with Admin-gated inline points edit"
```

---

## Task 9: Route `/point-rules`

**Files:**
- Create: `apps/backstage/src/routes/_app.point-rules.tsx`

Mirror the structure of `_app.members.tsx` (PageHeader + states). Read `PageHeader` props from `apps/backstage/src/components/page-header.tsx` first to match the eyebrow/title API.

- [ ] **Step 1: Implement the route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Button, EmptyState, Icon } from "@luminova/ui";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../features/point-rules/lib/current-term";
import { usePointRules } from "../features/point-rules/hooks/use-point-rules";
import { useSeedPointRules } from "../features/point-rules/hooks/use-seed-point-rules";
import { useUpdatePointRule } from "../features/point-rules/hooks/use-update-point-rule";
import { PointRuleTable } from "../features/point-rules/components/point-rule-table";

export const Route = createFileRoute("/_app/point-rules")({
  component: PointRulesPage,
});

function PointRulesPage() {
  const termId = currentTermId();
  const { data: rules, isLoading, isError } = usePointRules(termId);
  const seed = useSeedPointRules();
  const update = useUpdatePointRule(termId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Reconocimiento" title="Reglas de puntos" />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar las reglas.</p>}
      {rules && rules.length === 0 && (
        <EmptyState
          title={`No hay reglas de puntos para ${termId}.`}
          description="Inicializa la matriz del Mejor Miembro Individual para esta gestión."
          action={
            <Can I="create" a="PointRule">
              <Button onClick={() => seed.mutate(termId)} disabled={seed.isPending}>
                <Icon name="plus" /> Inicializar
              </Button>
            </Can>
          }
        />
      )}
      {rules && rules.length > 0 && (
        <PointRuleTable
          rules={rules}
          isSaving={update.isPending}
          onSave={(id, points) => update.mutate({ id, points })}
        />
      )}
    </div>
  );
}
```

Confirm `Can` is exported from `lib/authz/ability-context` (the member route imports it from there) and that `PageHeader` accepts `eyebrow`/`title`. Adjust to the real props if they differ.

- [ ] **Step 2: Regenerate the route tree + typecheck**

Run: `pnpm --filter backstage build`
Expected: `routeTree.gen.ts` regenerates to include `/_app/point-rules`; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/routes/_app.point-rules.tsx apps/backstage/src/routeTree.gen.ts
git commit -m "feat(backstage): /point-rules route"
```

---

## Task 10: Sidebar nav entry (TDD)

**Files:**
- Modify: `apps/backstage/src/components/nav-config.ts`
- Modify: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Update the failing test**

Change the two assertions that enumerate paths/groups:

```ts
  it("only lists routes that exist today", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual(["/", "/members", "/allies", "/point-rules"]);
  });
```

Add a case:

```ts
  it("gates point rules on the PointRule subject", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === "/point-rules");
    expect(item?.subject).toBe("PointRule");
    expect(item?.label).toBe("Reglas de puntos");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/components/nav-config.test.ts`
Expected: FAIL — `/point-rules` not in NAV_GROUPS.

- [ ] **Step 3: Update `nav-config.ts`**

Extend the unions and add the item to the "Gestión" group:

```ts
export interface NavItem {
  to: "/" | "/members" | "/allies" | "/point-rules";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?: "Member" | "Ally" | "PointRule";
}
```

In `NAV_GROUPS`, add to the "Gestión" group's items array:

```ts
      { to: "/point-rules", label: "Reglas de puntos", icon: "target", subject: "PointRule" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/components/nav-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/nav-config.ts apps/backstage/src/components/nav-config.test.ts
git commit -m "feat(backstage): sidebar entry for point rules (Admin-gated)"
```

---

## Task 11: Update `docs/data-models.md` (Term reshape)

**Files:**
- Modify: `docs/data-models.md`

- [ ] **Step 1: Update the `terms/{termId}` block in the Recognition Engine section**

In the `### terms/{termId}` snippet, remove the `year: number` line, change the doc-id comment to note the id IS the year, and make the two dates nullable:

```typescript
interface Term {
  id: string                     // doc id IS the year, e.g. "2026"
  label?: string                 // e.g. "Gestión 2026"
  board: BoardSeat[]
  conventionDate: Timestamp | null // unknown at term start
  pointsCutoffAt: Timestamp | null // unknown at term start
  bestMemberId: string | null
  status: 'Activo' | 'Cerrado'
}
```

Add a line under the firestore.rules table noting `terms` now ships (Admin write, signed-in read) and `pointRules` write is Admin (both live as of A1).

- [ ] **Step 2: Commit**

```bash
git add docs/data-models.md
git commit -m "docs(data-models): Term doc-id=year + nullable dates; terms/pointRules rules live"
```

---

## Task 12: Full verification

- [ ] **Step 1: Package + app CI**

Run: `pnpm --filter @luminova/types run ci && pnpm --filter backstage run ci`
Expected: both PASS (types incl. labels test; backstage incl. mapper/current-term/table/nav tests).

- [ ] **Step 2: Rules tests against the live emulator**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 GCLOUD_PROJECT=demo-rules-test pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (incl. new `terms` cases).

- [ ] **Step 3: Format + knip + audit**

Run: `pnpm format && pnpm knip && pnpm audit --audit-level=high`
Expected: format clean; knip exit 0 (new feature files are reachable via the route); audit exit 0 (1 moderate pre-existing is below the high threshold).

- [ ] **Step 4: Security review**

Dispatch `/security-review` on the diff and the `firestore-security-reviewer` subagent (rules + repository touched). Fix any finding ≥ High in-branch.

- [ ] **Step 5: Manual emulator e2e (optional but recommended)**

With emulators + `backstage dev` running and an Admin-claim user: visit `/point-rules` → "Inicializar" seeds 16 rows + `terms/{year}` → edit a points value → reload persists. Confirm a non-Admin doesn't see the nav item.

- [ ] **Step 6: Update memory**

Update `project-luminova-v2.md` with an A1-done entry (point-rules feature, Term reshape, POINT_RULE_LABELS, terms rule, deferred Term admin).

---

## Self-review

**Spec coverage:** Term reshape (T1) ✓; POINT_RULE_LABELS (T2) ✓; terms rule + tests (T3); pointRules rule pre-existing (noted) ✓; currentTermId (T4) ✓; seed mapper + deterministic ids + matrix order (T5) ✓; repository getAllByTerm/seed/updatePoints (T6) ✓; hooks (T7) ✓; inline points edit, Can-gated, points-only via `pointRuleSchema.shape.points` (T8) ✓; route with EmptyState→Initialize gated by `<Can create PointRule>` (T9) ✓; nav entry Admin-gated by subject (T10) ✓; data-models doc (T11) ✓; security review (T12) ✓.

**Placeholder scan:** Tasks 6/8/9 ask the engineer to confirm `Button`/`Input`/`PageHeader`/`Can` prop names against the real source — that's verification of an existing interface, not a missing-content placeholder; the code blocks are complete and runnable as written if the props match (they follow the members feature, which uses the same components). No "TODO"/"TBD".

**Type consistency:** `toSeedRules`/`byMatrixOrder`, `PointRuleRepository.{getAllByTerm,seed,updatePoints}`, `pointRuleKeys.byTerm`, `usePointRules`/`useSeedPointRules`/`useUpdatePointRule`, `PointRuleTable` props (`rules`/`onSave`/`isSaving`), `currentTermId` — all names consistent across tasks. `PointRule` shape (`id`/`termId`/`code`/`points`/`label`) matches `@luminova/types`. `subject: "PointRule"` matches the CASL `Subject` union.
```
