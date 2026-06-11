# Cargos, Comisiones & Permisos refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `/positions` so comisiones read as memberships (not cargos), gendered cargo names store one value and derive the feminine, and a new `/permisos` page makes "who can do what" visible.

**Architecture:** Five slices. Slice 1 changes `@luminova/types` (derive helper + optional `titleFemale`/new `sigla` + schema) — the foundation everything reads through. Slices 2–4 are backstage UI (category-aware position form, sectioned catalog, comisión-as-membership member views). Slice 5 adds a read-only Permisos overview page driven by a pure helper. No `firestore.rules` change.

**Tech Stack:** React 19, TanStack Router/Query, RHF + Zod, `@luminova/ui`, `@luminova/types`, vitest (jsdom for backstage, node for types).

**Spec:** `docs/superpowers/specs/2026-06-11-cargos-comisiones-permisos-design.md`

---

## File Structure

- **Modify** `packages/types/src/position.ts` — add `femaleTitle()`, make `titleFemale` optional + add `sigla`, update `positionTitle()`.
- **Modify** `packages/types/src/position-schema.ts` — optional `titleFemale`, optional `sigla`, comisión superRefine.
- **Modify** `packages/types/src/position.test.ts` + `position-schema.test.ts` — cover derivation + new rules.
- **Modify** `apps/backstage/src/features/positions/repositories/position-mapper.ts` — coerce optional fields to `null` (Firestore rejects `undefined`).
- **Modify** `apps/backstage/src/features/positions/components/position-form.tsx` — category-aware fields.
- **Modify** `apps/backstage/src/features/positions/components/position-table.tsx` → split into `PositionSection`.
- **Modify** `apps/backstage/src/routes/_app.positions.tsx` — render three sections.
- **Modify** `apps/backstage/src/features/members/components/member-form.tsx` + `member-position-history.tsx` — comisión sigla chips + relabel.
- **Create** `apps/backstage/src/features/positions/lib/permissions-overview.ts` (+ test) — `buildPermissionsOverview`.
- **Create** `apps/backstage/src/routes/_app.permisos.tsx` — Permisos page.
- **Modify** `apps/backstage/src/components/nav-config.ts` — add "Permisos" nav item.

---

## Slice 1 — Types: derive feminine + optional fields + schema

### Task 1: `femaleTitle` + `positionTitle` derivation

**Recommended model:** sonnet.

**Files:**
- Modify: `packages/types/src/position.ts`
- Test: `packages/types/src/position.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `packages/types/src/position.test.ts` (create the file if absent, importing from `./position.js`):

```ts
import { describe, expect, it } from "vitest";
import { femaleTitle, positionTitle } from "./position.js";

describe("femaleTitle", () => {
  it("maps -o to -a", () => {
    expect(femaleTitle("Tesorero")).toBe("Tesorera");
    expect(femaleTitle("Secretario")).toBe("Secretaria");
  });
  it("maps -e to -a", () => {
    expect(femaleTitle("Presidente")).toBe("Presidenta");
  });
  it("adds -a to a consonant ending", () => {
    expect(femaleTitle("Director")).toBe("Directora");
    expect(femaleTitle("Asesor")).toBe("Asesora");
  });
  it("feminizes only the first word, keeping the rest", () => {
    expect(femaleTitle("Vicepresidente de Área")).toBe("Vicepresidenta de Área");
    expect(femaleTitle("Asesor Legal")).toBe("Asesora Legal");
  });
});

