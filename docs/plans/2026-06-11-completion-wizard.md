# Completion Wizard Implementation Plan (C1-lite slice 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a 2-step completion wizard the only path to `status: Finalizado` on a Program/Project, writing the completion trio (`status` + `impact` + `finalReport`) atomically, server-enforced by a new firestore rule.

**Architecture:** New `CompletionWizard` (RHF + Zod, stepped Sheet) writes the trio via a new repository `complete()` method (replacing dead `fileFinalReport`) behind a `useCompleteInitiative` hook. The initiative edit form drops `Finalizado` from its status options and renders a locked read-only pill once a report is filed (reopen-block). `firestore.rules` gains `status == "Finalizado" ⇒ finalReport != null` on the initiative update path, with rules-tests.

**Tech Stack:** React 19, TanStack Router/Query v5, React Hook Form + Zod, `@luminova/ui` Sheet/Field/Input/Textarea/Button, Firebase Firestore client, `@firebase/rules-unit-testing` (vitest).

---

## Context the engineer needs

- The impact Zod schema **already exists** — `initiativeImpactSchema` / `InitiativeImpactInput` in `packages/types/src/engine/initiative-schema.ts`. Shape: `{ personsImpacted: number(int≥0), volunteers: number(int≥0), custom: {label,value}[], closingSummary: string(min 10) }`. Do **not** redefine it.
- `InitiativeImpact` type + `ImpactMetric` live in `packages/types/src/engine/initiative.ts`.
- `InitiativeCompleted` (`apps/backstage/src/features/initiatives/components/initiative-completed.tsx`) already renders a filed impact. The wizard produces exactly what it displays. Do not touch it.
- CASL `update` on `Program`/`Project` is granted only to `Admin`/`ProjectManager` (`packages/auth/src/ability.ts`). Direction (director/co-directors) is **not** encoded in CASL — it is computed client-side from `item.directionUids.includes(uid)`. The completion permission set mirrors `firestore.rules` `initiativeUpdateAllowed()` = `Admin ∪ ProjectManager ∪ isDirection`.
- Auth uid: `useAuth()` from `apps/backstage/src/lib/auth/auth.ts` returns `{ status, user, claims }`; `user?.uid` is the firebase uid (used for `finalReport.filedBy` and the `isDirection` check).
- Detail route already wires `useUpdateProgram` / `useUpdateProject` and an edit `Sheet`. Mirror that pattern for the completion `Sheet`.
- The existing `update()` path maps form-owned fields only (`toInitiativeUpdateDoc`) — it cannot carry `impact`/`finalReport`. That is why completion needs its own `complete()` method, not a reuse of `update()`.

## File map

| File | Responsibility | Action |
|------|----------------|--------|
| `firestore.rules` | `finalizedRequiresReport()` + wire into `initiativeUpdateAllowed()` | Modify |
| `tests/firestore-rules/rules.test.ts` | rules-tests for the new invariant | Modify |
| `apps/backstage/src/features/programs/repositories/program-repository.ts` | `complete()` replaces `fileFinalReport()` | Modify |
| `apps/backstage/src/features/projects/repositories/project-repository.ts` | `complete()` replaces `fileFinalReport()` | Modify |
| `apps/backstage/src/features/initiatives/hooks/use-complete-initiative.ts` | mutation hook (picks repo by type, invalidates key) | Create |
| `apps/backstage/src/features/initiatives/components/completion-wizard.tsx` | stepped wizard UI | Create |
| `apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx` | wizard validation + submit tests | Create |
| `apps/backstage/src/components/initiative-form.tsx` | drop `Finalizado` option + `lockStatus` reopen-block | Modify |
| `apps/backstage/src/components/initiative-form.test.tsx` | cover lock + dropped option | Modify |
| `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx` | Finalizar action + wizard Sheet + `isDirection` gate + `lockStatus` wiring | Modify |

---

## Task 1: Firestore rule — `Finalizado ⇒ finalReport != null`

**Files:**
- Modify: `firestore.rules` (functions block ~39-110)
- Test: `tests/firestore-rules/rules.test.ts` (describe "initiative direction branch", ~419-520; fixtures ~55-81)

