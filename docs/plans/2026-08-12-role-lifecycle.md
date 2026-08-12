# Role Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Admin take any role except `Admin` and `Member` out of service and bring it back, by first making INACTIVE distinguishable from MISSING in the perms pipeline.

**Architecture:** `resolveMemberPerms` goes three-way per built-in key (absent → seed snapshot, active doc → its perms, inactive doc → nothing but still *covered*), which removes the ambiguity the `firestore.rules` deactivation ban was working around; the rules ban is then replaced by a `roleLifecycleSafe()` helper local to the roles lane (`softDeleteSafe()` is untouched — four other collections depend on its one-way semantics). On the client, `useRoles()` becomes one unfiltered query and every *assignment* surface filters through a single `assignableRoles()` helper, while `/permisos` renders deactivated rows with their stored permissions and a "Reactivar rol" affordance.

**Tech Stack:** TypeScript 6 strict, Firebase Cloud Functions (firebase-admin), Firestore Security Rules + `@firebase/rules-unit-testing`, React 19 + TanStack Query v5, Vitest, `@luminova/ui`.

---

## Ordering contract (read before reordering anything)

Two hazards decide the order:

1. **No commit may permit a deactivation that restores seed perms.** Task 1 (beacon three-way) lands *before* Task 5 (rules unblock). Between them the rules still deny built-in deactivation, so the tree is safe at every commit. The reverse order opens exactly the hole `firestore.rules:391-392` exists to close.
2. **No commit may offer a deactivated role for assignment.** `assignableRoles()` and every consumer of it (Tasks 8-14) land *before* Task 16 widens `RoleRepository.getAll()`. While `getAll()` still filters `active`, those filters are no-ops in production and are proven only by their unit fixtures — which is exactly the point of adding them first.

Within Task 1, `firestore-deps.ts` must ship in the *same* commit as the widened `RolePermsDeps`: dropping `isActiveRoleDoc` from the query filter without the three-way would make an inactive built-in doc *contribute* its perms (strictly worse than today), and the widened type doesn't compile without the `active` mapping.

