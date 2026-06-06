# D1 — Events / Activities CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the board manage the Programa → Proyecto → Actividad hierarchy: real Program + Project CRUD (with member roster selects), Activity edit/cancel with engine-safety guards + a real program/project parent picker, and a minimal final-report action that flips child points provisional→confirmed.

**Architecture:** Backstage feature folders (repository + TanStack Query + RHF/Zod) for `programs`, `projects`, and an extension of A3's `activities`. Program/Project share one zod shape (`initiativeFormSchema`, aliased per entity) and two app-level presentational components (`InitiativeForm`/`InitiativeTable`), but keep distinct collections, repos, hooks, routes, and rules. Forms consume the #21 `Combobox`/`MultiSelect` via RHF `Controller`. Only `programs`/`projects`/`activities` are written — never `participations`/`memberPoints` (engine-only).

**Tech Stack:** React 19, TanStack Router/Query v5, react-hook-form + @hookform/resolvers/zod, zod, `@luminova/ui` (Combobox/MultiSelect/Sheet/Dialog/Select/Field/Button/Badge/EmptyState), `@luminova/types`, firebase/firestore, vitest + RTL.

**Key references (existing patterns to mirror):**
- Route + Sheet + Dialog + edit/delete: `apps/backstage/src/routes/_app.allies.tsx`.
- Repository (getById/update/serverTimestamp): `apps/backstage/src/features/allies/repositories/ally-repository.ts`.
- Activity form/route (A3): `apps/backstage/src/features/activities/components/activity-form.tsx`, `_app.activities.tsx`.
- Members list for options: `useMembers()` → `Member[]` with `{id, name}`.
- Rules tests helpers `as(uid, roles)` / `anon()` / `assertSucceeds` / `assertFails`: `tests/firestore-rules/rules.test.ts`.
- Nav: `apps/backstage/src/components/nav-config.ts`. CASL: `packages/auth/src/ability.ts` (subjects `Program`/`Project`/`Activity` already exist).
- `currentTermId()`: `apps/backstage/src/lib/current-term.ts`.

**Gotcha:** new routes → run bare `pnpm exec vite build` (router plugin regenerates `routeTree.gen.ts`) BEFORE a standalone `tsc`/full build. Rules tests when an emulator is already up: `pnpm --filter @luminova/firestore-rules-tests run test:run` (not `emulators:exec`).

---

### Task 1: `@luminova/types` — initiative/program/project schemas

**Files:**
- Create: `packages/types/src/engine/initiative-schema.ts`
- Create: `packages/types/src/engine/program-schema.ts`
- Create: `packages/types/src/engine/project-schema.ts`
- Test: `packages/types/src/engine/initiative-schema.test.ts`
- Modify: `packages/types/src/index.ts` (export the new schemas + types)

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/engine/initiative-schema.test.ts
import { describe, expect, it } from "vitest";
import { initiativeFormSchema } from "./initiative-schema";

const base = {
  title: "Proyecto Aurora",
  roster: { directorId: "m1", coDirectorId: null, teamIds: [] as string[] },
  status: "Planificacion" as const,
};

describe("initiativeFormSchema", () => {
  it("accepts a minimal valid initiative", () => {
    expect(initiativeFormSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a title under 3 chars", () => {
    expect(initiativeFormSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
  it("requires a director", () => {
    const r = initiativeFormSchema.safeParse({ ...base, roster: { ...base.roster, directorId: "" } });
    expect(r.success).toBe(false);
  });
  it("rejects co-director equal to director", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: "m1", teamIds: [] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m1"] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects co-director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: ["m2"] },
    });
    expect(r.success).toBe(false);
  });
  it("defaults teamIds to an empty array", () => {
    const r = initiativeFormSchema.parse({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorId: null },
      status: "Planificacion",
    });
    expect(r.roster.teamIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/initiative-schema.test.ts`
Expected: FAIL — cannot resolve `./initiative-schema`.

- [ ] **Step 3: Write the schemas**

```ts
// packages/types/src/engine/initiative-schema.ts
import { z } from "zod";
import { INITIATIVE_STATUSES } from "./initiative.js";

export const initiativeRosterSchema = z
  .object({
    directorId: z.string().min(1, "Requerido."),
    coDirectorId: z.string().min(1).nullable(),
    teamIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((r, ctx) => {
    if (r.coDirectorId !== null && r.coDirectorId === r.directorId) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorId"],
      });
    }
    if (r.teamIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El director no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
    if (r.coDirectorId !== null && r.teamIds.includes(r.coDirectorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
  });
export type InitiativeRosterInput = z.infer<typeof initiativeRosterSchema>;

export const initiativeFormSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres."),
  roster: initiativeRosterSchema,
  status: z.enum(INITIATIVE_STATUSES),
});
export type InitiativeInput = z.infer<typeof initiativeFormSchema>;
```

`INITIATIVE_STATUSES` is exported from `packages/types/src/engine/initiative.ts` (verified: `["Planificacion","EnEjecucion","Finalizado"]`). Use the `.js` extension on the relative import (NodeNext — engine modules already do this).

- [ ] **Step 4: Write the per-entity aliases**

```ts
// packages/types/src/engine/program-schema.ts
import { initiativeFormSchema, type InitiativeInput } from "./initiative-schema.js";

export const programSchema = initiativeFormSchema;
export type ProgramInput = InitiativeInput;
```

```ts
// packages/types/src/engine/project-schema.ts
import { initiativeFormSchema, type InitiativeInput } from "./initiative-schema.js";

export const projectSchema = initiativeFormSchema;
export type ProjectInput = InitiativeInput;
```

- [ ] **Step 5: Export from the root barrel**

In `packages/types/src/index.ts`, add (these are zod — root barrel only, NOT `engine/index.ts`):

```ts
export {
  initiativeRosterSchema,
  initiativeFormSchema,
  type InitiativeRosterInput,
  type InitiativeInput,
} from "./engine/initiative-schema.js";
export { programSchema, type ProgramInput } from "./engine/program-schema.js";
export { projectSchema, type ProjectInput } from "./engine/project-schema.js";
```

(Check the existing barrel for the import-extension convention — if other engine schema exports there omit `.js`, match what's there. The barrel already exports `activitySchema`; mirror its exact style.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/initiative-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/engine/initiative-schema.ts packages/types/src/engine/program-schema.ts packages/types/src/engine/project-schema.ts packages/types/src/engine/initiative-schema.test.ts packages/types/src/index.ts
git commit -m "feat(types): program/project/initiative form schemas + roster distinctness"
```

---

### Task 2: `@luminova/types` — Activity schema gains `coDirectorId`

**Files:**
- Modify: `packages/types/src/engine/activity-schema.ts`
- Test: `packages/types/src/engine/activity-schema.test.ts` (extend)

- [ ] **Step 1: Add a failing test**

Append to `packages/types/src/engine/activity-schema.test.ts`:

```ts
import { activitySchema } from "./activity-schema";

describe("activitySchema coDirectorId", () => {
  const inst = {
    category: "Assembly" as const,
    parentType: null,
    parentId: null,
    startAt: "2026-06-06T18:00",
    directorId: null,
  };
  it("accepts a null coDirectorId", () => {
    expect(activitySchema.safeParse({ ...inst, coDirectorId: null }).success).toBe(true);
  });
  it("accepts a member coDirectorId", () => {
    expect(activitySchema.safeParse({ ...inst, coDirectorId: "m2" }).success).toBe(true);
  });
});
```

(If the existing test file already imports `activitySchema`/`describe`, do not duplicate those imports — add only the new `describe` block.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/activity-schema.test.ts`
Expected: FAIL — `coDirectorId` not in the schema (excess key tolerated? zod object strips unknown by default, so the parse may SUCCEED but `coDirectorId` is dropped). To make the test meaningful, assert the parsed value:

Replace the two `it` bodies with:
```ts
  it("keeps a null coDirectorId", () => {
    const r = activitySchema.parse({ ...inst, coDirectorId: null });
    expect(r.coDirectorId).toBeNull();
  });
  it("keeps a member coDirectorId", () => {
    const r = activitySchema.parse({ ...inst, coDirectorId: "m2" });
    expect(r.coDirectorId).toBe("m2");
  });
```
Now Step 2 fails because `r.coDirectorId` is `undefined` (stripped).

- [ ] **Step 3: Add the field**

In `packages/types/src/engine/activity-schema.ts`, add `coDirectorId` to the object (beside `directorId`):

```ts
    directorId: z.string().min(1).nullable(),
    coDirectorId: z.string().min(1).nullable(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (all types tests, eslint, tsc).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/activity-schema.ts packages/types/src/engine/activity-schema.test.ts
git commit -m "feat(types): activity schema gains coDirectorId"
```

---

### Task 3: `firestore.rules` — `programs` match + rules tests

**Files:**
- Modify: `firestore.rules`
- Test: `tests/firestore-rules/rules.test.ts` (add a `programs` describe block)

- [ ] **Step 1: Write the failing rules test**

In `tests/firestore-rules/rules.test.ts`, add a seed line in the existing `beforeAll`/seed block beside the activities seed (search for `setDoc(doc(db, "activities/act1")`):

```ts
    await setDoc(doc(db, "programs/prog1"), { termId: "2026", title: "Programa X" });
```

Then add a describe block (place it after the `activities` describe):

```ts
describe("firestore.rules — programs", () => {
  it("any signed-in user can read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "programs/prog1")));
  });
  it("anonymous cannot read", async () => {
    await assertFails(getDoc(doc(anon(), "programs/prog1")));
  });
  it("ProjectManager can create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "programs/prog2"), { termId: "2026", title: "Y" }),
    );
  });
  it("Admin can update", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "programs/prog1"), { title: "Z" }));
  });
  it("a non-privileged role cannot write", async () => {
    await assertFails(updateDoc(doc(as("u", ["Treasury"]), "programs/prog1"), { title: "Nope" }));
  });
  it("nobody can delete", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "programs/prog1")));
  });
});
```

(Confirm `deleteDoc` is imported at the top of the test file — the members block uses it, so it is.)

- [ ] **Step 2: Run to verify it fails**

Ensure an emulator is up, then:
Run: `pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: FAIL — `programs` falls to deny-all, so the read/create/update assertSucceeds cases fail.

