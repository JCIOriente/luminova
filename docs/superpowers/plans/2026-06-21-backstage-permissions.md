# Dynamic Roles & Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Admin author roles, edit built-in roles' coarse permissions, and grant per-member permission overrides at runtime, enforced in CASL and `firestore.rules`.

**Architecture:** A `roles/{id}` Firestore collection holds editable role→permission mappings. The beacon claims-sync trigger resolves each member's effective coarse permission set (built-in roles via positions ∪ custom roles via `Member.roleIds` ∪ `permissionOverrides`) into a `perms` custom claim. CASL expands `perms` into abilities (plus the existing hardcoded conditional grants from `roles`); `firestore.rules` gates coarse CRUD on `perms`. Admin-only authority; readable perm strings; hard cap of 30 effective perms (fail-closed).

**Tech Stack:** TypeScript strict, Zod, CASL (`@casl/ability`), firebase-admin, Firestore rules + `@firebase/rules-unit-testing`, React 19 / TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-backstage-permissions-design.md`

> **Superseded (2026-07-20, PR-B #200):** the step below that has `buildAbility` consume
> `claims.perms` **with role fallback** is out of date — the fallback was removed;
> `buildAbility` now reads `claims.perms ?? []` (absent `perms` → zero coarse abilities).
> Retained as the original plan; current contract in
> `docs/status/2026-07-20-authz-migration.md`.

**Branch:** `feat/backstage-permissions` (worktree `.worktrees/feat-backstage-permissions`). Slices ship as 4 stacked PRs; each slice ends with `/simplify` + `/code-review` + `/security-review` (where triggered) before its PR.

---

## Permission vocabulary (shared constant — defined once in Task 1.1)

```
ACTIONS  = manage | create | read | update | delete | checkIn
SUBJECTS = Member Ally Event PointRule MemberPoints Payment Attendance Program Project Activity Position Role all
PermissionCode = `${Action}:${Subject}`
```

Built-in role → coarse perms (derived verbatim from today's `applyRole` in `packages/auth/src/ability.ts`; conditional grants are NOT encoded as perms — they stay in CASL/rules):

| Role | Perms |
|------|-------|
| Admin | `manage:all` |
| Membership | `manage:Member`, `read:Ally`, `read:Event`, `read:MemberPoints`, `read:Position` |
| Treasury | `manage:Payment`, `read:Member`, `read:MemberPoints` |
| ExecutiveCommittee | `read:Member`, `read:Ally`, `read:Event`, `read:MemberPoints`, `read:Program`, `read:Project`, `manage:Position` |
| ProjectManager | `manage:Project`, `manage:Activity`, `manage:Program`, `read:Ally`, `read:Event` (`checkIn:Attendance` is conditional → stays in CASL/rules, not a perm) |
| Scanner | (none coarse — `checkIn:Attendance` event-scoped + `read:Activity` are conditional, stay in CASL/rules) |
| Member | (none coarse — own-profile read/update + `read:MemberPoints/Event/Project/Position` stay in CASL/rules) |

> Decision: Membership/Treasury/EC/PM keep their **non-conditional** coarse perms in the seed (so editing them in the UI changes enforcement). Scanner/Member are purely conditional → empty coarse seed. `ProjectManager.checkIn:Attendance` is unconditional today (`can("checkIn","Attendance")`) — encode it as a perm `checkIn:Attendance`. Re-examine in Task 1.1.

---

## SLICE 1 — types + auth (`@luminova/types`, `@luminova/auth`)

Back-compatible: when `perms` is absent from claims, `buildAbility` falls back to deriving abilities from `roles` exactly as today, so nothing breaks before the beacon backfill.

**File structure:**
- Create `packages/types/src/permission.ts` — `ACTIONS`, `SUBJECTS`, `PermissionCode`, `isValidPermissionCode`, `PERMISSION_CAP = 30`.
- Create `packages/types/src/role-definition.ts` — `RoleDefinition` interface + `BUILT_IN_ROLE_PERMS` map.
- Create `packages/types/src/permission-overrides.ts` — `PermissionOverrides` interface.
- Modify `packages/types/src/member.ts` — add `roleIds?`, `permissionOverrides?`.
- Modify `packages/types/src/index.ts` — export the new symbols.
- Create `packages/types/src/role-definition-schema.ts` — Zod `roleDefinitionSchema`.
- Modify `packages/types/src/member-schema.ts` — add optional `roleIds`, `permissionOverrides` (admin assignment form).
- Create `packages/auth/src/perms.ts` — `resolveEffectivePerms`, `expandPermsToAbility`.
- Modify `packages/auth/src/ability.ts` — `buildAbility` consumes `claims.perms` with role fallback; keep conditional `applyRole` for the conditional bits.
- Modify `packages/auth/src/roles.ts` — `AuthClaims` gains `perms?: PermissionCode[]`.

### Task 1.1: Permission vocabulary

**Files:**
- Create: `packages/types/src/permission.ts`
- Test: `packages/types/src/permission.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ACTIONS, SUBJECTS, isValidPermissionCode, PERMISSION_CAP, ALL_PERMISSION_CODES } from "./permission.js";