describe("positionTitle", () => {
  const base = { title: "Director" };
  it("returns title for non-female", () => {
    expect(positionTitle(base, "Masculino")).toBe("Director");
    expect(positionTitle(base, undefined)).toBe("Director");
  });
  it("derives the feminine when no override", () => {
    expect(positionTitle(base, "Femenino")).toBe("Directora");
  });
  it("uses an explicit titleFemale override when present", () => {
    expect(positionTitle({ title: "Pasado Presidente", titleFemale: "Pasada Presidenta" }, "Femenino")).toBe(
      "Pasada Presidenta",
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`femaleTitle` not exported).

Run: `pnpm --filter @luminova/types exec vitest run src/position.test.ts`
Expected: FAIL — `femaleTitle is not a function`.

- [ ] **Step 3: Implement.** In `packages/types/src/position.ts`: make `titleFemale` optional + add `sigla`, add `femaleTitle`, update `positionTitle`:

```ts
export interface Position {
  id: string;
  title: string;
  /** Override for the feminine form. Absent → derived via femaleTitle(). */
  titleFemale?: string | null;
  /** Comisión acronym (e.g. "CCE"). Unused for CEL/JDL. */
  sigla?: string | null;
  category: PositionCategory;
  grants: Role[];
  term: number | null;
  description: string;
  active: boolean;
  deletedAt: Timestamp | null;
}
```

```ts
/** Derive the feminine form: feminize the FIRST word (-o→-a, -e→-a, else +a),
 *  keep the rest. Irregular multi-word titles need an explicit titleFemale. */
export function femaleTitle(title: string): string {
  const [first, ...rest] = title.split(" ");
  let f: string;
  if (/o$/.test(first)) f = first.replace(/o$/, "a");
  else if (/e$/.test(first)) f = first.replace(/e$/, "a");
  else f = first + "a";
  return [f, ...rest].join(" ");
}

export function positionTitle(
  position: Pick<Position, "title" | "titleFemale">,
  gender: MemberGender | undefined,
): string {
  if (gender !== "Femenino") return position.title;
  return position.titleFemale ?? femaleTitle(position.title);
}
```

- [ ] **Step 4: Run, expect PASS.**

Run: `pnpm --filter @luminova/types exec vitest run src/position.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/types/src/position.ts packages/types/src/position.test.ts
git commit -m "feat(types): derive feminine cargo title; titleFemale optional + sigla"
```

### Task 2: Position schema — optional fields + comisión rules

**Recommended model:** sonnet.

**Files:**
- Modify: `packages/types/src/position-schema.ts`
- Test: `packages/types/src/position-schema.test.ts`

- [ ] **Step 1: Update the failing tests.** Replace `packages/types/src/position-schema.test.ts` with (note: comisión now needs `sigla`, no `titleFemale`):

```ts
import { describe, expect, it } from "vitest";
import { positionSchema } from "./position-schema.js";

const base = {
  title: "Director de Miembro Individual",
  titleFemale: "Directora de Miembro Individual",
  category: "JDL" as const,
  grants: ["Membership" as const],
  term: 2026,
  description: "Acompaña a los miembros individuales.",
};

const comision = {
  title: "Comisión de Conducta y Ética",
  sigla: "CCE",
  category: "Comision" as const,
  grants: [] as const,
  term: null,
  description: "Vela por la conducta y la ética.",
};

describe("positionSchema", () => {
  it("accepts a JDL dirección with a term", () => {
    expect(positionSchema.safeParse(base).success).toBe(true);
  });
  it("accepts a CEL cargo without titleFemale (derived)", () => {
    const cel = { ...base, category: "CEL" as const, term: null, titleFemale: undefined };
    expect(positionSchema.safeParse(cel).success).toBe(true);
  });
  it("rejects JDL without term", () => {
    expect(positionSchema.safeParse({ ...base, term: null }).success).toBe(false);
  });
  it("rejects CEL with term", () => {
    expect(positionSchema.safeParse({ ...base, category: "CEL", term: 2026 }).success).toBe(false);
  });
  it("accepts a comisión with sigla and no grants", () => {
    expect(positionSchema.safeParse(comision).success).toBe(true);
  });
  it("rejects a comisión without sigla", () => {
    expect(positionSchema.safeParse({ ...comision, sigla: undefined }).success).toBe(false);
  });
  it("rejects a comisión that grants permissions", () => {
    expect(positionSchema.safeParse({ ...comision, grants: ["Admin"] }).success).toBe(false);
  });
  it("rejects a comisión with a term", () => {
    expect(positionSchema.safeParse({ ...comision, term: 2026 }).success).toBe(false);
  });
  it("rejects a non-comisión carrying a sigla", () => {
    expect(positionSchema.safeParse({ ...base, sigla: "XYZ" }).success).toBe(false);
  });
  it("rejects unknown grant roles", () => {
    expect(positionSchema.safeParse({ ...base, grants: ["SuperUser"] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter @luminova/types exec vitest run src/position-schema.test.ts`
Expected: FAIL (sigla unknown / comisión rules not enforced).

- [ ] **Step 3: Implement.** Replace `packages/types/src/position-schema.ts`:

```ts
import { z } from "zod";
import { POSITION_CATEGORIES } from "./position.js";
import { ROLES } from "./permission-role.js";

const optionalText = (min: number, msg: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().min(min, msg).optional());

export const positionSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    titleFemale: optionalText(3, "Mínimo 3 caracteres."),
    sigla: optionalText(1, "Requerido."),
    category: z.enum(POSITION_CATEGORIES),
    grants: z.array(z.enum(ROLES)),
    term: z
      .number({ error: "Requerido." })
      .int()
      .min(2000, "Año inválido.")
      .max(2100, "Año inválido.")
      .nullable(),
    description: z.string().min(1, "Requerido."),
  })
  .refine((p) => (p.category === "JDL") === (p.term !== null), {
    message: "Solo las direcciones JDL llevan gestión.",
    path: ["term"],
  })
  .superRefine((p, ctx) => {
    if (p.category === "Comision") {
      if (!p.sigla)
        ctx.addIssue({ code: "custom", path: ["sigla"], message: "Requerido para comisiones." });
      if (p.grants.length > 0)
        ctx.addIssue({
          code: "custom",
          path: ["grants"],
          message: "Las comisiones no otorgan permisos.",
        });
      if (p.titleFemale)
        ctx.addIssue({
          code: "custom",
          path: ["titleFemale"],
          message: "Las comisiones no llevan variante femenina.",
        });
    } else if (p.sigla) {
      ctx.addIssue({ code: "custom", path: ["sigla"], message: "Solo las comisiones llevan sigla." });
    }
  });

export type PositionInput = z.infer<typeof positionSchema>;
```

- [ ] **Step 4: Run, expect PASS** (the whole types package):

Run: `pnpm --filter @luminova/types run ci`
Expected: PASS (all types tests + tsc + eslint).

- [ ] **Step 5: Commit.**

```bash
git add packages/types/src/position-schema.ts packages/types/src/position-schema.test.ts
git commit -m "feat(types): position schema — optional titleFemale, comisión sigla rules"
```

### Task 3: Position mapper — null-coerce optional fields

**Recommended model:** sonnet.

**Files:**
- Modify: `apps/backstage/src/features/positions/repositories/position-mapper.ts`
- Test: `apps/backstage/src/features/positions/repositories/position-mapper.test.ts`

- [ ] **Step 1: Write failing tests.** Append to (or create) `position-mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPositionCreateDoc, toPositionUpdateDoc } from "./position-mapper";

const cel = {
  title: "Presidente",
  titleFemale: undefined,
  sigla: undefined,
  category: "CEL" as const,
  grants: ["Admin" as const],
  term: null,
  description: "Dirige el capítulo.",
};

describe("position mapper null-coercion", () => {
  it("create: undefined titleFemale/sigla become null (Firestore-safe)", () => {
    const doc = toPositionCreateDoc(cel);
    expect(doc.titleFemale).toBeNull();
    expect(doc.sigla).toBeNull();
    expect(doc.active).toBe(true);
    expect(doc.deletedAt).toBeNull();
  });
  it("update: keeps provided values, nulls absent ones", () => {
    const doc = toPositionUpdateDoc({ ...cel, sigla: "CCE", category: "Comision", grants: [] });
    expect(doc.sigla).toBe("CCE");
    expect(doc.titleFemale).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/repositories/position-mapper.test.ts`
Expected: FAIL (`titleFemale` is `undefined`, not `null`).

- [ ] **Step 3: Implement.** Replace `position-mapper.ts`:

```ts
import type { PositionInput } from "@luminova/types";

/** Firestore rejects `undefined`; the optional override/sigla store as null. */
export function toPositionCreateDoc(data: PositionInput) {
  return {
    ...data,
    titleFemale: data.titleFemale ?? null,
    sigla: data.sigla ?? null,
    active: true,
    deletedAt: null,
  };
}

export function toPositionUpdateDoc(data: PositionInput) {
  return { ...data, titleFemale: data.titleFemale ?? null, sigla: data.sigla ?? null };
}
```

- [ ] **Step 4: Run, expect PASS.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/repositories/position-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/features/positions/repositories/position-mapper.ts apps/backstage/src/features/positions/repositories/position-mapper.test.ts
git commit -m "fix(positions): mapper null-coerces optional titleFemale/sigla for Firestore"
```

---

## Slice 2 — Position form: category-aware fields

### Task 4: Conditional title-female / sigla / grants by category

**Recommended model:** sonnet.

**Files:**
- Modify: `apps/backstage/src/features/positions/components/position-form.tsx`
- Test: `apps/backstage/src/features/positions/components/position-form.test.tsx`

**Behavior to implement** (driven by `const category = watch("category")`):
- Add `import { femaleTitle } from "@luminova/types"` (already imports `POSITION_CATEGORIES`, `ROLES`, etc.).
- Title `<Field>` label: `category === "Comision" ? "Nombre" : "Cargo"`.
- **Feminine variant** (render only when `category !== "Comision"`): a `<Field label="Variante femenina (opcional)">` with an `<Input {...register("titleFemale")} />` whose `placeholder` is `watch("title") ? femaleTitle(watch("title")) : "Se deriva automáticamente"`. Add a `hint`: "Vacío = se deriva del nombre." Wrap it in a `<details>`/collapsible OR just render it below title — keep it visually secondary (implementer choice; default: always render but with the derived placeholder).
- **Sigla** (render only when `category === "Comision"`): `<Field label="Sigla" required><Input {...register("sigla")} placeholder="CCE" /></Field>`.
- **Permisos / grants** block: render only when `canEditGrants && category !== "Comision"` (was `canEditGrants` only).
- On category change to `"Comision"`: in the existing `onChange` for the category select, also `setValue("grants", [])` and `setValue("titleFemale", "")` (and keep the existing `term` reset). On change away from Comisión, `setValue("sigla", "")`.
- `EMPTY` default: add `titleFemale: "", sigla: ""` (RHF needs defined defaults; the schema's `preprocess` maps `""`→`undefined`).

- [ ] **Step 1: Write failing tests.** Add to `position-form.test.tsx` (follow the file's existing render harness; if none, create one rendering `<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />`):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PositionForm } from "./position-form";

function renderForm() {
  return render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
}

describe("PositionForm category-aware fields", () => {
  it("CEL shows feminine variant + permisos, no sigla", () => {
    renderForm();
    expect(screen.getByLabelText(/variante femenina/i)).toBeInTheDocument();
    expect(screen.getByText(/permisos que otorga/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/sigla/i)).not.toBeInTheDocument();
  });
  it("Comisión shows sigla, hides feminine variant + permisos", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/categoría/i), "Comision");
    expect(screen.getByLabelText(/sigla/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/variante femenina/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permisos que otorga/i)).not.toBeInTheDocument();
  });
  it("suggests the derived feminine as placeholder", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^cargo/i), "Director");
    expect(screen.getByLabelText(/variante femenina/i)).toHaveAttribute("placeholder", "Directora");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/position-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the category-aware fields per the "Behavior to implement" list above. Read the current `position-form.tsx` first and preserve its structure (the category `<Select>` `onChange` that already calls `setValue("term", …)`).

- [ ] **Step 4: Run, expect PASS.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/position-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/features/positions/components/position-form.tsx apps/backstage/src/features/positions/components/position-form.test.tsx
git commit -m "feat(positions): category-aware form — sigla for comisiones, derived feminine, no grants for comisiones"
```

---

## Slice 3 — Catalog: three sections

### Task 5: `PositionSection` + sectioned `/positions`

**Recommended model:** sonnet.

**Files:**
- Modify: `apps/backstage/src/features/positions/components/position-table.tsx` (rename concept to `PositionSection`)
- Modify: `apps/backstage/src/routes/_app.positions.tsx`
- Test: `apps/backstage/src/features/positions/components/position-table.test.tsx`

**Behavior:**
- Add a `PositionSection` component: props `{ title: string; positions: Position[]; variant: "cargo" | "comision"; onEdit; onDeactivate }`. It renders a section heading (`<SectionHeader>`/`<h2>`) + a `Table`:
  - `variant === "cargo"`: columns `Cargo` (`position.title`), `Gestión` (only meaningful for JDL — show `position.term ?? "—"`), `Permisos` (`grantsLabel`), `Acciones`. Drop the "Variante femenina" column.
  - `variant === "comision"`: columns `Sigla` (`position.sigla ?? "—"`), `Nombre` (`position.title`), `Acciones`. No gender, no permisos.
  - Empty section → `<EmptyState>` ("Sin cargos en esta categoría." / "Sin comisiones.").
- `_app.positions.tsx`: split `activePositions` by category and render three `PositionSection`s in order: CEL ("Cargos"), JDL ("Direcciones"), Comisión ("Comisiones"). The seed/empty-catalog `EmptyState` + "Crear cargos CEL" + "Nuevo cargo" Sheet/Dialog all stay. Keep the single "Nuevo cargo" button.

- [ ] **Step 1: Write failing tests** in `position-table.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PositionSection } from "./position-table";

const cargo = {
  id: "c1", title: "Tesorero", titleFemale: null, sigla: null, category: "CEL" as const,
  grants: ["Treasury" as const], term: null, description: "", active: true, deletedAt: null,
};
const com = {
  id: "k1", title: "Comisión de Conducta y Ética", titleFemale: null, sigla: "CCE",
  category: "Comision" as const, grants: [], term: null, description: "", active: true, deletedAt: null,
};

describe("PositionSection", () => {
  it("cargo variant shows Permisos, no Sigla column", () => {
    render(<PositionSection title="Cargos" positions={[cargo]} variant="cargo" onEdit={vi.fn()} onDeactivate={vi.fn()} />);
    expect(screen.getByText("Permisos")).toBeInTheDocument();
    expect(screen.queryByText("Sigla")).not.toBeInTheDocument();
    expect(screen.getByText("Tesorero")).toBeInTheDocument();
  });
  it("comision variant shows Sigla, no Permisos column", () => {
    render(<PositionSection title="Comisiones" positions={[com]} variant="comision" onEdit={vi.fn()} onDeactivate={vi.fn()} />);
    expect(screen.getByText("Sigla")).toBeInTheDocument();
    expect(screen.getByText("CCE")).toBeInTheDocument();
    expect(screen.queryByText("Permisos")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`PositionSection` not exported).

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/position-table.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `PositionSection` in `position-table.tsx` (keep the existing `Can`-gated row actions + `grantsLabel`). Then rewrite `_app.positions.tsx` to render three sections. If a prior `PositionTable` export is referenced elsewhere, grep and update the import (`grep -rn "PositionTable" apps/backstage/src`).

- [ ] **Step 4: Run, expect PASS** + the route still builds:

Run: `pnpm --filter backstage exec vitest run src/features/positions/ && pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/features/positions/components/position-table.tsx apps/backstage/src/routes/_app.positions.tsx apps/backstage/src/features/positions/components/position-table.test.tsx
git commit -m "feat(positions): sectioned catalog — Cargos / Direcciones / Comisiones"
```

---

## Slice 4 — Member views: comisión as membership

### Task 6: Sigla chips + relabel on member surfaces

**Recommended model:** sonnet.

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-form.tsx` (comisión multiselect label + option labels)
- Modify: `apps/backstage/src/features/members/components/member-position-history.tsx` (comisión chips show sigla)
- Test: the relevant existing test files for those components

**Behavior:**
- `member-form.tsx`: the comisión `MultiSelect` `<Field label>` → "Comisiones (pertenece a)". Build comisión options as `label: p.sigla ? \`${p.sigla} — ${p.title}\` : p.title` (the cargo Combobox keeps `positionTitle(p, gender)`).
- `member-position-history.tsx`: when listing a term's comisiones, render each as its `sigla ?? title` (a compact chip), and where the section is labelled, use "Pertenece a". Read the file first to match its current rendering; keep cargo rendering via `positionTitle`.

- [ ] **Step 1: Write/extend failing tests.** In the member-form test, assert the comisión option label includes the sigla:

```tsx
// within the existing member-form render test, with a comisión position { sigla: "CCE", title: "Comisión de Conducta y Ética", category: "Comision" }
// open the Comisiones multiselect and assert the option text:
expect(await screen.findByText(/CCE — Comisión de Conducta y Ética/)).toBeInTheDocument();
```
And in `member-position-history.test.tsx`, assert a comisión chip shows `CCE`.

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-form.test.tsx src/features/members/components/member-position-history.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the label + chip changes (read each file first to preserve structure).

- [ ] **Step 4: Run, expect PASS.**

Run: `pnpm --filter backstage exec vitest run src/features/members/`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/features/members/components/member-form.tsx apps/backstage/src/features/members/components/member-position-history.tsx apps/backstage/src/features/members/components/*.test.tsx
git commit -m "feat(members): comisiones render as memberships with siglas"
```

---

## Slice 5 — Permisos overview page

### Task 7: `buildPermissionsOverview` pure helper

**Recommended model:** opus.

**Files:**
- Create: `apps/backstage/src/features/positions/lib/permissions-overview.ts`
- Test: `apps/backstage/src/features/positions/lib/permissions-overview.test.ts`

**Contract:**
```ts
import type { Member, Position, Role } from "@luminova/types";

export interface PermissionRow {
  role: Role;
  grantingCargos: string[];          // position.title where grants includes role & active
  holders: { id: string; name: string }[]; // members whose effective roles include role
}

// Roles surfaced (cargo-granted, meaningful to manage). Member/Scanner excluded.
export const MANAGED_ROLES: Role[] = ["Admin", "Membership", "Treasury", "ExecutiveCommittee", "ProjectManager"];

export function buildPermissionsOverview(
  positions: Position[],
  members: Member[],
  termKey: string,
): PermissionRow[];
```
Use the existing `effectiveRoles(member, positionsById, termKey)` from `apps/backstage/src/features/members/lib/member-permissions.ts` to compute holders. `grantingCargos` = active positions whose `grants` includes the role.

- [ ] **Step 1: Write failing tests** `permissions-overview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPermissionsOverview, MANAGED_ROLES } from "./permissions-overview";

const pres = { id: "p1", title: "Presidente", category: "CEL", grants: ["Admin"], term: null, active: true, deletedAt: null, titleFemale: null, sigla: null, description: "" } as const;
const tes = { id: "p2", title: "Tesorero", category: "CEL", grants: ["Treasury"], term: null, active: true, deletedAt: null, titleFemale: null, sigla: null, description: "" } as const;

const olivia = { id: "m0", name: "Olivia", positions: { "2026": { cargoId: "p1", comisionIds: [], assignedBy: "m0" } } } as any;

describe("buildPermissionsOverview", () => {
  const rows = buildPermissionsOverview([pres, tes], [olivia], "2026");
  it("covers the managed roles", () => {
    expect(rows.map((r) => r.role)).toEqual(MANAGED_ROLES);
  });
  it("lists the cargo that grants Admin", () => {
    expect(rows.find((r) => r.role === "Admin")!.grantingCargos).toEqual(["Presidente"]);
  });
  it("lists Olivia as an Admin holder", () => {
    expect(rows.find((r) => r.role === "Admin")!.holders).toEqual([{ id: "m0", name: "Olivia" }]);
  });
  it("shows Treasury granted-by but held by nobody", () => {
    const t = rows.find((r) => r.role === "Treasury")!;
    expect(t.grantingCargos).toEqual(["Tesorero"]);
    expect(t.holders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/lib/permissions-overview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `permissions-overview.ts`:

```ts
import type { Member, Position, Role } from "@luminova/types";
import { effectiveRoles } from "../../members/lib/member-permissions";

export interface PermissionRow {
  role: Role;
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}

export const MANAGED_ROLES: Role[] = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
];

export function buildPermissionsOverview(
  positions: Position[],
  members: Member[],
  termKey: string,
): PermissionRow[] {
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  const memberRoles = members.map((m) => ({ m, roles: effectiveRoles(m, positionsById, termKey) }));
  return MANAGED_ROLES.map((role) => ({
    role,
    grantingCargos: positions
      .filter((p) => p.active && p.grants.includes(role))
      .map((p) => p.title),
    holders: memberRoles
      .filter(({ roles }) => roles.includes(role))
      .map(({ m }) => ({ id: m.id, name: m.name })),
  }));
}
```

- [ ] **Step 4: Run, expect PASS.**

Run: `pnpm --filter backstage exec vitest run src/features/positions/lib/permissions-overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/features/positions/lib/permissions-overview.ts apps/backstage/src/features/positions/lib/permissions-overview.test.ts
git commit -m "feat(permisos): buildPermissionsOverview — roles x granting cargos x holders"
```

### Task 8: `/permisos` route + nav item

**Recommended model:** opus.

**Files:**
- Create: `apps/backstage/src/routes/_app.permisos.tsx`
- Modify: `apps/backstage/src/components/nav-config.ts`

**Behavior:**
- Route `createFileRoute("/_app/permisos")`. Component reads `usePositions()` + `useMembers()`, computes `buildPermissionsOverview(positions ?? [], members ?? [], currentTermKey())` (import `currentTermKey` from `@luminova/types`), renders a `PageHeader` ("Gestión" / "Permisos" / subtitle) and a card per `PermissionRow`:
  - heading = `PERMISSION_ROLE_INFO[row.role].label` + description.
  - "Otorgado por:" → `row.grantingCargos.join(", ")` or "—".
  - "Lo tienen:" → `row.holders.map(h => h.name).join(", ")` or "Nadie aún".
  - a `<Link to="/positions">Editar permisos →</Link>`.
  - Loading → `Skeleton`; gate the whole page behind Admin (the route component may `useAbility().can("manage","all")` and render a "No autorizado" note otherwise — nav already hides it; defense in depth).
- `nav-config.ts`: add to the "Gestión" group, after the `/positions` item:
  ```ts
  { to: "/permisos", label: "Permisos", icon: "shield", roles: ["Admin"] },
  ```
  Use an existing icon key — check `apps/backstage/src/components/nav-config.ts` `IconKey` union and the `Icon` set in `@luminova/ui` for a fitting key (e.g. `shield`, `key`, or reuse `settings`). If none fits, add the icon to `@luminova/ui` `icons.tsx` in this task and to the `IconKey` union.

- [ ] **Step 1: Write a failing test** `apps/backstage/src/routes/-_app.permisos.test.tsx` (the `-` prefix stops the router plugin treating it as a route). Render the page body with a QueryClient + mocked hooks, OR (simpler) extract the presentational body into a `PermisosView({ rows, isLoading })` component in `apps/backstage/src/features/positions/components/permisos-view.tsx` and test THAT:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermisosView } from "../features/positions/components/permisos-view";

it("renders a card per role with granting cargos and holders", () => {
  render(
    <PermisosView
      isLoading={false}
      rows={[{ role: "Admin", grantingCargos: ["Presidente"], holders: [{ id: "m0", name: "Olivia" }] }]}
    />,
  );
  expect(screen.getByText(/Administración/)).toBeInTheDocument();
  expect(screen.getByText(/Presidente/)).toBeInTheDocument();
  expect(screen.getByText(/Olivia/)).toBeInTheDocument();
});
```
(Recommended: build `PermisosView` as the presentational component so the route file stays thin and testable; the route wires hooks → `PermisosView`.)

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter backstage exec vitest run src/routes/-_app.permisos.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `permisos-view.tsx` (presentational), `_app.permisos.tsx` (wires `usePositions`/`useMembers`/`buildPermissionsOverview` → `PermisosView`, Admin-gated), and the nav item. Regenerate the route tree: run `pnpm --filter backstage exec vite build` once so `routeTree.gen.ts` picks up the new route BEFORE `tsc` (the nav `<Link to="/permisos">` won't typecheck until the tree includes it).

- [ ] **Step 4: Run, expect PASS** + full backstage CI:

Run: `pnpm --filter backstage run ci`
Expected: PASS (eslint + tsc + vitest + build + knip + size-limit).

- [ ] **Step 5: Commit.**

```bash
git add apps/backstage/src/routes/_app.permisos.tsx apps/backstage/src/features/positions/components/permisos-view.tsx apps/backstage/src/routes/-_app.permisos.test.tsx apps/backstage/src/components/nav-config.ts apps/backstage/src/routeTree.gen.ts packages/ui/src/components/icons.tsx
git commit -m "feat(permisos): /permisos overview page + nav item"
```

---

## Post-implementation gates (after Task 8)

1. **`/simplify`** on the branch diff.
2. **`/code-review`** on the branch diff.
3. **`firestore-security-reviewer`** subagent — the change surfaces role/permission data; confirm no new client write path bypasses cargo→grants, and `/permisos` reads only Admin-readable data.
4. **`/security-review`** on the diff.
5. **Manual verify (emulator):** seed dev, log in as `admin@jci.cc`, confirm: `/positions` shows the three sections; create a comisión (sigla, no gender/permisos); create a JDL dirección (one name → female derived); a member's comisiones show as siglas; `/permisos` lists roles × granting cargos × holders.
6. Run `pnpm pr-tests`; open PR (`gh pr create`).

---

## Self-Review (spec coverage)

- Comisión refine-in-place (sigla, no gender/permisos, sectioned) → Tasks 2,4,5. ✓
- Member multi-comisión membership view → Task 6. ✓
- Store-one-name + derive feminine + optional override → Tasks 1,4. ✓
- One catalog column (no "Variante femenina") → Task 5. ✓
- Permisos overview (role × granting cargo × holders), Admin-only, edit-via-cargo → Tasks 7,8. ✓
- Firestore-safe optional fields → Task 3. ✓
- No `firestore.rules` change; security review at end → gates. ✓
- `positionTitle` signature preserved (callers unaffected) → Task 1. ✓