- [ ] **Step 3: Add the rule**

In `firestore.rules`, add after the `activities` match block:

```
    match /programs/{programId} {
      allow read: if signedIn();
      allow create, update: if hasAnyRole(['Admin', 'ProjectManager']);
      allow delete: if false;
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (the 6 new programs cases + all existing).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): programs collection (signedIn read, Admin/PM write, no delete)"
```

---

### Task 4: CASL + nav — expose Programs/Projects

**Files:**
- Modify: `packages/auth/src/ability.ts`
- Modify: `apps/backstage/src/components/nav-config.ts`
- Test: `packages/auth/src/ability.test.ts` (add a ProjectManager-Program case)

- [ ] **Step 1: Write the failing ability test**

In `packages/auth/src/ability.test.ts`, add (mirror the existing ProjectManager test there):

```ts
it("ProjectManager can manage Program", () => {
  const ability = buildAbility({ roles: ["ProjectManager"] }, "u1");
  expect(ability.can("manage", "Program")).toBe(true);
});
```

(Match the existing test's exact `buildAbility(...)` argument shape — check a neighbouring test for whether claims is `{ roles: [...] }` or includes more fields.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @luminova/auth exec vitest run src/ability.test.ts`
Expected: FAIL — ProjectManager lacks `manage Program`.

- [ ] **Step 3: Add `Program` to ProjectManager**

In `packages/auth/src/ability.ts`, change the ProjectManager case:

```ts
    case "ProjectManager":
      can("manage", ["Project", "Activity", "Program"]);
      can("checkIn", "Attendance");
      can("read", ["Ally", "Event"]);
      break;
```

- [ ] **Step 4: Verify the ability test passes**

Run: `pnpm --filter @luminova/auth run ci`
Expected: PASS.

- [ ] **Step 5: Add nav items + widen NavItem types**

In `apps/backstage/src/components/nav-config.ts`:

Widen the `to` union and `subject` union on `NavItem`:
```ts
  to:
    | "/"
    | "/me"
    | "/members"
    | "/allies"
    | "/point-rules"
    | "/leaderboard"
    | "/activities"
    | "/programs"
    | "/projects"
    | "/check-in";
```
```ts
  subject?: "Member" | "Ally" | "PointRule" | "Activity" | "Attendance" | "Program" | "Project";
```

In the `"Reconocimiento"` group, add two items before `/check-in`:
```ts
      { to: "/programs", label: "Programas", icon: "folder", subject: "Program" },
      { to: "/projects", label: "Proyectos", icon: "briefcase", subject: "Project" },
```

- [ ] **Step 6: Typecheck backstage**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS (routes don't exist yet but nav-config is just strings/types — tsc on nav-config alone passes; the route files are added in later tasks. If `createFileRoute` union complains elsewhere, it won't here.)

- [ ] **Step 7: Commit**

```bash
git add packages/auth/src/ability.ts packages/auth/src/ability.test.ts apps/backstage/src/components/nav-config.ts
git commit -m "feat(authz): ProjectManager manage Program; nav for Programas/Proyectos"
```

---

### Task 5: Shared `InitiativeForm` + `InitiativeTable` (app-level)

**Files:**
- Create: `apps/backstage/src/components/initiative-form.tsx`
- Create: `apps/backstage/src/components/initiative-table.tsx`
- Test: `apps/backstage/src/components/initiative-form.test.tsx`

- [ ] **Step 1: Write the form**

```tsx
// apps/backstage/src/components/initiative-form.tsx
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import {
  Button,
  Field,
  Input,
  Select,
  Combobox,
  MultiSelect,
  type ComboboxOption,
} from "@luminova/ui";
import { INITIATIVE_STATUSES, type InitiativeInput } from "@luminova/types";

const STATUS_LABELS: Record<(typeof INITIATIVE_STATUSES)[number], string> = {
  Planificacion: "Planificación",
  EnEjecucion: "En ejecución",
  Finalizado: "Finalizado",
};

const EMPTY: InitiativeInput = {
  title: "",
  roster: { directorId: "", coDirectorId: null, teamIds: [] },
  status: "Planificacion",
};

interface InitiativeFormProps {
  schema: ZodType<InitiativeInput>;
  memberOptions: ComboboxOption[];
  defaultValues?: Partial<InitiativeInput>;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (data: InitiativeInput) => void;
}

export function InitiativeForm({
  schema,
  memberOptions,
  defaultValues,
  submitLabel,
  isSaving,
  onSubmit,
}: InitiativeFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InitiativeInput>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Título" htmlFor="title" required error={errors.title?.message}>
        <Input id="title" {...register("title")} />
      </Field>
      <Field label="Director" required error={errors.roster?.directorId?.message}>
        <Controller
          control={control}
          name="roster.directorId"
          render={({ field }) => (
            <Combobox
              options={memberOptions}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? "")}
              placeholder="Elegir director"
            />
          )}
        />
      </Field>
      <Field label="Codirector" error={errors.roster?.coDirectorId?.message}>
        <Controller
          control={control}
          name="roster.coDirectorId"
          render={({ field }) => (
            <Combobox
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir codirector (opcional)"
            />
          )}
        />
      </Field>
      <Field label="Equipo" error={errors.roster?.teamIds?.message}>
        <Controller
          control={control}
          name="roster.teamIds"
          render={({ field }) => (
            <MultiSelect
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir equipo"
            />
          )}
        />
      </Field>
      <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
        <Select id="status" {...register("status")}>
          {INITIATIVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write the table**

```tsx
// apps/backstage/src/components/initiative-table.tsx
import { Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Icon } from "@luminova/ui";
import type { Program } from "@luminova/types";

type Initiative = Pick<Program, "id" | "title" | "roster" | "status" | "finalReport">;

const STATUS_TONE: Record<Initiative["status"], "ok" | "warn" | "neutral"> = {
  Finalizado: "ok",
  EnEjecucion: "warn",
  Planificacion: "neutral",
};

interface InitiativeTableProps {
  rows: Initiative[];
  memberName: (id: string) => string;
  onEdit: (row: Initiative) => void;
  onFileReport: (row: Initiative) => void;
}

export function InitiativeTable({ rows, memberName, onEdit, onFileReport }: InitiativeTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Director</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Informe final</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.title}</TableCell>
            <TableCell>{memberName(row.roster.directorId)}</TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
            </TableCell>
            <TableCell>{row.finalReport ? "Presentado" : "—"}</TableCell>
            <TableCell>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={`Editar ${row.title}`}
                  onClick={() => onEdit(row)}
                  className="text-ink-2 hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                {!row.finalReport && (
                  <button
                    type="button"
                    aria-label={`Marcar informe final de ${row.title}`}
                    onClick={() => onFileReport(row)}
                    className="text-ink-2 hover:text-ink-1"
                  >
                    {Icon.check({ s: 17 })}
                  </button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

(Verify `Badge` accepts a `tone` prop with values `ok|warn|neutral` — check `packages/ui/src/components/badge.tsx` `BadgeTone`. If the tone names differ, map to the actual union. If `neutral` isn't a member, use the closest existing tone for Planificacion.)

- [ ] **Step 3: Write a render test for the form**

```tsx
// apps/backstage/src/components/initiative-form.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { programSchema } from "@luminova/types";
import { InitiativeForm } from "./initiative-form";

const members = [
  { value: "m1", label: "Ana Rivas" },
  { value: "m2", label: "Bruno Paz" },
];

describe("InitiativeForm", () => {
  it("submits title + director + status", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InitiativeForm
        schema={programSchema}
        memberOptions={members}
        submitLabel="Crear"
        isSaving={false}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Título"), "Proyecto Aurora");
    await user.click(screen.getByRole("button", { name: /elegir director/i }));
    await user.click(screen.getByText("Ana Rivas"));
    await user.click(screen.getByRole("button", { name: /crear/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorId: null, teamIds: [] },
      status: "Planificacion",
    });
  });

  it("blocks submit when the director is missing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InitiativeForm
        schema={programSchema}
        memberOptions={members}
        submitLabel="Crear"
        isSaving={false}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText("Título"), "Proyecto Aurora");
    await user.click(screen.getByRole("button", { name: /crear/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the form test**

Run: `pnpm --filter backstage exec vitest run src/components/initiative-form.test.tsx`
Expected: PASS (2 tests). The cmdk jsdom stubs from #21 are already in `setup.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/initiative-form.tsx apps/backstage/src/components/initiative-table.tsx apps/backstage/src/components/initiative-form.test.tsx
git commit -m "feat(backstage): shared InitiativeForm + InitiativeTable"
```

---

### Task 6: `programs` feature — mapper, repository, hooks

**Files:**
- Create: `apps/backstage/src/features/programs/repositories/program-mapper.ts`
- Create: `apps/backstage/src/features/programs/repositories/program-repository.ts`
- Create: `apps/backstage/src/features/programs/hooks/program-keys.ts`
- Create: `apps/backstage/src/features/programs/hooks/use-programs-by-term.ts`
- Create: `apps/backstage/src/features/programs/hooks/use-create-program.ts`
- Create: `apps/backstage/src/features/programs/hooks/use-update-program.ts`
- Create: `apps/backstage/src/features/programs/hooks/use-file-program-report.ts`
- Test: `apps/backstage/src/features/programs/repositories/program-mapper.test.ts`

- [ ] **Step 1: Write the failing mapper test**

```ts
// apps/backstage/src/features/programs/repositories/program-mapper.test.ts
import { describe, expect, it } from "vitest";
import { toProgramCreateDoc, toProgramUpdateDoc } from "./program-mapper";

const input = {
  title: "Programa X",
  roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
  status: "Planificacion" as const,
};

describe("toProgramCreateDoc", () => {
  it("adds termId, null finalReport, and passes roster through", () => {
    expect(toProgramCreateDoc(input, "2026")).toEqual({
      termId: "2026",
      title: "Programa X",
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
      status: "Planificacion",
      finalReport: null,
    });
  });
});

describe("toProgramUpdateDoc", () => {
  it("maps editable fields only (no termId / finalReport churn)", () => {
    expect(toProgramUpdateDoc(input)).toEqual({
      title: "Programa X",
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
      status: "Planificacion",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/programs/repositories/program-mapper.test.ts`
Expected: FAIL — cannot resolve `./program-mapper`.

- [ ] **Step 3: Write the mapper**

```ts
// apps/backstage/src/features/programs/repositories/program-mapper.ts
import type { ProgramInput } from "@luminova/types";

export function toProgramCreateDoc(data: ProgramInput, termId: string) {
  return {
    termId,
    title: data.title,
    roster: data.roster,
    status: data.status,
    finalReport: null,
  };
}

export function toProgramUpdateDoc(data: ProgramInput) {
  return {
    title: data.title,
    roster: data.roster,
    status: data.status,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/programs/repositories/program-mapper.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the repository**

```ts
// apps/backstage/src/features/programs/repositories/program-repository.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Program, ProgramInput } from "@luminova/types";
import { toProgramCreateDoc, toProgramUpdateDoc } from "./program-mapper";

export class ProgramRepository {
  private readonly collection = collection(getFirebase().db, "programs");

  async getByTerm(termId: string): Promise<Program[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Program, "id">) }))
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  async getById(id: string): Promise<Program | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Program, "id">) };
  }

  async create(data: ProgramInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toProgramCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: ProgramInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toProgramUpdateDoc(data));
  }

  /** File the director's final report — the engine confirmation gate. */
  async fileFinalReport(id: string, uid: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Programa no encontrado.");
    if (existing.finalReport) throw new Error("El informe final ya fue presentado.");
    await updateDoc(doc(this.collection, id), {
      finalReport: { filedAt: serverTimestamp(), filedBy: uid },
      status: "Finalizado",
    });
  }
}
```

- [ ] **Step 6: Write the hooks**

```ts
// apps/backstage/src/features/programs/hooks/program-keys.ts
export const programKeys = {
  all: ["programs"] as const,
  byTerm: (termId: string) => ["programs", "term", termId] as const,
};
```

```ts
// apps/backstage/src/features/programs/hooks/use-programs-by-term.ts
import { useQuery } from "@tanstack/react-query";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useProgramsByTerm(termId: string) {
  return useQuery({
    queryKey: programKeys.byTerm(termId),
    queryFn: () => new ProgramRepository().getByTerm(termId),
  });
}
```

```ts
// apps/backstage/src/features/programs/hooks/use-create-program.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgramInput } from "@luminova/types";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useCreateProgram(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProgramInput) => new ProgramRepository().create(data, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
```

```ts
// apps/backstage/src/features/programs/hooks/use-update-program.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgramInput } from "@luminova/types";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useUpdateProgram(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProgramInput }) =>
      new ProgramRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
```

```ts
// apps/backstage/src/features/programs/hooks/use-file-program-report.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useFileProgramReport(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) =>
      new ProgramRepository().fileFinalReport(id, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
```

- [ ] **Step 7: Run + commit**

Run: `pnpm --filter backstage exec vitest run src/features/programs`
Expected: PASS.

```bash
git add apps/backstage/src/features/programs
git commit -m "feat(programs): repository, mapper, query hooks"
```

---

### Task 7: `programs` route

**Files:**
- Create: `apps/backstage/src/routes/_app.programs.tsx`

- [ ] **Step 1: Write the route**

```tsx
// apps/backstage/src/routes/_app.programs.tsx
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon, EmptyState } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import { programSchema, type Program, type ProgramInput } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeTable } from "../components/initiative-table";
import { currentTermId } from "../lib/current-term";
import { useAuth } from "../lib/auth/use-auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useCreateProgram } from "../features/programs/hooks/use-create-program";
import { useUpdateProgram } from "../features/programs/hooks/use-update-program";
import { useFileProgramReport } from "../features/programs/hooks/use-file-program-report";

export const Route = createFileRoute("/_app/programs")({ component: ProgramsPage });

type Editing = Program | "new" | null;

function programToInput(p: Program): Partial<ProgramInput> {
  return { title: p.title, roster: p.roster, status: p.status };
}

function ProgramsPage() {
  const termId = currentTermId();
  const { user } = useAuth();
  const { data: programs, isLoading, isError } = useProgramsByTerm(termId);
  const { data: members } = useMembers();
  const create = useCreateProgram(termId);
  const update = useUpdateProgram(termId);
  const fileReport = useFileProgramReport(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [reportTarget, setReportTarget] = useState<Program | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const memberName = useMemo(() => {
    const byId = new Map((members ?? []).map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "—";
  }, [members]);

  const handleSubmit = async (data: ProgramInput) => {
    if (editing === "new") await create.mutateAsync(data);
    else if (editing) await update.mutateAsync({ id: editing.id, data });
    setEditing(null);
  };

  const confirmReport = async () => {
    if (!reportTarget || !user) return;
    await fileReport.mutateAsync({ id: reportTarget.id, uid: user.uid });
    setReportTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Programas"
        actions={
          <Can I="create" a="Program">
            <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setEditing("new")}>
              Nuevo programa
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar los programas.</p>}
      {programs && programs.length === 0 && (
        <EmptyState
          icon={Icon.folder({ s: 40 })}
          title={`No hay programas para ${termId}.`}
          description="Crea un programa para agrupar actividades."
        />
      )}
      {programs && programs.length > 0 && (
        <InitiativeTable
          rows={programs}
          memberName={memberName}
          onEdit={setEditing}
          onFileReport={setReportTarget}
        />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nuevo programa" : "Editar programa"}
      >
        {editing !== null && (
          <InitiativeForm
            key={editing === "new" ? "new" : editing.id}
            schema={programSchema}
            memberOptions={memberOptions}
            defaultValues={editing === "new" ? undefined : programToInput(editing)}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            isSaving={create.isPending || update.isPending}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>

      <Dialog
        open={reportTarget !== null}
        onOpenChange={(open) => !open && setReportTarget(null)}
        title="Marcar informe final"
        description={
          reportTarget
            ? `¿Marcar el informe final de "${reportTarget.title}"? Confirma los puntos de sus actividades.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setReportTarget(null)}>
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmReport()}>
            Marcar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
```

Verify the `useAuth` import path + shape (`user.uid`) against `apps/backstage/src/routes/_app.me.tsx` or wherever the current uid is read — adjust the import to the real hook (the auth-store exposes the user/claims; use the same accessor the `/me` route uses). If `Can` lives at a different path, match `_app.activities.tsx`'s import (`../lib/authz/ability-context`).

- [ ] **Step 2: Regenerate route tree + typecheck**

Run: `pnpm --filter backstage exec vite build`
Then: `pnpm --filter backstage exec tsc --noEmit`
Expected: build regenerates `routeTree.gen.ts` with `/programs`; tsc passes.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/routes/_app.programs.tsx apps/backstage/src/routeTree.gen.ts
git commit -m "feat(programs): /programs route (CRUD + file final report)"
```

---

### Task 8: `projects` feature — mapper, repository, hooks, route

**Files:**
- Create: `apps/backstage/src/features/projects/repositories/project-mapper.ts`
- Create: `apps/backstage/src/features/projects/repositories/project-repository.ts`
- Create: `apps/backstage/src/features/projects/hooks/project-keys.ts`
- Create: `apps/backstage/src/features/projects/hooks/use-projects-by-term.ts`
- Create: `apps/backstage/src/features/projects/hooks/use-create-project.ts`
- Create: `apps/backstage/src/features/projects/hooks/use-update-project.ts`
- Create: `apps/backstage/src/features/projects/hooks/use-file-project-report.ts`
- Create: `apps/backstage/src/routes/_app.projects.tsx`
- Test: `apps/backstage/src/features/projects/repositories/project-mapper.test.ts`

This mirrors Task 6 + Task 7 with `Project`/`project` substituted and collection `"projects"`. Full code below (do not abbreviate — repository class, hooks, and route are distinct files).

- [ ] **Step 1: Mapper test**

```ts
// apps/backstage/src/features/projects/repositories/project-mapper.test.ts
import { describe, expect, it } from "vitest";
import { toProjectCreateDoc, toProjectUpdateDoc } from "./project-mapper";

const input = {
  title: "Proyecto Y",
  roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] as string[] },
  status: "EnEjecucion" as const,
};

describe("toProjectCreateDoc", () => {
  it("adds termId + null finalReport", () => {
    expect(toProjectCreateDoc(input, "2026")).toEqual({
      termId: "2026",
      title: "Proyecto Y",
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] },
      status: "EnEjecucion",
      finalReport: null,
    });
  });
});

describe("toProjectUpdateDoc", () => {
  it("maps editable fields only", () => {
    expect(toProjectUpdateDoc(input)).toEqual({
      title: "Proyecto Y",
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] },
      status: "EnEjecucion",
    });
  });
});
```

Run: `pnpm --filter backstage exec vitest run src/features/projects/repositories/project-mapper.test.ts` → FAIL.

- [ ] **Step 2: Mapper**

```ts
// apps/backstage/src/features/projects/repositories/project-mapper.ts
import type { ProjectInput } from "@luminova/types";

export function toProjectCreateDoc(data: ProjectInput, termId: string) {
  return {
    termId,
    title: data.title,
    roster: data.roster,
    status: data.status,
    finalReport: null,
  };
}

export function toProjectUpdateDoc(data: ProjectInput) {
  return {
    title: data.title,
    roster: data.roster,
    status: data.status,
  };
}
```

Run the mapper test → PASS.

- [ ] **Step 3: Repository**

```ts
// apps/backstage/src/features/projects/repositories/project-repository.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Project, ProjectInput } from "@luminova/types";
import { toProjectCreateDoc, toProjectUpdateDoc } from "./project-mapper";

export class ProjectRepository {
  private readonly collection = collection(getFirebase().db, "projects");

  async getByTerm(termId: string): Promise<Project[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  async getById(id: string): Promise<Project | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Project, "id">) };
  }

  async create(data: ProjectInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toProjectCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: ProjectInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toProjectUpdateDoc(data));
  }

  async fileFinalReport(id: string, uid: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Proyecto no encontrado.");
    if (existing.finalReport) throw new Error("El informe final ya fue presentado.");
    await updateDoc(doc(this.collection, id), {
      finalReport: { filedAt: serverTimestamp(), filedBy: uid },
      status: "Finalizado",
    });
  }
}
```

- [ ] **Step 4: Hooks** (four files, `project` variants of Task 6 Step 6)

```ts
// apps/backstage/src/features/projects/hooks/project-keys.ts
export const projectKeys = {
  all: ["projects"] as const,
  byTerm: (termId: string) => ["projects", "term", termId] as const,
};
```
```ts
// apps/backstage/src/features/projects/hooks/use-projects-by-term.ts
import { useQuery } from "@tanstack/react-query";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useProjectsByTerm(termId: string) {
  return useQuery({
    queryKey: projectKeys.byTerm(termId),
    queryFn: () => new ProjectRepository().getByTerm(termId),
  });
}
```
```ts
// apps/backstage/src/features/projects/hooks/use-create-project.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectInput } from "@luminova/types";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useCreateProject(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectInput) => new ProjectRepository().create(data, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
```
```ts
// apps/backstage/src/features/projects/hooks/use-update-project.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectInput } from "@luminova/types";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useUpdateProject(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectInput }) =>
      new ProjectRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
```
```ts
// apps/backstage/src/features/projects/hooks/use-file-project-report.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useFileProjectReport(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) =>
      new ProjectRepository().fileFinalReport(id, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
```

- [ ] **Step 5: Route** — copy `_app.programs.tsx`, substitute Project/project, collection label "Proyectos", icon `briefcase`, EmptyState copy, CASL subject `Project`:

```tsx
// apps/backstage/src/routes/_app.projects.tsx
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon, EmptyState } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import { projectSchema, type Project, type ProjectInput } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeTable } from "../components/initiative-table";
import { currentTermId } from "../lib/current-term";
import { useAuth } from "../lib/auth/use-auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useCreateProject } from "../features/projects/hooks/use-create-project";
import { useUpdateProject } from "../features/projects/hooks/use-update-project";
import { useFileProjectReport } from "../features/projects/hooks/use-file-project-report";

export const Route = createFileRoute("/_app/projects")({ component: ProjectsPage });

type Editing = Project | "new" | null;

function projectToInput(p: Project): Partial<ProjectInput> {
  return { title: p.title, roster: p.roster, status: p.status };
}

function ProjectsPage() {
  const termId = currentTermId();
  const { user } = useAuth();
  const { data: projects, isLoading, isError } = useProjectsByTerm(termId);
  const { data: members } = useMembers();
  const create = useCreateProject(termId);
  const update = useUpdateProject(termId);
  const fileReport = useFileProjectReport(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [reportTarget, setReportTarget] = useState<Project | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const memberName = useMemo(() => {
    const byId = new Map((members ?? []).map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "—";
  }, [members]);

  const handleSubmit = async (data: ProjectInput) => {
    if (editing === "new") await create.mutateAsync(data);
    else if (editing) await update.mutateAsync({ id: editing.id, data });
    setEditing(null);
  };

  const confirmReport = async () => {
    if (!reportTarget || !user) return;
    await fileReport.mutateAsync({ id: reportTarget.id, uid: user.uid });
    setReportTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Proyectos"
        actions={
          <Can I="create" a="Project">
            <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setEditing("new")}>
              Nuevo proyecto
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar los proyectos.</p>}
      {projects && projects.length === 0 && (
        <EmptyState
          icon={Icon.briefcase({ s: 40 })}
          title={`No hay proyectos para ${termId}.`}
          description="Crea un proyecto para agrupar actividades."
        />
      )}
      {projects && projects.length > 0 && (
        <InitiativeTable
          rows={projects}
          memberName={memberName}
          onEdit={setEditing}
          onFileReport={setReportTarget}
        />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nuevo proyecto" : "Editar proyecto"}
      >
        {editing !== null && (
          <InitiativeForm
            key={editing === "new" ? "new" : editing.id}
            schema={projectSchema}
            memberOptions={memberOptions}
            defaultValues={editing === "new" ? undefined : projectToInput(editing)}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            isSaving={create.isPending || update.isPending}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>

      <Dialog
        open={reportTarget !== null}
        onOpenChange={(open) => !open && setReportTarget(null)}
        title="Marcar informe final"
        description={
          reportTarget
            ? `¿Marcar el informe final de "${reportTarget.title}"? Confirma los puntos de sus actividades.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setReportTarget(null)}>
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmReport()}>
            Marcar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 6: Regenerate tree + verify + commit**

Run: `pnpm --filter backstage exec vite build` then `pnpm --filter backstage exec vitest run src/features/projects`
Expected: build + mapper tests PASS.

```bash
git add apps/backstage/src/features/projects apps/backstage/src/routes/_app.projects.tsx apps/backstage/src/routeTree.gen.ts
git commit -m "feat(projects): /projects route + repository/hooks (CRUD + file report)"
```

---

### Task 9: `activities` — repository extension + check-in guard

**Files:**
- Modify: `apps/backstage/src/features/activities/repositories/activity-repository.ts`
- Modify: `apps/backstage/src/features/activities/repositories/activity-mapper.ts`
- Create: `apps/backstage/src/features/activities/repositories/activity-guard.ts`
- Test: `apps/backstage/src/features/activities/repositories/activity-guard.test.ts`
- Test: extend `apps/backstage/src/features/activities/repositories/activity-mapper.test.ts`

- [ ] **Step 1: Write the failing guard test**

```ts
// apps/backstage/src/features/activities/repositories/activity-guard.test.ts
import { describe, expect, it } from "vitest";
import { lockedFieldsChanged } from "./activity-guard";

const current = { category: "Assembly" as const, startAt: 1000 };

describe("lockedFieldsChanged", () => {
  it("flags a changed startAt", () => {
    expect(lockedFieldsChanged(current, { category: "Assembly", startAt: 2000 })).toBe(true);
  });
  it("flags a changed category", () => {
    expect(lockedFieldsChanged(current, { category: "Course", startAt: 1000 })).toBe(true);
  });
  it("allows unchanged locked fields", () => {
    expect(lockedFieldsChanged(current, { category: "Assembly", startAt: 1000 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm --filter backstage exec vitest run src/features/activities/repositories/activity-guard.test.ts`
Expected: FAIL — cannot resolve `./activity-guard`.

- [ ] **Step 3: Write the guard helper**

```ts
// apps/backstage/src/features/activities/repositories/activity-guard.ts
import type { ActivityCategory } from "@luminova/types";

export interface LockedFields {
  category: ActivityCategory;
  startAt: number; // millis
}

/** True when a locked field (category/startAt) differs — disallowed once check-ins exist. */
export function lockedFieldsChanged(current: LockedFields, next: LockedFields): boolean {
  return current.category !== next.category || current.startAt !== next.startAt;
}

export class ActivityLockedError extends Error {
  constructor() {
    super("No se puede editar la fecha o categoría: ya hay registros de asistencia.");
    this.name = "ActivityLockedError";
  }
}
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm --filter backstage exec vitest run src/features/activities/repositories/activity-guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Extend the mapper (add update mapper test + impl)**

Append to `apps/backstage/src/features/activities/repositories/activity-mapper.test.ts`:

```ts
import { toActivityUpdateDoc } from "./activity-mapper";

describe("toActivityUpdateDoc", () => {
  it("maps editable fields incl. coDirectorId, excludes termId/status", () => {
    const input = {
      category: "ProjectExecution" as const,
      parentType: "Project" as const,
      parentId: "p1",
      startAt: "2026-06-06T18:00",
      directorId: "m1",
      coDirectorId: "m2",
    };
    const doc = toActivityUpdateDoc(input);
    expect(doc).toMatchObject({
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p1",
      organizers: { directorId: "m1", coDirectorId: "m2" },
    });
    expect(doc.startAt.toMillis()).toBe(new Date("2026-06-06T18:00:00Z").getTime());
  });
});
```

Then in `activity-mapper.ts`, update `toActivityCreateDoc` to read `coDirectorId` and add `toActivityUpdateDoc`:

```ts
export function toActivityCreateDoc(data: ActivityInput, termId: string) {
  return {
    termId,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorId: data.coDirectorId },
    startAt: toTimestamp(data.startAt),
    status: "Programada" as const,
  };
}

export function toActivityUpdateDoc(data: ActivityInput) {
  return {
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorId: data.coDirectorId },
    startAt: toTimestamp(data.startAt),
  };
}
```

Run: `pnpm --filter backstage exec vitest run src/features/activities/repositories/activity-mapper.test.ts`
Expected: PASS.

- [ ] **Step 6: Extend the repository**

In `activity-repository.ts`, add imports + methods:

```ts
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc, query, where, getCountFromServer,
} from "firebase/firestore";
import type { Activity, ActivityInput } from "@luminova/types";
import { toActivityCreateDoc, toActivityUpdateDoc } from "./activity-mapper";
import { lockedFieldsChanged, ActivityLockedError } from "./activity-guard";
```

Add inside the class:

```ts
  async getById(id: string): Promise<Activity | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Activity, "id">) };
  }

  async countCheckIns(activityId: string): Promise<number> {
    const checkIns = collection(this.db, "checkIns");
    const snap = await getCountFromServer(query(checkIns, where("activityId", "==", activityId)));
    return snap.data().count;
  }

  async update(id: string, data: ActivityInput): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Actividad no encontrada.");
    if ((await this.countCheckIns(id)) > 0) {
      const changed = lockedFieldsChanged(
        { category: existing.category, startAt: existing.startAt.toMillis() },
        { category: data.category, startAt: new Date(`${data.startAt}:00Z`).getTime() },
      );
      if (changed) throw new ActivityLockedError();
    }
    await updateDoc(doc(this.collection, id), toActivityUpdateDoc(data));
  }

  async cancel(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { status: "Cancelada" });
  }