describe("permission vocabulary", () => {
  it("accepts well-formed codes", () => {
    expect(isValidPermissionCode("manage:Member")).toBe(true);
    expect(isValidPermissionCode("read:Payment")).toBe(true);
    expect(isValidPermissionCode("manage:all")).toBe(true);
  });
  it("rejects malformed or unknown codes", () => {
    expect(isValidPermissionCode("bogus:Member")).toBe(false);
    expect(isValidPermissionCode("manage:Nope")).toBe(false);
    expect(isValidPermissionCode("manage")).toBe(false);
    expect(isValidPermissionCode(42)).toBe(false);
  });
  it("enumerates every action×subject", () => {
    expect(ALL_PERMISSION_CODES.length).toBe(ACTIONS.length * SUBJECTS.length);
    expect(new Set(ALL_PERMISSION_CODES).size).toBe(ALL_PERMISSION_CODES.length);
  });
  it("caps effective perms at 30", () => {
    expect(PERMISSION_CAP).toBe(30);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm --filter @luminova/types exec vitest run src/permission.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export const ACTIONS = ["manage", "create", "read", "update", "delete", "checkIn"] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  "Member", "Ally", "Event", "PointRule", "MemberPoints", "Payment",
  "Attendance", "Program", "Project", "Activity", "Position", "Role", "all",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export type PermissionCode = `${Action}:${Subject}`;

export const ALL_PERMISSION_CODES: PermissionCode[] = ACTIONS.flatMap((a) =>
  SUBJECTS.map((s) => `${a}:${s}` as PermissionCode),
);

const VALID = new Set<string>(ALL_PERMISSION_CODES);

export function isValidPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === "string" && VALID.has(value);
}

/** Max effective perms per member — keeps the encoded `perms` custom claim under
 *  Firebase's 1000-byte limit (longest code ~22B with quoting → ≥36 fit). */
export const PERMISSION_CAP = 30;
```

- [ ] **Step 4: Run test, verify it passes.**
- [ ] **Step 5: Commit** — `git commit -m "feat(types): permission vocabulary (action:Subject codes + cap)"`

### Task 1.2: RoleDefinition + built-in perm map

**Files:**
- Create: `packages/types/src/role-definition.ts`
- Test: `packages/types/src/role-definition.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { BUILT_IN_ROLE_PERMS } from "./role-definition.js";
import { isValidPermissionCode } from "./permission.js";
import { ROLES } from "./permission-role.js";

describe("BUILT_IN_ROLE_PERMS", () => {
  it("has an entry for every built-in role", () => {
    for (const r of ROLES) expect(BUILT_IN_ROLE_PERMS[r]).toBeDefined();
  });
  it("Admin is manage:all", () => {
    expect(BUILT_IN_ROLE_PERMS.Admin).toEqual(["manage:all"]);
  });
  it("only contains valid codes", () => {
    for (const codes of Object.values(BUILT_IN_ROLE_PERMS))
      for (const c of codes) expect(isValidPermissionCode(c)).toBe(true);
  });
  it("Scanner and Member have no coarse perms (conditional only)", () => {
    expect(BUILT_IN_ROLE_PERMS.Scanner).toEqual([]);
    expect(BUILT_IN_ROLE_PERMS.Member).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

```ts
import type { Timestamp } from "firebase/firestore";
import type { Role } from "./permission-role.js";
import type { PermissionCode } from "./permission.js";

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  builtInKey: Role | null;
  permissions: PermissionCode[];
  locked: boolean;
  active: boolean;
  deletedAt: Timestamp | null;
}

/** Coarse, non-conditional perms each built-in role confers. Conditional grants
 *  (own-profile, scanner events, attendance scope) live in CASL + rules, not here. */
export const BUILT_IN_ROLE_PERMS: Record<Role, PermissionCode[]> = {
  Admin: ["manage:all"],
  Membership: ["manage:Member", "read:Ally", "read:Event", "read:MemberPoints", "read:Position"],
  Treasury: ["manage:Payment", "read:Member", "read:MemberPoints"],
  ExecutiveCommittee: [
    "read:Member", "read:Ally", "read:Event", "read:MemberPoints",
    "read:Program", "read:Project", "manage:Position",
  ],
  ProjectManager: [
    "manage:Project", "manage:Activity", "manage:Program",
    "read:Ally", "read:Event", "checkIn:Attendance",
  ],
  Scanner: [],
  Member: [],
};
```

- [ ] **Step 4: Pass.** **Step 5: Commit** — `feat(types): RoleDefinition + built-in role perm map`.

### Task 1.3: PermissionOverrides + Member fields

**Files:**
- Create: `packages/types/src/permission-overrides.ts`
- Modify: `packages/types/src/member.ts:28-33`
- Test: covered via member-schema test (Task 1.5)

- [ ] **Step 1: Implement `permission-overrides.ts`**

```ts
import type { PermissionCode } from "./permission.js";

export interface PermissionOverrides {
  grant: PermissionCode[];
  revoke: PermissionCode[];
}
```

- [ ] **Step 2: Modify `member.ts`** — after the `uid?` field, add:

```ts
  /** Custom role ids assigned directly (Admin-only; positions confer built-in roles). */
  roleIds?: string[];
  /** Per-member coarse permission grants/revocations layered on resolved role perms. */
  permissionOverrides?: PermissionOverrides;
```

and add the import: `import type { PermissionOverrides } from "./permission-overrides.js";`

- [ ] **Step 3: Commit** — `feat(types): Member.roleIds + permissionOverrides`.

### Task 1.4: Barrel exports

**Files:** Modify `packages/types/src/index.ts`

- [ ] Add exports:

```ts
export {
  ACTIONS, SUBJECTS, ALL_PERMISSION_CODES, isValidPermissionCode, PERMISSION_CAP,
  type Action, type Subject, type PermissionCode,
} from "./permission.js";
export { BUILT_IN_ROLE_PERMS, type RoleDefinition } from "./role-definition.js";
export type { PermissionOverrides } from "./permission-overrides.js";
export { roleDefinitionSchema, type RoleDefinitionInput } from "./role-definition-schema.js";
```

- [ ] Commit with Task 1.5.

### Task 1.5: Zod schemas (roleDefinition + member assignment fields)

**Files:**
- Create: `packages/types/src/role-definition-schema.ts`
- Modify: `packages/types/src/member-schema.ts`
- Test: `packages/types/src/role-definition-schema.test.ts`, extend `member-schema.test.ts`

- [ ] **Step 1: Failing test** (`role-definition-schema.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { roleDefinitionSchema } from "./role-definition-schema.js";

describe("roleDefinitionSchema", () => {
  it("accepts a valid custom role", () => {
    const r = roleDefinitionSchema.safeParse({
      name: "Coordinador de Eventos", description: "", permissions: ["manage:Event"],
    });
    expect(r.success).toBe(true);
  });
  it("rejects an unknown permission code", () => {
    const r = roleDefinitionSchema.safeParse({ name: "X", description: "", permissions: ["manage:Nope"] });
    expect(r.success).toBe(false);
  });
  it("rejects an empty name", () => {
    const r = roleDefinitionSchema.safeParse({ name: "", description: "", permissions: [] });
    expect(r.success).toBe(false);
  });
  it("rejects more than PERMISSION_CAP perms", () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => `read:Member`);
    const r = roleDefinitionSchema.safeParse({ name: "X", description: "", permissions: tooMany });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement `role-definition-schema.ts`**

```ts
import { z } from "zod";
import { ALL_PERMISSION_CODES, PERMISSION_CAP } from "./permission.js";

const permissionCode = z.enum(ALL_PERMISSION_CODES as [string, ...string[]]);

export const roleDefinitionSchema = z.object({
  name: z.string().min(1, "Requerido."),
  description: z.string(),
  permissions: z.array(permissionCode).max(PERMISSION_CAP, `Máximo ${PERMISSION_CAP} permisos.`),
});

export type RoleDefinitionInput = z.infer<typeof roleDefinitionSchema>;
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Extend `member-schema.ts`** — add to `memberSchema` object:

```ts
  roleIds: z.array(z.string().min(1)).optional(),
  permissionOverrides: z
    .object({ grant: z.array(permissionCode), revoke: z.array(permissionCode) })
    .optional(),
```

(import `permissionCode` helper or inline `z.enum(ALL_PERMISSION_CODES ...)`; extract a shared `permissionCode` schema in `permission.ts` to avoid duplication — DRY.)

- [ ] **Step 6: Run types ci** — `pnpm --filter @luminova/types run ci` → PASS. **Commit** — `feat(types): zod schemas for roles + member permission assignment`.

### Task 1.6: resolveEffectivePerms (`@luminova/auth`)

**Files:**
- Create: `packages/auth/src/perms.ts`
- Test: `packages/auth/src/perms.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveEffectivePerms } from "./perms.js";
import type { RoleDefinition } from "@luminova/types";

const role = (permissions: string[]): RoleDefinition => ({
  id: "r", name: "r", description: "", builtIn: false, builtInKey: null,
  permissions: permissions as RoleDefinition["permissions"], locked: false, active: true, deletedAt: null,
});

describe("resolveEffectivePerms", () => {
  it("unions role perms and dedupes + sorts", () => {
    const out = resolveEffectivePerms({ roleDocs: [role(["read:Member"]), role(["read:Member", "manage:Ally"])] });
    expect(out).toEqual(["manage:Ally", "read:Member"]);
  });
  it("applies grants then revokes", () => {
    const out = resolveEffectivePerms({
      roleDocs: [role(["read:Member"])],
      overrides: { grant: ["manage:Event"], revoke: ["read:Member"] },
    });
    expect(out).toEqual(["manage:Event"]);
  });
  it("revoke wins over grant for the same code", () => {
    const out = resolveEffectivePerms({ roleDocs: [], overrides: { grant: ["read:Member"], revoke: ["read:Member"] } });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement**

```ts
import type { PermissionCode, RoleDefinition } from "@luminova/types";

export function resolveEffectivePerms(input: {
  roleDocs: Pick<RoleDefinition, "permissions">[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const set = new Set<PermissionCode>();
  for (const doc of input.roleDocs) for (const p of doc.permissions) set.add(p);
  for (const g of input.overrides?.grant ?? []) set.add(g);
  for (const r of input.overrides?.revoke ?? []) set.delete(r);
  return [...set].sort();
}
```

- [ ] **Step 4: Pass. Commit** — `feat(auth): resolveEffectivePerms`.

### Task 1.7: buildAbility consumes perms (with role fallback)

**Files:**
- Modify: `packages/auth/src/roles.ts` (add `perms?` to `AuthClaims`)
- Modify: `packages/auth/src/ability.ts`
- Test: extend `packages/auth/src/ability.test.ts`

- [ ] **Step 1: Failing test** (add to `ability.test.ts`)

```ts
it("grants coarse abilities from perms claim", () => {
  const a = buildAbility({ roles: ["Member"], perms: ["manage:Ally"] }, "u1");
  expect(a.can("update", "Ally")).toBe(true);
  expect(a.can("read", "Ally")).toBe(true); // manage implies read
});
it("keeps conditional Member self-access from roles even with perms present", () => {
  const a = buildAbility({ roles: ["Member"], perms: [] }, "u1");
  expect(a.can("update", subject("Member", { uid: "u1" }))).toBe(true);
  expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
});
it("falls back to role-derived abilities when perms is absent (pre-backfill)", () => {
  const a = buildAbility({ roles: ["Membership"] }, "u1");
  expect(a.can("manage", "Member")).toBe(true); // from BUILT_IN_ROLE_PERMS fallback
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — `roles.ts`: `AuthClaims` gains `perms?: PermissionCode[]` (import type from `@luminova/types`). `ability.ts`:

```ts
import { BUILT_IN_ROLE_PERMS, type PermissionCode } from "@luminova/types";
// ...
function applyConditional(role: Role, claims: AuthClaims, uid: string, can: Can): void {
  // ONLY the conditional / object-scoped grants remain here:
  switch (role) {
    case "Scanner":
      can("checkIn", "Attendance", { eventId: { $in: claims.scannerEventIds ?? [] } });
      can("read", "Activity");
      break;
    case "Member":
      can(["read", "update"], "Member", { uid });
      can("read", ["MemberPoints", "Event", "Project", "Position"]);
      break;
  }
}

function applyPerms(perms: PermissionCode[], can: Can): void {
  for (const code of perms) {
    const [action, sub] = code.split(":") as [Action, Subject];
    can(action, sub);
  }
}

export function buildAbility(claims: AuthClaims, uid: string): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  const perms = claims.perms ?? claims.roles.flatMap((r) => BUILT_IN_ROLE_PERMS[r]);
  applyPerms(perms, builder.can);
  for (const role of claims.roles) applyConditional(role, claims, uid, builder.can);
  return builder.build();
}
```

> Note: the old `applyRole` coarse cases (Admin manage:all, Membership, Treasury, EC, PM coarse) are now sourced from `BUILT_IN_ROLE_PERMS` via the fallback (pre-backfill) or from the `perms` claim (post-backfill). Delete the coarse cases from the switch; keep only Scanner/Member conditional.

- [ ] **Step 4: Run auth ci** — `pnpm --filter @luminova/auth run ci` → PASS (existing ability tests must still pass: they assert role→ability, now satisfied via fallback). Fix any drift.
- [ ] **Step 5: Commit** — `feat(auth): build ability from perms claim with role fallback`.

### Task 1.8: Slice 1 close-out

- [ ] `/simplify` on the slice-1 diff; apply.
- [ ] `/code-review` on the slice-1 diff; fix findings.
- [ ] `/security-review` on the diff (auth boundary). Stamp `Security-Reviewed:` trailer.
- [ ] `pnpm --filter @luminova/types --filter @luminova/auth run ci` green.
- [ ] Open PR #1 (base `main`): "feat(types,auth): permission vocabulary + perms-driven ability". `pnpm pr-tests`.

---

## SLICE 2 — beacon (resolution into claims + role trigger + seed + backfill)

**File structure:**
- Modify `apps/beacon/src/claims-sync/sync.ts` — resolve perms, cap guard, write `perms`.
- Modify `apps/beacon/src/claims-sync/firestore-deps.ts` — `getRole`, `getRolesByIds`, perms read/write in claims, `listMembers` for fan-out.
- Modify `apps/beacon/src/claims-sync/parse-member.ts` — extract `roleIds`, `permissionOverrides`.
- Create `apps/beacon/src/claims-sync/resolve-member-perms.ts` — glue: positions→builtInRoles→roleDocs→effective perms (pure, deps-injected).
- Create `apps/beacon/src/seed-roles.ts` — idempotent seeding of the 7 built-ins into `roles/`.
- Create `apps/beacon/src/recompute-claims.ts` — admin-only `recomputeAllClaims` callable.
- Modify `apps/beacon/src/index.ts` — `onRoleWritten` trigger binding + callable export + seed wiring.

### Task 2.1: parse-member extracts roleIds + overrides

**Files:** Modify `parse-member.ts`; extend `parse-member.test.ts`.

- [ ] **Step 1: Failing test** — assert `parseMember({ uid:"u", roleIds:["r1"], permissionOverrides:{grant:["manage:Event"],revoke:[]} })` returns those, drops malformed (`roleIds` non-array → `[]`; bad override codes filtered via `isValidPermissionCode`).
- [ ] **Step 2: Implement** — extend `SafeMember` with `roleIds: string[]` and `permissionOverrides: { grant: PermissionCode[]; revoke: PermissionCode[] }`; parse defensively (filter to valid codes with `isValidPermissionCode`, default `[]`).
- [ ] **Step 3: Pass. Commit** — `feat(beacon): parse roleIds + permissionOverrides`.

### Task 2.2: resolve-member-perms glue

**Files:** Create `resolve-member-perms.ts` + test; extend `ClaimsSyncDeps` with `getRolesByIds(ids): Promise<RoleDefinition[]>` and `getBuiltInRole(key): Promise<RoleDefinition | null>`.

- [ ] **Step 1: Failing test** with an in-memory deps fake: a member with built-in role `Membership` (from positions) + custom role `r1`(`manage:Ally`) + override grant `read:Payment` → effective = union of Membership's seeded perms ∪ manage:Ally ∪ read:Payment, sorted, deduped. Cap: >30 → returns `{ overflow: true }` sentinel.
- [ ] **Step 2: Implement** — fetch built-in role docs by name (their *current, possibly edited* perms come from `roles/`, not `BUILT_IN_ROLE_PERMS`), fetch custom role docs by id, call `resolveEffectivePerms`, enforce `PERMISSION_CAP`.
- [ ] **Step 3: Pass. Commit** — `feat(beacon): resolve member effective perms`.

### Task 2.3: syncMemberClaims writes perms (cap fail-closed)

**Files:** Modify `sync.ts`; extend `sync.test.ts`.

- [ ] **Step 1: Failing tests** — (a) claims now include sorted `perms`; (b) idempotent when perms unchanged; (c) when effective > 30, `setClaims` is NOT called and an error is logged (inject a logger dep); (d) existing `roles`/`scannerEventIds` behavior unchanged.
- [ ] **Step 2: Implement** — after computing `roles`, resolve perms (Task 2.2), guard cap, include `perms` in the `next` claims object; extend `sameClaims` to compare perms (order-independent).
- [ ] **Step 3: Pass. Commit** — `feat(beacon): sync resolves perms into claims with cap guard`.

### Task 2.4: firestore-deps — role reads, perms in claims, member listing

**Files:** Modify `firestore-deps.ts`; emulator-exercised (no unit).

- [ ] Implement `getBuiltInRole(key)` (`roles where builtInKey == key, active`), `getRolesByIds(ids)` (chunked `in` queries or per-id get), perms read in `getExistingClaims`, perms write in `setClaims`, and `listMembersWithRole(roleId)` / `listMembersWithBuiltInKey(key)` for the trigger fan-out. Commit — `feat(beacon): firestore deps for roles + perms claims`.

### Task 2.5: onRoleWritten trigger

**Files:** Modify `index.ts`; logic in `resolve-member-perms.ts` or a new `on-role-written.ts` (pure core + thin binding).

- [ ] **Step 1: Failing test** (pure core) — given a changed role id, the core returns the set of member uids to re-sync (custom: members with `roleIds` containing id; built-in: members whose positions confer `builtInKey`). Dedup.
- [ ] **Step 2: Implement** core + bind `onDocumentWritten("roles/{id}")` → for each affected member, `syncMemberClaims`. Batch sequentially (rare, admin-only). 
- [ ] **Step 3: Pass. Commit** — `feat(beacon): re-sync members on role change`.

### Task 2.6: seed-roles + recomputeAllClaims callable

**Files:** Create `seed-roles.ts`, `recompute-claims.ts`; wire in `index.ts`.

- [ ] **Step 1: Failing test** — `seedRoles` writes 7 built-in docs (id = role name, `builtIn:true`, `builtInKey`, perms from `BUILT_IN_ROLE_PERMS`, Admin `locked:true`), idempotent (skips existing). `recomputeAllClaims` core iterates members and calls sync; callable rejects non-Admin (`HttpsError("permission-denied")`) — mirror `setUserRoles` guard.
- [ ] **Step 2: Implement.** Seed runs via the callable or a guarded one-shot (NOT auto on deploy — explicit admin trigger). 
- [ ] **Step 3: Pass. Commit** — `feat(beacon): seed built-in roles + admin recompute-claims callable`.

### Task 2.7: Slice 2 close-out

- [ ] `/simplify` → `/code-review` → dispatch `firebase-functions-reviewer` → `/security-review`; fix findings; stamp trailer.
- [ ] `pnpm --filter beacon run ci` green.
- [ ] PR #2 (base = slice-1 branch). `pnpm pr-tests`.

---

## SLICE 3 — firestore.rules (perm-based gates + role collection + assignment immutability)

> Deploy AFTER the backfill (`recomputeAllClaims`) has populated `perms` for all members. Sequencing noted in the PR description.

**File structure:** Modify `firestore.rules`; extend `tests/firestore-rules/rules.test.ts`.

### Task 3.1: helpers

- [ ] Add `perms()`, `hasPerm(p)`, `canDo(action, subject)` (expands `manage:all` / `manage:<subject>` / `<action>:<subject>`). Keep `roles()`/`hasAnyRole()` for conditional gates. (Read the current `firestore.rules` first to place these next to existing helpers.)

### Task 3.2: migrate coarse collection gates

- [ ] For each collection currently gated `hasAnyRole([...])` for **coarse** CRUD (members create/update, allies, events, positions create/update, pointRules, terms, etc.), replace with `canDo(action, subject)`. Preserve every **conditional** clause (member self profilePicture update by uid; EC position-only; scanner checkIn eventId scope; initiative direction; soft-delete safety; positionsAssignmentSafe trust gate). Map each subject to the matching firestore path. Write per-gate rules-unit tests (allow + deny) before each change (TDD).

### Task 3.3: roles collection + assignment immutability

- [ ] `match /roles/{id}`: read `signedIn()`; write `hasPerm('manage:all')` (Admin). 
- [ ] `members/{id}` update: non-Admin writes must leave `roleIds` and `permissionOverrides` unchanged — add to the existing immutability conjunction (alongside `uid`/`totalPoints`). Only `hasPerm('manage:all')` may change them. Tests: non-Admin attempt to set `roleIds`/overrides → DENY; Admin → ALLOW; escalation via override grant by non-Admin → DENY.

### Task 3.4: Slice 3 close-out

- [ ] Run rules tests: `pnpm --filter @luminova/tests-firestore-rules test` (confirm exact filter from `tests/firestore-rules/package.json`).
- [ ] `/simplify` (rules readability) → dispatch `firestore-security-reviewer` → `/security-review`; fix; stamp trailer.
- [ ] PR #3 (base = slice-2 branch), description leads with the **backfill-before-deploy** ordering. `pnpm pr-tests`.

---

## SLICE 4 — admin UI (`apps/backstage`, `/permisos`)

**File structure (read `apps/backstage/src/routes/_app.permisos.tsx` + a sibling feature for patterns first):**
- Create `features/permissions/repositories/role-repository.ts` — CRUD on `roles/` (client SDK).
- Create `features/permissions/hooks/use-roles.ts`, `use-save-role.ts`, `use-delete-role.ts` (TanStack Query).
- Create `features/permissions/components/role-list.tsx`, `role-editor.tsx` (subject×action matrix; built-in conditions locked; Admin locked; live count vs cap).
- Create `features/permissions/components/member-permissions-panel.tsx` — roleIds multiselect + override grant/revoke + read-only effective-perms preview (computed client-side via `resolveEffectivePerms`); blocks save > 30.
- Create `features/permissions/effective-preview.ts` — wraps `resolveEffectivePerms` with the member's built-in roles for the preview.
- Modify `_app.permisos.tsx` — mount role list/editor under the existing `manage:all` gate.
- Wire member assignment into the member detail route (read it first).

### Task 4.1–4.6 (TDD each; component tests with vitest + testing-library)
- [ ] Role repository + hooks (test with mocked firestore client, mirror an existing repository's test).
- [ ] Role list (built-in/custom badge, create button gated `manage:all`).
- [ ] Role editor (matrix toggles, locked rows for Admin + conditional perms, cap counter, save via Zod `roleDefinitionSchema`).
- [ ] Member permissions panel (assign roles, overrides, effective preview, cap block).
- [ ] Route wiring + nav.
- [ ] Close-out: `/simplify` → `/code-review` → `react-best-practices` (auto) → dispatch `bundle-budget-watcher` → `/security-review` (touches authz UI). PR #4 (base = slice-3 branch). `pnpm pr-tests`.

---

## Cross-slice notes
- **Merge order:** PR1 → PR2 → PR3 → PR4 (no CI; rules deploy gated on backfill).
- **NodeNext in beacon/types:** relative imports use explicit `.js`.
- **No barrel imports in backstage features** — import direct.
- **Stop hook** nudges checkpoint commits; keep each task's commit small.