Within Task 5, the `Member` bar ships in the *same* commit as the unblock. A commit that permits built-in deactivation without it lets an Admin strip five reads from every provisioned user in the chapter.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/beacon/src/claims-sync/resolve-member-perms.ts` | Modify | `RolePermsDeps.getRoleDocsByBuiltInKeys` widens to carry `active`; three-way resolution (`covered` from all docs, contribution from active only) |
| `apps/beacon/src/claims-sync/resolve-member-perms.test.ts` | Modify | Unit tests for the three-way; existing fixture gains `active` |
| `apps/beacon/src/claims-sync/firestore-deps.ts` | Modify | Drop `isActiveRoleDoc` from the built-in query filter (KEEP `builtIn === true`), map `active` onto the result |
| `apps/beacon/src/claims-sync/role-docs.emulator.test.ts` | Create | Emulator regression over the real deps shared by BOTH `resolveMemberPerms` callers (`sync.ts:94`, `set-user-roles.ts:59`) |
| `apps/beacon/src/claims-sync/role-change.ts` | Modify | Compare `builtIn` **before** the both-inactive short-circuit |
| `apps/beacon/src/claims-sync/role-change.test.ts` | Modify | `inactive+builtIn:true -> inactive+builtIn:false` fires the fan-out |
| `apps/beacon/src/reseed-role-perms.emulator.test.ts` | Modify | `reseedBuiltInRolePerms` does not resurrect a deactivated built-in |
| `apps/beacon/src/seed-roles.emulator.test.ts` | Create | `seedBuiltInRoles` (create-only) does not resurrect a deactivated built-in |
| `firestore.rules` | Modify | Add `roleLifecycleSafe()`; delete the `builtIn`/`active` clause; bar `active:false` on `builtInKey == 'Member'`; require `active:true` + `deletedAt:null` on create |
| `tests/firestore-rules/rules.test.ts` | Modify | Replace the removed-invariant test; lifecycle allow/deny matrix; create-arm tests; built-in NAME write; Scanner conjunct survives deactivation (both arms) |
| `apps/backstage/src/lib/role-lifecycle.ts` | Create | `isLiveRole` (client mirror of beacon `isActiveRoleDoc`) + the ONE `assignableRoles` filter |
| `apps/backstage/src/lib/role-lifecycle.test.ts` | Create | Unit tests for both |
| `apps/backstage/src/lib/role-display.ts` | Modify | `roleOptions` labels a deactivated built-in "… (desactivado)" and KEEPS the option |
| `apps/backstage/src/lib/role-display.test.ts` | Modify | Pins the label + the option's survival |
| `apps/backstage/src/features/permissions/lib/effective-preview.ts` | Modify | Three-way on the built-in path; `active` filter on the custom path |
| `apps/backstage/src/features/permissions/lib/effective-preview.test.ts` | Modify | Tests for both paths incl. the `active:true`+`deletedAt` ghost |
| `apps/backstage/src/features/permissions/components/member-roles-panel.tsx` | Modify | `customRoleOptions` via `assignableRoles`; visible notice for a stored inactive `roleId` |
| `apps/backstage/src/features/permissions/components/member-roles-panel.test.tsx` | Modify | Deactivated role absent from the picker; notice rendered |
| `apps/backstage/src/features/notifications/components/notifications-page.tsx` | Modify | `ComposeForm` audience via `assignableRoles` |
| `apps/backstage/src/features/notifications/components/notifications-page.test.tsx` | Modify | Mock becomes mutable; deactivated role absent from the audience `<Select>` |
| `apps/backstage/src/features/permissions/lib/role-overview.ts` | Modify | `RoleOverviewRow.active`; inactive rows keep their STORED permissions |
| `apps/backstage/src/features/permissions/lib/role-overview.test.ts` | Modify | Row-level lifecycle tests |
| `apps/backstage/src/features/permissions/components/roles-panel.tsx` | Modify | Inactive row copy, "Miembros activos" label, degradation states, `Editing` carries the row, "Reactivar rol" + confirmation Dialog |
| `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` | Modify | All of the above |
| `apps/backstage/src/features/permissions/components/role-editor.tsx` | Modify | `canDelete` relaxed; "Desactivar rol"; holder count |
| `apps/backstage/src/features/permissions/components/role-editor.test.tsx` | Modify | Relaxed-gate + Member-bar + copy tests |
| `apps/backstage/src/features/positions/components/permisos-page.tsx` | Modify | `RolesPanel` renders off the `roles` query alone; positions/members degrade per-section |
| `apps/backstage/src/features/positions/components/permisos-page.test.tsx` | Modify | Replaces the union-gating suite |
| `apps/backstage/src/features/permissions/repositories/role-repository.ts` | Modify | `getAll()` unfiltered; `reactivate(id)` |
| `apps/backstage/src/features/permissions/repositories/role-repository.test.ts` | Create | Mocked-SDK tests: no `where`, reactivate writes both fields |
| `apps/backstage/src/features/permissions/hooks/use-save-role.ts` | Modify | `useReactivateRole()` |
| `docs/specs/role-lifecycle.md` | Modify | Status line |
| `docs/data-models.md` | Modify | `roles` lifecycle semantics (the collection has no schema section today — the rules-summary row + a new callout) |

---

### Task 1: Beacon three-way perms resolution

**Files:**
- Test: `apps/beacon/src/claims-sync/resolve-member-perms.test.ts` (modify lines 22-24 fixture; add 3 cases)
- Modify: `apps/beacon/src/claims-sync/resolve-member-perms.ts` (lines 6-14 interface, 25-36 body)
- Modify: `apps/beacon/src/claims-sync/firestore-deps.ts` (lines 64-73)

- [ ] **Step 1: Write the failing test**

In `apps/beacon/src/claims-sync/resolve-member-perms.test.ts`, add `BUILT_IN_ROLE_PERMS` to the imports and change the existing "prefers the live built-in role doc" fixture to carry `active`, then append the new cases:

```ts
import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { resolveMemberPerms, type RolePermsDeps } from "./resolve-member-perms.js";
```

```ts
  it("prefers the live built-in role doc over the seed snapshot", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["read:Member"], builtInKey: "Treasury", active: true },
        ],
      }),
      ["Treasury"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual(["read:Member"]);
  });

  it("BLOCKING: an inactive built-in doc contributes nothing AND suppresses the seed fallback", async () => {
    // The whole reason firestore.rules used to deny deactivating a built-in: a missing doc
    // and an inactive doc were indistinguishable, so dropping the inactive doc from the
    // query made the key UNCOVERED and re-minted BUILT_IN_ROLE_PERMS. Perms deliberately
    // non-empty so a resolver that ignores `active` fails loudly instead of coincidentally
    // returning [].
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["manage:all"], builtInKey: "Treasury", active: false },
        ],
      }),
      ["Treasury"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([]);
  });

  it("an inactive doc for one key does not suppress another key's seed fallback", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["manage:all"], builtInKey: "Treasury", active: false },
        ],
      }),
      ["Treasury", "Membership"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Membership].sort());
  });

  it("mixes an active doc, an inactive doc and an unseeded key in one resolution", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["read:Position"], builtInKey: "Membership", active: true },
          { permissions: ["manage:all"], builtInKey: "Treasury", active: false },
        ],
      }),
      ["Membership", "Treasury", "Secretary"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([...new Set(["read:Position", ...BUILT_IN_ROLE_PERMS.Secretary])].sort());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/resolve-member-perms.test.ts`

Expected: FAIL — the BLOCKING case reports `expected [] to deeply equal [ 'manage:all' ]`, and the one-key case reports `expected [ 'manage:Member', 'manage:all', 'read:MemberPoints', 'read:Position' ] to deeply equal [ 'manage:Member', 'read:MemberPoints', 'read:Position' ]`.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/beacon/src/claims-sync/resolve-member-perms.ts` in full:

```ts
import type { Role } from "@luminova/auth/roles";
import { resolveEffectivePerms } from "@luminova/auth/perms";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode, RoleDefinition } from "@luminova/types";

export interface RolePermsDeps {
  /** EVERY built-in role doc matching these keys by builtInKey — active AND inactive.
   *  Returning the inactive ones is load-bearing: they contribute no perms but they do
   *  COVER their key, which is the only thing that tells "deactivated" apart from
   *  "never seeded". Filter them out here and a deactivation silently restores the
   *  seed snapshot through the fallback below. */
  getRoleDocsByBuiltInKeys(
    keys: Role[],
  ): Promise<Pick<RoleDefinition, "permissions" | "builtInKey" | "active">[]>;
  /** Custom role docs by id — ACTIVE only. There is no fallback on this path, so
   *  dropping an inactive doc already yields zero perms. */
  getRolesByIds(ids: string[]): Promise<Pick<RoleDefinition, "permissions">[]>;
}

/** Resolve a member's effective coarse perms from every source: the live perms of
 *  the built-in roles they hold (via positions), their directly-assigned custom
 *  roles, and their per-member overrides.
 *
 *  Three-way per built-in key:
 *    - doc ABSENT             → BUILT_IN_ROLE_PERMS[key] (the pre-seed window must
 *                               still mint perms on a fresh project)
 *    - doc present, active    → the doc's live `permissions`
 *    - doc present, inactive  → nothing, and the key stays COVERED
 *
 *  Two production callers inherit this: claims-sync/sync.ts (the onMemberWritten /
 *  onRoleWritten trigger) and set-user-roles.ts (the setUserRoles admin callable). */
export async function resolveMemberPerms(
  deps: RolePermsDeps,
  builtInRoleNames: Role[],
  roleIds: string[],
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] },
): Promise<PermissionCode[]> {
  const builtInDocs = builtInRoleNames.length
    ? await deps.getRoleDocsByBuiltInKeys(builtInRoleNames)
    : [];
  const covered = new Set(builtInDocs.map((doc) => doc.builtInKey));
  const fallback = builtInRoleNames
    .filter((role) => !covered.has(role))
    .map((role) => ({ permissions: BUILT_IN_ROLE_PERMS[role] }));
  const customDocs = roleIds.length ? await deps.getRolesByIds(roleIds) : [];
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs.filter((doc) => doc.active), ...fallback, ...customDocs],
    overrides,
  });
}
```

In `apps/beacon/src/claims-sync/firestore-deps.ts`, replace the body of `getRoleDocsByBuiltInKeys` (lines 64-73). `isActiveRoleDoc` stays imported — `getRolesByIds` below still uses it.

```ts
    getRoleDocsByBuiltInKeys: async (keys) => {
      if (keys.length === 0) return [];
      // `in` supports ≤30 values; ROLES has 9. `builtIn === true` is defense in
      // depth against an impostor custom role spoofing a builtInKey (rules also
      // forbid clients setting builtInKey, but the trust boundary is the trigger).
      // NO active filter: an inactive doc must still reach resolveMemberPerms so it
      // COVERS its key. Filtering here made a deactivated built-in indistinguishable
      // from an unseeded one, which restored its seed perms.
      const snap = await db.collection("roles").where("builtInKey", "in", keys).get();
      return snap.docs
        .filter((d) => d.get("builtIn") === true)
        .map((d) => ({
          permissions: permsFromRoleDoc(d.data()),
          builtInKey: d.get("builtInKey") as Role,
          active: isActiveRoleDoc(d.data()),
        }));
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/resolve-member-perms.test.ts src/claims-sync/sync.test.ts` then `pnpm --filter beacon exec tsc --noEmit`

Expected: PASS (both suites; `sync.test.ts` already stubs with full `RoleDefinition` objects, which carry `active`, so it needs no edit) and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/claims-sync/resolve-member-perms.ts \
        apps/beacon/src/claims-sync/resolve-member-perms.test.ts \
        apps/beacon/src/claims-sync/firestore-deps.ts
git commit -m "fix(beacon): three-way built-in role resolution so inactive != missing

An inactive built-in doc now COVERS its key and contributes nothing, instead of
being filtered out of the query and re-minting BUILT_IN_ROLE_PERMS through the
seed fallback. This is the prerequisite for permitting deactivation in the rules."
```

---

### Task 2: Emulator regression over the deps both `resolveMemberPerms` callers share

**Files:**
- Create: `apps/beacon/src/claims-sync/role-docs.emulator.test.ts`

**Why this shape.** `setUserRoles` (`apps/beacon/src/set-user-roles.ts:59-64`) is a `requireAdmin` gate plus `resolveMemberPerms(firestoreClaimsDeps(getFirestore(), auth), …)` plus `auth.setCustomUserClaims`. Its own `.run()` cannot be exercised in this repo: `pnpm test:emulator` boots `firebase emulators:exec --only firestore`, so `FIREBASE_AUTH_EMULATOR_HOST` is unset and `setCustomUserClaims` would target **production Auth**. So the regression pins the two units the callable is a wrapper over, against the real Firestore.

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { clearCollections, initEmulatorTestApp } from "../award-points/emulator-harness.js";
import { seedBuiltInRoles } from "../seed-roles.js";
import { firestoreClaimsDeps } from "./firestore-deps.js";
import { resolveMemberPerms } from "./resolve-member-perms.js";

// The REAL deps against the REAL emulator. Both production callers of
// resolveMemberPerms route through exactly this pair:
//   - claims-sync/sync.ts:94        (onMemberWritten / onRoleWritten)
//   - set-user-roles.ts:59-64       (the setUserRoles admin callable)
// The callable itself is not invoked here on purpose: `pnpm test:emulator` runs
// `emulators:exec --only firestore`, so FIREBASE_AUTH_EMULATOR_HOST is unset and
// its setCustomUserClaims call would hit production Auth.

const { app, db } = initEmulatorTestApp();

/** Cast, not a fabricated Auth: getRoleDocsByBuiltInKeys and getRolesByIds are pure
 *  Firestore reads and never touch the auth handle. A stub with fake methods would
 *  imply this suite exercises the Auth lane, which it must not. */
const deps = () => firestoreClaimsDeps(db, {} as Auth);

const NO_OVERRIDES = { grant: [], revoke: [] } as const;
const DELETED_AT = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  await clearCollections(db, ["roles"]);
  await seedBuiltInRoles(db);
});
afterAll(async () => {
  await deleteApp(app);
});

describe("built-in role doc lifecycle → resolved perms (emulator)", () => {
  it("a seeded active built-in doc mints its stored perms", async () => {
    await db.doc("roles/Treasury").update({ permissions: ["read:Member"] });
    expect(await resolveMemberPerms(deps(), ["Treasury"], [], NO_OVERRIDES)).toEqual([
      "read:Member",
    ]);
  });

  it("BLOCKING: a deactivated built-in doc mints nothing and does NOT restore the seed snapshot", async () => {
    await db.doc("roles/Treasury").update({ active: false, deletedAt: DELETED_AT });
    const out = await resolveMemberPerms(deps(), ["Treasury"], [], NO_OVERRIDES);
    expect(out).toEqual([]);
    expect(out).not.toEqual(BUILT_IN_ROLE_PERMS.Treasury);
  });

  it("an ABSENT built-in doc still falls back to the seed snapshot (pre-seed window)", async () => {
    await db.doc("roles/Treasury").delete();
    expect(await resolveMemberPerms(deps(), ["Treasury"], [], NO_OVERRIDES)).toEqual(
      [...BUILT_IN_ROLE_PERMS.Treasury].sort(),
    );
  });

  it("a deactivated built-in referenced by DOC ID in roleIds also contributes nothing", async () => {
    // getRolesByIds keeps its active filter; a built-in doc id in members.roleIds
    // resolves through that path, so the two paths agree.
    await db.doc("roles/Treasury").update({ active: false, deletedAt: DELETED_AT });
    expect(await resolveMemberPerms(deps(), [], ["Treasury"], NO_OVERRIDES)).toEqual([]);
  });

  it("an active:true + deletedAt-set ghost mints nothing but still covers its key", async () => {
    // isActiveRoleDoc reads BOTH fields; firestore.rules now bars authoring this
    // shape, but a console write can still produce it.
    await db.doc("roles/Treasury").update({ active: true, deletedAt: DELETED_AT });
    expect(await resolveMemberPerms(deps(), ["Treasury"], [], NO_OVERRIDES)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `git stash push apps/beacon/src/claims-sync/resolve-member-perms.ts apps/beacon/src/claims-sync/firestore-deps.ts && pnpm --filter beacon run test:emulator; git stash pop`

Expected: FAIL on the BLOCKING case with `expected [ 'read:Member', 'read:MemberPoints' ] to deeply equal []` (pre-Task-1 code restores the seed snapshot). If you'd rather not stash, skip to Step 4 and treat this as a characterization test for Task 1 — but then say so in the commit body.

- [ ] **Step 3: Write minimal implementation**

None. Task 1 is the implementation; this task only adds its integration-level guard.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon run test:emulator`

Expected: PASS (all emulator suites; `test:emulator` runs the whole `*.emulator.test.ts` set behind the machine-wide emulator lock and cannot be narrowed to one file).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/claims-sync/role-docs.emulator.test.ts
git commit -m "test(beacon): pin the three-way against the real deps both callers share

Covers the setUserRoles path (set-user-roles.ts:59-64), not just the trigger.
The callable itself is unreachable in test: test:emulator boots firestore only,
so its setCustomUserClaims would target production Auth."
```

---

### Task 3: `roleClaimsChanged` compares `builtIn` before the both-inactive short-circuit

**Files:**
- Test: `apps/beacon/src/claims-sync/role-change.test.ts` (append)
- Modify: `apps/beacon/src/claims-sync/role-change.ts` (lines 31-44)

**Note on the spec.** `docs/specs/role-lifecycle.md:99` says to move `builtIn` *and* `builtInKey` above the short-circuit. `builtInKey` is **already** first (`role-change.ts:31`). Only the `builtIn` compare (`:42`) moves.

- [ ] **Step 1: Write the failing test**

```ts
  it("BLOCKING: is true when builtIn flips on an ALREADY-INACTIVE role", () => {
    // Post-three-way, `builtIn` decides coverage, not just contribution:
    // inactive + builtIn:true is COVERED and mints nothing, while
    // inactive + builtIn:false is UNCOVERED and re-mints BUILT_IN_ROLE_PERMS[key]
    // through the seed fallback. So this flip changes every holder's perms and must
    // fan out. Client-unreachable (roleIdentityUnchanged pins builtIn) — console /
    // admin-SDK only — but it is exactly the invariant the deleted rule protected.
    const before = { permissions: ["read:Member"], builtInKey: "Treasury", builtIn: true, active: false };
    const after = { permissions: ["read:Member"], builtInKey: "Treasury", builtIn: false, active: false };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is true when builtIn flips on an already-inactive role in the restoring direction too", () => {
    const before = { permissions: ["read:Member"], builtInKey: "Treasury", builtIn: false, active: false };
    const after = { permissions: ["read:Member"], builtInKey: "Treasury", builtIn: true, active: false };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/role-change.test.ts`

Expected: FAIL — both new cases report `expected false to be true` (the `!beforeActive` short-circuit at line 38 returns before the `builtIn` compare at line 42).

- [ ] **Step 3: Write minimal implementation**

Replace lines 29-44 of `apps/beacon/src/claims-sync/role-change.ts` (the function body after the `if (!before || !after) return true;` guard):

```ts
  if (!before || !after) return true;

  if (builtInKeyFromRoleDoc(before) !== builtInKeyFromRoleDoc(after)) return true;

  // BEFORE the both-inactive short-circuit, not after. Post-three-way, `builtIn`
  // decides COVERAGE, not just contribution: an inactive doc with builtIn:true
  // covers its key and mints nothing, while the same doc with builtIn:false is
  // uncovered and re-mints BUILT_IN_ROLE_PERMS[key] through the seed fallback in
  // resolveMemberPerms. A flip on an inactive doc therefore changes every holder's
  // perms, and skipping the fan-out would strand them.
  if ((before.builtIn === true) !== (after.builtIn === true)) return true;

  const beforeActive = isActiveRoleDoc(before);
  const afterActive = isActiveRoleDoc(after);
  if (beforeActive !== afterActive) return true;

  // Both inactive → contributes nothing regardless of its perms. (builtIn is
  // already handled above; perms genuinely do not matter while inactive.)
  if (!beforeActive) return false;

  return !permsEqual(permsFromRoleDoc(before), permsFromRoleDoc(after));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/role-change.test.ts`

Expected: PASS — including the pre-existing `"is false when an already-inactive role's perms change"` case (both sides carry no `builtIn` key, so `(undefined === true) !== (undefined === true)` is `false` and the short-circuit is still reached).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/claims-sync/role-change.ts apps/beacon/src/claims-sync/role-change.test.ts
git commit -m "fix(beacon): compare builtIn before the both-inactive short-circuit

The three-way makes builtIn decide coverage, so a flip on an inactive doc changes
every holder's perms. builtInKey was already compared first; only builtIn moved."
```

---

### Task 4: `reseedBuiltInRolePerms` and `seedBuiltInRoles` do not resurrect a deactivated role

**Files:**
- Test: `apps/beacon/src/reseed-role-perms.emulator.test.ts` (append one case)
- Create: `apps/beacon/src/seed-roles.emulator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe("reseedBuiltInRolePerms (emulator) — the callable wrapper")` block in `apps/beacon/src/reseed-role-perms.emulator.test.ts`:

```ts
  it("BLOCKING: does not resurrect a deactivated built-in role", async () => {
    // Deploy-note guard: an operator re-running the reseed after a deactivation must
    // not silently bring the role back with the seed snapshot's perms. The planner
    // already skips `inactive` (recompute-claims.ts:134-137); this pins the callable
    // end-to-end, on disk.
    await db.doc("roles/Treasury").update({
      permissions: ["read:Member"],
      active: false,
      deletedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const result = await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(result.skipped).toContainEqual({ id: "Treasury", reason: "inactive" });
    const after = await db.doc("roles/Treasury").get();
    expect(after.get("active")).toBe(false);
    expect(after.get("deletedAt")).not.toBeNull();
    expect(after.get("permissions")).toEqual(["read:Member"]);
  });
```

Create `apps/beacon/src/seed-roles.emulator.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { clearCollections, initEmulatorTestApp } from "./award-points/emulator-harness.js";
import { seedBuiltInRoles } from "./seed-roles.js";

// buildBuiltInRoleDocs is covered purely by seed-roles.test.ts. THIS suite exercises
// the create()-only write path against the real emulator — specifically that it never
// clobbers or resurrects an existing doc.

const { app, db } = initEmulatorTestApp();
const DELETED_AT = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  await clearCollections(db, ["roles"]);
});
afterAll(async () => {
  await deleteApp(app);
});

describe("seedBuiltInRoles (emulator)", () => {
  it("creates one doc per ROLES key on a fresh project", async () => {
    const created = await seedBuiltInRoles(db);
    expect(created.sort()).toEqual([...ROLES].sort());
  });

  it("BLOCKING: does not resurrect a deactivated built-in role", async () => {
    await seedBuiltInRoles(db);
    await db.doc("roles/Treasury").update({
      permissions: ["read:Member"],
      active: false,
      deletedAt: DELETED_AT,
    });

    const created = await seedBuiltInRoles(db);

    expect(created).toEqual([]);
    const after = await db.doc("roles/Treasury").get();
    expect(after.get("active")).toBe(false);
    expect(after.get("deletedAt")).not.toBeNull();
    // Not the snapshot: create() swallowing ALREADY_EXISTS is what keeps the
    // operator's edits — and the deactivation — intact.
    expect(after.get("permissions")).toEqual(["read:Member"]);
    expect(after.get("permissions")).not.toEqual(BUILT_IN_ROLE_PERMS.Treasury);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon run test:emulator`

Expected: PASS. **These are characterization tests, deliberately green on first run** — `planRolePermReseed` already skips inactive (`recompute-claims.ts:134-137`) and `seedBuiltInRoles` is `create()`-only (`seed-roles.ts:46-49`). Their job is to make the deploy note in `docs/specs/role-lifecycle.md:279-281` executable, so a future "reseed should heal every doc" change goes red. Non-vacuity is proven by the `.not.toEqual(BUILT_IN_ROLE_PERMS.Treasury)` and `skipped` assertions: they fail the moment either function starts writing.

- [ ] **Step 3: Write minimal implementation**

None — characterization only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon run test:emulator`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/reseed-role-perms.emulator.test.ts apps/beacon/src/seed-roles.emulator.test.ts
git commit -m "test(beacon): pin that reseed + seed never resurrect a deactivated role

Characterization: both already behave (planner skips inactive; seed is create-only).
Makes the role-lifecycle deploy note executable."
```

---

### Task 5: Rules — `roleLifecycleSafe()`, unblock deactivation, bar `Member`

**Files:**
- Modify: `firestore.rules` (add helper after line 370; rewrite the update arm at lines 384-392)
- Test: `tests/firestore-rules/rules.test.ts` (add fixtures after line 124; **replace** lines 2293-2297)

**This is one commit on purpose.** The commit that permits built-in deactivation must also bar `Member` — otherwise it ships a window in which an Admin can strip `read:Member`, `read:MemberPoints`, `read:Activity`, `read:Program`, `read:Project` from every provisioned user in the chapter via an unbounded no-retry members scan (`apps/beacon/src/index.ts:298-311`).

- [ ] **Step 1: Write the failing test**

(a) Add fixtures to the `env.withSecurityRulesDisabled` block in `beforeAll`, after the `roles/custom_existing` doc (line 124):

```ts
    // Lifecycle fixtures. Deliberately NOT roles/Treasury — the roles describe block
    // mutates that doc, and a lifecycle test sharing it would couple to test order.
    await setDoc(doc(db, "roles/Membership"), {
      name: "Membresía",
      description: "",
      builtIn: true,
      builtInKey: "Membership",
      permissions: ["manage:Member"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/Member"), {
      name: "Miembro",
      description: "",
      builtIn: true,
      builtInKey: "Member",
      permissions: ["read:Member"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/inactive_builtin"), {
      name: "Secretaría",
      description: "",
      builtIn: true,
      builtInKey: "Secretary",
      permissions: ["manage:Notification"],
      locked: false,
      active: false,
      deletedAt: DELETED_AT,
    });
    // Deny-probe target for the malformed-lifecycle writes below. Every test that uses
    // it is an assertFails, so its state never changes and it can serve all of them.
    await setDoc(doc(db, "roles/ghost_probe"), {
      name: "Sonda",
      description: "",
      builtIn: false,
      builtInKey: null,
      permissions: ["read:Position"],
      locked: false,
      active: true,
      deletedAt: null,
    });
```

(b) In `describe("firestore.rules — roles collection")`, **replace** lines 2293-2297 with:

```ts
  // REPLACES "denies deactivating a built-in role (would restore seed perms via the
  // trigger)". That test stood in for the invariant "an inactive built-in must not
  // restore its seed perms", which now lives in the beacon three-way
  // (apps/beacon/src/claims-sync/resolve-member-perms.test.ts + role-docs.emulator.test.ts).
  // Both halves need a test or the guard evaporates: there, that inactive means zero
  // perms; here, that deactivation is permitted at all.
  it("allows Admin to deactivate a non-locked built-in role", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Membership"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("allows Admin to reactivate a deactivated built-in role", async () => {
    // softDeleteSafe() hard-blocks active:false -> true, which is why the roles lane
    // uses roleLifecycleSafe() instead. softDeleteSafe itself must not change: four
    // other collections depend on its one-way semantics and member resurrection is
    // pinned denied at rules.test.ts:1038.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/inactive_builtin"), {
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("BLOCKING: denies deactivating the Member role", async () => {
    // computeMemberRoles injects "Member" into every claim unconditionally
    // (compute-roles.ts:9), so this strips five reads from the whole chapter and the
    // restore is a second unbounded members scan. An admin who wants that outcome
    // empties its `permissions` instead. `locked` protects roles/Admin only.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Member"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies deactivating the locked Admin role", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies deleteField('active') — a ghost role, invisible in the UI but live in the pipeline", async () => {
    // roleDefinitionDocSchema requires active: z.boolean(), so parseDocs drops the doc
    // and /permisos cannot show or restore it; beacon's isActiveRoleDoc reads
    // `active !== false`, so it keeps minting perms forever.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { active: deleteField() }),
    );
  });
  it("BLOCKING: denies a non-bool active", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { active: "false" }),
    );
  });
  it("BLOCKING: denies a string deletedAt — invisible in the UI, dead in the pipeline, no path back", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: "2026-01-01",
      }),
    );
  });
  it("BLOCKING: denies active:true with deletedAt set — assignable everywhere, mints nothing", async () => {
    // Live to getAll()'s where("active","==",true), dead to isActiveRoleDoc, and for a
    // built-in also COVERED, so the seed fallback silently vanishes too.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: true,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("denies a deactivation whose deletedAt is not request.time (audit hygiene)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: Timestamp.fromDate(DELETED_AT),
      }),
    );
  });
  it("denies clearing deletedAt while leaving active false", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: null,
      }),
    );
  });
  it("denies a non-Admin deactivating a role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/custom_existing"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
```

`deleteField`, `serverTimestamp` and `Timestamp` are already imported (`rules.test.ts:14,18,20`); `DELETED_AT` is already defined (`:47`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: FAIL — `allows Admin to deactivate a non-locked built-in role` and `allows Admin to reactivate a deactivated built-in role` both fail with `Expected request to succeed, but it failed`. (The deny cases already pass: `softDeleteSafe()` blocks reactivation and the `builtIn`/`active` clause blocks deactivation.)

- [ ] **Step 3: Write minimal implementation**

In `firestore.rules`, insert after `roleIdentityUnchanged()` (line 370):

```
    // Roles are the ONE collection whose soft-delete is REVERSIBLE: a built-in role
    // must be able to go out of service and come back. softDeleteSafe() is one-way and
    // shared by four other collections (:311, :336 members; :360 positions; :399
    // allies) — it must NOT change; member resurrection is pinned denied at
    // rules.test.ts:1038.
    //
    // Every conjunct is load-bearing, because this repo's two definitions of "inactive"
    // disagree: roleDefinitionDocSchema requires `active: z.boolean()`
    // (role-definition-doc-schema.ts:21), so a malformed doc is dropped by parseDocs and
    // becomes invisible to the UI, while beacon's isActiveRoleDoc reads `active !== false`
    // (role-doc.ts:26), so the same doc stays LIVE and keeps minting perms.
    //   - without ('active' in d): a deleteField('active') write yields a ghost —
    //     invisible in the UI, live in the pipeline, unrestorable;
    //   - without (d.deletedAt is timestamp): a string deletedAt is the inverse —
    //     invisible in the UI, dead in the pipeline, with no path back;
    //   - without the active<->deletedAt coupling: active:true + deletedAt set is live to
    //     getAll()'s where and dead to the pipeline — assignable everywhere, minting
    //     nothing, and for a built-in also COVERED, so the seed fallback vanishes too.
    // deletedAt value forgery has no authorization effect (every consumer tests
    // null-ness only, never ordering); `== request.time` is audit hygiene.
    function roleLifecycleSafe() {
      let d = request.resource.data;
      return ('active' in d) && (d.active is bool) && ('deletedAt' in d)
        && (d.active == true ? d.deletedAt == null
                            : d.deletedAt is timestamp && d.deletedAt == request.time);
    }
```

Then replace the update arm (lines 384-392) with:

```
      // The locked (Admin) role is immutable. Identity fields can't change. A built-in
      // role MAY be deactivated and reactivated — the perms consequence is handled by
      // beacon's three-way resolution (an inactive doc covers its key and contributes
      // nothing), not by a rules ban. `Member` is the one exception: computeMemberRoles
      // injects it into every claim unconditionally (compute-roles.ts:9), so
      // deactivating it collapses nav and route access for the whole chapter. An admin
      // who wants that empties its `permissions` instead — same effect, no lifecycle
      // asymmetry, still visible on /permisos.
      allow update: if hasAnyRole(['Admin'])
        && resource.data.get('locked', false) == false
        && roleIdentityUnchanged()
        && roleLifecycleSafe()
        && (resource.data.get('builtInKey', null) != 'Member'
            || request.resource.data.get('active', true) == true);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: PASS — the whole suite, including the untouched `softDeleteSafe()` cases for members / positions / allies.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): reversible role lifecycle via roleLifecycleSafe()

Drops the builtIn/active deactivation ban (the beacon three-way now makes an
inactive built-in distinguishable from a missing one) and replaces softDeleteSafe()
in the roles lane ONLY. softDeleteSafe is unchanged — four collections rely on its
one-way semantics. Member stays non-deactivatable.

Replaces rules.test.ts's 'denies deactivating a built-in role' rather than deleting
it; the invariant it stood in for now has tests on both halves."
```

---

### Task 6: Rules — the create arm must author a live, non-deleted role

**Files:**
- Modify: `firestore.rules` (lines 380-383)
- Test: `tests/firestore-rules/rules.test.ts` (add to the roles describe block)

- [ ] **Step 1: Write the failing test**

```ts
  it("BLOCKING: denies creating a role that omits `active`", async () => {
    // where("active","==",true) can't match it and roleDefinitionDocSchema rejects it,
    // so /permisos never shows it — yet isActiveRoleDoc calls it ACTIVE and
    // getRolesByIds mints its permissions to any member naming it in roleIds. A live
    // manage:all role invisible on the page whose job is to show exactly that.
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/no_active"), {
        name: "Sin active",
        description: "",
        builtIn: false,
        builtInKey: null,
        permissions: ["manage:all"],
        locked: false,
        deletedAt: null,
      }),
    );
  });
  it("BLOCKING: denies creating a role that omits deletedAt", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/no_deleted_at"), {
        name: "Sin deletedAt",
        description: "",
        builtIn: false,
        builtInKey: null,
        permissions: ["read:Position"],
        locked: false,
        active: true,
      }),
    );
  });
  it("denies creating an already-deactivated role", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/born_dead"), {
        ...ROLE_DOC,
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("denies creating a role with active:true and deletedAt set", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/born_ghost"), {
        ...ROLE_DOC,
        deletedAt: serverTimestamp(),
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: FAIL — all four report `Expected request to fail, but it succeeded` (the create arm at `firestore.rules:380-383` checks only `builtIn`, `builtInKey` and `locked`).

- [ ] **Step 3: Write minimal implementation**

Replace `firestore.rules` lines 380-383:

```
      allow create: if hasAnyRole(['Admin'])
        && request.resource.data.builtIn == false
        && request.resource.data.builtInKey == null
        && request.resource.data.get('locked', false) == false
        // Close the same INACTIVE-vs-MISSING ambiguity on create. `.get(…, false)` and an
        // explicit key check, not a bare read: a create OMITTING the field must deny
        // cleanly, and `.get('deletedAt', null) == null` would let an omission through.
        && request.resource.data.get('active', false) == true
        && ('deletedAt' in request.resource.data)
        && request.resource.data.deletedAt == null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: PASS — including the pre-existing `allows Admin to create a custom role`, whose `ROLE_DOC` already carries `active: true, deletedAt: null`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "fix(rules): require active:true + deletedAt:null on role create

An addDoc omitting active produced a doc that where('active','==',true) can't match
and roleDefinitionDocSchema rejects, yet isActiveRoleDoc calls active and
getRolesByIds mints its permissions — a live role invisible on /permisos."
```

---

### Task 7: Rules characterization — the built-in NAME write, and the Scanner conjunct surviving deactivation

**Files:**
- Test: `tests/firestore-rules/rules.test.ts` (fixture + roles describe + checkIns describe)

**This task is characterization, not red-green.** Both behaviors already hold; neither has a test. `docs/specs/role-lifecycle.md:17-20` names the rename gap explicitly ("no test pins a built-in `name` write as allowed — so PR 1's headline behavior is unguarded"), and `:241-243` names the Scanner residual. Each new allow-case ships with its deny twin so the pin is bidirectional and cannot pass vacuously.

- [ ] **Step 1: Write the failing test**

(a) Add a deactivated Scanner fixture to `beforeAll`, after the other role docs:

```ts
    // Deactivated on purpose: the checkIns Scanner conjunct is NAME-keyed
    // (!hasAnyRole(['Scanner'])) and reads no role doc, so the tests below prove the
    // restriction survives the doc going out of service. Restrictive, so surviving is
    // the safe direction — a deactivation must never widen anyone's authority.
    await setDoc(doc(db, "roles/Scanner"), {
      name: "Escáner",
      description: "",
      builtIn: true,
      builtInKey: "Scanner",
      permissions: ["read:Activity", "checkIn:Attendance"],
      locked: false,
      active: false,
      deletedAt: DELETED_AT,
    });
```

(b) In `describe("firestore.rules — roles collection")`:

```ts
  it("allows Admin to rename a non-locked built-in role", async () => {
    // PR 1's headline behavior, previously unguarded: the rules suite only covered
    // `permissions` (rules.test.ts:2267-2272). RoleRepository.update writes
    // name/description/permissions, so the name lane needs its own pin.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Treasury"), {
        name: "Finanzas",
        description: "Renombrado por el Admin.",
      }),
    );
  });
  it("BLOCKING: denies renaming the locked Admin role (the rename allow is not blanket)", async () => {
    // Non-vacuity twin for the case above: if the rename allow ever became
    // unconditional, this goes red.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), { name: "Superusuario" }),
    );
  });
  it("denies a non-Admin renaming a built-in role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/Treasury"), { name: "Caja" }),
    );
  });