```

(The class already has `private readonly db = getFirebase().db;` and `private readonly collection`. Confirm `this.db` exists — A3's repo declares it. If not, add `private readonly db = getFirebase().db;`.)

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backstage/src/features/activities/repositories
git commit -m "feat(activities): getById/update/cancel/countCheckIns + edit-lock guard"
```

---

### Task 10: `activities` — ParentPicker + form extension + route edit/cancel

**Files:**
- Create: `apps/backstage/src/features/activities/components/parent-picker.tsx`
- Modify: `apps/backstage/src/features/activities/components/activity-form.tsx`
- Modify: `apps/backstage/src/features/activities/components/activity-table.tsx`
- Create: `apps/backstage/src/features/activities/hooks/use-update-activity.ts`
- Create: `apps/backstage/src/features/activities/hooks/use-cancel-activity.ts`
- Modify: `apps/backstage/src/routes/_app.activities.tsx`
- Test: `apps/backstage/src/features/activities/components/activity-form.test.tsx` (extend)

- [ ] **Step 1: Write the ParentPicker**

```tsx
// apps/backstage/src/features/activities/components/parent-picker.tsx
import { Field, Select, Combobox, type ComboboxOption } from "@luminova/ui";
import type { InitiativeKind } from "@luminova/types";

interface ParentPickerProps {
  parentType: InitiativeKind | null;
  parentId: string | null;
  programOptions: ComboboxOption[];
  projectOptions: ComboboxOption[];
  onParentTypeChange: (t: InitiativeKind | null) => void;
  onParentIdChange: (id: string | null) => void;
  error?: string;
}

export function ParentPicker({
  parentType,
  parentId,
  programOptions,
  projectOptions,
  onParentTypeChange,
  onParentIdChange,
  error,
}: ParentPickerProps) {
  const options = parentType === "Program" ? programOptions : projectOptions;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Tipo de padre" htmlFor="parentType">
        <Select
          id="parentType"
          value={parentType ?? "Project"}
          onChange={(e) => {
            onParentTypeChange(e.target.value as InitiativeKind);
            onParentIdChange(null);
          }}
        >
          <option value="Project">Proyecto</option>
          <option value="Program">Programa</option>
        </Select>
      </Field>
      <Field label="Padre" error={error}>
        <Combobox
          options={options}
          value={parentId}
          onChange={onParentIdChange}
          placeholder={parentType === "Program" ? "Elegir programa" : "Elegir proyecto"}
        />
      </Field>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the activity form to use Controller + ParentPicker + member comboboxes + lock**

```tsx
// apps/backstage/src/features/activities/components/activity-form.tsx
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Select, Combobox, type ComboboxOption } from "@luminova/ui";
import { activitySchema, type ActivityInput, ACTIVITY_CATEGORIES } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";
import { ParentPicker } from "./parent-picker";