- [ ] **Step 1: Write the failing rules-tests** — append inside the `describe("firestore.rules — initiative direction branch", …)` block in `tests/firestore-rules/rules.test.ts`:

```ts
  it("lets direction complete with the full trio", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "owner-uid" },
        impact: { personsImpacted: 120, volunteers: 8, custom: [], closingSummary: "Cerrado con éxito." },
      }),
    );
  });
  it("denies setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies Admin setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies completing a program without a finalReport (mirrored)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { status: "Finalizado" }),
    );
  });
```

- [ ] **Step 2: Run to verify they fail** — free port 4010 first (`lsof -ti tcp:4010 | xargs kill` if a stray emulator is up), then:

Run: `pnpm --filter @luminova/firestore-rules-tests test`
Expected: the 3 `denies …` cases FAIL (rule not present yet — `Finalizado` without report currently succeeds via direction/Admin).

- [ ] **Step 3: Add the rule** — in `firestore.rules`, add this function next to `initiativeWriteSafe()` (~46):

```
    // The completion trio is written atomically by the wizard; a bare status flip to
    // Finalizado (no report) would orphan child-activity point confirmation. Enforce
    // the report is present in the same write. Create already forbids Finalizado.
    function finalizedRequiresReport() {
      return request.resource.data.get('status', '') != 'Finalizado'
        || request.resource.data.get('finalReport', null) != null;
    }
```

Then extend `initiativeUpdateAllowed()` (~107):

```
    function initiativeUpdateAllowed() {
      return (hasAnyRole(['Admin', 'ProjectManager']) || isDirection())
        && initiativeWriteSafe()
        && finalizedRequiresReport();
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @luminova/firestore-rules-tests test`
Expected: all green, including the 4 new cases and the pre-existing "lets a direction uid update status" (sets `Planificacion`, unaffected).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(backstage): enforce Finalizado requires finalReport in rules"
```

---

## Task 2: Repository `complete()` replaces `fileFinalReport()`

**Files:**
- Modify: `apps/backstage/src/features/programs/repositories/program-repository.ts:44-53`
- Modify: `apps/backstage/src/features/projects/repositories/project-repository.ts:44-53`

- [ ] **Step 1: Replace in `project-repository.ts`** — swap the `fileFinalReport` method for:

```ts
  /** The completion wizard's atomic trio write — the engine confirmation gate. */
  async complete(id: string, impact: InitiativeImpactInput, uid: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      status: "Finalizado",
      impact,
      finalReport: { filedAt: serverTimestamp(), filedBy: uid },
    });
  }
```

Add `InitiativeImpactInput` to the type import: `import type { Project, ProjectInput, InitiativeImpactInput } from "@luminova/types";`. `getDoc`/`getById` stay (used by detail route); `serverTimestamp` stays.

- [ ] **Step 2: Replace in `program-repository.ts`** — identical method (collection is `programs`), import `InitiativeImpactInput` alongside `Program, ProgramInput`.

- [ ] **Step 3: Confirm no orphan callers**

Run: `grep -rn "fileFinalReport" apps packages tests --include="*.ts" --include="*.tsx"`
Expected: no matches.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/programs/repositories/program-repository.ts apps/backstage/src/features/projects/repositories/project-repository.ts
git commit -m "feat(backstage): repository complete() trio write, drop dead fileFinalReport"
```

---

## Task 3: `useCompleteInitiative` hook

**Files:**
- Create: `apps/backstage/src/features/initiatives/hooks/use-complete-initiative.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InitiativeImpactInput } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import { programKeys } from "../../programs/hooks/program-keys";
import { projectKeys } from "../../projects/hooks/project-keys";
import type { InitiativeType } from "./use-initiative";

export function useCompleteInitiative(type: InitiativeType, termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, impact, uid }: { id: string; impact: InitiativeImpactInput; uid: string }) =>
      type === "program"
        ? new ProgramRepository().complete(id, impact, uid)
        : new ProjectRepository().complete(id, impact, uid),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: type === "program" ? programKeys.byTerm(termId) : projectKeys.byTerm(termId),
      }),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/features/initiatives/hooks/use-complete-initiative.ts
git commit -m "feat(backstage): useCompleteInitiative mutation hook"
```

---

