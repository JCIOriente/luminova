# Member Roles, Invitations & Sheet Sizes (K1–K3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customizable Sheet widths (K1), a gender-aware position catalog (CEL/JDL/comisiones) wired into the member model, forms and Firestore rules (K2), and invitation emails actually sent via Firebase (K3).

**Architecture:** New `positions` Firestore collection (catalog) + `gender`/`positions` fields on member docs (assignments keyed by term = calendar year). Permission claims stay the engine (CASL + custom claims); positions declare `grants`. K4 (claims-sync trigger, member edit page, permissions panel) is a separate plan after K2/K3 land.

**Tech Stack:** React 19, TanStack Router/Query v5, RHF + Zod, Firestore + rules-unit-testing, vitest, `@luminova/ui` (Combobox/MultiSelect/Sheet/Badge).

**Spec:** `docs/specs/2026-06-10-member-roles-invitations-design.md`

## Branching (stacked PRs, all inside `.worktrees/member-roles`)

- `feat/member-roles-permissions` (current) holds spec + this plan.
- K1: `git checkout -b feat/k1-sheet-size` off it → PR targets `main` (carries the two docs commits — they belong with the work).
- K2: `git checkout -b feat/k2-position-catalog` off K1 → PR targets `feat/k1-sheet-size`.
- K3: `git checkout -b feat/k3-invite-email` off K2 → PR targets `feat/k2-position-catalog`.
- Before every commit: `git branch --show-current` (shared-tree discipline).

## Verification commands

- Backstage unit tests: `pnpm --filter backstage exec vitest run <path>`
- Types/auth tests: `pnpm --filter @luminova/types test`, `pnpm --filter @luminova/auth test`
- Rules tests: `pnpm --dir tests/firestore-rules test` (spawns its own Firestore emulator)
- Full gate before each PR: `pnpm pr-tests`

---

## K1 — Sheet size prop

### Task 1: `size` prop on Sheet

**Files:**
- Modify: `packages/ui/src/components/sheet.tsx`
- Test: `apps/backstage/src/features/_widgets/sheet.test.tsx` (new; mirror setup of `combobox.test.tsx` in the same folder)
- Modify: `packages/ui/DESIGN.md` (Sheet entry: note `size` prop)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet } from "@luminova/ui";

function renderSheet(size?: "sm" | "md" | "lg" | "xl") {
  render(
    <Sheet open onOpenChange={() => {}} title="Prueba" size={size}>
      <p>contenido</p>
    </Sheet>,
  );
}

describe("Sheet", () => {
  it("defaults to the 440px width", () => {
    renderSheet();
    expect(screen.getByRole("dialog").className).toContain("max-w-[440px]");
  });

  it("applies the requested width", () => {
    renderSheet("lg");
    expect(screen.getByRole("dialog").className).toContain("max-w-[680px]");
  });
});
```

If `combobox.test.tsx` uses shared render helpers/jsdom setup, copy that harness exactly.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/_widgets/sheet.test.tsx`
Expected: FAIL — `size` is not a valid prop (TS error) / class assertion fails.

- [ ] **Step 3: Implement**

In `sheet.tsx`:

```tsx
import { cn } from "../lib/cn";

const SIZE_CLASSES = {
  sm: "max-w-[440px]",
  md: "max-w-[560px]",
  lg: "max-w-[680px]",
  xl: "max-w-[800px]",
} as const;

export type SheetSize = keyof typeof SIZE_CLASSES;

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Pane width; defaults to `sm` (440px), the historical width. */
  size?: SheetSize;
  children: ReactNode;
}
```

On `RadixDialog.Content`, replace the hardcoded `max-w-[440px]` with:

```tsx
className={cn(
  "fixed top-0 right-0 z-50 flex h-dvh w-full flex-col gap-[22px] overflow-y-auto bg-surface p-[26px] shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)] data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out motion-reduce:animate-none",
  SIZE_CLASSES[size ?? "sm"],
)}
```

Export `SheetSize` from `packages/ui/src/index.ts` (explicit named export, repo rule).
Static class strings in the map keep Tailwind from purging them.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/_widgets/sheet.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Update `packages/ui/DESIGN.md`** — in the Sheet line of the inventory add: `size sm|md|lg|xl (440/560/680/800px, default sm)`.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add packages/ui apps/backstage/src/features/_widgets/sheet.test.tsx
git commit -m "feat(ui): sheet size prop (sm/md/lg/xl)"
```

Open PR (K1 → main) per repo template; run `pnpm pr-tests`.

---

## K2 — Position catalog + member positions

### Task 2: Move `Role`/`ROLES` into `@luminova/types`

`Position.grants: Role[]` must live in types; auth keeps its public API by re-exporting. `@luminova/auth` gains a dep on `@luminova/types` (workspace link, no npm version — secure-dep-vetting not applicable, no registry package added).

**Files:**
- Create: `packages/types/src/permission-role.ts`
- Modify: `packages/types/src/index.ts`, `packages/auth/src/roles.ts`, `packages/auth/package.json`

- [ ] **Step 1: Create `packages/types/src/permission-role.ts`** — move verbatim from `packages/auth/src/roles.ts`:

```ts
export const ROLES = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
  "Scanner",
  "Member",
] as const;