interface ActivityFormProps {
  defaultValues?: Partial<ActivityInput>;
  memberOptions: ComboboxOption[];
  programOptions: ComboboxOption[];
  projectOptions: ComboboxOption[];
  /** Lock category + startAt (edit mode with existing check-ins). */
  locked?: boolean;
  isSaving: boolean;
  submitLabel?: string;
  onSubmit: (data: ActivityInput) => void;
}

const EMPTY: ActivityInput = {
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "",
  directorId: null,
  coDirectorId: null,
};

export function ActivityForm({
  defaultValues,
  memberOptions,
  programOptions,
  projectOptions,
  locked = false,
  isSaving,
  submitLabel = "Guardar",
  onSubmit,
}: ActivityFormProps) {
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivityInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const category = watch("category");
  const isExecution = category === "ProjectExecution";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Categoría" htmlFor="category" required error={errors.category?.message}>
        <Select id="category" disabled={locked} {...register("category")}>
          {ACTIVITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        {locked && <p className="mt-1 text-sm text-ink-3">No editable: ya hay registros de asistencia.</p>}
      </Field>

      <Field label="Fecha y hora" htmlFor="startAt" required error={errors.startAt?.message}>
        <Input id="startAt" type="datetime-local" disabled={locked} {...register("startAt")} />
      </Field>

      {isExecution && (
        <Controller
          control={control}
          name="parentId"
          render={({ field: idField }) => (
            <Controller
              control={control}
              name="parentType"
              render={({ field: typeField }) => (
                <ParentPicker
                  parentType={typeField.value}
                  parentId={idField.value}
                  programOptions={programOptions}
                  projectOptions={projectOptions}
                  onParentTypeChange={typeField.onChange}
                  onParentIdChange={idField.onChange}
                  error={errors.parentId?.message}
                />
              )}
            />
          )}
        />
      )}

      <Field label="Director" error={errors.directorId?.message}>
        <Controller
          control={control}
          name="directorId"
          render={({ field }) => (
            <Combobox
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir director (opcional)"
            />
          )}
        />
      </Field>
      <Field label="Codirector" error={errors.coDirectorId?.message}>
        <Controller
          control={control}
          name="coDirectorId"
          render={({ field }) => (
            <Combobox
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir codirector (opcional)"
            />
          )}
        />
      </Field>

      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
```

Note: when `category` is not `ProjectExecution`, `parentType`/`parentId` keep their default `null` (institutional) — the schema's Invariant-A `superRefine` enforces "no parent on institutional". When the user switches category to `ProjectExecution`, the picker appears with `parentType` defaulting to `Project` (set on first interaction). The form does not auto-clear parent on category change; the schema rejects an institutional+parent combo, surfacing the error. To avoid a stuck state, reset parent in an effect:

Add after `const isExecution = ...`:
```tsx
  // keep parent consistent with category (institutional => no parent)
  const { setValue } = useForm<ActivityInput>(); // placeholder — DO NOT add; see below
```
DO NOT add the above. Instead destructure `setValue` from the single existing `useForm` call (add `setValue` to the destructure list) and add:
```tsx
  useEffect(() => {
    if (!isExecution) {
      setValue("parentType", null);
      setValue("parentId", null);
    }
  }, [isExecution, setValue]);
```
Add `import { useEffect } from "react";` at the top and `setValue` to the `useForm` destructure.

- [ ] **Step 3: Add update/cancel hooks**

```ts
// apps/backstage/src/features/activities/hooks/use-update-activity.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivityInput } from "@luminova/types";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useUpdateActivity(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ActivityInput }) =>
      new ActivityRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
```
```ts
// apps/backstage/src/features/activities/hooks/use-cancel-activity.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useCancelActivity(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new ActivityRepository().cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
```

(Confirm `activityKeys` exposes `byTerm(termId)` — check `activity-keys.ts`; A3's `use-activities-by-term` uses it. If the key is named differently, match it.)

- [ ] **Step 4: Extend the activities route**

Modify `_app.activities.tsx` to: load members/programs/projects for options, support edit (open Sheet with `getById` + `countCheckIns` to compute `locked`), cancel (Dialog), and wire update. Because the edit lock needs `countCheckIns`, fetch it on edit-open. Full updated route:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, Icon, Sheet, Dialog, Toast } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import type { Activity, ActivityInput } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { useUpdateActivity } from "../features/activities/hooks/use-update-activity";
import { useCancelActivity } from "../features/activities/hooks/use-cancel-activity";
import { ActivityRepository } from "../features/activities/repositories/activity-repository";
import { ActivityLockedError } from "../features/activities/repositories/activity-guard";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityTable } from "../features/activities/components/activity-table";

export const Route = createFileRoute("/_app/activities")({ component: ActivitiesPage });

type Editing = Activity | "new" | null;

function activityToInput(a: Activity): Partial<ActivityInput> {
  return {
    category: a.category,
    parentType: a.parentType,
    parentId: a.parentId,
    startAt: new Date(a.startAt.toMillis()).toISOString().slice(0, 16),
    directorId: a.organizers.directorId,
    coDirectorId: a.organizers.coDirectorId,
  };
}

function ActivitiesPage() {
  const termId = currentTermId();
  const { data: activities, isLoading, isError } = useActivitiesByTerm(termId);
  const { data: members } = useMembers();
  const { data: programs } = useProgramsByTerm(termId);
  const { data: projects } = useProjectsByTerm(termId);
  const create = useCreateActivity(termId);
  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [cancelTarget, setCancelTarget] = useState<Activity | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const programOptions: ComboboxOption[] = useMemo(
    () => (programs ?? []).map((p) => ({ value: p.id, label: p.title })),
    [programs],
  );
  const projectOptions: ComboboxOption[] = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );

  const editingId = editing && editing !== "new" ? editing.id : null;
  const { data: checkInCount } = useQuery({
    queryKey: ["activities", "checkin-count", editingId],
    queryFn: () => new ActivityRepository().countCheckIns(editingId as string),
    enabled: editingId !== null,
  });
  const locked = (checkInCount ?? 0) > 0;

  const handleSubmit = async (data: ActivityInput) => {
    try {
      if (editing === "new") await create.mutateAsync(data);
      else if (editing) await update.mutateAsync({ id: editing.id, data });
      setEditing(null);
    } catch (err) {
      setToast(err instanceof ActivityLockedError ? err.message : "No se pudo guardar la actividad.");
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelActivity.mutateAsync(cancelTarget.id);
    } catch {
      setToast("No se pudo cancelar la actividad.");
    }
    setCancelTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Actividades"
        actions={
          <Can I="create" a="Activity">
            <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setEditing("new")}>
              Nueva actividad
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar las actividades.</p>}
      {activities && activities.length === 0 && (
        <EmptyState
          icon={Icon.calendar({ s: 40 })}
          title={`No hay actividades para ${termId}.`}
          description="Crea una actividad para registrar asistencia."
        />
      )}
      {activities && activities.length > 0 && (
        <ActivityTable activities={activities} onEdit={setEditing} onCancel={setCancelTarget} />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nueva actividad" : "Editar actividad"}
      >
        {editing !== null && (
          <ActivityForm
            key={editing === "new" ? "new" : editing.id}
            defaultValues={editing === "new" ? undefined : activityToInput(editing)}
            memberOptions={memberOptions}
            programOptions={programOptions}
            projectOptions={projectOptions}
            locked={editing !== "new" && locked}
            isSaving={create.isPending || update.isPending}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar actividad"
        description={
          cancelTarget ? `¿Cancelar la actividad? Se marcará como Cancelada, no se borra.` : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setCancelTarget(null)}>
            Volver
          </Button>
          <Button as="button" type="button" onClick={() => void confirmCancel()}>
            Cancelar actividad
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
```

(Confirm `Toast`'s prop API in `packages/ui/src/components/toast.tsx` — A5/contact use `<Toast message=... icon=... />`. If it needs an `onDismiss`/auto-hide, follow the existing usage; if the signature differs, adapt. The `activityToInput` startAt uses `.toISOString().slice(0,16)` to produce `YYYY-MM-DDTHH:mm` for `datetime-local`, matching the mapper's `${value}:00Z` round-trip.)

- [ ] **Step 5: Update ActivityTable to accept onEdit/onCancel**

In `activity-table.tsx`, add `onEdit`/`onCancel` props + per-row action buttons (mirror the InitiativeTable action pattern: an edit button `Icon.settings` and a cancel button `Icon.close`, each with `aria-label`). Add a "Programa/Proyecto" parent + director-name column if members/initiative names are passed; to keep scope tight, show `parentType`/`parentId` presence as a simple label and the `organizers.directorId` raw — OR pass a `memberName`/`initiativeName` resolver like InitiativeTable. Minimal version — add only the actions:

```tsx
interface ActivityTableProps {
  activities: Activity[];
  onEdit: (a: Activity) => void;
  onCancel: (a: Activity) => void;
}
```
Render two action buttons per row inside a new "Acciones" column:
```tsx
<button type="button" aria-label="Editar actividad" onClick={() => onEdit(a)} className="text-ink-2 hover:text-ink-1">
  {Icon.settings({ s: 17 })}
</button>
<button type="button" aria-label="Cancelar actividad" onClick={() => onCancel(a)} className="text-ink-2 hover:text-ink-1">
  {Icon.close({ s: 17 })}
</button>
```
(Read the current `activity-table.tsx` first and insert the column + props without breaking existing columns.)

- [ ] **Step 6: Add a form render test for the parent picker conditional**

Append to `apps/backstage/src/features/activities/components/activity-form.test.tsx`:

```tsx
import { ActivityForm } from "./activity-form";
// (reuse existing render/screen/userEvent imports in the file)

it("shows the parent picker only for ProjectExecution", async () => {
  const user = userEvent.setup();
  render(
    <ActivityForm
      memberOptions={[]}
      programOptions={[{ value: "pr1", label: "Programa X" }]}
      projectOptions={[{ value: "p1", label: "Proyecto Y" }]}
      isSaving={false}
      onSubmit={() => {}}
    />,
  );
  // default category Assembly => no parent picker
  expect(screen.queryByText("Padre")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Categoría"), "ProjectExecution");
  expect(screen.getByText("Padre")).toBeInTheDocument();
});
```

(If the existing test file's imports differ, only add the new `it` and any missing import.)

- [ ] **Step 7: Regenerate tree, typecheck, test, commit**

Run: `pnpm --filter backstage exec vite build`
Run: `pnpm --filter backstage exec vitest run src/features/activities`
Expected: PASS.

```bash
git add apps/backstage/src/features/activities apps/backstage/src/routes/_app.activities.tsx apps/backstage/src/routeTree.gen.ts
git commit -m "feat(activities): real parent picker + edit/cancel + member roster selects"
```

---

### Task 11: Full verification, reviews, PR

**Files:** none (integration).

- [ ] **Step 1: Regenerate + backstage CI**

Run: `pnpm --filter backstage exec vite build`
Run: `pnpm --filter @luminova/types run ci && pnpm --filter @luminova/auth run ci && pnpm --filter backstage run ci`
Expected: all PASS (prettier, eslint, tsc, build, vitest, knip, size-limit).

- [ ] **Step 2: Rules tests**

With an emulator up:
Run: `pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS (programs cases + existing). If port-conflict on a shared emulator, that is the known env gotcha — note it; the suite itself must pass when run against a clean emulator.

- [ ] **Step 3: knip + format**

Run: `pnpm knip` and `pnpm exec prettier --check "apps/backstage/src/**/*.{ts,tsx}" "packages/types/src/**/*.ts"`
Expected: clean. (New exports are consumed by routes/tests; if knip flags an unused hook, wire or remove it.)

- [ ] **Step 4: Reviews**

- Dispatch `firestore-security-reviewer` — new `programs` rule + new write paths (`update`, `fileFinalReport`, activity `cancel`, `countCheckIns` read). Confirm least-privilege + no engine-collection writes.
- Run `/security-review` on the diff — auth-gated routes + Firestore writes.
- Dispatch `bundle-budget-watcher` — first real route consumption of cmdk/popover (programs/projects/activities chunks). Re-check the inert `size-limit` gate (follow-up #8).
- `firebase-functions-reviewer` — NOT needed (no `apps/beacon` change).

Fix any ≥ High finding in-branch before the PR.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/events-crud
gh pr create --title "feat(backstage): D1 Events/Activities CRUD" --body "$(cat <<'EOF'
## Summary
- Program + Project CRUD (`/programs`, `/projects`) with member roster selects (Combobox/MultiSelect), status, and a minimal `fileFinalReport` action that flips child-activity points provisional→confirmed via A2's existing report triggers.
- Activity edit/cancel + a real program/project parent picker (replaces A3's free-text parentId); `startAt`/`category` lock once check-ins exist (engine-safety guard).
- New `programs` Firestore rule (signedIn read, Admin/PM write, no delete); ProjectManager gains `manage Program`.
- Writes only programs/projects/activities — never participations/memberPoints.

## Test plan
- [ ] types-ci + auth-ci + backstage-ci pass
- [ ] firestore-rules-tests pass (programs)
- [ ] /security-review + firestore-security-reviewer run (new rule + write paths)
- [ ] bundle-budget-watcher (first real widget route consumption)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Run pr-tests locally (hook reminder)**

Run: `pnpm pr-tests`
Expected: PASS (or rules-suite port-conflict only — the known env gotcha).

---

## Self-review

- **Spec coverage:** types schemas (T1) ✓; activity coDirector (T2) ✓; programs rule + tests (T3) ✓; CASL + nav (T4) ✓; shared form/table (T5) ✓; programs feature + route (T6, T7) ✓; projects feature + route (T8) ✓; activity repo guard (T9) ✓; parent picker + form + edit/cancel (T10) ✓; verification + reviews + PR (T11) ✓. Check-in prefill: **dropped** from the plan (spec marked it "light / deferred if it complicates" — not worth the cross-feature touch in v1; explicitly out). finalReport action ✓ (T6/T8 repos + T7/T8 routes).
- **Type consistency:** `InitiativeInput` (T1) used by `InitiativeForm` (T5) + `programSchema`/`projectSchema` aliases (T1) passed as its `schema` prop (T7/T8). `ProgramInput`/`ProjectInput` mappers (T6/T8) ↔ repos. `ActivityInput` gains `coDirectorId` (T2) used in mapper (T9) + form (T10). `lockedFieldsChanged`/`ActivityLockedError` (T9) ↔ repo.update + route catch (T9/T10). `activityKeys.byTerm` assumed — T9/T10 flag to confirm. `useAuth().user.uid` + `Can` path flagged to confirm against existing routes.
- **Placeholders:** none. The one anti-pattern guard (T10 Step 2's "DO NOT add" placeholder useForm) is an explicit instruction to avoid a mistake, with the correct code shown immediately after.
- **Assumptions flagged for the implementer to verify against real files (not guesses):** `Badge` tone union (T5), `Toast` prop API (T10), `useAuth` accessor + `Can` import path (T7), `activityKeys.byTerm` name (T9/T10), `this.db` presence on ActivityRepository (T9). Each step says to check the neighbouring existing file.
