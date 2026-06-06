# @luminova/types (F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the BUILT `@luminova/types` package, promote the shipped `Member`/`Ally` types + zod schemas into it (renaming `personInCharge → contactPerson`), and rewire `apps/backstage` to import from it.

**Architecture:** Mirror `@luminova/auth` — a `tsc`-built workspace package emitting `dist/`, consumed via a single root entrypoint `@luminova/types`. Persisted-interface files (`member.ts`, `ally.ts`) stay framework-free (type-only `firebase` import) so a beacon-safe subpath can be added later with no refactor; zod schema files import constants from the pure files.

**Tech Stack:** TypeScript 6, zod 4.4.3, vitest 4, Turborepo, pnpm workspaces. Firebase `Timestamp` (type-only).

---

## File structure

```
packages/types/
  package.json        # @luminova/types, build=tsc, ci=eslint+tsc+vitest; deps: zod; devDeps: firebase
  tsconfig.json       # extends base, outDir dist, rootDir src, exclude *.test.ts
  src/
    member.ts         # MEMBER_STATUSES (const), MemberStatus, Member  — framework-free
    member-schema.ts  # memberSchema, MemberInput  — imports MEMBER_STATUSES from ./member
    member-schema.test.ts
    ally.ts           # Ally (contactPerson)  — framework-free
    ally-schema.ts    # allySchema, AllyInput (contactPerson)
    ally-schema.test.ts
    index.ts          # barrel re-export — the public entrypoint
```

Deleted after rewire: `apps/backstage/src/features/members/types/*`, `apps/backstage/src/features/allies/types/*`.

---