export type Role = (typeof ROLES)[number];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Re-export from types index**

```ts
export { ROLES, isValidRole, type Role } from "./permission-role";
```

- [ ] **Step 3: Rewrite `packages/auth/src/roles.ts`**

```ts
import { ROLES, isValidRole, type Role } from "@luminova/types";

export { ROLES, isValidRole };
export type { Role };

export interface AuthClaims {
  roles: Role[];
  scannerEventIds?: string[];
}

export function hasRole(claims: AuthClaims, role: Role): boolean {
  return claims.roles.includes(role);
}

export function hasAnyRole(claims: AuthClaims, roles: readonly Role[]): boolean {
  return claims.roles.some((role) => roles.includes(role));
}
```

Add to `packages/auth/package.json` dependencies: `"@luminova/types": "workspace:*"`, then `pnpm install`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @luminova/auth test && pnpm typecheck`
Expected: existing `roles.test.ts` + `ability.test.ts` PASS unchanged.

- [ ] **Step 5: Commit** — `git commit -m "refactor(types): move permission Role to @luminova/types"`

### Task 3: `Position` type + schema + term/title helpers

**Files:**
- Create: `packages/types/src/position.ts`, `packages/types/src/position-schema.ts`
- Test: `packages/types/src/position.test.ts`, `packages/types/src/position-schema.test.ts`
- Modify: `packages/types/src/member.ts` (gender const), `packages/types/src/index.ts`

- [ ] **Step 1: Add gender to `member.ts`** (alongside `MEMBER_STATUSES`):

```ts
export const MEMBER_GENDERS = ["Masculino", "Femenino"] as const;
export type MemberGender = (typeof MEMBER_GENDERS)[number];
```

- [ ] **Step 2: Write failing tests** — `position.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { positionTitle, currentTermKey } from "./position";

const cargo = { title: "Presidente", titleFemale: "Presidenta" };

describe("positionTitle", () => {
  it("picks the female variant", () => {
    expect(positionTitle(cargo, "Femenino")).toBe("Presidenta");
  });
  it("picks the base variant for masculine", () => {
    expect(positionTitle(cargo, "Masculino")).toBe("Presidente");
  });
  it("falls back to base when gender is missing (legacy docs)", () => {
    expect(positionTitle(cargo, undefined)).toBe("Presidente");
  });
});

describe("currentTermKey", () => {
  it("is the calendar year", () => {
    expect(currentTermKey(new Date("2026-06-10T12:00:00Z"))).toBe("2026");
  });
});
```

`position-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { positionSchema } from "./position-schema";

const base = {
  title: "Director de Miembro Individual",
  titleFemale: "Directora de Miembro Individual",
  category: "JDL" as const,
  grants: ["Membership" as const],
  term: 2026,
  description: "Acompaña a los miembros individuales.",
};

describe("positionSchema", () => {
  it("accepts a JDL dirección with a term", () => {
    expect(positionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects JDL without term", () => {
    expect(positionSchema.safeParse({ ...base, term: null }).success).toBe(false);
  });
  it("rejects CEL with term", () => {
    expect(positionSchema.safeParse({ ...base, category: "CEL", term: 2026 }).success).toBe(false);
  });
  it("accepts an evergreen comisión without grants", () => {
    const comision = { ...base, category: "Comision" as const, term: null, grants: [] };
    expect(positionSchema.safeParse(comision).success).toBe(true);
  });
  it("rejects unknown grant roles", () => {
    expect(positionSchema.safeParse({ ...base, grants: ["SuperUser"] }).success).toBe(false);
  });
});
```

Run: `pnpm --filter @luminova/types test` → Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `position.ts`**

```ts
import type { Timestamp } from "firebase/firestore";
import type { Role } from "./permission-role";
import type { MemberGender } from "./member";

export const POSITION_CATEGORIES = ["CEL", "JDL", "Comision"] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];

/** Catalog entry: a CEL cargo (fixed), JDL dirección (per term) or comisión (evergreen). */
export interface Position {
  id: string;
  title: string;
  titleFemale: string;
  category: PositionCategory;
  /** Permission claim roles this position confers. Empty = chip only, no power. */
  grants: Role[];
  /** JDL direcciones belong to one term (year); CEL and comisiones are evergreen. */
  term: number | null;
  description: string;
  active: boolean;
  deletedAt: Timestamp | null;
}

/** A member's assignments within one term: at most one cargo + any comisiones. */
export interface TermPositions {
  cargoId: string | null;
  comisionIds: string[];
}

export function positionTitle(
  position: Pick<Position, "title" | "titleFemale">,
  gender: MemberGender | undefined,
): string {
  return gender === "Femenino" ? position.titleFemale : position.title;
}

export function currentTermKey(now = new Date()): string {
  return String(now.getUTCFullYear());
}
```

`position-schema.ts`:

```ts
import { z } from "zod";
import { POSITION_CATEGORIES } from "./position";
import { ROLES } from "./permission-role";