```

(c) Append to `describe("firestore.rules — checkIns")`:

```ts
  it("BLOCKING: the Scanner Attendee conjunct survives a Scanner-role deactivation (create arm)", async () => {
    // Residual documented in docs/specs/role-lifecycle.md: computeMemberRoles is pure
    // over {trustedGrants, hadScanner} and reads NO role doc, so the `roles` claim keeps
    // the Scanner name after roles/Scanner is deactivated. firestore.rules:507 is
    // name-keyed and RESTRICTIVE, so surviving is the safe direction. The rejected
    // alternative — dropping names whose doc is inactive — would let a member holding
    // Scanner + ActivityManager keep checkIn:Attendance while shedding the Scanner name,
    // lifting the Attendee restriction. A deactivation must never widen authority.
    await assertFails(
      setDoc(doc(as("s_dead", ["Scanner"]), "checkIns/c_scan_dead_dir"), {
        memberId: "m1",
        activityId: "a1",
        role: "Director",
      }),
    );
  });
  it("a Scanner can still create an Attendee row while roles/Scanner is deactivated", async () => {
    // Non-vacuity twin: proves the deny above is the Attendee conjunct biting, not the
    // whole Scanner lane collapsing.
    await assertSucceeds(
      setDoc(doc(as("s_dead", ["Scanner"]), "checkIns/c_scan_dead_att"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("BLOCKING: the Scanner Attendee conjunct survives a Scanner-role deactivation (delete arm)", async () => {
    // firestore.rules:516 — the delete-side mirror. delete carries no request.resource,
    // so the conjunct reads resource.data.role.
    await assertFails(deleteDoc(doc(as("s_dead", ["Scanner"]), "checkIns/c_del_director")));
  });
  it("a Scanner can still delete an in-window Attendee row while roles/Scanner is deactivated", async () => {
    await assertSucceeds(deleteDoc(doc(as("s_dead", ["Scanner"]), "checkIns/c_scan_dead_att")));
  });
```

The last case deletes the doc created two cases earlier. Vitest runs `it` blocks in declaration order within a file, so keep them in this order; the delete-arm deny above it targets the pre-existing `checkIns/c_del_director` fixture (an `assertFails`, so it survives).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: **PASS.** Characterization, by design — see the note above. If any of these fails, stop: `firestore.rules` is not in the state Tasks 5-6 left it in.

- [ ] **Step 3: Write minimal implementation**

None.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/firestore-rules-tests run test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/firestore-rules/rules.test.ts
git commit -m "test(rules): pin the built-in rename allow and the Scanner residual

Characterization, each with its deny twin. The rename lane shipped in PR 1 with no
test (the suite only covered permissions). The Scanner Attendee conjunct on BOTH
checkIns arms is name-keyed and must survive a Scanner-role deactivation."
```

---

### Task 8: `apps/backstage/src/lib/role-lifecycle.ts` — the one assignment filter

**Files:**
- Create: `apps/backstage/src/lib/role-lifecycle.test.ts`
- Create: `apps/backstage/src/lib/role-lifecycle.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { RoleDefinition } from "@luminova/types";
import { assignableRoles, isLiveRole } from "./role-lifecycle";

const role = (over: Partial<RoleDefinition>): RoleDefinition => ({
  id: "r",
  name: "Rol",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
  ...over,
});

// Structural stand-in for a firebase Timestamp: isLiveRole only tests null-ness, and
// importing the real class would drag the firestore SDK into a pure unit test.
const DELETED_AT = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];

describe("isLiveRole", () => {
  it("is true only for active + never-deleted", () => {
    expect(isLiveRole(role({}))).toBe(true);
  });

  it("is false when active is false", () => {
    expect(isLiveRole(role({ active: false }))).toBe(false);
  });

  it("is false when deletedAt is set even though active is true", () => {
    // The ghost shape: live to getAll()'s where, dead to beacon's isActiveRoleDoc.
    // Offering it for assignment would promise perms that never arrive.
    expect(isLiveRole(role({ active: true, deletedAt: DELETED_AT }))).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("drops every non-live role and keeps input order", () => {
    const live = role({ id: "a" });
    const dead = role({ id: "b", active: false });
    const ghost = role({ id: "c", deletedAt: DELETED_AT });
    const live2 = role({ id: "d" });
    expect(assignableRoles([live, dead, ghost, live2]).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("returns an empty array for undefined (an unresolved query)", () => {
    expect(assignableRoles(undefined)).toEqual([]);
  });

  it("keeps built-ins — the filter is about lifecycle, not about kind", () => {
    const builtIn = role({ id: "Treasury", builtIn: true, builtInKey: "Treasury" });
    expect(assignableRoles([builtIn]).map((r) => r.id)).toEqual(["Treasury"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/role-lifecycle.test.ts`

Expected: FAIL with `Failed to resolve import "./role-lifecycle" from "src/lib/role-lifecycle.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

`apps/backstage/src/lib/role-lifecycle.ts`:

```ts
import type { RoleDefinition } from "@luminova/types";

/** Client mirror of beacon's `isActiveRoleDoc`
 *  (apps/beacon/src/claims-sync/role-doc.ts:26). BOTH fields matter: `active: true`
 *  with `deletedAt` set is live to `where("active","==",true)` and dead to the perms
 *  pipeline, so a surface that trusted `active` alone would offer a role that mints
 *  nothing. Keep the two in lockstep. */
export function isLiveRole(role: RoleDefinition): boolean {
  return role.active && role.deletedAt === null;
}

/** The ONE filter every ASSIGNMENT surface applies to the role list.
 *
 *  `useRoles()` returns every role doc — unfiltered — so /permisos can show and
 *  restore a deactivated role. That makes each consumer state its own intent, and a
 *  picker that hands out a deactivated role promises perms beacon will never mint.
 *  DISPLAY surfaces deliberately do NOT call this: `roleDisplay`, the sent-history
 *  role names and the cargo grants picker must still resolve a value that is already
 *  stored. The per-surface tests are the actual guard — the type system cannot express
 *  "this list must be filtered". */
export function assignableRoles(roles: readonly RoleDefinition[] | undefined): RoleDefinition[] {
  return (roles ?? []).filter(isLiveRole);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/role-lifecycle.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/role-lifecycle.ts apps/backstage/src/lib/role-lifecycle.test.ts
git commit -m "feat(backstage): assignableRoles — one lifecycle filter for assignment surfaces

Mirrors beacon's isActiveRoleDoc (both active and deletedAt). Lands before
useRoles() widens, so no commit ever offers a deactivated role."
```

---

### Task 9: `MemberRolesPanel` custom-role picker filters through `assignableRoles`

**Files:**
- Test: `apps/backstage/src/features/permissions/components/member-roles-panel.test.tsx` (lines 1-42 setup; add a case)
- Modify: `apps/backstage/src/features/permissions/components/member-roles-panel.tsx` (line 10 imports, lines 62-65)

- [ ] **Step 1: Write the failing test**

Add `userEvent` to the imports and a deactivated fixture, then the case:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Member, RoleDefinition } from "@luminova/types";
```

```ts
const deactivatedRole: RoleDefinition = {
  id: "c_dead",
  name: "Coordinador Retirado",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: ["manage:Ally"],
  locked: false,
  active: false,
  deletedAt: null,
};
```

```ts
  it("BLOCKING: never offers a deactivated custom role for assignment", async () => {
    // useRoles() is now unfiltered so /permisos can restore a deactivated role. The
    // type system cannot express "this list must be filtered", so this test IS the
    // guard: assigning a deactivated role promises perms beacon will never mint
    // (getRolesByIds drops inactive docs).
    rolesData = [customRole, deactivatedRole];
    const user = userEvent.setup();
    render(<MemberRolesPanel member={member} builtInRoleNames={[]} />);

    await user.click(screen.getByRole("button", { name: /sin roles personalizados/i }));

    expect(screen.getByText("Coordinador")).toBeInTheDocument();
    expect(screen.queryByText("Coordinador Retirado")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/member-roles-panel.test.tsx`

Expected: FAIL with `expected null not to be in the document` — the assertion on `queryByText("Coordinador Retirado")` finds the option, because `customRoleOptions` filters only on `!r.builtIn`.

- [ ] **Step 3: Write minimal implementation**

Add the import to `member-roles-panel.tsx` (after line 10):

```ts
import { assignableRoles } from "../../../lib/role-lifecycle";
```

Replace lines 62-65:

```ts
  const customRoleOptions = useMemo(
    () =>
      assignableRoles(roles)
        .filter((r) => !r.builtIn)
        .map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/member-roles-panel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/components/member-roles-panel.tsx \
        apps/backstage/src/features/permissions/components/member-roles-panel.test.tsx
git commit -m "fix(backstage): filter the member custom-role picker through assignableRoles"
```

---

### Task 10: Notifications `ComposeForm` audience filters through `assignableRoles`

**Files:**
- Test: `apps/backstage/src/features/notifications/components/notifications-page.test.tsx` (lines 20-22 mock; add a case)
- Modify: `apps/backstage/src/features/notifications/components/notifications-page.tsx` (line 33 imports, lines 88-89, line 150 JSX)

- [ ] **Step 1: Write the failing test**

Replace the `use-roles` mock (lines 20-22) with a mutable one, and add the case:

```ts
import type { RoleDefinition } from "@luminova/types";

const rolesState = vi.hoisted(() => ({ data: [] as RoleDefinition[] }));
vi.mock("../../permissions/hooks/use-roles", () => ({
  useRoles: () => ({ data: rolesState.data, isLoading: false }),
}));
```

```ts
const role = (over: Partial<RoleDefinition>): RoleDefinition => ({
  id: "r",
  name: "Rol",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
  ...over,
});

describe("NotificationsPage — audience options", () => {
  it("BLOCKING: never offers a deactivated role as a notification audience", () => {
    // ComposeForm is an ASSIGNMENT surface: picking `role:<id>` targets whoever holds
    // that role. A deactivated role grants nothing, so composing to it is a message
    // aimed at an audience the admin believes has perms it does not have.
    rolesState.data = [
      role({ id: "c_live", name: "Comunicaciones" }),
      role({ id: "c_dead", name: "Comunicaciones Retirado", active: false }),
    ];
    renderWith(FULL_ACCESS, <NotificationsPage />);

    expect(screen.getByRole("option", { name: "Comunicaciones" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Comunicaciones Retirado" }),
    ).not.toBeInTheDocument();
  });

  it("still resolves a deactivated role's NAME in the sent history (display, not assignment)", () => {
    rolesState.data = [role({ id: "c_dead", name: "Comunicaciones Retirado", active: false })];
    renderWith(FULL_ACCESS, <NotificationsPage />);
    // No throw, and the audience picker simply omits it — SentHistory's byId map is
    // deliberately unfiltered so an already-sent message keeps a readable label.
    expect(screen.getByText(/^Enviadas$/)).toBeInTheDocument();
  });
});
```

Reset the mock between tests by adding to the existing `describe` setup (or a file-level `beforeEach`):

```ts
beforeEach(() => {
  rolesState.data = [];
});
```

(add `beforeEach` to the vitest import).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/notifications/components/notifications-page.test.tsx`

Expected: FAIL with `expected null not to be in the document` on the `Comunicaciones Retirado` option.

- [ ] **Step 3: Write minimal implementation**

Add the import to `notifications-page.tsx` (after line 33):

```ts
import { assignableRoles } from "../../../lib/role-lifecycle";
```

Replace lines 88-89 inside `ComposeForm`:

```ts
  const { data: roles } = useRoles({ enabled: true });
  // Assignment surface: composing to `role:<id>` targets that role's holders, so a
  // deactivated role must not be offered. `NO_ROLES` is no longer needed here —
  // assignableRoles absorbs the undefined case — but SentHistory still uses it.
  const audienceRoles = useMemo(() => assignableRoles(roles), [roles]);
```

and in the `<Select>` (line ~150) replace `activeRoles.map(...)` with `audienceRoles.map(...)`:

```tsx
          {audienceRoles.map((role) => (
            <option key={role.id} value={`role:${role.id}`}>
              {role.name}
            </option>
          ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/notifications/components/notifications-page.test.tsx` then `pnpm --filter backstage exec eslint src/features/notifications`

Expected: PASS and no lint error (`NO_ROLES` is still referenced by `SentHistory` at line 175, so it does not become unused).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/notifications/components/notifications-page.tsx \
        apps/backstage/src/features/notifications/components/notifications-page.test.tsx
git commit -m "fix(backstage): filter the notification audience picker through assignableRoles"
```

---

### Task 11: `roleOptions` labels a deactivated built-in "… (desactivado)" and keeps the option

**Files:**
- Test: `apps/backstage/src/lib/role-display.test.ts` (add to the `roleOptions` describe)
- Modify: `apps/backstage/src/lib/role-display.ts` (line 7 imports, lines 55-69)

- [ ] **Step 1: Write the failing test**

```ts
describe("roleOptions and the role lifecycle", () => {
  it("keeps a deactivated built-in's option and marks it in the label", () => {
    // The option must NOT disappear: MultiSelect renders chips by filtering options
    // against the stored value, so dropping it would hide a grant already live on a
    // cargo. But offering "Proyectos" with no marker while its doc is out of service is
    // the ambiguity an Admin authorizes from — so keep the option, kill the ambiguity.
    const options = roleOptions([doc({ active: false })]);
    expect(options.map((o) => o.value)).toEqual([...ROLES]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe(
      "Proyectos (desactivado)",
    );
  });

  it("marks an active:true + deletedAt-set ghost as deactivated too", () => {
    const deletedAt = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];
    const options = roleOptions([doc({ active: true, deletedAt })]);
    expect(options.find((o) => o.value === "ProjectManager")?.label).toBe(
      "Proyectos (desactivado)",
    );
  });

  it("does not mark a role with no seeded doc (the snapshot fallback is live)", () => {
    // No doc means beacon's BUILT_IN_ROLE_PERMS fallback really is minting perms —
    // calling that "desactivado" would be the opposite of the truth.
    expect(roleOptions([]).find((o) => o.value === "ProjectManager")?.label).toBe("Proyectos");
  });

  it("leaves roleDisplay untouched — the name still resolves for a deactivated doc", () => {
    expect(roleDisplay("ProjectManager", [doc({ active: false })]).label).toBe("Proyectos");
  });
});
```

Ensure `import type { RoleDefinition } from "@luminova/types";` is present in the test file's imports (the `doc()` helper at line 5 already types its parameter as `Partial<RoleDefinition>`, so it is).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.test.ts`

Expected: FAIL with `expected 'Proyectos' to be 'Proyectos (desactivado)'` on the first two cases.

- [ ] **Step 3: Write minimal implementation**

Add the import to `role-display.ts` (after line 7):

```ts
import { isLiveRole } from "./role-lifecycle";
```

Replace lines 55-69:

```ts
/** Options for a role picker, derived from ROLES rather than from the doc list.
 *
 *  This is load-bearing. MultiSelect renders chips by filtering `options` against the
 *  stored value, so an option list built from the docs would silently hide a grant already
 *  stored on a cargo whenever its role doc is missing or inactive — the admin would then be
 *  making authorization decisions from a display that omits a live power grant. Deriving
 *  from ROLES keeps the list total; a missing doc costs a fallback label, never an option.
 *
 *  A DEACTIVATED built-in keeps its option for exactly that reason, but says so in its
 *  label. A role with NO doc is not marked: beacon's BUILT_IN_ROLE_PERMS fallback really
 *  is minting its perms, so "desactivado" would be the opposite of the truth. */
export function roleOptions(
  roleDocs: readonly RoleDefinition[] | undefined,
): { value: Role; label: string }[] {
  return builtInRoles(roleDocs).map(({ key, doc }) => {
    const { label } = displayOf(key, doc);
    return {
      value: key,
      label: doc !== null && !isLiveRole(doc) ? `${label} (desactivado)` : label,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/role-display.test.ts src/features/positions/components/position-form.test.tsx`

Expected: PASS both (the `PositionForm grant options are total` case at `position-form.test.tsx:114-137` passes an `active: true` doc, so its label is unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/role-display.ts apps/backstage/src/lib/role-display.test.ts
git commit -m "feat(backstage): label a deactivated built-in '(desactivado)' in roleOptions

The option stays — dropping it would hide a grant already live on a cargo. Deactivated
built-ins were already offered in the cargo picker with no marker at all."
```

---

### Task 12: `previewEffectivePerms` goes three-way on the built-in path and filters the custom path

**Files:**
- Test: `apps/backstage/src/features/permissions/lib/effective-preview.test.ts` (append)
- Modify: `apps/backstage/src/features/permissions/lib/effective-preview.ts` (lines 1-34)

- [ ] **Step 1: Write the failing test**

```ts
  it("BLOCKING: a deactivated built-in doc contributes nothing and does NOT fall back to the snapshot", () => {
    // Mirror of the beacon three-way. An inactive doc COVERS its key, so reporting
    // BUILT_IN_ROLE_PERMS here would show the admin perms the member will not get.
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [
        role({
          id: "Treasury",
          builtIn: true,
          builtInKey: "Treasury",
          permissions: ["manage:all"],
          active: false,
        }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it("a deactivated built-in does not suppress another key's snapshot fallback", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury", "Secretary"],
      selectedCustomRoleIds: [],
      allRoles: [
        role({
          id: "Treasury",
          builtIn: true,
          builtInKey: "Treasury",
          permissions: ["manage:all"],
          active: false,
        }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Secretary].sort());
  });

  it("BLOCKING: a deactivated CUSTOM role contributes nothing", () => {
    // members.roleIds keeps naming a deactivated custom role — softDelete never scrubs
    // roleIds — and this path had no `active` filter at all, correct only by accident
    // because the hook feeding it used to be active-only.
    const out = previewEffectivePerms({
      builtInRoleNames: [],
      selectedCustomRoleIds: ["c1"],
      allRoles: [role({ id: "c1", permissions: ["manage:Ally"], active: false })],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it("an active:true + deletedAt-set ghost contributes nothing on either path", () => {
    const deletedAt = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];
    expect(
      previewEffectivePerms({
        builtInRoleNames: ["Treasury"],
        selectedCustomRoleIds: ["c1"],
        allRoles: [
          role({
            id: "Treasury",
            builtIn: true,
            builtInKey: "Treasury",
            permissions: ["manage:all"],
            deletedAt,
          }),
          role({ id: "c1", permissions: ["manage:Ally"], deletedAt }),
        ],
        overrides: { grant: [], revoke: [] },
      }),
    ).toEqual([]);
  });
```

Add `BUILT_IN_ROLE_PERMS` — already imported at line 2 — and keep `RoleDefinition` (also already imported).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/lib/effective-preview.test.ts`

Expected: FAIL — the first case reports `expected [ 'manage:all' ] to deeply equal []`, the second `expected [ 'manage:Ally', 'manage:Lead', 'manage:Notification', 'manage:all' ] to deeply equal [ 'manage:Ally', 'manage:Lead', 'manage:Notification' ]`, the third `expected [ 'manage:Ally' ] to deeply equal []`.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backstage/src/features/permissions/lib/effective-preview.ts` in full:

```ts
import { resolveEffectivePerms } from "@luminova/auth/perms";
import {
  BUILT_IN_ROLE_PERMS,
  type PermissionCode,
  type Role,
  type RoleDefinition,
} from "@luminova/types";
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";

/** Client-side mirror of the beacon resolution for the member-assignment preview:
 *  effective perms = built-in roles (held via positions) ∪ selected custom roles ∪
 *  override grants − revokes.
 *
 *  Three-way per built-in key, exactly as resolveMemberPerms does it:
 *    - doc ABSENT            → the BUILT_IN_ROLE_PERMS snapshot (pre-seed window)
 *    - doc present, live     → the doc's permissions
 *    - doc present, inactive → nothing, and the key stays COVERED (so the snapshot
 *                              must NOT come back)
 *
 *  The CUSTOM path filters too. members.roleIds keeps naming a deactivated custom role
 *  (softDelete never scrubs roleIds), and beacon's getRolesByIds drops inactive docs —
 *  a preview that counted them would overstate the member's perms. */
export function previewEffectivePerms(input: {
  builtInRoleNames: Role[];
  selectedCustomRoleIds: string[];
  allRoles: RoleDefinition[];
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const byId = new Map(assignableRoles(input.allRoles).map((r) => [r.id, r]));
  // Keyed off ALL docs, live or not: coverage is what suppresses the snapshot.
  const byBuiltInKey = new Map(
    input.allRoles
      .filter((r) => r.builtIn && r.builtInKey !== null)
      .map((r) => [r.builtInKey as Role, r]),
  );
  const builtInDocs = input.builtInRoleNames.map((name) => {
    const doc = byBuiltInKey.get(name);
    if (doc === undefined) return { permissions: BUILT_IN_ROLE_PERMS[name] };
    return isLiveRole(doc) ? doc : { permissions: [] };
  });
  const customDocs = input.selectedCustomRoleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleDefinition => r !== undefined);
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs, ...customDocs],
    overrides: input.overrides,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/lib/effective-preview.test.ts src/features/permissions/components/member-roles-panel.test.tsx`

Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/lib/effective-preview.ts \
        apps/backstage/src/features/permissions/lib/effective-preview.test.ts
git commit -m "fix(backstage): three-way + active filter in previewEffectivePerms

Mirrors resolveMemberPerms on the built-in path and adds the active filter the
custom path never had (correct only while the hook feeding it was active-only)."
```

---

### Task 13: `MemberRolesPanel` shows a stored `roleId` whose doc is deactivated

**Files:**
- Test: `apps/backstage/src/features/permissions/components/member-roles-panel.test.tsx` (add a case)
- Modify: `apps/backstage/src/features/permissions/components/member-roles-panel.tsx` (lines 1-2 imports; add `inactiveAssigned`; JSX after the roles `MultiSelect`)

- [ ] **Step 1: Write the failing test**

```ts
  it("BLOCKING: surfaces a stored roleId whose doc is deactivated", async () => {
    // The chip vanishes on its own: MultiSelect renders chips by filtering options
    // against the value, and the deactivated role is no longer an option. Without an
    // explicit notice the admin sees a member with no custom roles while roleIds still
    // carries one — and a save would silently re-persist it.
    rolesData = [customRole, deactivatedRole];
    const withDead = { ...member, roleIds: ["c_dead"] } as unknown as Member;
    render(<MemberRolesPanel member={withDead} builtInRoleNames={[]} />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("Coordinador Retirado");
    expect(notice).toHaveTextContent(/desactivado/i);
    // The stored assignment is preserved, not silently dropped.
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(saveMutate).toHaveBeenCalledWith({
        memberId: "m1",
        roleIds: ["c_dead"],
        permissionOverrides: { grant: [], revoke: [] },
      }),
    );
  });

  it("shows no deactivated-role notice when every stored role is live", () => {
    rolesData = [customRole, deactivatedRole];
    const withLive = { ...member, roleIds: ["c1"] } as unknown as Member;
    render(<MemberRolesPanel member={withLive} builtInRoleNames={[]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/member-roles-panel.test.tsx`

Expected: FAIL with `Unable to find an accessible element with the role "alert"`.

- [ ] **Step 3: Write minimal implementation**

Update the imports in `member-roles-panel.tsx`:

```ts
import { Badge, Button, Card, MultiSelect } from "@luminova/ui";
```

(already correct) and extend the lifecycle import:

```ts
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";
```

Add after `customRoleOptions`:

```ts
  // A stored roleId whose doc is deactivated has no chip (it is no longer an option),
  // so without this notice the panel reads as "no custom roles" while roleIds still
  // carries one. Deliberately does NOT drop it from state: the assignment is real and
  // comes back the moment the role is reactivated.
  const inactiveAssigned = useMemo(
    () => (roles ?? []).filter((r) => roleIds.includes(r.id) && !isLiveRole(r)),
    [roles, roleIds],
  );
```

Insert inside the roles `<label>` block, after the `<MultiSelect …/>` (line ~109):

```tsx
        {inactiveAssigned.length > 0 && (
          <span role="alert" className="flex flex-wrap items-center gap-1.5 text-ui-xs text-ink-3">
            {inactiveAssigned.map((r) => (
              <Badge key={r.id} tone="amber">
                {r.name}
              </Badge>
            ))}
            {inactiveAssigned.length === 1
              ? "está desactivado: sigue asignado pero no otorga permisos hasta reactivarlo en /permisos."
              : "están desactivados: siguen asignados pero no otorgan permisos hasta reactivarlos en /permisos."}
          </span>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/member-roles-panel.test.tsx` then `pnpm --filter backstage exec eslint src/features/permissions`

Expected: PASS and clean lint (only token utilities, no raw hex, no raw elements).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/components/member-roles-panel.tsx \
        apps/backstage/src/features/permissions/components/member-roles-panel.test.tsx
git commit -m "feat(backstage): surface a member's deactivated stored role assignments

The chip disappears with the option; the assignment does not. Without the notice the
panel reads as 'no custom roles' while roleIds still carries one."
```

---

### Task 14: `RoleOverviewRow.active` + the `/permisos` inactive row

**Files:**
- Test: `apps/backstage/src/features/permissions/lib/role-overview.test.ts` (append)
- Modify: `apps/backstage/src/features/permissions/lib/role-overview.ts` (lines 9 imports, 12-28 interface, 65-96 builders)
- Modify: `apps/backstage/src/features/permissions/components/roles-panel.tsx` (lines 79-110)
- Test: `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` (fixtures + cases)

Adding a required field to `RoleOverviewRow` breaks the `rowFor`/`unsyncedRow` literals in `roles-panel.test.tsx`, so both files land in this commit.

- [ ] **Step 1: Write the failing test**

In `role-overview.test.ts`:

```ts
describe("buildRoleOverview and the role lifecycle", () => {
  it("BLOCKING: a deactivated role's row keeps its STORED permissions, not []", () => {
    // The update lane still permits editing `permissions` on an inactive doc, and
    // roleClaimsChanged makes that edit silent — so the stored array is real, editable,
    // and is exactly what "Reactivar rol" will mint to every holder at once. Reporting
    // [] would hide it.
    const rows = buildRoleOverview(
      [{ ...builtInDoc, id: "Treasury", builtInKey: "Treasury", locked: false, active: false }],
      [],
      [],
      "2026",
    );
    expect(firstRow(rows).active).toBe(false);
    expect(firstRow(rows).permissions).toEqual(["manage:all"]);
  });

  it("an active:true + deletedAt-set ghost row is reported inactive", () => {
    const deletedAt = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];
    const rows = buildRoleOverview([{ ...customDoc, id: "c1", deletedAt }], [], [], "2026");
    expect(firstRow(rows).active).toBe(false);
  });

  it("an unsynced built-in row is reported ACTIVE — the seed fallback really is minting", () => {
    const rows = buildRoleOverview([], [], [], "2026");
    expect(rows).toHaveLength(ROLES.length);
    for (const row of rows) expect(row.active).toBe(true);
  });

  it("a live role's row is reported active", () => {
    const rows = buildRoleOverview([builtInDoc], [], [], "2026");
    expect(firstRow(rows).active).toBe(true);
  });

  it("still counts holders and granting cargos for a deactivated role", () => {
    // holders routes through effectiveRoles, pure over positions.grants — doc-state
    // independent. The count is the blast radius of a reactivation.
    const rows = buildRoleOverview(
      [{ ...builtInDoc, active: false }],
      [presidente],
      [olivia],
      "2026",
    );
    expect(rowFor(rows, "Admin").holders).toEqual([{ id: "m0", name: "Olivia" }]);
    expect(rowFor(rows, "Admin").grantingCargos).toEqual(["Presidente"]);
  });
});
```

In `roles-panel.test.tsx`, update the two row builders and add cases:

```ts
const unsyncedRow: RoleOverviewRow = {
  role: null,
  id: "ProjectManager",
  builtInKey: "ProjectManager",
  label: "Proyectos",
  description: "Gestionar proyectos.",
  permissions: ["manage:Project"],
  active: true,
  grantingCargos: [],
  holders: [],
};

function rowFor(doc: RoleDefinition, over: Partial<RoleOverviewRow> = {}): RoleOverviewRow {
  return {
    role: doc,
    id: doc.id,
    builtInKey: doc.builtInKey,
    label: doc.name,
    description: doc.description,
    permissions: doc.permissions,
    active: doc.active && doc.deletedAt === null,
    grantingCargos: [],
    holders: [],
    ...over,
  };
}
```

```ts
  it("BLOCKING: a deactivated row shows its STORED perm count plus the reactivation promise", () => {
    const dead = { ...customDoc, active: false, permissions: ["manage:Ally", "read:Position"] };
    render(<RolesPanel rows={[rowFor(dead)]} />);
    expect(screen.getByText("Desactivado")).toBeInTheDocument();
    expect(screen.getByText(/2 permisos · inactivo — se otorgarán al reactivar/)).toBeInTheDocument();
  });

  it("does not badge or annotate an active row", () => {
    render(<RolesPanel rows={[rowFor(customDoc)]} />);
    expect(screen.queryByText("Desactivado")).not.toBeInTheDocument();
    expect(screen.queryByText(/se otorgarán al reactivar/)).not.toBeInTheDocument();
  });

  it("labels the holder list 'Miembros activos' (not the complete blast radius)", () => {
    // useMembers() filters where('active','==',true) while the onRoleWritten fan-out has
    // no active filter (index.ts:298), so soft-deleted members with a surviving Auth user
    // DO receive the perms. The count must not be presented as complete.
    render(<RolesPanel rows={[rowFor(customDoc, { holders: [{ id: "m0", name: "Olivia" }] })]} />);
    expect(screen.getByText("Miembros activos:")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/lib/role-overview.test.ts src/features/permissions/components/roles-panel.test.tsx`

Expected: FAIL — `role-overview.test.ts` reports `expected undefined to be false` on `.active`, and `roles-panel.test.tsx` reports `Unable to find an element with the text: Desactivado` and `... Miembros activos:`.

- [ ] **Step 3: Write minimal implementation**

In `role-overview.ts`, extend the import at line 9:

```ts
import { builtInRoles, roleDisplay } from "../../../lib/role-display";
import { isLiveRole } from "../../../lib/role-lifecycle";
```

Add to the `RoleOverviewRow` interface after `permissions` (line 24):

```ts
  permissions: PermissionCode[];
  /** Whether this role is currently minting perms. False for a doc that is `active:
   *  false` OR carries a `deletedAt` (beacon reads both). TRUE for an unsynced built-in:
   *  with no doc seeded, beacon's BUILT_IN_ROLE_PERMS fallback really is minting.
   *  An inactive row keeps its STORED `permissions` — the update lane still permits
   *  editing them, so the array is real and is exactly what a reactivation will grant. */
  active: boolean;
```

In the `seeded` mapper (lines 65-78), add `active: isLiveRole(role),` after `permissions: role.permissions,`. In the `unsynced` mapper (lines 82-96), add `active: true,` after `permissions: BUILT_IN_ROLE_PERMS[key],`.

In `roles-panel.tsx`, replace the badge/description block (lines 79-93):

```tsx
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-1">{row.label}</span>
                    <Badge tone={row.builtInKey !== null ? "navy" : "teal"}>
                      {row.builtInKey !== null ? "Predefinido" : "Personalizado"}
                    </Badge>
                    {doc?.locked && <Badge tone="gray">Protegido</Badge>}
                    {doc === null && <Badge tone="amber">Sin sincronizar</Badge>}
                    {!row.active && <Badge tone="red">Desactivado</Badge>}
                  </div>
                  {row.description && (
                    <span className="text-ui-sm text-ink-3">{row.description}</span>
                  )}
                  <span className="text-ui-xs text-ink-3">
                    {row.permissions.length} permiso
                    {row.permissions.length === 1 ? "" : "s"}
                    {!row.active && " · inactivo — se otorgarán al reactivar"}
                  </span>
```

and the holders `<dt>` (line 107):

```tsx
                <div className="flex gap-2">
                  {/* "activos", not "los tienen": useMembers() filters active members while
                      the onRoleWritten fan-out (index.ts:298) does not, so a soft-deleted
                      member with a surviving Auth user still receives the perms. This count
                      is not the complete blast radius. */}
                  <dt className="text-ink-3">Miembros activos:</dt>
                  <dd className="text-ink-2">{holdersLabel(row.holders)}</dd>
                </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions src/features/positions/components/permisos-page.test.tsx` then `pnpm --filter backstage exec tsc --noEmit`

Expected: PASS and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/lib/role-overview.ts \
        apps/backstage/src/features/permissions/lib/role-overview.test.ts \
        apps/backstage/src/features/permissions/components/roles-panel.tsx \
        apps/backstage/src/features/permissions/components/roles-panel.test.tsx
git commit -m "feat(backstage): render deactivated roles on /permisos with their stored perms

RoleOverviewRow gains `active`. An inactive row keeps its stored permissions array —
it is editable, silent to the fan-out, and exactly what a reactivation will grant.
Holder list relabelled 'Miembros activos' (the fan-out is wider than the count)."
```

---

### Task 15: `/permisos` stops failing closed on unrelated queries

**Files:**
- Modify: `apps/backstage/src/features/permissions/components/roles-panel.tsx` (props, `originLabel`, `holdersLabel`)
- Modify: `apps/backstage/src/features/positions/components/permisos-page.tsx` (lines 42-90)
- Test: `apps/backstage/src/features/positions/components/permisos-page.test.tsx` (replace lines 74-129)

- [ ] **Step 1: Write the failing test**

Replace `permisos-page.test.tsx` lines 74-129 (the `describe.each(QUERIES)` block and the first two `query states` cases) with:

```ts
// REVERSES the previous union-gating suite (`describe.each(QUERIES)`), which pinned
// positions/members/roles as EACH driving both page branches. That was correct while the
// page's only alternative was rendering "Ningún cargo lo otorga" / "Nadie aún" for a
// failed query — a wrong authorization picture presented as fact. It is wrong now: the
// only affordance that can RESTORE a deactivated role lives in RolesPanel, and gating it
// on an unrelated members read makes a deactivated role permanently unrestorable in the
// UI. The panel now labels each degraded section explicitly instead, so nothing is
// presented as fact that isn't.
describe("PermisosPage — the roles query alone gates the panel", () => {
  it("puts the page in its loading state while roles loads", () => {
    stubs.roles = { ...stubs.idle(), isLoading: true };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(container.querySelectorAll(".animate-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
  });

  it("puts the page in its error state when roles fails", () => {
    stubs.roles = { ...stubs.idle(), isError: true, error: new Error("roles boom") };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });

  it("lets the roles error win over a still-loading roles retry", () => {
    stubs.roles = { ...stubs.idle(), isError: true, isLoading: true, error: new Error("boom") };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });
});

describe.each(["positions", "members"] as const)(
  "PermisosPage — a %s outage degrades one section, never the page",
  (key) => {
    it("still renders the roles panel (the only restore affordance)", () => {
      stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
      renderWith(admin, <PermisosPage />);
      expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
      expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
    });

    it("labels its own section 'No disponible' instead of an empty state", () => {
      stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
      renderWith(admin, <PermisosPage />);
      expect(screen.getAllByText("No disponible").length).toBeGreaterThan(0);
    });

    it("labels its own section 'Cargando…' while it loads", () => {
      stubs[key] = { ...stubs.idle(), isLoading: true };
      renderWith(admin, <PermisosPage />);
      expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
      expect(screen.getAllByText("Cargando…").length).toBeGreaterThan(0);
    });
  },
);

describe("PermisosPage — query states", () => {
  it("BLOCKING: renders the panel even when BOTH side queries fail", () => {
    // The regression this replaces: one bad members read made a deactivated role
    // permanently unrestorable.
    stubs.positions = { ...stubs.idle(), isError: true, error: new Error("boom") };
    stubs.members = { ...stubs.idle(), isError: true, error: new Error("boom") };
    renderWith(admin, <PermisosPage />);
    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
  });

  it("refetches all three queries from the single retry button", async () => {
    stubs.roles = { ...stubs.idle(), isError: true, error: new Error("boom") };
    renderWith(admin, <PermisosPage />);
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(stubs.positions.refetch).toHaveBeenCalledTimes(1);
    expect(stubs.members.refetch).toHaveBeenCalledTimes(1);
    expect(stubs.roles.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders every built-in role as unsynced when nothing is seeded yet", () => {
    renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("Sin sincronizar")).toHaveLength(ROLES.length);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/positions/components/permisos-page.test.tsx`

Expected: FAIL — the `positions`/`members` degradation cases report `Unable to find an accessible element with the role "heading" and name "Roles"` (the page renders `QueryErrorState` for them today), and the label cases report `Unable to find an element with the text: No disponible`.

- [ ] **Step 3: Write minimal implementation**

In `roles-panel.tsx`, add the exported state type and thread it through the two label helpers:

```ts
/** Per-section availability, so /permisos can degrade `grantingCargos` / `holders`
 *  independently instead of failing the whole page closed. Three states, not two: an
 *  empty list while a query is still in flight must not read as "Nadie aún". */
export type SectionState = "ok" | "loading" | "error";

function stateLabel(state: SectionState): string | null {
  if (state === "loading") return "Cargando…";
  if (state === "error") return "No disponible";
  return null;
}

function holdersLabel(holders: RoleOverviewRow["holders"], state: SectionState): string {
  const degraded = stateLabel(state);
  if (degraded !== null) return degraded;
  if (holders.length === 0) return "Nadie aún";
  const shown = holders
    .slice(0, MAX_HOLDERS)
    .map((holder) => holder.name)
    .join(", ");
  const rest = holders.length - MAX_HOLDERS;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

function originLabel(row: RoleOverviewRow, state: SectionState): string {
  // Custom roles are structurally cargo-less, so a positions outage tells us nothing
  // new about them — don't degrade a fact.
  if (row.builtInKey === null) return "Asignación directa";
  const degraded = stateLabel(state);
  if (degraded !== null) return degraded;
  return row.grantingCargos.length > 0 ? row.grantingCargos.join(", ") : "Ningún cargo lo otorga";
}
```

Change the component signature and the two call sites:

```tsx
export function RolesPanel({
  rows,
  cargosState = "ok",
  holdersState = "ok",
}: {
  rows: RoleOverviewRow[];
  cargosState?: SectionState;
  holdersState?: SectionState;
}) {
```

```tsx
                  <dd className="text-ink-2">{originLabel(row, cargosState)}</dd>
```
```tsx
                  <dd className="text-ink-2">{holdersLabel(row.holders, holdersState)}</dd>
```

Replace `permisos-page.tsx` lines 42-90:

```tsx
  const rows = useMemo(
    () => buildRoleOverview(roles ?? [], positions ?? [], members ?? [], currentTermKey()),
    [roles, positions, members],
  );

  if (!isAdmin) {
    return (
      <p role="alert" className="text-ink-3">
        No autorizado.
      </p>
    );
  }

  const retryAll = () => {
    refetchPositions();
    refetchMembers();
    refetchRoles();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Permisos"
        subtitle="Cada rol, qué cargo lo otorga y quién lo tiene. Los permisos efectivos de cada miembro se sincronizan al iniciar sesión."
        actions={
          <Link to="/positions" className="text-ui-md text-jci-blue hover:underline">
            Editar permisos →
          </Link>
        }
      />
      {/* Only the `roles` query gates the panel. Unioning all three used to fail the
          whole page closed — including the ONLY affordance that can restore a
          deactivated role, so one bad members read made it permanently unrestorable.
          positions/members degrade inside the panel instead: each section says
          "Cargando…" or "No disponible" rather than rendering an empty list as fact. */}
      {rolesError ? (
        <QueryErrorState error={rolesErr} onRetry={retryAll} />
      ) : rolesLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <RolesPanel
          rows={rows}
          cargosState={sectionState(positionsLoading, positionsError)}
          holdersState={sectionState(membersLoading, membersError)}
        />
      )}
    </div>
  );
}

function sectionState(isLoading: boolean, isError: boolean): SectionState {
  // Error before loading: a partial outage must not paint a spinner forever while one
  // query retries.
  if (isError) return "error";
  return isLoading ? "loading" : "ok";
}
```

and change the `RolesPanel` import (line 9) to bring in the type:

```ts
import { RolesPanel, type SectionState } from "../../permissions/components/roles-panel";
```

`positionsErr` / `membersErr` become unused — remove those two destructured bindings (lines 25, 32) to keep eslint clean; `refetchPositions` / `refetchMembers` are still used by `retryAll`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/positions src/features/permissions` then `pnpm --filter backstage exec eslint src && pnpm --filter backstage exec tsc --noEmit`

Expected: PASS, clean lint, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/components/roles-panel.tsx \
        apps/backstage/src/features/permissions/components/roles-panel.test.tsx \
        apps/backstage/src/features/positions/components/permisos-page.tsx \
        apps/backstage/src/features/positions/components/permisos-page.test.tsx
git commit -m "fix(backstage): /permisos degrades per-section instead of failing closed

The page gated the whole render — including the only role-restore affordance — on
positionsError || membersError || rolesError. RolesPanel now renders off the roles
query alone; the cargo and holder sections carry their own loading/error labels."
```

---

### Task 16: `RoleRepository` — unfiltered `getAll()`, `reactivate()`, `useReactivateRole()`

**Files:**
- Create: `apps/backstage/src/features/permissions/repositories/role-repository.test.ts`
- Modify: `apps/backstage/src/features/permissions/repositories/role-repository.ts` (lines 2-11 imports, 37-44, 60-66)
- Modify: `apps/backstage/src/features/permissions/hooks/use-save-role.ts` (append)

**This is the flip.** Every assignment surface already filters (Tasks 9-13) and `/permisos` already renders lifecycle state (Task 14), so widening the query cannot leak a deactivated role into a picker.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked SDK, not the emulator: no repository in this app is emulator-tested, and the
// three assertions that matter (no `where`, both lifecycle fields written together) are
// about the CALL the repository issues, not about Firestore's response.
const getDocs = vi.fn();
const updateDoc = vi.fn();
const addDoc = vi.fn(async () => ({ id: "new-id" }));
const serverTimestamp = vi.fn(() => "SERVER_TS");
const collection = vi.fn((_db: unknown, name: string) => ({ path: name }));
const docRef = vi.fn((coll: { path: string }, id: string) => ({ path: `${coll.path}/${id}` }));
const query = vi.fn();
const where = vi.fn();

vi.mock("@luminova/firebase/db", () => ({ getDb: () => ({ mock: "db" }) }));
vi.mock("firebase/firestore", () => ({
  addDoc,
  collection,
  doc: docRef,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
}));

import { RoleRepository } from "./role-repository";

const snap = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  ref: { parent: { id: "roles" } },
  data: () => ({
    name: id,
    description: "",
    builtIn: false,
    builtInKey: null,
    permissions: [],
    locked: false,
    active: true,
    deletedAt: null,
    ...over,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  getDocs.mockResolvedValue({ docs: [] });
});

describe("RoleRepository.getAll", () => {
  it("BLOCKING: reads the whole collection — no active filter", async () => {
    // /permisos must be able to SHOW and RESTORE a deactivated role. Filtering here made
    // it invisible to the only UI that could bring it back.
    await new RoleRepository().getAll();
    expect(getDocs).toHaveBeenCalledWith({ path: "roles" });
    expect(where).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns deactivated docs, built-ins first then alphabetical", async () => {
    getDocs.mockResolvedValue({
      docs: [
        snap("c_dead", { name: "Auditoría", active: false }),
        snap("Treasury", { name: "Tesorería", builtIn: true, builtInKey: "Treasury" }),
      ],
    });
    const roles = await new RoleRepository().getAll();
    expect(roles.map((r) => r.id)).toEqual(["Treasury", "c_dead"]);
    expect(roles.find((r) => r.id === "c_dead")?.active).toBe(false);
  });
});

describe("RoleRepository lifecycle writes", () => {
  it("softDelete stamps active:false + a server deletedAt", async () => {
    await new RoleRepository().softDelete("c1");
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "roles/c1" },
      { active: false, deletedAt: "SERVER_TS" },
    );
  });

  it("BLOCKING: reactivate writes BOTH lifecycle fields", async () => {
    // firestore.rules' roleLifecycleSafe() couples them (active:true requires
    // deletedAt == null) and beacon's isActiveRoleDoc reads both, so clearing only
    // `active` leaves a doc live to getAll()'s sort and dead to the perms pipeline.
    await new RoleRepository().reactivate("c_dead");
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "roles/c_dead" },
      { active: true, deletedAt: null },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/repositories/role-repository.test.ts`

Expected: FAIL — `expected "where" to not be called at all, but actually been called 1 times` on the first case, and `TypeError: new RoleRepository(...).reactivate is not a function` on the last.

- [ ] **Step 3: Write minimal implementation**

In `role-repository.ts`, trim the SDK import (drop `query`, `where`):

```ts
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
```

Replace `getAll` (lines 37-44):

```ts
  /** EVERY role doc, built-ins first then customs, each alphabetical.
   *
   *  Unfiltered on purpose. /permisos must be able to show — and RESTORE — a
   *  deactivated role, and a `where("active","==",true)` here made it invisible to the
   *  only UI that could. Every ASSIGNMENT surface filters explicitly via
   *  `assignableRoles()` (apps/backstage/src/lib/role-lifecycle.ts); display surfaces
   *  deliberately don't, so a stored value always resolves its real name. */
  async getAll(): Promise<RoleDefinition[]> {
    const snapshot = await getDocs(this.collection);
    return parseDocs(roleDefinitionDocSchema, snapshot).sort((a, b) => {
      if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
  }
```

Replace `softDelete` and add `reactivate` (lines 60-66):

```ts
  /** Soft delete — REVERSIBLE via `reactivate`. Built-ins are allowed now except
   *  `roles/Member` and the locked `roles/Admin` (firestore.rules). */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }

  /** Undo a soft delete. Writes BOTH fields: firestore.rules' roleLifecycleSafe()
   *  couples them (active:true requires deletedAt == null), and beacon's isActiveRoleDoc
   *  reads both — clearing only `active` leaves a doc that is live to getAll()'s sort and
   *  dead to the perms pipeline. */
  async reactivate(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: true,
      deletedAt: null,
    });
  }
```

Append to `use-save-role.ts`:

```ts
export function useReactivateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new RoleRepository().reactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage run ci`

Expected: PASS — the full backstage CI (eslint + tsc + vitest). This is the commit that changes what production data reaches every consumer, so run the whole suite here rather than one file.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/repositories/role-repository.ts \
        apps/backstage/src/features/permissions/repositories/role-repository.test.ts \
        apps/backstage/src/features/permissions/hooks/use-save-role.ts
git commit -m "feat(backstage): unfiltered role query + RoleRepository.reactivate

useRoles() now returns every role doc so /permisos can show and restore a deactivated
one; every assignment surface already filters through assignableRoles(). reactivate
writes active AND deletedAt — the rules couple them and beacon reads both."
```

---

### Task 17: `RoleEditor` — "Desactivar rol", relaxed gate, holder count

**Files:**
- Test: `apps/backstage/src/features/permissions/components/role-editor.test.tsx` (append)
- Modify: `apps/backstage/src/features/permissions/components/role-editor.tsx` (lines 30-42, 156-178)
- Modify: `apps/backstage/src/features/permissions/components/roles-panel.tsx` (`Editing` type + wiring)
- Test: `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` (existing editor case)

**Deviation from the spec, on purpose.** `docs/specs/role-lifecycle.md:154` says `canDelete` relaxes to `!role.locked && !isMemberRole`. This plan adds `&& role.active`: an already-deactivated role must not offer "Desactivar rol" (its restore affordance is the panel's "Reactivar rol"). The rules would permit the re-stamp, so this is a UI-only narrowing.

- [ ] **Step 1: Write the failing test**

```ts
const builtInTreasury: RoleDefinition = {
  id: "Treasury",
  name: "Tesorería",
  description: "",
  builtIn: true,
  builtInKey: "Treasury",
  permissions: ["read:Member"],
  locked: false,
  active: true,
  deletedAt: null,
};

const builtInMember: RoleDefinition = { ...builtInTreasury, id: "Member", name: "Miembro", builtInKey: "Member" };

describe("RoleEditor deactivation", () => {
  it("offers Desactivar rol for a non-locked BUILT-IN role and states the holder count", async () => {
    // Was gated on !role.builtIn, so a built-in could never be taken out of service.
    render(
      <RoleEditor
        role={builtInTreasury}
        holderCount={7}
        onSubmit={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: "Desactivar rol" })).toBeInTheDocument();
    expect(screen.getByText(/7 miembros activos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar rol/i })).not.toBeInTheDocument();
  });

  it("singularizes the holder count", () => {
    render(
      <RoleEditor role={builtInTreasury} holderCount={1} onSubmit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/1 miembro activo/)).toBeInTheDocument();
  });

  it("BLOCKING: never offers Desactivar rol for the Member role", () => {
    // computeMemberRoles injects Member into every claim unconditionally, so
    // deactivating it collapses nav and route access for the whole chapter.
    // firestore.rules bars it too; this mirrors that bar in the UI.
    render(<RoleEditor role={builtInMember} holderCount={40} onSubmit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede desactivar/i)).toBeInTheDocument();
  });

  it("never offers Desactivar rol on the locked Admin role", () => {
    render(<RoleEditor role={builtInAdmin} onSubmit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });

  it("never offers Desactivar rol on an already-deactivated role", () => {
    render(
      <RoleEditor
        role={{ ...builtInTreasury, active: false }}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });

  it("surfaces a failed deactivation without closing the form", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("denied"));
    render(
      <RoleEditor role={builtInTreasury} holderCount={0} onSubmit={vi.fn()} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desactivar rol" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo desactivar el rol.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/role-editor.test.tsx`

Expected: FAIL — the first case reports `Unable to find an accessible element with the role "button" and name "Desactivar rol"` (`canDelete` is `!role.builtIn`), and the `Member` case reports `Unable to find an element with the text: /no se puede desactivar/i`. TypeScript also rejects the `holderCount` prop.

- [ ] **Step 3: Write minimal implementation**

In `role-editor.tsx`, replace the props interface and the two derived flags (lines 30-42):

```ts
interface RoleEditorProps {
  role: RoleDefinition | null;
  /** Members who currently hold this role, as counted by /permisos. Labelled
   *  "activos" because that count comes from useMembers() (active only) while the
   *  onRoleWritten fan-out has no active filter — it is not the full blast radius. */
  holderCount?: number;
  onSubmit: (data: RoleDefinitionInput) => Promise<void>;
  /** Deactivate this role (soft, reversible from /permisos). */
  onDelete?: () => Promise<void>;
}

/** Create/edit form for a role: name + description + a subject×action permission
 *  matrix. The locked (Admin) role is fully read-only; every other role allows editing
 *  name/description/permissions (identity fields are immutable server-side).
 *
 *  Deactivation is offered for BUILT-INS too — the beacon three-way makes an inactive
 *  built-in mint nothing instead of restoring its seed perms. Two exclusions: the locked
 *  Admin role (anti-lockout) and `Member`, which computeMemberRoles injects into every
 *  claim unconditionally. Both are also barred in firestore.rules; this is the mirror.
 *  An already-deactivated role offers no deactivate button — its affordance is
 *  "Reactivar rol" in RolesPanel. */
export function RoleEditor({ role, holderCount = 0, onSubmit, onDelete }: RoleEditorProps) {
  const locked = role?.locked ?? false;
  const isMemberRole = role?.builtInKey === "Member";
  const canDelete =
    role !== null && role.active && !locked && !isMemberRole && onDelete !== undefined;
```

Replace the delete block and add the Member note (lines 156-178):

```tsx
      {canDelete && (
        <div className="flex flex-col gap-1.5">
          <p className="text-ui-xs text-ink-3">
            Desactivar es reversible: el rol deja de otorgar permisos y se puede reactivar desde
            /permisos. Afecta a {holderCount}{" "}
            {holderCount === 1 ? "miembro activo" : "miembros activos"}.
          </p>
          <Button
            as="button"
            type="button"
            variant="ghost"
            disabled={saving}
            className="w-full justify-center text-error"
            onClick={() => {
              if (!onDelete) return;
              setSaving(true);
              onDelete()
                .catch(() => setError("No se pudo desactivar el rol."))
                .finally(() => setSaving(false));
            }}
          >
            Desactivar rol
          </Button>
        </div>
      )}
      {isMemberRole && (
        <p className="text-ui-xs text-ink-3">
          El rol Miembro no se puede desactivar: lo tiene toda la organización. Para quitarle
          autoridad, vacía sus permisos.
        </p>
      )}
      {locked && (
        <p className="text-ui-xs text-ink-3">
          El rol Administrador está protegido y no se puede editar.
        </p>
      )}
```

In `roles-panel.tsx`, make `Editing` carry the row so the holder count is available without a lossy id lookup (an unsynced built-in row and a custom doc can share an id — see the existing key comment at line 71):

```ts
/** The row AND its doc: the editor needs the doc to write to, and the row to report the
 *  holder count. Carrying only the doc forced an id lookup back into `rows`, which is
 *  ambiguous — an unsynced built-in row and a custom doc can share an id. */
type Editing = { row: RoleOverviewRow; doc: RoleDefinition } | "new" | null;
```

```ts
  const submit = async (data: RoleDefinitionInput) => {
    if (editing === "new") await addRole.mutateAsync(data);
    else if (editing) await updateRole.mutateAsync({ id: editing.doc.id, data });
    setEditing(null);
  };

  const remove = async () => {
    if (editing && editing !== "new") await deleteRole.mutateAsync(editing.doc.id);
    setEditing(null);
  };
```

```tsx
                {doc !== null && (
                  <Button
                    as="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing({ row, doc })}
                  >
                    {doc.locked ? "Ver" : "Editar"}
                  </Button>
                )}
```

```tsx
        {editing !== null && (
          <RoleEditor
            key={editing === "new" ? "new" : editing.doc.id}
            role={editing === "new" ? null : editing.doc}
            holderCount={editing === "new" ? 0 : editing.row.holders.length}
            onSubmit={submit}
            onDelete={editing !== "new" ? remove : undefined}
          />
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/permissions && pnpm --filter backstage exec tsc --noEmit`

Expected: PASS and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/components/role-editor.tsx \
        apps/backstage/src/features/permissions/components/role-editor.test.tsx \
        apps/backstage/src/features/permissions/components/roles-panel.tsx \
        apps/backstage/src/features/permissions/components/roles-panel.test.tsx
git commit -m "feat(backstage): 'Desactivar rol' for built-ins, barred for Member and Admin

canDelete was !role.builtIn, so a built-in could never be taken out of service. Now
!locked && builtInKey !== 'Member' && role.active, with the holder count stated (and
labelled 'activos' — the fan-out is wider). Copy is soft/reversible, not 'Eliminar'."
```

---

### Task 18: `/permisos` "Reactivar rol" with a perms + holder-count confirmation

**Files:**
- Test: `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` (mock + cases)
- Modify: `apps/backstage/src/features/permissions/components/roles-panel.tsx`
- Modify: `apps/backstage/src/features/positions/components/permisos-page.test.tsx` (mock only — the page renders `RolesPanel`, which now calls `useReactivateRole`)

- [ ] **Step 1: Write the failing test**

In `roles-panel.test.tsx`, extend the mock and add cases:

```ts
const reactivateMutate = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: addMutate }),
  useUpdateRole: () => ({ mutateAsync: updateMutate }),
  useDeleteRole: () => ({ mutateAsync: deleteMutate }),
  useReactivateRole: () => ({ mutateAsync: reactivateMutate }),
}));
```

```ts
beforeEach(() => {
  addMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
  reactivateMutate.mockClear();
});
```

```ts
describe("RolesPanel reactivation", () => {
  const dead = {
    ...customDoc,
    active: false,
    permissions: ["manage:Ally", "read:Position"] as RoleDefinition["permissions"],
  };

  it("offers Reactivar rol only on a deactivated row", () => {
    render(<RolesPanel rows={[rowFor(dead), rowFor(customDoc)]} />);
    expect(screen.getAllByRole("button", { name: "Reactivar rol" })).toHaveLength(1);
  });

  it("offers no Reactivar rol for an unsynced built-in (no doc to write to)", () => {
    render(<RolesPanel rows={[unsyncedRow]} />);
    expect(screen.queryByRole("button", { name: "Reactivar rol" })).not.toBeInTheDocument();
  });

  it("BLOCKING: the confirmation states the perms set and the holder count before writing", async () => {
    // Reactivation mints this exact set to every holder at once, through an unbounded
    // no-retry members scan. The admin must see WHAT and to WHOM before confirming.
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(dead, { holders: [{ id: "m0", name: "Olivia" }] })]} />);

    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));

    expect(screen.getByText(/1 miembro activo/)).toBeInTheDocument();
    expect(screen.getByText("Gestionar Aliados")).toBeInTheDocument();
    expect(screen.getByText("Ver Cargos")).toBeInTheDocument();
    expect(reactivateMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(reactivateMutate).toHaveBeenCalledWith("custom-1");
  });

  it("Cancelar closes the confirmation without writing", async () => {
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(dead)]} />);
    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(reactivateMutate).not.toHaveBeenCalled();
  });
});
```

Add `import userEvent from "@testing-library/user-event";` to `roles-panel.test.tsx`.

In `permisos-page.test.tsx`, extend the `use-save-role` mock (lines 31-35):

```ts
vi.mock("../../permissions/hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: vi.fn() }),
  useUpdateRole: () => ({ mutateAsync: vi.fn() }),
  useDeleteRole: () => ({ mutateAsync: vi.fn() }),
  useReactivateRole: () => ({ mutateAsync: vi.fn() }),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/permissions/components/roles-panel.test.tsx`

Expected: FAIL — `expected length of [] to be 1` on the first case (`Unable to find … "Reactivar rol"`).

- [ ] **Step 3: Write minimal implementation**

In `roles-panel.tsx`, extend imports and add the state, handler, row button and dialog:

```ts
import { Badge, Button, Card, Dialog, Sheet } from "@luminova/ui";
import { useAddRole, useUpdateRole, useDeleteRole, useReactivateRole } from "../hooks/use-save-role";
import { permissionLabel } from "../lib/permission-matrix";
```

```ts
  const reactivateRole = useReactivateRole();
  const [reactivating, setReactivating] = useState<{ row: RoleOverviewRow; doc: RoleDefinition } | null>(
    null,
  );

  const confirmReactivate = async () => {
    if (reactivating) await reactivateRole.mutateAsync(reactivating.doc.id);
    setReactivating(null);
  };
```

Replace the row action block so a deactivated row offers both affordances:

```tsx
                {doc !== null && (
                  <div className="flex shrink-0 items-center gap-2">
                    {!row.active && (
                      <Button
                        as="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setReactivating({ row, doc })}
                      >
                        Reactivar rol
                      </Button>
                    )}
                    <Button
                      as="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ row, doc })}
                    >
                      {doc.locked ? "Ver" : "Editar"}
                    </Button>
                  </div>
                )}
```

Add the dialog after the `<Sheet>`:

```tsx
      {/* Reactivation mints the role's whole stored permission set to every holder at
          once, through the unbounded no-retry members scan in onRoleWritten. Show WHAT
          and to WHOM before writing — the confirmation is the last human check. */}
      <Dialog
        open={reactivating !== null}
        onOpenChange={(open) => {
          if (!open) setReactivating(null);
        }}
        title="Reactivar rol"
        description={
          reactivating
            ? `¿Reactivar ${reactivating.row.label}? Volverá a otorgar estos permisos a ${reactivating.row.holders.length} ${reactivating.row.holders.length === 1 ? "miembro activo" : "miembros activos"}.`
            : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {reactivating !== null &&
            (reactivating.row.permissions.length === 0 ? (
              <p className="text-ui-xs text-ink-3">Este rol no otorga ningún permiso.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {reactivating.row.permissions.map((code) => (
                  <li key={code}>
                    <Badge tone="gray">{permissionLabel(code)}</Badge>
                  </li>
                ))}
              </ul>
            ))}
          <div className="flex justify-end gap-3">
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={() => setReactivating(null)}
            >
              Cancelar
            </Button>
            <Button as="button" type="button" onClick={() => void confirmReactivate()}>
              Reactivar
            </Button>
          </div>
        </div>
      </Dialog>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage run ci`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/permissions/components/roles-panel.tsx \
        apps/backstage/src/features/permissions/components/roles-panel.test.tsx \
        apps/backstage/src/features/positions/components/permisos-page.test.tsx
git commit -m "feat(backstage): 'Reactivar rol' on /permisos with a perms + holders confirmation

Closes the loop: no repository in the codebase had a reactivate path, so a deactivated
role was unrecoverable from the UI. The dialog shows the exact permission set the
reactivation will mint and the active-holder count it will reach."
```

---

### Task 19: Documentation

**Files:**
- Modify: `docs/specs/role-lifecycle.md` (line 3)
- Modify: `docs/data-models.md` (line 164 table row; new callout after line 224)

**Finding to record.** `docs/data-models.md` has **no `roles/{roleId}` schema section** — the collection appears only in the rules-summary table (`:164`) and the two prose callouts (`:194-201`, `:224`). So there is nowhere to "add lifecycle semantics to the roles collection schema"; this task adds a fourth callout beside the existing ones and corrects the table row, which is factually wrong after Tasks 5-6.

- [ ] **Step 1: Write the failing test**

No test — documentation only. The verification is `pnpm format` (prettier covers `docs/**`) plus a manual read-back of the three claims below against the source, per CLAUDE.md's "claim == reality" guardrail:
- `firestore.rules` has no `builtIn`/`active` clause on the roles update arm;
- `roleLifecycleSafe()` exists and is referenced only from the roles lane;
- `softDeleteSafe()` is unchanged and still has five call sites at `:311`, `:336`, `:360`, `:399`.

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -n "builtIn', false) != true" firestore.rules; grep -c "softDeleteSafe()" firestore.rules; grep -n "roleLifecycleSafe" firestore.rules`

Expected: the first `grep` prints nothing (exit 1), the second prints `5` (1 definition + 4 call sites), the third prints the definition plus exactly one call site in the roles update arm. If any of these disagrees, an earlier task is not in the state this plan assumes — stop and reconcile before writing docs.

- [ ] **Step 3: Write minimal implementation**

`docs/specs/role-lifecycle.md` line 3:

```markdown
Status: implemented — see `docs/plans/2026-08-12-role-lifecycle.md` · PR 3 of the
role-management overhaul (PR 1 = #216, PR 2 = #219, both merged)
```

`docs/data-models.md` line 164:

```markdown
| `roles` | signed-in | Admin (clients author CUSTOM roles only, and must set `active: true` + `deletedAt: null`; built-ins seeded via admin SDK; `locked` role immutable; deactivation/reactivation allowed except `builtInKey == 'Member'`) | never (reversible soft-delete only) |
```

Append after the `> **roles display text:** …` callout (line 224):

```markdown
>
> **role lifecycle (deactivate / reactivate):** `roles` is the ONE collection whose
> soft-delete is **reversible**. Writes go through `roleLifecycleSafe()` in
> `firestore.rules`, not the shared one-way `softDeleteSafe()` (four other collections
> depend on that helper's semantics and member resurrection stays denied). The helper
> requires `active` to be present and a bool, `deletedAt` to be present, and couples the
> two: `active: true` ⇒ `deletedAt == null`; `active: false` ⇒ `deletedAt` is a timestamp
> equal to `request.time`. Every conjunct is load-bearing, because the two definitions of
> "inactive" in this repo disagree — `roleDefinitionDocSchema` requires
> `active: z.boolean()` (a malformed doc is dropped by `parseDocs` and disappears from the
> UI) while beacon's `isActiveRoleDoc` reads `active !== false` (the same doc keeps minting
> perms). The create arm enforces the same shape, so no `addDoc` can author a role that is
> invisible on `/permisos` and live in the claims pipeline.
>
> `roles/Member` cannot be deactivated (rules + UI): `computeMemberRoles` injects
> `"Member"` into every claim unconditionally, so deactivating it strips five reads from
> every provisioned user in the chapter. Empty its `permissions` instead. `roles/Admin`
> is protected by `locked: true` — verify that flag really is set in production before
> deploying, it is the only structural anti-lockout guard.
>
> **Perms semantics — three-way, not two.** `resolveMemberPerms` treats each built-in key
> as: doc **absent** → `BUILT_IN_ROLE_PERMS[key]` (the pre-seed window must still mint);
> doc **active** → the doc's live `permissions`; doc **inactive** → **nothing, and the key
> is still COVERED**, so the seed snapshot does not come back. This is what makes
> deactivation safe at all; before it, a missing doc and an inactive doc were
> indistinguishable and deactivating a built-in silently restored its seed perms.
> `previewEffectivePerms` mirrors it client-side.
>
> **Deactivation revokes perms, never name-keyed authority.** The `roles` custom claim
> keeps a deactivated role's NAME, so every `hasAnyRole([...])` gate survives — including
> `canCurateFeatured()` and the Scanner `Attendee` conjunct on both `checkIns` arms (both
> pinned by rules tests). Removing name-keyed authority means editing the cargo's `grants`.
> Having `computeMemberRoles` drop inactive names is **rejected**: it would let a member
> holding Scanner + ActivityManager shed the Scanner name while keeping
> `checkIn:Attendance`, lifting the Attendee restriction — a deactivation must never widen
> authority.
>
> **Query semantics.** `RoleRepository.getAll()` is **unfiltered** — `/permisos` must be
> able to show and restore a deactivated role. Every ASSIGNMENT surface filters through
> `assignableRoles()` (`apps/backstage/src/lib/role-lifecycle.ts`), the one place that
> mirrors `isActiveRoleDoc`; DISPLAY surfaces deliberately do not, so a stored value always
> resolves its real name. `roleOptions()` keeps a deactivated built-in's option (dropping
> it would hide a grant already live on a cargo) and marks the label "… (desactivado)".
>
> Neither seeder resurrects a deactivated role: `seedBuiltInRoles` is `create()`-only and
> `reseedBuiltInRolePerms` skips inactive docs. Both have regression tests.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm format` then `pnpm pr-tests`

Expected: PASS — prettier clean and the whole monorepo gate green (`turbo run ci` covers backstage, beacon incl. emulator, and the firestore-rules suite; plus knip, audit, seed and harness tests).

- [ ] **Step 5: Commit**

```bash
git add docs/specs/role-lifecycle.md docs/data-models.md
git commit -m "docs: role lifecycle semantics in data-models; mark the spec implemented

docs/data-models.md has no roles/{roleId} schema section, so the lifecycle goes in a
callout beside the existing roles callouts, plus a correction to the rules-summary row
(clients must now author active:true + deletedAt:null, and deactivation is allowed)."
```

---

## Where the spec disagrees with the code

Recorded here so an implementer does not "fix" the file to match the spec. In every case **the file wins.**

1. `docs/specs/role-lifecycle.md:99` — "Compare `builtIn` and `builtInKey` *before* the both-inactive short-circuit." `builtInKey` is **already** first (`apps/beacon/src/claims-sync/role-change.ts:31`); only `builtIn` (`:42`) moves. Task 3.
2. `:157-161` — the spec does not mention that `apps/backstage/src/features/positions/components/permisos-page.test.tsx:74-108` **pins the union gating as correct**, with a comment arguing for it. Task 15 replaces that suite and explains the reversal.
3. `:154` — `canDelete` relaxes to `!role.locked && !isMemberRole`. Task 17 also requires `role.active`, or an already-deactivated role offers "Desactivar rol".
4. `:103` cites `effective-preview.ts:25-27` for the built-in collapse; it is `:25-27` for the map and `:28-30` for the custom path — both correct, but the built-in *fallback* is on line 26 alone.
5. `:145-152` says holders "come from `useMembers()` → `where("active","==",true)`"; that is `apps/backstage/src/features/members/repositories/member-repository.ts:38`, and `useMembers` merely wraps it. No behavioral difference.
6. `docs/specs/role-lifecycle.md:275-281` (Deploy notes) is correct but does not say that a *rules-only* deploy is now the dangerous half **in both directions**: rules-before-beacon permits a seed-restoring deactivation, and beacon-before-rules is inert but leaves the UI's "Desactivar rol" write denied once Task 17 ships. Keep hosting last.

---

### Critical Files for Implementation

- `/Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/role-lifecycle/apps/beacon/src/claims-sync/resolve-member-perms.ts`
- `/Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/role-lifecycle/firestore.rules`
- `/Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/role-lifecycle/tests/firestore-rules/rules.test.ts`
- `/Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/role-lifecycle/apps/backstage/src/features/permissions/components/roles-panel.tsx`
- `/Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/role-lifecycle/apps/backstage/src/features/positions/components/permisos-page.tsx`

---
