# Allies (Aliados) Feature — Design

Date: 2026-06-05
Status: Approved (brainstorming)
Scope: `apps/backstage`

## Goal

Admin can list, create, edit, and delete partner companies (aliados) at `/allies`,
backed by an `AllyRepository` over the `allies` Firestore collection. Mirrors the
members feature's repository + TanStack Query + RHF/Zod + Table/Sheet/Dialog
structure 1:1.

## Key decision: soft-delete (overrides flat model)

The documented data model for `allies` is flat (no system fields). During
brainstorming the user chose **soft-delete** over hard-delete for consistency with
members. This adds `active` and `deletedAt` system fields to the allies model and
requires a mapper (like members).

Consequence: `docs/data-models.md` allies section is updated to include the system
fields and a soft-delete note, so docs stay the source of truth (no drift).

`firestore.rules` is NOT touched — soft-delete is a Firestore `update`, already
allowed by `allies → authenticated read/write`. Rules hardening remains deferred.

## Data model

Persisted document (`features/allies/types/ally.ts`):

```ts
import type { Timestamp } from "firebase/firestore";

export interface Ally {
  id: string;
  companyName: string;
  personInCharge: string;
  phone: string;
  email: string;
  active: boolean;            // system — soft-delete flag
  deletedAt: Timestamp | null; // system — soft-delete timestamp
}
```

No `totalPoints` / `profilePicture` (those are member-only). No date-of-X fields,
so the mapper performs no Timestamp conversion and the route needs no
`dateInputValue` helper.

## Schema (`features/allies/types/ally-schema.ts`)

All four editable fields required:

```ts
import { z } from "zod";

export const allySchema = z.object({
  companyName: z.string().min(3, "Mínimo 3 caracteres."),
  personInCharge: z.string().min(3, "Mínimo 3 caracteres."),
  phone: z.string().min(1, "Requerido."),
  email: z.string().email("Correo inválido."),
});

export type AllyInput = z.infer<typeof allySchema>;
```

## Mapper (`features/allies/repositories/ally-mapper.ts`)

Kept for create-default parity with members; simpler (no date conversion).

- `editableFields(data: AllyInput)` → the 4 fields.
- `toAllyCreateDoc(data)` → `{ ...editableFields(data), active: true, deletedAt: null }`.
- `toAllyUpdateDoc(data)` → `editableFields(data)` only (never touches system fields).

## Repository (`features/allies/repositories/ally-repository.ts`)

`class AllyRepository`, collection `allies`:

- `getAll(): Promise<Ally[]>` — `query(collection, where("active","==",true))`,
  sort by `companyName.localeCompare(b.companyName, "es")`.
- `getById(id): Promise<Ally | null>` — null if missing or `!active`.
- `create(data: AllyInput): Promise<string>` — `addDoc(toAllyCreateDoc(data))`.
- `update(id, data: AllyInput): Promise<void>` — `updateDoc(toAllyUpdateDoc(data))`.
- `softDelete(id): Promise<void>` — `updateDoc({ active: false, deletedAt: serverTimestamp() })`.

## Hooks (`features/allies/hooks/`)

- `ally-keys.ts` — `export const allyKeys = { all: ["allies"] as const };`
- `use-allies.ts` — `useQuery({ queryKey: allyKeys.all, queryFn: () => new AllyRepository().getAll() })`.
- `use-add-ally.ts` — mutation → `create`, invalidate `allyKeys.all`.
- `use-update-ally.ts` — mutation → `update({id,data})`, invalidate.
- `use-delete-ally.ts` — mutation → `softDelete(id)`, invalidate.

## Components (`features/allies/components/`)

- `ally-table.tsx` — columns: Empresa, Encargado, Teléfono, Correo, acciones
  (editar / eliminar). Props `{ allies, onEdit, onDelete }`. Uses `@luminova/ui`
  Table widgets. Empty state Spanish copy.
- `ally-form.tsx` — RHF + zodResolver(allySchema), 4 fields with Spanish labels
  (Empresa, Encargado, Teléfono, Correo). Props mirror `MemberForm`
  (`defaultValues`, `submitLabel`, `onSubmit`).

## Route (`routes/_app.allies.tsx`)

Mirrors `_app.members.tsx`:

- `createFileRoute("/_app/allies")`.
- State: `editing: Ally | "new" | null`, `deleteTarget: Ally | null`.
- `allyToInput(ally): Partial<AllyInput>` helper (no date conversion).
- Header: `<h2>Aliados</h2>` + `Agregar aliado` button.
- Loading / error copy: "Cargando…" / "No se pudieron cargar los aliados."
- `Sheet` titled "Agregar aliado" / "Editar aliado" wrapping `AllyForm`
  (submit labels "Crear" / "Guardar").
- `Dialog` titled "Eliminar aliado", description:
  "¿Eliminar a {companyName}? Se marcará como inactivo, no se borra definitivamente."

## Sidebar (`components/app-sidebar.tsx`)

Add nav link "Aliados" → `/allies`, positioned after "Miembros".

## Tests (TDD — write first)

- `types/ally-schema.test.ts` — accept a valid ally; reject invalid email,
  empty/short companyName & personInCharge, empty phone. Mirrors
  `member-schema.test.ts`.
- `components/ally-form.test.tsx` — renders fields, shows validation errors,
  calls `onSubmit` with valid data. Mirrors `member-form.test.tsx`.

## File inventory

```
apps/backstage/src/features/allies/
  types/ally.ts
  types/ally-schema.ts
  types/ally-schema.test.ts
  repositories/ally-mapper.ts
  repositories/ally-repository.ts
  hooks/ally-keys.ts
  hooks/use-allies.ts
  hooks/use-add-ally.ts
  hooks/use-update-ally.ts
  hooks/use-delete-ally.ts
  components/ally-table.tsx
  components/ally-form.tsx
  components/ally-form.test.tsx
apps/backstage/src/routes/_app.allies.tsx        (new)
apps/backstage/src/components/app-sidebar.tsx     (edit — add nav link)
docs/data-models.md                               (edit — allies system fields)
```

## Out of scope

Pagination, table search/filter, `firestore.rules` hardening, profilePicture/logo
upload, `@luminova/types` promotion, events/point-rules features.

## Verification

`pnpm --filter backstage run ci` green (prettier → eslint → tsc → build → vitest →
knip → size-limit), then `pnpm pr-tests`. `bundle-budget-watcher` after (new route).
PR base `main`, branch off `main` before first edit, Conventional Commits scope
`(backstage)`, checkpoint commits ≤10 files.