export const positionSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    titleFemale: z.string().min(3, "Mínimo 3 caracteres."),
    category: z.enum(POSITION_CATEGORIES),
    grants: z.array(z.enum(ROLES)),
    term: z.number().int().nullable(),
    description: z.string().min(1, "Requerido."),
  })
  .refine((p) => (p.category === "JDL") === (p.term !== null), {
    message: "Solo las direcciones JDL llevan gestión.",
    path: ["term"],
  });

export type PositionInput = z.infer<typeof positionSchema>;
```

Index exports:

```ts
export type { Position, PositionCategory, TermPositions } from "./position";
export { POSITION_CATEGORIES, positionTitle, currentTermKey } from "./position";
export { positionSchema, type PositionInput } from "./position-schema";
export { MEMBER_GENDERS, type MemberGender } from "./member";
```

- [ ] **Step 4: Run tests** — `pnpm --filter @luminova/types test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(types): position catalog model + gender"`

### Task 4: Member type/schema/mapper changes

**Files:**
- Modify: `packages/types/src/member.ts`, `packages/types/src/member-schema.ts`
- Modify: `apps/backstage/src/features/members/repositories/member-mapper.ts`
- Test: extend `apps/backstage/src/features/members/repositories/member-mapper.test.ts` (create if missing)

- [ ] **Step 1: Extend `Member`** (after `isPastPresident`):

```ts
/** Missing on pre-K2 docs; required by the form from K2 on. */
gender?: MemberGender;
/** Position assignments keyed by term (year, e.g. "2026"). */
positions?: Record<string, TermPositions>;
```

Import `MemberGender` is a cycle (member ↔ position)? No: `position.ts` imports only the *type* from `member.ts`, and `member.ts` imports `TermPositions` type from `position.ts` — type-only circular imports are erased at compile time and safe here. Use `import type` on both sides.

Keep `role: string` (legacy display fallback; dropped in K4).

- [ ] **Step 2: Rework `member-schema.ts`** — remove `role`, add:

```ts
gender: z.enum(MEMBER_GENDERS, { message: "Requerido." }),
cargoId: z.string().nullable(),
comisionIds: z.array(z.string()),
```

(`MemberInput` now carries current-term assignments; mapper merges them under the term key.)

- [ ] **Step 3: Write failing mapper tests** (UTC-date helpers already tested if file exists; add):

```ts
import { describe, expect, it } from "vitest";
import { toMemberCreateDoc, toMemberUpdateDoc } from "./member-mapper";

const input = {
  name: "Ana Suárez",
  email: "ana@jci.org",
  phone: "",
  gender: "Femenino" as const,
  profession: "",
  joinDate: "2024-03-01",
  birthdate: "1995-07-15",
  status: "Activo" as const,
  cargoId: "pos-presidente",
  comisionIds: ["pos-etica"],
};

describe("member-mapper positions", () => {
  it("creates with current-term assignments and empty legacy role", () => {
    const doc = toMemberCreateDoc(input, "2026");
    expect(doc.positions).toEqual({
      "2026": { cargoId: "pos-presidente", comisionIds: ["pos-etica"] },
    });
    expect(doc.role).toBe("");
    expect(doc.gender).toBe("Femenino");
  });

  it("updates only the current term via dot path (other terms untouched)", () => {
    const doc = toMemberUpdateDoc(input, "2026");
    expect(doc["positions.2026"]).toEqual({
      cargoId: "pos-presidente",
      comisionIds: ["pos-etica"],
    });
    expect(doc).not.toHaveProperty("positions");
    expect(doc).not.toHaveProperty("role");
  });
});
```

Run: `pnpm --filter backstage exec vitest run src/features/members/repositories/member-mapper.test.ts` → FAIL.

- [ ] **Step 4: Implement mapper**

```ts
function editableFields(data: MemberInput) {
  return {
    name: data.name,
    email: data.email,
    phone: data.phone ?? "",
    gender: data.gender,
    profession: data.profession ?? "",
    joinDate: toTimestamp(data.joinDate),
    birthdate: toTimestamp(data.birthdate),
    status: data.status,
  };
}

export function toMemberCreateDoc(data: MemberInput, termKey = currentTermKey()) {
  return {
    ...editableFields(data),
    role: "",
    positions: { [termKey]: { cargoId: data.cargoId, comisionIds: data.comisionIds } },
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
  };
}

/** Dot-path keeps other terms' history intact without a read-modify-write. */
export function toMemberUpdateDoc(data: MemberInput, termKey = currentTermKey()) {
  return {
    ...editableFields(data),
    [`positions.${termKey}`]: { cargoId: data.cargoId, comisionIds: data.comisionIds },
  };
}
```

(`MemberRepository.create/update` signatures unchanged — `updateDoc` accepts dot-path keys.)

- [ ] **Step 5: Run tests + typecheck.** Compile errors in `member-form.tsx`, `member-drawer.tsx`, `member-invite-drawer.tsx`, `member-csv.ts`, role-suggestions consumers are EXPECTED — fixed in Tasks 8–9. Do not commit yet if `pnpm typecheck` fails repo-wide; Tasks 4–9 land as one commit train on the K2 branch, commit after each task only when its package typechecks (`pnpm --filter @luminova/types test` green here).