## Task 4: `CompletionWizard` component (stepped, TDD)

**Files:**
- Create: `apps/backstage/src/features/initiatives/components/completion-wizard.tsx`
- Test: `apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx`

Props contract:

```ts
interface CompletionWizardProps {
  initiativeLabel: string;             // "proyecto" | "programa" for copy
  isSaving: boolean;
  onComplete: (impact: InitiativeImpactInput) => void;
}
```

Behaviour: step 1 = `closingSummary` textarea + "Siguiente" (validates only `closingSummary` via `form.trigger`, advances on success). Step 2 = `personsImpacted` + `volunteers` number inputs + repeatable custom `{label,value}` rows (`useFieldArray`) + "Atrás"/"Finalizar". Submit calls `onComplete(values)`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompletionWizard } from "./completion-wizard";

function renderWizard(onComplete = vi.fn()) {
  render(<CompletionWizard initiativeLabel="proyecto" isSaving={false} onComplete={onComplete} />);
  return onComplete;
}

describe("CompletionWizard", () => {
  it("blocks advancing to step 2 until closingSummary is valid", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(await screen.findByText(/mínimo 10 caracteres/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/personas impactadas/i)).not.toBeInTheDocument();
  });

  it("submits the full impact trio including a custom metric", async () => {
    const user = userEvent.setup();
    const onComplete = renderWizard();
    await user.type(screen.getByLabelText(/resumen de cierre/i), "Cerramos con gran impacto.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.type(screen.getByLabelText(/personas impactadas/i), "120");
    await user.type(screen.getByLabelText(/voluntarios/i), "8");
    await user.click(screen.getByRole("button", { name: /agregar métrica/i }));
    await user.type(screen.getByLabelText(/etiqueta/i), "Juguetes entregados");
    await user.type(screen.getByLabelText(/valor/i), "1.200");
    await user.click(screen.getByRole("button", { name: /finalizar/i }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        closingSummary: "Cerramos con gran impacto.",
        personsImpacted: 120,
        volunteers: 8,
        custom: [{ label: "Juguetes entregados", value: "1.200" }],
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/initiatives/components/completion-wizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the wizard**

```tsx
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Textarea } from "@luminova/ui";
import { initiativeImpactSchema, type InitiativeImpactInput } from "@luminova/types";

interface CompletionWizardProps {
  initiativeLabel: string;
  isSaving: boolean;
  onComplete: (impact: InitiativeImpactInput) => void;
}

const EMPTY: InitiativeImpactInput = {
  closingSummary: "",
  personsImpacted: 0,
  volunteers: 0,
  custom: [],
};

export function CompletionWizard({ initiativeLabel, isSaving, onComplete }: CompletionWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const {
    register,
    control,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<InitiativeImpactInput>({
    resolver: zodResolver(initiativeImpactSchema),
    defaultValues: EMPTY,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "custom" });

  const goNext = async () => {
    if (await trigger("closingSummary")) setStep(2);
  };

  return (
    <form onSubmit={handleSubmit(onComplete)} noValidate className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-3">Paso {step} de 2</p>

      {step === 1 && (
        <>
          <Field
            label="Resumen de cierre"
            htmlFor="closingSummary"
            required
            error={errors.closingSummary?.message}
          >
            <Textarea id="closingSummary" rows={5} {...register("closingSummary")} />
          </Field>
          <Button as="button" type="button" className="justify-center" onClick={() => void goNext()}>
            Siguiente →
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Personas impactadas"
              htmlFor="personsImpacted"
              required
              error={errors.personsImpacted?.message}
            >
              <Input
                id="personsImpacted"
                type="number"
                min={0}
                {...register("personsImpacted", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Voluntarios"
              htmlFor="volunteers"
              required
              error={errors.volunteers?.message}
            >
              <Input
                id="volunteers"
                type="number"
                min={0}
                {...register("volunteers", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field
                  label="Etiqueta"
                  htmlFor={`custom-label-${i}`}
                  error={errors.custom?.[i]?.label?.message}
                >
                  <Input id={`custom-label-${i}`} {...register(`custom.${i}.label`)} />
                </Field>
                <Field
                  label="Valor"
                  htmlFor={`custom-value-${i}`}
                  error={errors.custom?.[i]?.value?.message}
                >
                  <Input id={`custom-value-${i}`} {...register(`custom.${i}.value`)} />
                </Field>
                <Button
                  as="button"
                  type="button"
                  variant="ghost"
                  onClick={() => remove(i)}
                  aria-label={`Quitar métrica ${i + 1}`}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={() => append({ label: "", value: "" })}
            >
              + Agregar métrica
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              as="button"
              type="button"
              variant="secondary"
              className="flex-1 justify-center"
              onClick={() => setStep(1)}
            >
              ← Atrás
            </Button>
            <Button
              as="button"
              type="submit"
              className="flex-1 justify-center"
              disabled={isSaving}
            >
              {isSaving ? "Finalizando…" : `Finalizar ${initiativeLabel}`}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
```

> Note: `Controller` is **not** used by this implementation — drop it from the import (`import { useForm, useFieldArray } from "react-hook-form";`) to keep eslint/knip clean. `Button` `variant="ghost"` is confirmed present.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage exec vitest run src/features/initiatives/components/completion-wizard.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/initiatives/components/completion-wizard.tsx apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx
git commit -m "feat(backstage): stepped completion wizard component"
```

---

## Task 5: Edit form — drop `Finalizado` option + reopen-block

**Files:**
- Modify: `apps/backstage/src/components/initiative-form.tsx`
- Modify: `apps/backstage/src/components/initiative-form.test.tsx`

- [ ] **Step 1: Write/extend the failing test** — add to `initiative-form.test.tsx`:

```tsx
  it("never offers Finalizado as a selectable status", () => {
    render(
      <InitiativeForm memberOptions={[]} submitLabel="Guardar" isSaving={false} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByRole("option", { name: /completado/i })).not.toBeInTheDocument();
  });

  it("locks status to a read-only pill when finalReport is filed", () => {
    render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
        lockStatus
        defaultValues={{ status: "Finalizado" }}
      />,
    );
    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede reabrir/i)).toBeInTheDocument();
  });
```

(Keep existing imports: `render`, `screen`, `vi`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/components/initiative-form.test.tsx`
Expected: FAIL — `Finalizado` still offered / `lockStatus` prop unknown.

- [ ] **Step 3: Implement** — in `initiative-form.tsx`:

Add to `InitiativeFormProps`: `lockStatus?: boolean;` and accept it (default `false`) in the destructure.

Replace the Estado `Field` (lines ~141-149) with:

```tsx
      {lockStatus ? (
        <Field label="Estado" htmlFor="status-locked">
          <input type="hidden" {...register("status")} />
          <div
            id="status-locked"
            className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink-2"
          >
            <span>{statusLabel("Finalizado")}</span>
            <span aria-hidden>🔒</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            No se puede reabrir una iniciativa finalizada.
          </p>
        </Field>
      ) : (
        <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
          <Select id="status" {...register("status")}>
            {INITIATIVE_STATUSES.filter((s) => s !== "Finalizado").map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      )}
```

> The hidden input preserves the existing `Finalizado` value through submit (a disabled `<Select>` would make RHF emit `undefined`). The `.filter` removes `Finalizado` from selectable options so the wizard owns that transition. (`rounded-[10px]` / `bg-surface-2` / `variant="ghost"` confirmed present in `packages/ui`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage exec vitest run src/components/initiative-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/initiative-form.tsx apps/backstage/src/components/initiative-form.test.tsx
git commit -m "feat(backstage): drop Finalizado from status select + reopen-block pill"
```

---

## Task 6: Wire wizard into the detail route

**Files:**
- Modify: `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx`

- [ ] **Step 1: Add imports** near the other feature imports:

```tsx
import { useAuth } from "../lib/auth/auth";
import { CompletionWizard } from "../features/initiatives/components/completion-wizard";
import { useCompleteInitiative } from "../features/initiatives/hooks/use-complete-initiative";
import type { InitiativeImpactInput } from "@luminova/types";
```

- [ ] **Step 2: Compute the permission + state** — inside `InitiativeDetailPage`, after `const ability = useAbility();`:

```tsx
  const { user } = useAuth();
  const uid = user?.uid ?? null;
```

After the `item` guard (where `item` is known non-null, ~line 92), add:

```tsx
  const isDirection = uid !== null && item.directionUids.includes(uid);
  const canComplete = (canUpdate || isDirection) && item.status !== "Finalizado";
```

Add wizard open state beside `editOpen`:

```tsx
  const [completeOpen, setCompleteOpen] = useState(false);
```

Wire the mutation (place beside `updateProgram`/`updateProject`):

```tsx
  const completeInitiative = useCompleteInitiative(initiativeType, termId);
```

- [ ] **Step 3: Add the handler** beside `handleUpdate`:

```tsx
  const handleComplete = async (impact: InitiativeImpactInput) => {
    if (!canComplete || uid === null) return;
    await completeInitiative.mutateAsync({ id: item.id, impact, uid });
    setCompleteOpen(false);
  };
```

- [ ] **Step 4: Add the Finalizar action** — extend the `InitiativeHero` `actions` prop so it renders both buttons:

```tsx
        actions={
          <div className="flex gap-2">
            {canUpdate && (
              <Button as="button" type="button" variant="secondary" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
            {canComplete && (
              <Button as="button" type="button" onClick={() => setCompleteOpen(true)}>
                Finalizar
              </Button>
            )}
          </div>
        }
```

- [ ] **Step 5: Pass `lockStatus` to the edit form** — in the edit `Sheet`'s `<InitiativeForm …>` add `lockStatus={item.finalReport !== null}`.

- [ ] **Step 6: Render the wizard Sheet** — after the edit `Sheet`:

```tsx
      <Sheet
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title={`Finalizar ${item.kind === "Program" ? "programa" : "proyecto"}`}
      >
        <CompletionWizard
          initiativeLabel={item.kind === "Program" ? "programa" : "proyecto"}
          isSaving={completeInitiative.isPending}
          onComplete={(impact) => void handleComplete(impact)}
        />
      </Sheet>
```

- [ ] **Step 7: Typecheck + build + unit tests**

Run: `pnpm --filter backstage exec tsc --noEmit && pnpm --filter backstage exec vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx
git commit -m "feat(backstage): wire completion wizard + Finalizar action into detail route"
```

---

## Task 7: Full verification + reviews

- [ ] **Step 1: Format then full CI** (turbo caches `ci`; run format first so a passing run is trustworthy)

```bash
pnpm format
pnpm --filter backstage run ci
```
Expected: prettier/eslint/tsc/build/vitest/knip/size-limit all PASS. Knip must show no unused exports (drop the `Controller` import if unused).

- [ ] **Step 2: Rules-tests standalone** (port race — free 4010 first)

```bash
lsof -ti tcp:4010 | xargs kill 2>/dev/null; pnpm --filter @luminova/firestore-rules-tests test
```
Expected: all green.

- [ ] **Step 3: Reviews** (rules touched — mandatory): `/security-review` on the diff, `firestore-security-reviewer` subagent, then `/simplify`, then `/code-review` (high).

- [ ] **Step 4: pr-tests + PR** — `pnpm pr-tests` (free 4010 first), then `gh pr create` to `main` after rebasing `origin/main`. Body per CLAUDE.md template.

---

## Spec self-review

- **Coverage:** wizard as only Finalizado path (Task 4 + Task 5 drops the option) ✅; atomic trio (Task 2 `complete()`) ✅; rule `Finalizado ⇒ finalReport != null` + tests (Task 1) ✅; reopen-block honest UI (Task 5 lock pill) ✅; remove dead `fileFinalReport` (Task 2) ✅; wire Finalizar gated on update∪direction (Task 6) ✅.
- **Type consistency:** `complete(id, impact: InitiativeImpactInput, uid: string)` identical across both repos and the hook; wizard emits `InitiativeImpactInput` matching `initiativeImpactSchema`; `InitiativeType` reused from `use-initiative`.
- **No placeholders:** every step has concrete code or an exact command.
- **Watch-out (flagged, not blocking):** `InitiativeCompleted`/`initiativeToInput`/`useUpdate*` untouched; `directionUids` is beacon-written and only read here. `variant="ghost"` and token classnames are the only two "verify it exists" notes — fall back to `secondary` / existing control classes if absent.
