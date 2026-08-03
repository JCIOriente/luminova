# Role display single source of truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live `roles/{id}` Firestore doc the only source a UI surface ever reads a role's Spanish name or description from, and collapse `/permisos` into a single role list.

**Architecture:** One `roleDisplay(key, roleDocs)` / `roleOptions(roleDocs)` helper resolves display text from the live doc with the seed snapshot as an explicitly-named bootstrap fallback. Option lists derive from the `ROLES` union — never from the doc list — so a missing or inactive doc can never hide a grant already stored on a cargo. The hardcoded `PERMISSION_ROLE_INFO` map is deleted and its Spanish descriptions are promoted to a canonical `ROLE_DESCRIPTIONS` constant that both seeders write.

**Tech Stack:** TypeScript strict, React 19, TanStack Query v5, vitest + @testing-library/react, `@luminova/ui`, `@luminova/types`.

**Design doc:** `docs/specs/role-display-single-source.md` — read it first.

**Worktree:** all work happens in `.worktrees/role-management` on branch `feat/role-display-single-source`. Never edit the primary checkout.

---

## File structure

**Create**
- `packages/types/src/role-definition.ts` — extend with `ROLE_DESCRIPTIONS` (modify)
- `apps/backstage/src/lib/role-display.ts` — the only backstage module that touches the snapshot constants
- `apps/backstage/src/lib/role-display.test.ts`
- `apps/backstage/src/lib/role-display.guard.test.ts`
- `apps/backstage/src/features/permissions/lib/role-overview.ts`
- `apps/backstage/src/features/permissions/lib/role-overview.test.ts`
- `apps/backstage/src/features/permissions/components/roles-panel.tsx`
- `apps/backstage/src/features/permissions/components/roles-panel.test.tsx`

**Modify**
- `packages/types/src/index.ts`, `packages/types/src/role-definition.mirror.test.ts`
- `tools/scripts/lib/role-seed.mjs`
- `apps/beacon/src/seed-roles.ts`, `apps/beacon/src/seed-roles.test.ts`
- `apps/backstage/src/features/positions/components/position-table.tsx`
- `apps/backstage/src/features/positions/components/position-form.tsx`
- `apps/backstage/src/features/positions/components/permisos-page.tsx`
- `apps/backstage/src/features/members/components/member-permissions-panel.tsx`

**Delete**
- `apps/backstage/src/features/positions/lib/permission-labels.ts`
- `apps/backstage/src/features/positions/lib/permissions-overview.ts` + `.test.ts`
- `apps/backstage/src/features/positions/components/permisos-view.tsx` + `.test.tsx`
- `apps/backstage/src/features/permissions/components/role-manager.tsx` + `.test.tsx`

Commit boundaries: Task 1, Task 2, Task 3, Task 4 — four commits, each under the 10-file checkpoint limit.

---

## Task 1: `ROLE_DESCRIPTIONS` canonical constant + mirrors

The Spanish descriptions currently live **only** in `permission-labels.ts`, which Task 4 deletes. Promote them first or they are lost.

**Files:**
- Modify: `packages/types/src/role-definition.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/role-definition.mirror.test.ts`
- Modify: `tools/scripts/lib/role-seed.mjs`
- Modify: `apps/beacon/src/seed-roles.ts`
- Modify: `apps/beacon/src/seed-roles.test.ts`

- [ ] **Step 1: Write the failing mirror test**

Append to `packages/types/src/role-definition.mirror.test.ts`, and add `ROLE_DESCRIPTIONS` to the import from `./role-definition.js` and `ROLE_DESCRIPTIONS as MIRROR_DESCRIPTIONS` to the import from `../../../tools/scripts/lib/role-seed.mjs`:

```ts
  it("ROLE_DESCRIPTIONS matches the canonical descriptions exactly", () => {
    expect(MIRROR_DESCRIPTIONS).toEqual(ROLE_DESCRIPTIONS);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/role-definition.mirror.test.ts`
Expected: FAIL — `ROLE_DESCRIPTIONS` is not exported from either module.

- [ ] **Step 3: Add the canonical constant**

In `packages/types/src/role-definition.ts`, directly below `ROLE_LABELS`:

```ts
/** Spanish one-line descriptions for the built-in roles — seeded into the role doc's
 *  `description` field. Like ROLE_LABELS this is a SEED SNAPSHOT: once a doc exists the
 *  doc's own description is what every surface renders. Text carried verbatim from the
 *  former apps/backstage PERMISSION_ROLE_INFO map. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Admin: "Acceso total a la plataforma.",
  Membership: "Crear y editar miembros; ver aliados, eventos y puntos.",
  Treasury: "Gestionar pagos; ver miembros y puntos.",
  ExecutiveCommittee: "Ver gestión del capítulo; administrar cargos y comisiones.",
  ProjectManager: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  Scanner: "Registrar asistencia en actividades asignadas.",
  Member: "Ver y editar su propio perfil; ver puntos y eventos.",
};
```

In `packages/types/src/index.ts`, extend the existing `role-definition.js` re-export (line ~12) to include `ROLE_DESCRIPTIONS` alongside `BUILT_IN_ROLE_PERMS, ROLE_LABELS`.

- [ ] **Step 4: Mirror it into the plain-Node seed lib**

In `tools/scripts/lib/role-seed.mjs`, below `ROLE_LABELS`:

```js
/** @type {Record<string, string>} */
export const ROLE_DESCRIPTIONS = {
  Admin: "Acceso total a la plataforma.",
  Membership: "Crear y editar miembros; ver aliados, eventos y puntos.",
  Treasury: "Gestionar pagos; ver miembros y puntos.",
  ExecutiveCommittee: "Ver gestión del capítulo; administrar cargos y comisiones.",
  ProjectManager: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  Scanner: "Registrar asistencia en actividades asignadas.",
  Member: "Ver y editar su propio perfil; ver puntos y eventos.",
};
```

and in the same file change `buildBuiltInRoleDocs`'s `description: ""` to:

```js
    description: ROLE_DESCRIPTIONS[role],
```

- [ ] **Step 5: Do the same in the beacon seeder**

In `apps/beacon/src/seed-roles.ts`, import `ROLE_DESCRIPTIONS` from `@luminova/types/role-definition` alongside the existing `BUILT_IN_ROLE_PERMS, ROLE_LABELS`, and change its `description: ""` to `description: ROLE_DESCRIPTIONS[role],`.

- [ ] **Step 6: Assert the beacon seeder writes it**

Add to `apps/beacon/src/seed-roles.test.ts` (import `ROLE_DESCRIPTIONS` from `@luminova/types/role-definition`):

```ts
  it("seeds the canonical description for every built-in role", () => {
    for (const doc of buildBuiltInRoleDocs()) {
      expect(doc.description).toBe(ROLE_DESCRIPTIONS[doc.builtInKey]);
    }
  });
```

- [ ] **Step 7: Run all three suites**

Run:
```bash
pnpm --filter @luminova/types exec vitest run
pnpm --filter beacon exec vitest run src/seed-roles.test.ts
node --test tools/scripts/lib/role-seed.test.mjs
```
Expected: all PASS. If `role-seed.test.mjs` snapshots the doc shape it will need its expected `description` updated from `""` to the canonical text — update it, do not weaken the assertion.

- [ ] **Step 8: Commit**

```bash
git add packages/types tools/scripts/lib/role-seed.mjs apps/beacon/src/seed-roles.ts apps/beacon/src/seed-roles.test.ts
git commit -m "feat(types): promote built-in role descriptions to a canonical constant"
```

---

## Task 2: the `roleDisplay` helper and its guard

**Files:**
- Create: `apps/backstage/src/lib/role-display.ts`
- Create: `apps/backstage/src/lib/role-display.test.ts`
- Create: `apps/backstage/src/lib/role-display.guard.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `apps/backstage/src/lib/role-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROLES, type RoleDefinition } from "@luminova/types";
import { roleDisplay, roleOptions } from "./role-display";

function doc(over: Partial<RoleDefinition>): RoleDefinition {
  return {
    id: "ProjectManager",
    name: "Proyectos",
    description: "Gestiona proyectos.",
    builtIn: true,
    builtInKey: "ProjectManager",
    permissions: [],
    locked: false,
    active: true,
    deletedAt: null,
    ...over,
  };
}