- [ ] **Step 6: Commit** — `git commit -m "feat(types): member gender + per-term positions"` (include mapper; if backstage typecheck blocks the pre-commit hook, proceed to Tasks 8–9 first and commit the train together — never use `--no-verify`).

### Task 5: firestore.rules — `positions` collection + exec positions-only member update

**Files:**
- Modify: `firestore.rules`
- Test: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Write failing rules tests** — in `beforeAll` seed add:

```ts
await setDoc(doc(db, "positions/pos1"), {
  title: "Tesorero", titleFemale: "Tesorera", category: "CEL",
  grants: ["Treasury"], term: null, description: "Finanzas.", active: true, deletedAt: null,
});
```

New describe block:

```ts
describe("firestore.rules — positions", () => {
  it("denies anonymous reads", async () => {
    await assertFails(getDoc(doc(anon(), "positions/pos1")));
  });
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "positions/pos1")));
  });
  it("allows ExecutiveCommittee to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/new1"), {
        title: "Director de Comunicación", titleFemale: "Directora de Comunicación",
        category: "JDL", grants: [], term: 2026, description: "Comunica.",
        active: true, deletedAt: null,
      }),
    );
  });
  it("denies Membership creating positions", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "positions/new2"), { title: "X", active: true }),
    );
  });
  it("denies resurrecting a soft-deleted position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "positions/pos_deleted"), { active: true }),
    );
  });
});

describe("firestore.rules — member positions by ExecutiveCommittee", () => {
  it("allows a positions-only update", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [] } },
      }),
    );
  });
  it("denies touching other fields", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [] } },
        name: "Hacked",
      }),
    );
  });
});
```

Also seed `positions/pos_deleted` with `active: false, deletedAt: DELETED_AT`.

Run: `pnpm --dir tests/firestore-rules test` → new cases FAIL (default deny).

- [ ] **Step 2: Add rules** — after the `members` block:

```
match /positions/{positionId} {
  allow read: if signedIn();
  allow create: if hasAnyRole(['Admin', 'ExecutiveCommittee']);
  allow update: if hasAnyRole(['Admin', 'ExecutiveCommittee']) && softDeleteSafe();
  allow delete: if false;
}
```

In `members`, add a third update rule (UI for exec arrives with the K4 edit page; the rule lands now with its tests):

```
// ExecutiveCommittee may edit only position assignments (org chart), nothing else.
allow update: if hasAnyRole(['ExecutiveCommittee'])
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['positions'])
  && softDeleteSafe();
```

- [ ] **Step 3: Run rules tests** — `pnpm --dir tests/firestore-rules test` → ALL PASS (old + new).
- [ ] **Step 4: Commit** — `git commit -m "feat(rules): positions collection + exec positions-only member update"`

### Task 6: Position repository + hooks + CEL seed

**Files:**
- Create: `apps/backstage/src/features/positions/repositories/position-mapper.ts`
- Create: `apps/backstage/src/features/positions/repositories/position-repository.ts`
- Create: `apps/backstage/src/features/positions/hooks/use-positions.ts`, `use-add-position.ts`, `use-update-position.ts`, `use-delete-position.ts`
- Create: `apps/backstage/src/features/positions/lib/cel-seed.ts`
- Test: `position-mapper.test.ts`, `cel-seed.test.ts` (same folders)

- [ ] **Step 1: Failing tests** — `position-mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPositionCreateDoc, toPositionUpdateDoc } from "./position-mapper";

const input = {
  title: "Director de Comunicación",
  titleFemale: "Directora de Comunicación",
  category: "JDL" as const,
  grants: [],
  term: 2026,
  description: "Comunicación del capítulo.",
};

describe("position-mapper", () => {
  it("creates with system defaults", () => {
    expect(toPositionCreateDoc(input)).toEqual({ ...input, active: true, deletedAt: null });
  });
  it("updates editable fields only", () => {
    expect(toPositionUpdateDoc(input)).toEqual(input);
  });
});
```

`cel-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CEL_SEED } from "./cel-seed";

describe("CEL_SEED", () => {
  it("has the 8 fixed cargos, all CEL and evergreen", () => {
    expect(CEL_SEED).toHaveLength(8);
    expect(CEL_SEED.every((p) => p.category === "CEL" && p.term === null)).toBe(true);
  });
  it("has unique titles and both gender variants everywhere", () => {
    expect(new Set(CEL_SEED.map((p) => p.title)).size).toBe(8);
    expect(CEL_SEED.every((p) => p.title.length >= 3 && p.titleFemale.length >= 3)).toBe(true);
  });
  it("maps Presidente to Admin and Tesorero to Treasury", () => {
    expect(CEL_SEED.find((p) => p.title === "Presidente")?.grants).toEqual(["Admin"]);
    expect(CEL_SEED.find((p) => p.title === "Tesorero")?.grants).toEqual(["Treasury"]);
  });
});
```

Run both → FAIL (modules missing).

- [ ] **Step 2: Implement** — `position-mapper.ts`:

```ts
import type { PositionInput } from "@luminova/types";

export function toPositionCreateDoc(data: PositionInput) {
  return { ...data, active: true, deletedAt: null };
}

export function toPositionUpdateDoc(data: PositionInput) {
  return { ...data };
}
```