### Task 1: Scaffold the package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@luminova/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "build": "tsc",
    "ci": "eslint . && tsc --noEmit && vitest run --passWithNoTests"
  },
  "dependencies": {
    "zod": "4.4.3"
  },
  "devDependencies": {
    "firebase": "12.14.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Write a temporary `src/index.ts`** (replaced in Task 4; lets the package install/typecheck now)

```ts
export {};
```

- [ ] **Step 4: Install so the workspace links the package**

Run: `pnpm install`
Expected: completes; `@luminova/types` linked. (`packages/*` is already in `pnpm-workspace.yaml`.)

- [ ] **Step 5: Verify the package builds + ci passes empty**

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (eslint clean, tsc clean, vitest "no tests" pass).

- [ ] **Step 6: Commit**

```bash
git add packages/types pnpm-lock.yaml
git commit -m "feat(types): scaffold @luminova/types package"
```

---

### Task 2: Member type + schema (with MEMBER_STATUSES ownership flip)

**Files:**
- Create: `packages/types/src/member.ts`
- Create: `packages/types/src/member-schema.ts`
- Create: `packages/types/src/member-schema.test.ts` (moved from backstage)

- [ ] **Step 1: Write the failing test** — `packages/types/src/member-schema.test.ts` (copy of the backstage test, imports from new local paths)

```ts
import { describe, expect, it } from "vitest";
import { memberSchema, MEMBER_STATUSES } from "./member-schema";

describe("memberSchema", () => {
  const valid = {
    name: "Ana Rivas",
    email: "ana@example.com",
    phone: "70000000",
    role: "Socia",
    profession: "Abogada",
    joinDate: "2024-01-15",
    birthdate: "1995-06-20",
    status: "Activo" as const,
  };

  it("accepts a valid member", () => {
    expect(memberSchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects names shorter than 3 chars", () => {
    expect(memberSchema.safeParse({ ...valid, name: "Al" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(memberSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects overflow dates (2024-02-30)", () => {
    expect(memberSchema.safeParse({ ...valid, birthdate: "2024-02-30" }).success).toBe(false);
  });

  it("exposes the three Spanish status values", () => {
    expect(MEMBER_STATUSES).toEqual(["Activo", "Inactivo", "Desafiliado"]);
  });
});
```

> Note: confirm against the original `apps/backstage/src/features/members/types/member-schema.test.ts`; if it has extra cases, port them verbatim rather than dropping them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/member-schema.test.ts`
Expected: FAIL — cannot resolve `./member-schema`.

- [ ] **Step 3: Write `member.ts`** (pure — owns the status const)

```ts
import type { Timestamp } from "firebase/firestore";

export const MEMBER_STATUSES = ["Activo", "Inactivo", "Desafiliado"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Persisted member document (Firestore shape). Form input is `MemberInput`. */
export interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profession?: string;
  joinDate: Timestamp;
  birthdate: Timestamp;
  status: MemberStatus;
  profilePicture: string | null;
  totalPoints: number;
  active: boolean;
  deletedAt: Timestamp | null;
}
```

- [ ] **Step 4: Write `member-schema.ts`** (imports the const as a value from `./member`)

```ts
import { z } from "zod";
import { MEMBER_STATUSES } from "./member";

const dateString = z
  .string()
  .min(1, "Requerido.")
  .refine((value) => {
    // Parse as UTC midnight and reject overflow dates (e.g. 2024-02-30 → 03-01).
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Fecha inválida.");

export const memberSchema = z.object({
  name: z.string().min(3, "Mínimo 3 caracteres."),
  email: z.string().email("Correo inválido."),
  phone: z.string().optional(),
  role: z.string().min(3, "Mínimo 3 caracteres."),
  profession: z.string().optional(),
  joinDate: dateString,
  birthdate: dateString,
  status: z.enum(MEMBER_STATUSES),
});

export type MemberInput = z.infer<typeof memberSchema>;

export { MEMBER_STATUSES };
```

> Re-exporting `MEMBER_STATUSES` here keeps the existing `member-schema` import site (`member-form.tsx` imports it from the schema) working through the barrel.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/member-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/member.ts packages/types/src/member-schema.ts packages/types/src/member-schema.test.ts
git commit -m "feat(types): add Member type + schema"
```

---

### Task 3: Ally type + schema with `personInCharge → contactPerson` rename

**Files:**
- Create: `packages/types/src/ally.ts`
- Create: `packages/types/src/ally-schema.ts`
- Create: `packages/types/src/ally-schema.test.ts` (moved from backstage, renamed field)

- [ ] **Step 1: Write the failing test** — `packages/types/src/ally-schema.test.ts` (uses `contactPerson`)

```ts
import { describe, expect, it } from "vitest";
import { allySchema } from "./ally-schema";

describe("allySchema", () => {
  const valid = {
    companyName: "Acme SRL",
    contactPerson: "Bruno Paz",
    phone: "70000000",
    email: "bruno@acme.com",
  };

  it("accepts a valid ally", () => {
    expect(allySchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects companyName shorter than 3 chars", () => {
    expect(allySchema.safeParse({ ...valid, companyName: "Ac" }).success).toBe(false);
  });

  it("rejects contactPerson shorter than 3 chars", () => {
    expect(allySchema.safeParse({ ...valid, contactPerson: "Bo" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(allySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects an empty phone", () => {
    expect(allySchema.safeParse({ ...valid, phone: "" }).success).toBe(false);
  });
});
```

> Confirm against the original `apps/backstage/src/features/allies/types/ally-schema.test.ts`; port any extra cases verbatim, swapping `personInCharge` → `contactPerson`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/ally-schema.test.ts`
Expected: FAIL — cannot resolve `./ally-schema`.

- [ ] **Step 3: Write `ally.ts`** (pure, renamed field)

```ts
import type { Timestamp } from "firebase/firestore";

/** Persisted ally document (Firestore shape). Form input is `AllyInput`. */
export interface Ally {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  active: boolean;
  deletedAt: Timestamp | null;
}
```

- [ ] **Step 4: Write `ally-schema.ts`** (renamed field)

```ts
import { z } from "zod";

export const allySchema = z.object({
  companyName: z.string().min(3, "Mínimo 3 caracteres."),
  contactPerson: z.string().min(3, "Mínimo 3 caracteres."),
  phone: z.string().min(1, "Requerido."),
  email: z.string().email("Correo inválido."),
});

export type AllyInput = z.infer<typeof allySchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/ally-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/ally.ts packages/types/src/ally-schema.ts packages/types/src/ally-schema.test.ts
git commit -m "feat(types): add Ally type + schema (personInCharge -> contactPerson)"
```

---

### Task 4: Barrel entrypoint

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with the real barrel**

```ts
export type { Member, MemberStatus } from "./member";
export { MEMBER_STATUSES } from "./member";
export { memberSchema, type MemberInput } from "./member-schema";
export type { Ally } from "./ally";
export { allySchema, type AllyInput } from "./ally-schema";
```

- [ ] **Step 2: Run the package ci**

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (eslint, tsc, all schema tests).

- [ ] **Step 3: Build to confirm dist emits self-contained js**

Run: `pnpm --filter @luminova/types run build`
Expected: PASS; `packages/types/dist/{index,member,member-schema,ally,ally-schema}.js` exist. (Do not commit `dist/` — confirm it's git-ignored like `packages/auth/dist`.)

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): expose package via root barrel entrypoint"
```

---

### Task 5: Rewire backstage MEMBER imports

**Files:**
- Modify: `apps/backstage/package.json` (add dep)
- Modify (repoint imports): `apps/backstage/src/features/members/components/member-form.tsx:5`, `.../components/member-table.test.tsx:8`, `.../components/member-table.tsx:13`, `.../hooks/use-add-member.ts:3`, `.../hooks/use-update-member.ts:3`, `.../repositories/member-mapper.test.ts:4`, `.../repositories/member-mapper.ts:2`, `.../repositories/member-repository.ts:13-14`, `apps/backstage/src/routes/_app.members.tsx:12-13`
- Delete: `apps/backstage/src/features/members/types/member.ts`, `.../member-schema.ts`, `.../member-schema.test.ts`

- [ ] **Step 1: Add the dependency to `apps/backstage/package.json`**

Add to `dependencies` (alphabetical position, next to other `@luminova/*`):

```json
"@luminova/types": "workspace:*",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; backstage resolves `@luminova/types`.

- [ ] **Step 3: Repoint every member import to `@luminova/types`**

Replace these specifiers (the symbols are unchanged — only the path):
- `"../types/member"` → `"@luminova/types"`
- `"../types/member-schema"` → `"@luminova/types"`
- `"../features/members/types/member"` → `"@luminova/types"` (in `_app.members.tsx`)
- `"../features/members/types/member-schema"` → `"@luminova/types"` (in `_app.members.tsx`)

Each stays a `type`-only or value import exactly as before. Example, `member-table.tsx:13`:

```ts
import type { Member, MemberStatus } from "@luminova/types";
```

`member-form.tsx:5` (value + type mix — unchanged shape):

```ts
import { memberSchema, type MemberInput, MEMBER_STATUSES } from "@luminova/types";
```

`_app.members.tsx:12-13` collapses two imports into one:

```ts
import type { Member, MemberInput } from "@luminova/types";
```

- [ ] **Step 4: Delete the local member type files**

```bash
git rm apps/backstage/src/features/members/types/member.ts \
       apps/backstage/src/features/members/types/member-schema.ts \
       apps/backstage/src/features/members/types/member-schema.test.ts
```

- [ ] **Step 5: Run backstage ci**

Run: `pnpm --filter backstage run ci`
Expected: PASS (eslint, tsc resolves `@luminova/types`, all member component/mapper/repo tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/package.json pnpm-lock.yaml apps/backstage/src
git commit -m "refactor(backstage): import Member types from @luminova/types"
```

---

### Task 6: Rewire backstage ALLY imports + apply `contactPerson` rename in consumers

**Files:**
- Modify (repoint imports): `apps/backstage/src/features/allies/components/ally-form.tsx:5`, `.../components/ally-table.test.tsx:7`, `.../components/ally-table.tsx:11`, `.../hooks/use-add-ally.ts:3`, `.../hooks/use-update-ally.ts:3`, `.../repositories/ally-mapper.ts:1`, `.../repositories/ally-repository.ts:13-14`, `apps/backstage/src/routes/_app.allies.tsx:11-12`
- Modify (rename field usages `personInCharge` → `contactPerson`): `.../repositories/ally-mapper.ts`, `.../components/ally-form.tsx`, `.../components/ally-table.tsx`, `.../components/ally-table.test.tsx`, `.../components/ally-form.test.tsx`, `apps/backstage/src/routes/_app.allies.tsx`
- Delete: `apps/backstage/src/features/allies/types/ally.ts`, `.../ally-schema.ts`, `.../ally-schema.test.ts`

- [ ] **Step 1: Update the consumer tests first (red)** — in `ally-table.test.tsx` and `ally-form.test.tsx`, rename every `personInCharge` to `contactPerson` (object fixtures, form-field assertions, query selectors). The user-facing Spanish label text ("Encargado") is NOT changed — only the identifier/field key.

- [ ] **Step 2: Run the ally tests to verify they fail**

Run: `pnpm --filter backstage exec vitest run src/features/allies`
Expected: FAIL — production code still uses `personInCharge` / still imports deleted-soon local paths.

- [ ] **Step 3: Repoint every ally import to `@luminova/types`**

- `"../types/ally"` → `"@luminova/types"`
- `"../types/ally-schema"` → `"@luminova/types"`
- `"../features/allies/types/ally"` → `"@luminova/types"` (in `_app.allies.tsx`)
- `"../features/allies/types/ally-schema"` → `"@luminova/types"` (in `_app.allies.tsx`)

`_app.allies.tsx:11-12` collapses to:

```ts
import type { Ally, AllyInput } from "@luminova/types";
```

`ally-form.tsx:5`:

```ts
import { allySchema, type AllyInput } from "@luminova/types";
```

- [ ] **Step 4: Rename `personInCharge` → `contactPerson` in the production consumers**

In `ally-mapper.ts` (`toAllyCreateDoc`/`toAllyUpdateDoc` field), `ally-form.tsx` (RHF field name + `register`/defaultValues key — keep label "Encargado"), `ally-table.tsx` (column accessor `ally.contactPerson`; header label stays "Encargado"), and `_app.allies.tsx` (any defaultValues / row mapping). Search to confirm none remain:

Run: `grep -rn personInCharge apps/backstage/src`
Expected: no output.

- [ ] **Step 5: Delete the local ally type files**

```bash
git rm apps/backstage/src/features/allies/types/ally.ts \
       apps/backstage/src/features/allies/types/ally-schema.ts \
       apps/backstage/src/features/allies/types/ally-schema.test.ts
```

- [ ] **Step 6: Run backstage ci (green)**

Run: `pnpm --filter backstage run ci`
Expected: PASS (all ally tests green with `contactPerson`).

- [ ] **Step 7: Commit**

```bash
git add apps/backstage/src
git commit -m "refactor(backstage): import Ally types from @luminova/types; rename personInCharge -> contactPerson"
```

---

### Task 7: Docs, roadmap, knip, full verification

**Files:**
- Modify: `docs/data-models.md` (ally field rename)
- Modify: `docs/roadmap.md` (F2 row → done)
- Verify: `knip.json` (no change expected — generic `packages/*` entry covers `src/index.ts`)

- [ ] **Step 1: Update `docs/data-models.md`** — in the allies section, rename `personInCharge` → `contactPerson` (keep the Spanish "Encargado" label note if present).

- [ ] **Step 2: Update `docs/roadmap.md`** — mark the F2 row done (strike `~~F2~~ ✅`, note `feat/luminova-types`), matching the F1 row's done-style. Add a line under "Done (baseline)" for `@luminova/types`.

- [ ] **Step 3: Confirm knip needs no change**

Run: `pnpm knip` (or `pnpm pr-tests` in step 4 which includes it)
Expected: no unused-dependency / unused-export errors for `@luminova/types`. (`zod` is used by schemas; `firebase` is used type-only by `member.ts`/`ally.ts`.) If knip flags the package, add a `"packages/types"` entry mirroring the generic one — but it should not.

- [ ] **Step 4: Full repo verification**

Run: `pnpm pr-tests`
Expected: PASS — format check, every package/app `ci`, and knip all green. (Firestore-rules tests may be Java-skipped in a non-interactive shell — that's pre-existing, not introduced here.)

- [ ] **Step 5: Commit**

```bash
git add docs/data-models.md docs/roadmap.md knip.json
git commit -m "docs(types): mark F2 done; rename ally contactPerson in data model"
```

---

## Self-review notes

- **Spec coverage:** package shape (T1), Member type+schema + status-const flip (T2), Ally type+schema + rename (T3), single barrel entrypoint (T4), backstage rewire member (T5) + ally/rename (T6), docs/roadmap/knip + verify (T7). All spec sections mapped.
- **Beacon-safety:** `MEMBER_STATUSES` owned by pure `member.ts`; schema files import it — `member.ts`/`ally.ts` carry no zod runtime. Subpath export deferred to A2 (per spec).
- **Type consistency:** symbols `Member`, `MemberStatus`, `MEMBER_STATUSES`, `MemberInput`, `memberSchema`, `Ally`, `AllyInput`, `allySchema` are identical across package exports and backstage imports; only `personInCharge → contactPerson` changes, applied in both the type/schema (T3) and all consumers (T6).
- **No new deps to vet:** `zod 4.4.3` / `firebase 12.14.0` already in the tree → `secure-dep-vetting` not triggered. No auth/rules/functions → no `/security-review`.