describe("roleDisplay", () => {
  it("prefers the live doc over the seed snapshot", () => {
    expect(roleDisplay("ProjectManager", [doc({})])).toEqual({
      label: "Proyectos",
      description: "Gestiona proyectos.",
    });
  });

  it("falls back to the snapshot when no doc exists for the key", () => {
    expect(roleDisplay("ProjectManager", []).label).toBe("Director de Proyecto");
  });

  it("falls back to the snapshot when the doc carries an empty description", () => {
    // Seeded docs currently store description: "" — an empty string must not win.
    expect(roleDisplay("ProjectManager", [doc({ description: "" })]).description).toBe(
      "Gestionar proyectos, programas y actividades; registrar asistencia.",
    );
  });

  it("ignores custom role docs when resolving a built-in key", () => {
    const custom = doc({ id: "abc", name: "Impostor", builtIn: false, builtInKey: null });
    expect(roleDisplay("ProjectManager", [custom]).label).toBe("Director de Proyecto");
  });
});

describe("roleOptions", () => {
  it("returns one option per ROLES entry even with no docs loaded", () => {
    expect(roleOptions(undefined).map((o) => o.value)).toEqual([...ROLES]);
  });

  it("labels from the live doc where one exists", () => {
    const options = roleOptions([doc({})]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe("Proyectos");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.test.ts`
Expected: FAIL — cannot resolve `./role-display`.

- [ ] **Step 3: Write the helper**

Create `apps/backstage/src/lib/role-display.ts`:

```ts
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
  type RoleDefinition,
} from "@luminova/types";

export interface RoleDisplay {
  label: string;
  description: string;
}

/** Resolve a built-in role's display text. The live `roles/{id}` doc is the single source
 *  of truth; ROLE_LABELS / ROLE_DESCRIPTIONS are the bootstrap snapshot, read ONLY when no
 *  doc exists for the key (fresh project, pre-seed).
 *
 *  `||` not `??`: seeded docs carry `description: ""` today, and an empty string must fall
 *  through to the snapshot rather than render blank.
 *
 *  This module is the ONE place in backstage allowed to import those constants —
 *  role-display.guard.test.ts enforces it. */
export function roleDisplay(
  key: Role,
  roleDocs: readonly RoleDefinition[] | undefined,
): RoleDisplay {
  const doc = roleDocs?.find((role) => role.builtInKey === key);
  return {
    label: doc?.name || ROLE_LABELS[key],
    description: doc?.description || ROLE_DESCRIPTIONS[key],
  };
}

/** Options for a role picker, derived from ROLES rather than from the doc list.
 *
 *  This is load-bearing. MultiSelect renders chips by filtering `options` against the
 *  stored value, so an option list built from the docs would silently hide a grant already
 *  stored on a cargo whenever its role doc is missing or inactive — the admin would then be
 *  making authorization decisions from a display that omits a live power grant. Deriving
 *  from ROLES keeps the list total; a missing doc costs a fallback label, never an option. */
export function roleOptions(
  roleDocs: readonly RoleDefinition[] | undefined,
): { value: Role; label: string }[] {
  return ROLES.map((role) => ({ value: role, label: roleDisplay(role, roleDocs).label }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the guard test**

Create `apps/backstage/src/lib/role-display.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_LABELS } from "@luminova/types";

// The bug this guards against already shipped once: features/positions/lib/permission-labels.ts
// hand-declared a second Spanish label map and three surfaces rendered it, so a role rename in
// /permisos changed one screen and not the others. roleDisplay() is now the only supported way
// to obtain a role's label, and this test keeps it that way.
const SRC = join(process.cwd(), "src");
const ALLOWED = join("lib", "role-display.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(path)) return [];
    if (/\.test\.tsx?$/.test(path)) return [];
    if (path.endsWith(ALLOWED)) return [];
    return [path];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("role labels have exactly one source", () => {
  it("finds source files to check (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no module other than lib/role-display.ts imports the seed label constants", () => {
    const offenders = files
      .filter(({ text }) => /\bROLE_LABELS\b|\bROLE_DESCRIPTIONS\b/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no module hardcodes a canonical multi-word role label", () => {
    // Multi-word only: single-word labels like "Miembro" legitimately appear in unrelated copy.
    const distinctive = Object.values(ROLE_LABELS).filter((label) => label.includes(" "));
    const offenders = files
      .filter(({ text }) => distinctive.some((label) => text.includes(label)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the guard — it is EXPECTED to fail right now**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.guard.test.ts`
Expected: FAIL on the third test, listing `features/positions/lib/permission-labels.ts` (it contains "Comité Ejecutivo" and "Director de Proyecto"). This proves the guard detects the real bug. Tasks 3 and 4 delete that file and turn this green. Leave it failing at this commit — do not weaken the assertion to make it pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backstage/src/lib/role-display.ts apps/backstage/src/lib/role-display.test.ts apps/backstage/src/lib/role-display.guard.test.ts
git commit -m "feat(backstage): add roleDisplay as the single role-label resolver

The guard test fails until permission-labels.ts is deleted in a follow-up commit
on this branch; that failure is the proof it detects the real regression."
```

---

## Task 3: migrate the three simple consumers

Each consumer calls `useRoles()` directly. TanStack Query dedupes on the shared `roleKeys.all` key, so several callers on one screen issue one request. No loading gate is needed anywhere here: `roleDisplay` degrades to the snapshot label while the query is in flight, so text is never blank and no option ever disappears.

**Files:**
- Modify: `apps/backstage/src/features/positions/components/position-table.tsx`
- Modify: `apps/backstage/src/features/positions/components/position-form.tsx`
- Modify: `apps/backstage/src/features/members/components/member-permissions-panel.tsx`

- [ ] **Step 1: Write the failing test for the cargo table**

Create/extend `apps/backstage/src/features/positions/components/position-table.test.tsx` with a case asserting the live doc name wins. Wrap the render in the app's existing test QueryClient provider — copy the wrapper from `apps/backstage/src/features/permissions/components/role-manager.test.tsx` before deleting it in Task 4, and seed the roles query with `queryClient.setQueryData(roleKeys.all, [...])`:

```tsx
it("labels a cargo's grants from the live role doc, not a hardcoded map", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(roleKeys.all, [
    {
      id: "ProjectManager",
      name: "Dirección de Proyectos",
      description: "",
      builtIn: true,
      builtInKey: "ProjectManager",
      permissions: [],
      locked: false,
      active: true,
      deletedAt: null,
    },
  ]);
  render(
    <QueryClientProvider client={client}>
      <PositionSection
        title="Cargos"
        variant="cargo"
        positions={[projectCargo]}
        onEdit={() => {}}
        onDeactivate={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Dirección de Proyectos/)).toBeInTheDocument();
});
```

where `projectCargo` is a `Position` with `grants: ["ProjectManager"]`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/position-table.test.tsx`
Expected: FAIL — renders "Proyectos" from `PERMISSION_ROLE_INFO`.

- [ ] **Step 3: Migrate `position-table.tsx`**

Delete the `PERMISSION_ROLE_INFO` import. `grantsLabel` takes the docs; `CARGO_COLUMNS` becomes a memoized factory because it now closes over query data:

```tsx
import { useMemo } from "react";
import type { RoleDefinition } from "@luminova/types";
import { useRoles } from "../../permissions/hooks/use-roles";
import { roleDisplay } from "../../../lib/role-display";

function grantsLabel(position: Position, roleDocs: RoleDefinition[] | undefined): string {
  if (position.grants.length === 0) return "—";
  return position.grants.map((grant) => roleDisplay(grant, roleDocs).label).join(", ");
}

function cargoColumns(roleDocs: RoleDefinition[] | undefined): DataTableColumn<Position>[] {
  return [
    /* title and term columns unchanged — copy them verbatim from the current
       CARGO_COLUMNS literal */
    {
      id: "grants",
      header: "Permisos",
      sortable: false,
      cell: (position) => (
        <span className="text-ink-2">{grantsLabel(position, roleDocs)}</span>
      ),
    },
  ];
}
```

Inside `PositionSection`:

```tsx
  const { data: roleDocs } = useRoles();
  const columns = useMemo(
    () => (variant === "cargo" ? cargoColumns(roleDocs) : COMISION_COLUMNS),
    [variant, roleDocs],
  );
```

and pass `columns={columns}` to `DataTable`. `COMISION_COLUMNS` stays a module constant — it has no role dependency.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/position-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Migrate the grants picker**

In `apps/backstage/src/features/positions/components/position-form.tsx`, delete the `PERMISSION_ROLE_INFO` import and the module-level `GRANT_OPTIONS` constant. Inside the component:

```tsx
  const { data: roleDocs } = useRoles();
  const grantOptions = useMemo(() => roleOptions(roleDocs), [roleDocs]);
```

and pass `options={grantOptions}` to the `MultiSelect`. Keep the `ROLES` import only if it is still used elsewhere in the file; `roleOptions` now owns that derivation.

- [ ] **Step 6: Migrate the member panel**

In `apps/backstage/src/features/members/components/member-permissions-panel.tsx`, replace the `PERMISSION_ROLE_INFO` import with `useRoles` + `roleDisplay`, and inside the component:

```tsx
  const { data: roleDocs } = useRoles();
```

then in the `roles.map` body swap `const info = PERMISSION_ROLE_INFO[role];` for `const info = roleDisplay(role, roleDocs);`. The rest of the JSX is unchanged.

- [ ] **Step 7: Run the full backstage suite**

Run: `pnpm --filter backstage exec vitest run`
Expected: PASS except `role-display.guard.test.ts` (still red — `permission-labels.ts` survives until Task 4) and any test that asserted a hardcoded label. Do not delete `permission-labels.ts` yet; Task 4 removes it together with its last consumer.

- [ ] **Step 8: Commit**

```bash
git add apps/backstage/src/features/positions/components/position-table.tsx apps/backstage/src/features/positions/components/position-table.test.tsx apps/backstage/src/features/positions/components/position-form.tsx apps/backstage/src/features/members/components/member-permissions-panel.tsx
git commit -m "refactor(backstage): resolve cargo + member role labels from the live role doc"
```

---

## Task 4: merge `/permisos` into one role list

**Files:**
- Create: `apps/backstage/src/features/permissions/lib/role-overview.ts` + `.test.ts`
- Create: `apps/backstage/src/features/permissions/components/roles-panel.tsx` + `.test.tsx`
- Modify: `apps/backstage/src/features/positions/components/permisos-page.tsx`
- Delete: `apps/backstage/src/features/positions/lib/permission-labels.ts`
- Delete: `apps/backstage/src/features/positions/lib/permissions-overview.ts` + `.test.ts`
- Delete: `apps/backstage/src/features/positions/components/permisos-view.tsx` + `.test.tsx`
- Delete: `apps/backstage/src/features/permissions/components/role-manager.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing row-builder test**

Create `apps/backstage/src/features/permissions/lib/role-overview.test.ts`. Build fixtures the same way `permissions-overview.test.ts` does (`as unknown as Position` / `as unknown as Member`) before deleting it. Required cases:

```ts
it("lists the cargos that grant a built-in role", () => {
  const rows = buildRoleOverview([builtInDoc], [presidente], [], "2026");
  expect(rows[0].grantingCargos).toEqual(["Presidente"]);
});

it("never attributes a cargo to a custom role", () => {
  // positions.grants is z.enum(ROLES) — a custom role's doc id can never appear in it.
  const rows = buildRoleOverview([customDoc], [presidente], [], "2026");
  expect(rows[0].grantingCargos).toEqual([]);
});

it("counts cargo-derived holders for a built-in role", () => {
  const rows = buildRoleOverview([builtInDoc], [presidente], [olivia], "2026");
  expect(rows[0].holders).toEqual([{ id: "m0", name: "Olivia" }]);
});

it("counts roleIds holders for a custom role", () => {
  // The old buildPermissionsOverview read only positions[term].cargoId, so every custom
  // role reported "Nadie aún" even when it had holders.
  const member = { id: "m1", name: "Bruno", roleIds: ["custom-1"], positions: {} } as unknown as Member;
  const rows = buildRoleOverview([customDoc], [], [member], "2026");
  expect(rows[0].holders).toEqual([{ id: "m1", name: "Bruno" }]);
});

it("ignores inactive cargos", () => {
  const rows = buildRoleOverview([builtInDoc], [{ ...presidente, active: false }], [], "2026");
  expect(rows[0].grantingCargos).toEqual([]);
});
```

`builtInDoc` = `{ id: "Admin", name: "Administrador", builtIn: true, builtInKey: "Admin", ... }`; `customDoc` = `{ id: "custom-1", name: "Auditoría", builtIn: false, builtInKey: null, ... }`; `presidente` = a `Position` with `grants: ["Admin"], active: true, title: "Presidente"`; `olivia` = a `Member` with `positions: { "2026": { cargoId: "p1", comisionIds: [] } }`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/lib/role-overview.test.ts`
Expected: FAIL — cannot resolve `./role-overview`.

- [ ] **Step 3: Write the row builder**

Create `apps/backstage/src/features/permissions/lib/role-overview.ts`:

```ts
import type { Member, Position, RoleDefinition } from "@luminova/types";
import { effectiveRoles } from "../../members/lib/member-permissions";

export interface RoleOverviewRow {
  role: RoleDefinition;
  /** Cargos whose `grants` confer this role. Always empty for a custom role. */
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}

/** One row per role doc, unioning BOTH assignment paths: a built-in role arrives through
 *  a cargo's `grants`, a custom role through `members.roleIds`. Reading only the cargo
 *  path (as the former buildPermissionsOverview did) reports "Nadie aún" for every custom
 *  role that has holders. */
export function buildRoleOverview(
  roles: RoleDefinition[],
  positions: Position[],
  members: Member[],
  termKey: string,
): RoleOverviewRow[] {
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const memberRoles = members.map((member) => ({
    member,
    roles: effectiveRoles(member, positionsById, termKey),
  }));

  return roles.map((role) => {
    const key = role.builtInKey;
    return {
      role,
      grantingCargos:
        key === null
          ? []
          : positions
              .filter((position) => position.active && position.grants.includes(key))
              .map((position) => position.title),
      holders: memberRoles
        .filter(({ member, roles: effective }) =>
          key === null ? (member.roleIds ?? []).includes(role.id) : effective.includes(key),
        )
        .map(({ member }) => ({ id: member.id, name: member.name })),
    };
  });
}
```

If `Member` has no `roleIds` field in `packages/types/src/member.ts`, stop and report — do not add one in this PR.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/lib/role-overview.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing panel test**

Create `apps/backstage/src/features/permissions/components/roles-panel.test.tsx`. Render `RolesPanel` inside a `QueryClientProvider` and assert:

```tsx
it("renders one row per role with its cargos and holders", () => { /* built-in row shows "Presidente" and "Olivia" */ });
it("labels a custom role's origin as direct assignment", () => {
  // "Otorgado por: <cargo>" is structurally impossible for a custom role.
  expect(screen.getByText(/Asignación directa/)).toBeInTheDocument();
});
it("truncates a long holder list", () => {
  // The Miembro row lists the whole chapter; 7 holders must render 5 names + "y 2 más".
  expect(screen.getByText(/y 2 más/)).toBeInTheDocument();
});
it("renders an empty state when there are no role docs", () => {
  expect(screen.getByText(/No hay roles configurados/)).toBeInTheDocument();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/roles-panel.test.tsx`
Expected: FAIL — cannot resolve `./roles-panel`.

- [ ] **Step 7: Write `roles-panel.tsx`**

Create `apps/backstage/src/features/permissions/components/roles-panel.tsx`. It replaces both `PermisosView` and `RoleManager`. Props: `{ rows: RoleOverviewRow[] }`. It owns the create/edit/delete mutations (`useAddRole`, `useUpdateRole`, `useDeleteRole`) and the `Sheet` + `RoleEditor` exactly as `role-manager.tsx` does today — copy that logic verbatim, including the `Editing` type and the `submit`/`remove` handlers.

Each row renders, reusing the existing markup from `role-manager.tsx` (badges, permission count, Editar/Ver button) plus the two `<dl>` rows from `permisos-view.tsx`:

```tsx
const MAX_HOLDERS = 5;

function holdersLabel(holders: RoleOverviewRow["holders"]): string {
  if (holders.length === 0) return "Nadie aún";
  const shown = holders.slice(0, MAX_HOLDERS).map((holder) => holder.name).join(", ");
  const rest = holders.length - MAX_HOLDERS;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

function originLabel(row: RoleOverviewRow): string {
  if (row.role.builtInKey === null) return "Asignación directa";
  return row.grantingCargos.length > 0 ? row.grantingCargos.join(", ") : "Ningún cargo lo otorga";
}
```

Render the role's `description` under its name — that is what Task 1's `ROLE_DESCRIPTIONS` seeds. Empty state when `rows.length === 0`: `<EmptyState title="No hay roles configurados" description="Ejecuta la sincronización de roles para crear los predefinidos." />`.

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/roles-panel.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Rewire the page and delete the dead modules**

In `apps/backstage/src/features/positions/components/permisos-page.tsx`:
- add `useRoles({ enabled: isAdmin })` alongside the existing `usePositions` / `useMembers`
- fold its loading / error flags into the existing unions (`isLoading`, `isError`, `loadError`) so one outage paints ONE `QueryErrorState`
- replace the `buildPermissionsOverview` call with `buildRoleOverview(roles ?? [], positions ?? [], members ?? [], currentTermKey())`
- replace `<PermisosView …/>` **and** `<RoleManager />` with a single `<RolesPanel rows={rows} />`
- drop the standalone `<p className="text-ui-xs text-ink-3">Refleja los cargos del catálogo…</p>` paragraph into the `PageHeader` subtitle or delete it — it described the old split

Then delete:

```bash
git rm apps/backstage/src/features/positions/lib/permission-labels.ts \
       apps/backstage/src/features/positions/lib/permissions-overview.ts \
       apps/backstage/src/features/positions/lib/permissions-overview.test.ts \
       apps/backstage/src/features/positions/components/permisos-view.tsx \
       apps/backstage/src/features/positions/components/permisos-view.test.tsx \
       apps/backstage/src/features/permissions/components/role-manager.tsx \
       apps/backstage/src/features/permissions/components/role-manager.test.tsx
```

- [ ] **Step 10: Verify the guard is now green**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.guard.test.ts`
Expected: PASS, 3 tests. If the third still fails it is naming a file that hardcodes a role label — fix that file, never the assertion.

- [ ] **Step 11: Run the full gate**

Run: `pnpm --filter backstage run ci`
Expected: prettier → eslint → tsc → build → vitest → knip → size-limit all pass. `knip` will flag anything left orphaned by the deletions — remove it rather than adding an ignore.

- [ ] **Step 12: Commit**

```bash
git add -A apps/backstage/src/features
git commit -m "feat(backstage): collapse /permisos into a single role list"
```

---

## Task 5: verification and docs

- [ ] **Step 1: Full monorepo gate**

Run: `pnpm pr-tests`
Expected: pass. Known pre-existing failure: `pnpm audit` reports brace-expansion advisories repo-wide — not introduced here, do not attempt to fix it in this PR.

- [ ] **Step 2: Update the docs this PR falsifies**

- `docs/data-models.md` — the `roles` row: note that `name`/`description` on the doc are what every surface renders.
- `docs/reuse-first-ui.md` — add `roleDisplay` / `roleOptions` to the component quick-index as the only supported way to obtain a role label.

- [ ] **Step 3: Route the diff and run every mandated review**

```bash
.claude/hooks/route.sh
```
Run everything it lists. `packages/types`, `apps/beacon` and `tools/scripts/lib/role-seed.mjs` are all in the `authSurface` set, so `/security-review` is hard-gated.

- [ ] **Step 4: Stamp the review trailer**

Copy the exact command the router printed. The trailer must sit in the commit message's **last** paragraph.

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(backstage): one source of truth for role names" --body "…"
```
Body follows the CLAUDE.md template, with the `## Reviews` list mirroring exactly what the router mandated.

---

## Self-review notes

- **Spec coverage:** `roleDisplay`/`roleOptions` → Task 2. `ROLE_DESCRIPTIONS` → Task 1. Merged page with the corrected row shape → Task 4. Guard → Task 2 Step 5 (red) and Task 4 Step 10 (green). Three query states → Task 4 Step 9. Holder truncation → Task 4 Step 7.
- **Deliberate red test:** the guard is committed failing at Task 2 and goes green at Task 4. That sequencing is the evidence it detects the real regression rather than being written to pass.
- **Type consistency:** `RoleOverviewRow.role` is the full `RoleDefinition` (not a `Role` key) everywhere; `roleDisplay(key, roleDocs)` takes the key first in every call site.