`position-repository.ts` (mirror `member-repository.ts` exactly: same imports, `getFirebase().db`):

```ts
export class PositionRepository {
  private readonly collection = collection(getFirebase().db, "positions");

  /** Active catalog entries, CEL first then JDL then comisiones, alphabetical inside. */
  async getAll(): Promise<Position[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    const order: Record<Position["category"], number> = { CEL: 0, JDL: 1, Comision: 2 };
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Position, "id">) }))
      .sort(
        (a, b) =>
          order[a.category] - order[b.category] || a.title.localeCompare(b.title, "es"),
      );
  }

  async create(data: PositionInput): Promise<string> {
    const ref = await addDoc(this.collection, toPositionCreateDoc(data));
    return ref.id;
  }

  async update(id: string, data: PositionInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toPositionUpdateDoc(data));
  }

  /** Soft delete — assignments referencing the id keep resolving for history. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { active: false, deletedAt: serverTimestamp() });
  }

  async seed(entries: PositionInput[]): Promise<void> {
    await Promise.all(entries.map((entry) => this.create(entry)));
  }
}
```

Hooks (mirror members' hooks; keys):

```ts
export const positionKeys = { all: ["positions"] as const };
```

`use-positions` → `useQuery({ queryKey: positionKeys.all, queryFn: () => new PositionRepository().getAll() })`; the three mutations invalidate `positionKeys.all`.

`cel-seed.ts` — `PositionInput[]`, all `category: "CEL"`, `term: null`:

| title | titleFemale | grants | description |
|---|---|---|---|
| Presidente | Presidenta | `["Admin"]` | Dirige el capítulo; acceso total a la plataforma. |
| Vicepresidente Ejecutivo | Vicepresidenta Ejecutiva | `["ExecutiveCommittee", "Membership"]` | Coordina la junta directiva y la membresía. |
| Vicepresidente de Área | Vicepresidenta de Área | `["ExecutiveCommittee", "Membership"]` | Supervisa las direcciones de su área. |
| Secretario | Secretaria | `["Membership"]` | Actas, registros y gestión de miembros. |
| Tesorero | Tesorera | `["Treasury"]` | Finanzas, cuotas y pagos del capítulo. |
| Asesor Legal | Asesora Legal | `["ExecutiveCommittee"]` | Asesora legalmente al comité ejecutivo. |
| Pasado Presidente | Pasada Presidenta | `["ExecutiveCommittee"]` | Acompaña la transición y asesora a la directiva. |
| Asesor Presidencial | Asesora Presidencial | `["ExecutiveCommittee"]` | Asesora a la presidencia. |

- [ ] **Step 3: Run tests** — both files PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(backstage): positions repository, hooks and CEL seed"`

### Task 7: Ability, nav, catalog route + PositionForm

**Files:**
- Modify: `packages/auth/src/ability.ts` (+ `ability.test.ts`)
- Modify: `apps/backstage/src/components/nav-config.ts`
- Create: `apps/backstage/src/routes/_app.positions.tsx`
- Create: `apps/backstage/src/features/positions/components/position-form.tsx` (+ test)
- Create: `apps/backstage/src/features/positions/lib/permission-labels.ts`

- [ ] **Step 1: Failing ability test** — add to `packages/auth/src/ability.test.ts`:

```ts
it("lets ExecutiveCommittee manage the position catalog", () => {
  const ability = buildAbility({ roles: ["ExecutiveCommittee"] }, "u1");
  expect(ability.can("manage", "Position")).toBe(true);
});

it("lets Membership read but not manage positions", () => {
  const ability = buildAbility({ roles: ["Membership"] }, "u1");
  expect(ability.can("read", "Position")).toBe(true);
  expect(ability.can("create", "Position")).toBe(false);
});
```

Run `pnpm --filter @luminova/auth test` → FAIL.

- [ ] **Step 2: Implement ability** — add `"Position"` to `Subject`; in `applyRole`: Membership gets `can("read", "Position")` (form options), ExecutiveCommittee gets `can("manage", "Position")` plus its existing reads, Member gets `can("read", "Position")` (own profile chips resolve titles). Run tests → PASS.

- [ ] **Step 3: `permission-labels.ts`** (used by grants picker now, permissions panel in K4):

```ts
import type { Role } from "@luminova/types";

export const PERMISSION_ROLE_INFO: Record<Role, { label: string; description: string }> = {
  Admin: { label: "Administración", description: "Acceso total a la plataforma." },
  Membership: { label: "Membresía", description: "Crear y editar miembros; ver aliados, eventos y puntos." },
  Treasury: { label: "Tesorería", description: "Gestionar pagos; ver miembros y puntos." },
  ExecutiveCommittee: { label: "Comité ejecutivo", description: "Ver gestión del capítulo; administrar cargos y comisiones." },
  ProjectManager: { label: "Proyectos", description: "Gestionar proyectos, programas y actividades; registrar asistencia." },
  Scanner: { label: "Escáner", description: "Registrar asistencia en actividades asignadas." },
  Member: { label: "Miembro", description: "Ver y editar su propio perfil; ver puntos y eventos." },
};
```

- [ ] **Step 4: `position-form.tsx`** — RHF + zod (`positionSchema`), fields: Título, Título femenino (Inputs), Categoría (`Select` over `POSITION_CATEGORIES` with labels CEL/JDL/Comisión), Gestión (number `Input`, rendered only when `watch("category") === "JDL"`, registered with `{ valueAsNumber: true }`, set `null` otherwise via `setValue("term", null)` on category change), Permisos (`MultiSelect`, options from `PERMISSION_ROLE_INFO` via `Controller`), Descripción (`Textarea`). Submit pattern, error display and `SectionLabel` copied from `member-form.tsx`. Test (`position-form.test.tsx`): renders, term field hidden for CEL, shown for JDL, submit passes parsed values (mirror `ally-form.test.tsx` harness).

- [ ] **Step 5: nav + route** — `nav-config.ts`: add `"/positions"` to the `to` union, `"Position"` to `subject` union, and under "Gestión": `{ to: "/positions", label: "Cargos y comisiones", icon: "compass", subject: "Position" }` (default `action` is read — visible to Membership/Exec/Admin).

`_app.positions.tsx`: `createFileRoute("/_app/positions")`; page mirrors `_app.members.tsx` skeleton: `PageHeader` (title "Cargos y comisiones", subtitle "Estructura del capítulo: CEL, JDL y comisiones."), `usePositions()`, a `Table` with columns Cargo (base title) / Variante femenina / Categoría (`Badge` tone: CEL→`navy`, JDL→`teal`, Comisión→`gray`) / Gestión (`term ?? "—"`) / Permisos (grant labels joined) — row click opens edit `Sheet size="md"` with `PositionForm`; header action `<Can I="create" a="Position">` button "Nuevo cargo" opens create Sheet; `EmptyState` when catalog empty with `<Can I="create" a="Position">` button "Crear cargos CEL" calling `new PositionRepository().seed(CEL_SEED)` then invalidating `positionKeys.all`; row menu/secondary action "Desactivar" → `useDeletePosition` (soft). No route-level guard beyond `_app` auth — nav hides it; rules enforce writes.

- [ ] **Step 6: Run tests + typecheck** — `pnpm --filter backstage exec vitest run src/features/positions && pnpm --filter @luminova/auth test`. Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(backstage): cargos y comisiones catalog page"`

### Task 8: Member form rework (gender + cargo + comisiones)

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-form.tsx` (+ its test)
- Modify: `member-invite-drawer.tsx`, `member-drawer.tsx` (+ tests)
- Modify: `apps/backstage/src/routes/_app.members.tsx`
- Modify: `apps/backstage/src/features/members/lib/member-display.ts` (+ test)
- Modify: `apps/backstage/src/features/members/lib/member-csv.ts` (+ test)
- Delete: `apps/backstage/src/features/members/lib/role-suggestions.ts`

- [ ] **Step 1: Failing display-helper test** — add to `member-display.test.ts`:

```ts
import { memberPositionLabel } from "./member-display";

const positions = new Map([
  ["pos-pres", { title: "Presidente", titleFemale: "Presidenta" }],
]);

describe("memberPositionLabel", () => {
  it("resolves the gendered cargo title for the term", () => {
    const member = {
      gender: "Femenino",
      role: "",
      positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } },
    };
    expect(memberPositionLabel(member, positions, "2026")).toBe("Presidenta");
  });
  it("falls back to the legacy role string", () => {
    expect(memberPositionLabel({ role: "Vocal" }, positions, "2026")).toBe("Vocal");
  });
  it("falls back to Miembro when nothing is set", () => {
    expect(memberPositionLabel({ role: "" }, positions, "2026")).toBe("Miembro");
  });
});
```

Implementation in `member-display.ts`:

```ts
import { positionTitle, type Member, type MemberGender } from "@luminova/types";

