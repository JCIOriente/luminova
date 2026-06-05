# Allies (Aliados) Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin CRUD for partner companies (aliados) at `/allies`, mirroring the members feature with soft-delete.

**Architecture:** `AllyRepository` over the `allies` Firestore collection; TanStack Query hooks; RHF + Zod form; Table/Sheet/Dialog from `@luminova/ui`. Soft-delete via `active`/`deletedAt` system fields + mapper, exactly like members.

**Tech Stack:** React 19, TanStack Router/Query v5, React Hook Form, Zod, Firebase Firestore, Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-06-05-allies-feature-design.md`.

---

### Task 1: Schema + types (TDD)

**Files:**
- Create: `apps/backstage/src/features/allies/types/ally-schema.ts`
- Create: `apps/backstage/src/features/allies/types/ally-schema.test.ts`
- Create: `apps/backstage/src/features/allies/types/ally.ts`

- [ ] **Step 1: Write failing schema test** — accept valid ally; reject invalid email, short companyName, short personInCharge, empty phone.
- [ ] **Step 2: Run** `pnpm --filter backstage test ally-schema` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `ally-schema.ts` (`allySchema`, `AllyInput`) and `ally.ts` (`Ally` with `active`/`deletedAt`).
- [ ] **Step 4: Run** test — expect PASS.
- [ ] **Step 5: Commit** `feat(backstage): allies schema + type`.

### Task 2: Mapper + repository

**Files:**
- Create: `apps/backstage/src/features/allies/repositories/ally-mapper.ts`
- Create: `apps/backstage/src/features/allies/repositories/ally-repository.ts`

`ally-mapper.ts`: `editableFields`, `toAllyCreateDoc` (adds `active:true,deletedAt:null`), `toAllyUpdateDoc`.
`ally-repository.ts`: `getAll` (where active==true, sort companyName es), `getById`, `create`, `update`, `softDelete`.

- [ ] Commit `feat(backstage): allies mapper + repository`.

### Task 3: Hooks

**Files:** `hooks/ally-keys.ts`, `use-allies.ts`, `use-add-ally.ts`, `use-update-ally.ts`, `use-delete-ally.ts` (under `apps/backstage/src/features/allies/`).

Mirror member hooks 1:1 (`allyKeys.all = ["allies"]`; delete → `softDelete`).

- [ ] Commit `feat(backstage): allies query hooks`.

### Task 4: Form component (TDD)

**Files:**
- Create: `apps/backstage/src/features/allies/components/ally-form.test.tsx`
- Create: `apps/backstage/src/features/allies/components/ally-form.tsx`

Test: blocks submit on empty (shows "Mínimo 3 caracteres."); submits valid data. Form: 4 `Field`+`Input` (Empresa, Encargado, Teléfono, Correo).

- [ ] Run test FAIL → implement → PASS → commit `feat(backstage): allies form`.

### Task 5: Table component

**Files:** `apps/backstage/src/features/allies/components/ally-table.tsx` — cols Empresa/Encargado/Teléfono/Correo/Acciones; empty state "No hay aliados todavía."

- [ ] Commit `feat(backstage): allies table`.

### Task 6: Route + sidebar

**Files:**
- Create: `apps/backstage/src/routes/_app.allies.tsx` (mirror `_app.members.tsx`).
- Modify: `apps/backstage/src/components/app-sidebar.tsx` — add "Aliados" → `/allies` after "Miembros".

- [ ] Run `pnpm --filter backstage build` (regenerates route tree). Commit `feat(backstage): allies route + sidebar nav`.

### Task 7: Docs sync

**Files:** Modify `docs/data-models.md` allies section — add `active`/`deletedAt` + soft-delete note.

- [ ] Commit `docs(backstage): allies soft-delete data model`.

### Task 8: Verify

- [ ] `pnpm --filter backstage run ci` green (prettier→eslint→tsc→build→vitest→knip→size-limit).
- [ ] Dispatch `firestore-security-reviewer` (touches repository + auth-guarded route).
- [ ] Dispatch `bundle-budget-watcher` (new route).
- [ ] `pnpm pr-tests`, open PR base `main`.

## Self-Review

Spec coverage: schema/type (T1), mapper/repo (T2), hooks (T3), form+test (T4), table (T5), route+sidebar (T6), docs (T7), verify+reviews (T8) — all spec sections covered. No placeholders (real code mirrored from members). Type names consistent: `Ally`, `AllyInput`, `AllyRepository`, `allyKeys`, `allySchema`, `toAllyCreateDoc`/`toAllyUpdateDoc`/`editableFields`, `softDelete`.