type LabelSource = Pick<Member, "role"> & {
  gender?: MemberGender;
  positions?: Member["positions"];
};

export function memberPositionLabel(
  member: LabelSource,
  positionsById: Map<string, { title: string; titleFemale: string }>,
  termKey: string,
): string {
  const cargoId = member.positions?.[termKey]?.cargoId;
  const cargo = cargoId ? positionsById.get(cargoId) : undefined;
  if (cargo) return positionTitle(cargo, member.gender);
  return member.role || "Miembro";
}
```

- [ ] **Step 2: Rework `member-form.tsx`**
  - Add prop `positions: Position[]`.
  - Remove the Rol `Input` + `datalist` + `ROLE_SUGGESTIONS` import + `useId`; delete `role-suggestions.ts`.
  - `EMPTY`: drop `role`, add `gender: undefined as unknown as MemberGender` — instead, type `defaultValues` properly: `gender` left unset so zod reports "Requerido."; `cargoId: null`, `comisionIds: []`. (RHF: use `useForm<MemberInput>` with `defaultValues: { ...EMPTY, ...defaultValues }` where `EMPTY` omits `gender`.)
  - In "Datos personales": add Género `Select` (`MEMBER_GENDERS` options + leading empty `<option value="">Seleccionar…</option>`) registered as `{...register("gender")}`.
  - In "Membresía", replace the Rol field with (uses `Controller` from react-hook-form and `control` from `useForm`):

```tsx
const gender = watch("gender");
const term = currentTermKey();
const cargoOptions = positions
  .filter((p) => p.category !== "Comision" && (p.term === null || String(p.term) === term))
  .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));
const comisionOptions = positions
  .filter((p) => p.category === "Comision")
  .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));
```

```tsx
<Field label="Cargo" htmlFor="cargoId" error={errors.cargoId?.message}>
  <Controller
    control={control}
    name="cargoId"
    render={({ field }) => (
      <Combobox
        id="cargoId"
        options={cargoOptions}
        value={field.value}
        onChange={field.onChange}
        placeholder="Sin cargo"
      />
    )}
  />
</Field>
<Field label="Comisiones" htmlFor="comisionIds" error={errors.comisionIds?.message}>
  <Controller
    control={control}
    name="comisionIds"
    render={({ field }) => (
      <MultiSelect
        id="comisionIds"
        options={comisionOptions}
        value={field.value}
        onChange={field.onChange}
      />
    )}
  />
</Field>
```

  - Preview block: `previewRole` becomes the selected cargo label: `cargoOptions.find((o) => o.value === watch("cargoId"))?.label ?? "Miembro"`.

- [ ] **Step 3: Drawer + route wiring**
  - `member-drawer.tsx` `toFormInput`: drop `role`, add `gender: member.gender`, `cargoId: member.positions?.[currentTermKey()]?.cargoId ?? null`, `comisionIds: member.positions?.[currentTermKey()]?.comisionIds ?? []`. Pass `positions` prop down to both `MemberForm` usages. ViewBody: Detail "Rol" → "Cargo" using `memberPositionLabel`; below the `dl`, render chips: cargo Badge (tone `navy` CEL / `teal` JDL) + one gray Badge per comisión, resolved through the positions map.
  - `member-invite-drawer.tsx`: accept + forward `positions`; `defaultValues` drop `role`, keep `joinDate`/`status`, add `cargoId: null, comisionIds: []`.
  - `_app.members.tsx`: `const { data: positions } = usePositions()`; build `const positionsById = useMemo(() => new Map((positions ?? []).map((p) => [p.id, p])), [positions])`; pass `positions ?? []` to both drawers and `positionsById` to `MemberTable` if the table renders the role column (check `member-table.tsx`: wherever it shows `member.role`, switch to `memberPositionLabel(member, positionsById, currentTermKey())`).
  - `member-csv.ts`: `membersToCsv(members, roleLabel: (m: Member) => string)` — page passes `(m) => memberPositionLabel(m, positionsById, currentTermKey())`; header cell "Cargo".
  - `member-filter.ts`: keep matching on legacy `member.role`; ALSO match the resolved label is K4 scope — add nothing here.

- [ ] **Step 4: Update component tests** — `member-form.test.tsx`: replace role-input assertions with: gender select present + required error, cargo combobox lists gendered labels (pass a two-position fixture, set gender Femenino, open combobox, expect "Presidenta"), submit emits `cargoId`/`comisionIds`. `member-invite-drawer.test.tsx` / `member-drawer.test.tsx` / `member-table.test.tsx`: update fixtures (`gender`, `positions`, `positions={[]}` props) until green.

- [ ] **Step 5: Run the whole members suite**

Run: `pnpm --filter backstage exec vitest run src/features/members`
Expected: PASS. Then `pnpm typecheck` → PASS repo-wide (Task 4's pending breakage is now resolved).

- [ ] **Step 6: Commit** — `git commit -m "feat(backstage): gender-aware cargo y comisiones in member forms"`

### Task 9: K2 docs + verification + PR

- [ ] **Step 1: Docs** — `docs/data-models.md`: add `positions/{positionId}` section (fields, category semantics, soft delete) + member `gender`/`positions` fields + rules matrix rows (`positions` read signed-in / write Admin+ExecutiveCommittee; members note exec positions-only update). `apps/backstage/CLAUDE.md` routes table: add `_app.positions.tsx | /positions | Cargos y comisiones`.
- [ ] **Step 2: Drawer sizes** — `MemberInviteDrawer`/`MemberDrawer` Sheets get `size="md"` (forms grew).
- [ ] **Step 3: Full verification** — `pnpm pr-tests` AND `pnpm --dir tests/firestore-rules test`. All green; fix anything red before proceeding (superpowers:systematic-debugging if needed).
- [ ] **Step 4: Commit docs** — `git commit -m "docs(data-models): positions collection + member positions"`
- [ ] **Step 5: Reviews (required — rules touched)** — run `/security-review` on the K2 diff; dispatch `firestore-security-reviewer` subagent. Apply findings via superpowers:receiving-code-review.
- [ ] **Step 6: PR** — `gh pr create` targeting `feat/k1-sheet-size`, body per repo template; then `pnpm pr-tests`.

---

## K3 — Invitation email via Firebase

### Task 10: Send the reset email on provision

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-invite-drawer.tsx` (+ test)
- Modify: `apps/backstage/src/routes/_app.members.tsx` (row-menu provision path)
- Modify: `docs/firebase-setup.md` (owner op: customize the password-reset template in Firebase console — Spanish JCI wording)

The existing `requestPasswordReset` (`apps/backstage/src/lib/auth/request-password-reset.ts`) already wraps `sendPasswordResetEmail`. Reuse it — no new lib.

- [ ] **Step 1: Failing drawer test** — in `member-invite-drawer.test.tsx`, mock the lib:

```ts
vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));
```

Cases:
1. submit with "Enviar acceso" checked → `onProvision` called, then `requestPasswordReset` called with the form email, done-state shows `Invitación enviada a ana@jci.org`.
2. `requestPasswordReset` rejects → done-state shows the warning copy `El correo no se pudo enviar.` AND a "Copiar enlace de acceso" button (provision still succeeded).
3. checkbox unchecked → `requestPasswordReset` NOT called (existing copy unchanged).

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-invite-drawer.test.tsx` → FAIL.

- [ ] **Step 2: Implement drawer**
  - Change prop: `onProvision: (memberId: string) => Promise<{ email: string; actionLink: string }>` (the callable already returns this; `_app.members.tsx` passes `(memberId) => provision.mutateAsync(memberId)` — drop the `.then(() => undefined)`).
  - `DoneState` gains `emailSent: boolean; actionLink: string | null`.
  - `handleSubmit`:

```tsx
const handleSubmit = async (data: MemberInput) => {
  const id = await onCreate(data);
  let provisioned = false;
  let emailSent = false;
  let actionLink: string | null = null;
  if (sendAccess) {
    const result = await onProvision(id);
    provisioned = true;
    actionLink = result.actionLink;
    try {
      await requestPasswordReset(data.email);
      emailSent = true;
    } catch {
      emailSent = false;
    }
  }
  setDone({ name: data.name, email: data.email, provisioned, emailSent, actionLink });
};
```

  - Done-state copy: provisioned && emailSent → `Invitación enviada a {email}. Recibirá un correo para crear su contraseña.`; provisioned && !emailSent → `role="alert"` text `El correo no se pudo enviar. Comparte el enlace de acceso manualmente.` + `<Button variant="secondary" onClick={() => navigator.clipboard.writeText(done.actionLink ?? "")}>Copiar enlace de acceso</Button>`; not provisioned → existing copy.

- [ ] **Step 3: Row-menu path** — in `_app.members.tsx` `handleProvision`: after `provision.mutateAsync`, `try { await requestPasswordReset(member.email); setToast(actionMessage(member.name, "invited")); } catch { setToast("Acceso creado, pero el correo no se envió."); }`.

- [ ] **Step 4: Run tests** — drawer suite PASS; `pnpm --filter backstage exec vitest run src/features/members` PASS.
- [ ] **Step 5: Docs** — `docs/firebase-setup.md`: short "Invitation email" subsection — built-in Auth template sends the email; emulator prints the link to the Auth emulator logs; console template customization = owner op.
- [ ] **Step 6: Commit** — `git commit -m "feat(backstage): send invitation email via Firebase Auth"`

### Task 11: K3 verification + PR

- [ ] **Step 1: Manual emulator check** — `firebase emulators:start` + `pnpm --filter backstage dev` (`VITE_FIREBASE_EMULATOR_ENABLED=true`): invite a member with "Enviar acceso" → Auth emulator log shows the reset-link email entry; drawer shows sent state.
- [ ] **Step 2: `pnpm pr-tests`** → green.
- [ ] **Step 3: `/security-review`** on the K3 diff (auth flow touched — required).
- [ ] **Step 4: PR** — `gh pr create` targeting `feat/k2-position-catalog`.

---

## Deferred to the K4 plan (write after K2/K3 merge)

- Beacon `onDocumentWritten('members/{id}')` claims-sync trigger (+ `firebase-functions-reviewer`).
- **K4 SECURITY REQUIREMENT (from K2 security review — blocking for the trigger):** cargo *assignment* is writable by Membership/ExecutiveCommittee, and the `grants` guard only covers position *definition*. The claims-sync trigger MUST NOT blindly promote grants from any assigned `cargoId`: it must gate power-conferring assignments (e.g. honor non-empty-`grants` positions only when the assignment was authored by an Admin, or require Admin re-approval before claims recompute). Add a trigger/rules test: "Membership assigns Presidente cargo → no Admin claim."
- Extend the existing `/members/$memberId` page (`_app.members_.$memberId.tsx`): full editing, per-term position history, permissions panel from CASL + `PERMISSION_ROLE_INFO` (frontend-design → ui-ux-pro-max in that slice).
- Exec positions-only editing UI (rule already live from K2).
- Drop legacy `Member.role` + backfill `positions` from it; member-filter searches resolved labels.
- Category-colored chips in the members TABLE (spec promised table+drawer; K2 shipped drawer chips + a text label in the table — upgrade with the K4 edit page).
- `provisionMemberLogin` claims alignment: today it sets `roles: ["Member"]`; the K4 trigger recomputes from positions, so provisioning a Presidenta heals on first positions write — K4 makes the trigger also run on `uid` linkage (already specced).
