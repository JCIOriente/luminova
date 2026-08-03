# Built-in role set + reseed + two authorization holes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new nine-key built-in role table, the admin callable that pushes it to production, and the two authorization holes (`positionsAssignmentSafe` never checks the cargo being replaced; a coarse `checkIn:Attendance` bypasses the Scanner Attendee restriction) that this role change would otherwise widen.

**Architecture:** Every hand-written role list is derived from the `ROLES` union **before** the two new keys are added, so `ActivityManager` and `Secretary` are covered the moment they exist. The layout map becomes an exhaustive `Record<Role, WidgetKey[]>` so a future omission is a compile error, not a silent full-admin-dashboard fallback. The reseed callable writes `permissions` only — never `name`/`description` — in one `WriteBatch`, so it can coexist with a later rename feature. Scanner event scoping is abandoned end-to-end (claim, CASL grant, callable validation, rules arm) rather than left as configuration implying a guarantee nothing enforces.

**Tech Stack:** TypeScript strict, `@luminova/types`, `@luminova/auth` (CASL), Firebase Cloud Functions (admin SDK, Node 24), `firestore.rules` + `@firebase/rules-unit-testing` against the Firestore emulator, vitest, plain-Node `.mjs` seed mirrors.

**Design doc:** `docs/specs/builtin-role-set.md` — read it first. Read the "Concerns" section at the bottom of THIS plan before starting: three places where the spec is factually wrong about the codebase are resolved there, and the resolutions are already baked into the tasks.

**Worktree:** all work happens in `.worktrees/role-set` on branch `feat/builtin-role-set`. Never edit the primary checkout. `cd` into the worktree in its own Bash call before the first command; the pre-commit hook reads the tool's cwd, not an inline `cd`.

**Out of scope for this plan:** running the review router, stamping a review trailer, and opening the PR. The orchestrator does those after Task 13.

---

## File structure

**Modify — the role table and its mirrors**
- `packages/types/src/permission-role.ts` — `ROLES` gains `ActivityManager`, `Secretary`
- `packages/types/src/role-definition.ts` — new `BUILT_IN_ROLE_PERMS`, extended `ROLE_LABELS` / `ROLE_DESCRIPTIONS`
- `packages/types/src/role-definition.test.ts` — rewritten (asserts the new table)
- `tools/scripts/lib/role-seed.mjs` — plain-Node mirror of all three
- `packages/types/src/cel-positions.ts` — `Secretario` grants `["Secretary", "Membership"]`
- `tools/scripts/lib/cel-seed.mjs` — plain-Node mirror
- `eslint.config.js` — the hardcoded `ROLE_KEY` regex must learn the two new keys

**Modify — the four hand-written role lists (derived from `ROLES` FIRST)**
- `apps/backstage/src/lib/authz/is-member-only.ts` + `.test.ts`
- `apps/backstage/src/components/overview/board-home-layout.ts` + `.test.ts`
- `tests/firestore-rules/nav-equivalence.test.ts`
- `apps/backstage/src/components/nav-config.test.ts`

**Modify — the two holes**
- `firestore.rules` — delete the ExecutiveCommittee positions-edit lane; add `currentCargoGrantsEmpty()`; restructure the `checkIns` create/delete arms
- `tests/firestore-rules/rules.test.ts` — six ExecutiveCommittee allows flip to denies; the Scanner check-in block is rewritten; two new guards

**Modify — Scanner event scoping removal**
- `packages/auth/src/roles.ts`, `packages/auth/src/ability.ts`, `packages/auth/src/ability.test.ts`, `packages/auth/CLAUDE.md`
- `apps/backstage/src/lib/authz/claims.ts` + `.test.ts`, `apps/backstage/src/lib/authz/use-can.ts`
- `apps/backstage/src/features/check-in/lib/can-remove-entry.ts` + `.test.ts`
- `apps/backstage/src/features/check-in/components/activity-check-in.tsx`
- `apps/beacon/src/set-user-roles.ts` + `.test.ts`
- `apps/beacon/src/claims-sync/sync.ts` + `.test.ts`, `apps/beacon/src/claims-sync/firestore-deps.ts`
- `apps/beacon/src/provision-member-login.ts` + `.test.ts`

**Create / modify — the reseed callable**
- `apps/beacon/src/recompute-claims.ts` (modify — new callable + pure planner)
- `apps/beacon/src/recompute-claims.test.ts` (create)
- `apps/beacon/src/index.ts` (modify — export)

**Modify — tests and docs the change falsifies**
- `tests/firestore-rules/seed-contract.test.ts`
- `apps/backstage/src/lib/role-display.test.ts`, `apps/backstage/src/features/permissions/components/roles-panel.test.tsx`, `apps/backstage/src/features/permissions/lib/role-overview.test.ts` (the `ProjectManager` label rename)
- `docs/data-models.md`, `apps/beacon/CLAUDE.md`

### Commit boundaries

CLAUDE.md caps a commit at 10 modified files. Twelve commits, each named by its task:

| Commit | Task | Files |
|---|---|---|
| 1 | 1 | `is-member-only.ts`, `is-member-only.test.ts` (2) |
| 2 | 2 | `board-home-layout.ts`, `board-home-layout.test.ts` (2) |
| 3 | 3 | `nav-equivalence.test.ts`, `nav-config.test.ts` (2) |
| 4 | 4 | `permission-role.ts`, `role-definition.ts`, `role-definition.test.ts`, `role-seed.mjs`, `eslint.config.js`, `board-home-layout.ts`, `board-home-layout.test.ts`, `nav-config.test.ts` (8) |
| 5 | 5 | `role-definition.ts`, `role-seed.mjs`, `role-display.test.ts`, `roles-panel.test.tsx`, `role-overview.test.ts` (5) |
| 6 | 6 | `cel-positions.ts`, `cel-seed.mjs` (2) |
| 7 | 7 | `firestore.rules`, `rules.test.ts` (2) |
| 8 | 8 | `firestore.rules`, `rules.test.ts` (2) |
| 9 | 9 | `roles.ts`, `ability.ts`, `ability.test.ts`, `claims.ts`, `claims.test.ts`, `can-remove-entry.ts`, `can-remove-entry.test.ts`, `use-can.ts`, `activity-check-in.tsx` (9) |
| 10 | 10 | `set-user-roles.ts`, `set-user-roles.test.ts`, `sync.ts`, `sync.test.ts`, `firestore-deps.ts`, `provision-member-login.ts`, `provision-member-login.test.ts` (7) |
| 11 | 11 | `recompute-claims.ts`, `recompute-claims.test.ts`, `index.ts` (3) |
| 12 | 12 | `seed-contract.test.ts`, `docs/data-models.md`, `apps/beacon/CLAUDE.md`, `packages/auth/CLAUDE.md` (4) |

**Order is load-bearing.** Tasks 1–3 derive the four lists while `ROLES` still has seven keys. Task 4 adds the keys; every derived list and every exhaustive `Record<Role, …>` then covers them automatically or fails to compile. Task 4 must also precede Tasks 7–8, because the rules tests mint claims through `permsForRoles` from the real seed producer — a Scanner only holds `checkIn:Attendance` after Task 4.

---

## Task 1: derive `PRIVILEGED` from `ROLES`

`PRIVILEGED` is a bare `string[]` with five hand-typed names. A new management role omitted from it is classified member-only and bounced from `/` to `/me` on every login.

The derivation is **not** `ROLES` minus `Member`: `Scanner` is deliberately not privileged today (a Member+Scanner user belongs on `/me`), so the honest shape is `ROLES` minus an explicit, commented non-privileged list.

**Files:**
- Modify: `apps/backstage/src/lib/authz/is-member-only.ts`
- Modify: `apps/backstage/src/lib/authz/is-member-only.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/backstage/src/lib/authz/is-member-only.test.ts`, and add the import line `import { ROLES } from "@luminova/types";` below the existing imports:

```ts
  it("treats every ROLES key except Member and Scanner as privileged", () => {
    // The list used to be five hand-typed strings. Deriving it from ROLES is the whole
    // point: a role added to the union must be privileged by default, or its holder is
    // bounced to /me on every login despite holding management capabilities.
    for (const role of ROLES) {
      const expected = role === "Member" || role === "Scanner";
      expect(isMemberOnly({ roles: ["Member", role] }), role).toBe(expected);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter backstage exec vitest run src/lib/authz/is-member-only.test.ts
```
Expected: PASS today (the seven current keys happen to be covered), which is exactly why the test alone is not enough — it is the *regression guard* for Task 4. If it FAILS, stop: something else already drifted.

> This is the one task whose test is green before the implementation. That is intentional and stated: the assertion's value is that it goes red in Task 4 if `PRIVILEGED` is still hand-written. Do not skip Step 3 because Step 2 was green.

- [ ] **Step 3: Derive the list**

Replace the whole of `apps/backstage/src/lib/authz/is-member-only.ts`:

```ts
import { ROLES } from "@luminova/types";
import type { AuthClaims } from "@luminova/auth/roles";

/** The two roles that do NOT make a user "privileged". Member is the baseline every
 *  provisioned user carries; Scanner is a single-purpose check-in grant whose holder
 *  still belongs on /me, not the board dashboard. Everything else in ROLES is a
 *  management tier — derived, not hand-listed, so a new role key can never be silently
 *  omitted and its holder bounced to /me on every login. */
const NOT_PRIVILEGED: readonly string[] = ["Member", "Scanner"];
const PRIVILEGED: readonly string[] = ROLES.filter((role) => !NOT_PRIVILEGED.includes(role));

/** A member-only user: has the Member role and none of the privileged roles. Used
 *  to route them to /me instead of the admin Overview. */
export function isMemberOnly(claims: AuthClaims): boolean {
  return claims.roles.includes("Member") && !claims.roles.some((r) => PRIVILEGED.includes(r));
}
```

- [ ] **Step 4: Run to verify it still passes**

```bash
pnpm --filter backstage exec vitest run src/lib/authz/is-member-only.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/authz/is-member-only.ts apps/backstage/src/lib/authz/is-member-only.test.ts
git commit -m "refactor(backstage): derive the privileged-role list from ROLES"
```

---

## Task 2: make the board-home layout map exhaustive

`ROLE_LAYOUTS` is a `Partial<Record<Role, WidgetKey[]>>`. When a user's roles match no entry, `boardHomeLayout` returns `DEFAULT_LAYOUT` — the **full** admin dashboard, KPI and chart widgets included. So the failure mode of forgetting a role is "show them everything", which is the wrong direction.

Making it an exhaustive `Record<Role, WidgetKey[]>` turns a future omission into a compile error. `PRECEDENCE` becomes exhaustive too, with a test that pins it against `ROLES`.

**Files:**
- Modify: `apps/backstage/src/components/overview/board-home-layout.ts`
- Modify: `apps/backstage/src/components/overview/board-home-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/backstage/src/components/overview/board-home-layout.test.ts`, change the import line to:

```ts
import { ROLES } from "@luminova/types";
import { boardHomeLayout, LAYOUT_ROLES, PRECEDENCE, type WidgetKey } from "./board-home-layout";
```

Then replace the last test (`"unknown role falls back to default"`, currently at `:69-71`) with:

```ts
  it("every ROLES key carries its own layout (no role falls through to the full admin default)", () => {
    // The old Partial<Record> meant an unlisted role got DEFAULT_LAYOUT — the FULL admin
    // dashboard, KPI + chart included, for someone who may not be allowed to run those
    // queries. Exhaustiveness is now a compile error; this pins the runtime side too.
    expect([...LAYOUT_ROLES].sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      expect(boardHomeLayout([role]), role).not.toEqual(DEFAULT);
    }
  });

  it("PRECEDENCE ranks every ROLES key exactly once", () => {
    // boardHomeLayout picks the lead layout from PRECEDENCE; a role missing from it can
    // never lead, so a user holding only that role silently borrows another's ordering.
    expect([...PRECEDENCE].sort()).toEqual([...ROLES].sort());
  });

  it("still falls back to the default when the caller has no roles at all", () => {
    expect(boardHomeLayout([])).toEqual(DEFAULT);
  });
```

and delete the now-duplicated `"empty roles fall back to default"` test above it (currently `:65-67`).

> Note: `Admin`'s layout **is** `DEFAULT_LAYOUT`, so the `not.toEqual(DEFAULT)` loop would fail on `Admin`. Skip it explicitly — replace the loop body with:
>
> ```ts
>     for (const role of ROLES) {
>       if (role === "Admin") continue; // Admin's layout IS the full default, by design.
>       expect(boardHomeLayout([role]), role).not.toEqual(DEFAULT);
>     }
> ```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter backstage exec vitest run src/components/overview/board-home-layout.test.ts
```
Expected: FAIL — `PRECEDENCE` is not exported, and `LAYOUT_ROLES` (5 entries) does not equal `ROLES` (7 entries).

- [ ] **Step 3: Make both maps exhaustive**

In `apps/backstage/src/components/overview/board-home-layout.ts`:

Change the import at `:1` to pull `Role` from `@luminova/types` alongside the existing auth import — actually keep `import type { Role } from "@luminova/auth/roles";` as-is (it re-exports the same type) and add nothing. Then replace `PRECEDENCE` (`:22-29`) and `ROLE_LAYOUTS` (`:31-47`) with:

```ts
// Which role's layout wins when a user has several (display precedence, not authority).
// Exhaustive over Role so `lead` is always found for a non-empty role set; the unit test
// pins it against ROLES.
export const PRECEDENCE: Role[] = [
  "Admin",
  "ExecutiveCommittee",
  "Treasury",
  "ProjectManager",
  "Membership",
  "Scanner",
  "Member",
];

// Birthdays are chapter-wide and role-agnostic — every layout carries them, so no
// board member's home is missing the one thing the whole chapter looks at.
//
// EXHAUSTIVE Record, not Partial: an unlisted role used to fall through to
// DEFAULT_LAYOUT, i.e. the full admin dashboard (KPIs + points chart) for someone who
// may hold no read:Member / read:MemberPoints at all. A missing key is now a compile
// error. Adding a role to ROLES forces a deliberate layout decision here.
const ROLE_LAYOUTS: Record<Role, WidgetKey[]> = {
  Admin: DEFAULT_LAYOUT,
  Membership: [
    "headerActions",
    "kpis",
    "quickActions",
    "birthdays",
    "recentActivity",
    "chart",
    "upcomingEvents",
  ],
  Treasury: ["kpis", "birthdays", "recentActivity", "chart"],
  ProjectManager: ["upcomingEvents", "birthdays", "quickActions", "kpis", "recentActivity"],
  ExecutiveCommittee: ["kpis", "birthdays", "recentActivity", "chart"],
  // Scanner reads activities and nothing else — no member, points or ally capability,
  // so no KPI tile, no points chart, no member quick actions.
  Scanner: ["upcomingEvents", "birthdays"],
  // A Member is bounced from / to /me by _app.index, so this is the degenerate landing
  // they should never reach; keep it to the two chapter-wide, read-only cards.
  Member: ["upcomingEvents", "birthdays"],
};
```

Leave `LAYOUT_ROLES`, `boardHomeLayout` and `DEFAULT_LAYOUT` unchanged — `known.length === 0` now happens only for an empty role array, which is still the correct DEFAULT case.

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter backstage exec vitest run src/components/overview/board-home-layout.test.ts
```
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/board-home-layout.ts apps/backstage/src/components/overview/board-home-layout.test.ts
git commit -m "refactor(backstage): make the board-home layout map exhaustive over Role"
```

---

## Task 3: derive the two test role fixtures from `ROLES`

`nav-equivalence.test.ts`'s `PRINCIPALS` and `nav-config.test.ts`'s `ALL_ROLES` are hand-typed seven-element literals. A new role is simply never probed by either.

**Files:**
- Modify: `tests/firestore-rules/nav-equivalence.test.ts`
- Modify: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Derive `PRINCIPALS` from `ROLES`**

In `tests/firestore-rules/nav-equivalence.test.ts`, `role-seed.mjs` does not export `ROLES`. Take it from `@luminova/auth/roles`, which re-exports it — **not** from `@luminova/types`: `tests/firestore-rules/package.json` lists `@luminova/auth` but not `@luminova/types`, so a direct import would fail to resolve under pnpm's strict layout. Extend the existing auth import at `:13`:

```ts
import { ROLES, type AuthClaims } from "@luminova/auth/roles";
```

(`ROLES` is a runtime value and `@luminova/auth` maps runtime to `dist/*.js`, so the package must be built — the file already imports `buildAbility` at runtime, so this adds no new requirement.)

Then replace the `PRINCIPALS` literal (`:53-68`) with:

```ts
const PRINCIPALS: Principal[] = [
  // Derived from ROLES, never hand-listed: a new built-in role must be probed against the
  // nav⟷rules implication from the moment it exists, or its holder can be offered a route
  // the rules deny (render-then-die) with no test noticing.
  ...ROLES.map((role) => canonical(role)),
  // Adversarial custom roles (perms only, no built-in role NAME) — the C1/C5 axis:
  custom("manage-all", ["manage:all"]), // escalation probe: must NOT be offered the role-gated admin routes
  custom("manage-Position", ["manage:Position"]), // org-chart custom role the /positions orCan re-admits
  custom("read-Member", ["read:Member"]), // must be offered /members + /leaderboard the rules let it list
  custom("read-Lead", ["read:Lead"]), // must be offered /leads the rules let it list
  { label: "roleless", uid: "roleless-uid", roles: [], perms: [] },
];
```

`canonical` already takes a `string` and calls `permsForRoles([role])`, so no signature change is needed.

- [ ] **Step 2: Derive `ALL_ROLES` from `ROLES`**

In `apps/backstage/src/components/nav-config.test.ts`, add `ROLES` to the existing `@luminova/types` import (currently `import type { PermissionCode } from "@luminova/types";` at `:7`):

```ts
import { ROLES, type PermissionCode } from "@luminova/types";
```

Then replace the `ALL_ROLES` literal (`:191-199`) with:

```ts
  // Derived from ROLES, never hand-listed: these four routes have no rules boundary that
  // mirrors their nav gate (curationOnly), so this pinned visibility set is their ONLY
  // coverage. A role missing from the list is a route gate nothing probes.
  const ALL_ROLES: Role[] = [...ROLES];
```

- [ ] **Step 3: Run both suites to verify nothing changed yet**

```bash
pnpm --filter backstage exec vitest run src/components/nav-config.test.ts
pnpm --filter @luminova/auth run build
pnpm --filter @luminova/firestore-rules-tests run test
```

The rules package's `test` script wraps `vitest run` in `with-emulator-lock.sh` + `firebase emulators:exec`, so it boots and tears down its own Firestore emulator and cannot collide with a running dev emulator. (`test:run` is the bare `vitest run` and assumes an emulator is already up — use `test`.) There is no per-file filter through `emulators:exec`; the whole suite runs each time.

Expected: both PASS. `ROLES` still has seven keys, so the derived lists are element-for-element identical to the literals they replaced. That equality is the proof the refactor is behaviour-preserving.

- [ ] **Step 4: Commit**

```bash
git add tests/firestore-rules/nav-equivalence.test.ts apps/backstage/src/components/nav-config.test.ts
git commit -m "test: derive the nav principal/role fixtures from ROLES"
```

---

## Task 4: add `ActivityManager` + `Secretary` and rewrite the role table

With Tasks 1–3 landed, adding the two keys propagates automatically into the privileged list and both test fixtures, and produces compile errors in every exhaustive `Record<Role, …>` — which is the point.

**Files:**
- Modify: `packages/types/src/permission-role.ts`
- Modify: `packages/types/src/role-definition.ts`
- Modify: `packages/types/src/role-definition.test.ts`
- Modify: `tools/scripts/lib/role-seed.mjs`
- Modify: `eslint.config.js`
- Modify: `apps/backstage/src/components/overview/board-home-layout.ts`
- Modify: `apps/backstage/src/components/overview/board-home-layout.test.ts`
- Modify: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Rewrite the role-table test first**

Replace the whole of `packages/types/src/role-definition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BUILT_IN_ROLE_PERMS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./role-definition.js";
import { isValidPermissionCode } from "./permission.js";
import { ROLES } from "./permission-role.js";

describe("BUILT_IN_ROLE_PERMS", () => {
  it("has an entry for every built-in role", () => {
    for (const role of ROLES) expect(BUILT_IN_ROLE_PERMS[role]).toBeDefined();
  });

  it("only contains valid permission codes", () => {
    for (const codes of Object.values(BUILT_IN_ROLE_PERMS))
      for (const code of codes) expect(isValidPermissionCode(code)).toBe(true);
  });

  it("carries no duplicate code within a role", () => {
    for (const [role, codes] of Object.entries(BUILT_IN_ROLE_PERMS))
      expect(new Set(codes).size, role).toBe(codes.length);
  });

  it("Admin is manage:all", () => {
    expect(BUILT_IN_ROLE_PERMS.Admin).toEqual(["manage:all"]);
  });

  it("Membership no longer carries the Ally trio (Secretaría owns allies)", () => {
    // Losing read/create/update:Ally is what drops /allies out of Membership's nav.
    for (const code of ["read:Ally", "create:Ally", "update:Ally"] as const)
      expect(BUILT_IN_ROLE_PERMS.Membership).not.toContain(code);
  });

  it("ExecutiveCommittee no longer carries manage:Position (cargo assignment is Admin-only)", () => {
    // Paired with the deleted positions-edit lane in firestore.rules. /positions stays in
    // CEL's nav allowlist: the collection is signedIn()-readable and the row actions gate
    // on can("update","Position"), so they keep seeing who holds what, read-only.
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).not.toContain("manage:Position");
  });

  it("ExecutiveCommittee reads the chapter broadly and may compose notifications", () => {
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toEqual([
      "read:Member",
      "read:Ally",
      "read:MemberPoints",
      "read:Program",
      "read:Project",
      "read:Notification",
      "create:Notification",
      "read:Lead",
      "read:PointRule",
    ]);
  });

  it("Scanner holds coarse check-in access (event scoping abandoned)", () => {
    // Replaces the CASL eventId conditional. The Attendee restriction now lives as a
    // Scanner-specific CONJUNCT in firestore.rules, independent of where the perm came from.
    expect(BUILT_IN_ROLE_PERMS.Scanner).toEqual(["read:Activity", "checkIn:Attendance"]);
  });

  it("ActivityManager is the activity-only slice of ProjectManager", () => {
    expect(BUILT_IN_ROLE_PERMS.ActivityManager).toEqual(["manage:Activity", "checkIn:Attendance"]);
    for (const code of BUILT_IN_ROLE_PERMS.ActivityManager)
      expect(BUILT_IN_ROLE_PERMS.ProjectManager).toContain(code);
  });

  it("Secretary owns communications, prospects and allies", () => {
    expect(BUILT_IN_ROLE_PERMS.Secretary).toEqual([
      "manage:Notification",
      "manage:Lead",
      "manage:Ally",
    ]);
  });

  it("Member carries only read-only, member-facing coarse perms", () => {
    expect(BUILT_IN_ROLE_PERMS.Member).toEqual([
      "read:Member",
      "read:MemberPoints",
      "read:Activity",
      "read:Program",
      "read:Project",
    ]);
    for (const code of BUILT_IN_ROLE_PERMS.Member) expect(code.startsWith("read:")).toBe(true);
  });

  it("Member does NOT carry read:PointRule", () => {
    // /point-rules gates on that perm with no role allowlist, so granting it would put the
    // admin page in every member's nav.
    expect(BUILT_IN_ROLE_PERMS.Member).not.toContain("read:PointRule");
  });
});

describe("display text", () => {
  it("labels and descriptions cover exactly the ROLES keys", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual([...ROLES].sort());
  });

  it("no label or description is blank", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role].length, role).toBeGreaterThan(0);
      expect(ROLE_DESCRIPTIONS[role].length, role).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @luminova/types exec vitest run src/role-definition.test.ts
```
Expected: FAIL — `BUILT_IN_ROLE_PERMS.ActivityManager` and `.Secretary` are `undefined`, and `Membership` still contains `read:Ally`.

- [ ] **Step 3: Add the two keys to `ROLES`**

Replace the array in `packages/types/src/permission-role.ts`:

```ts
export const ROLES = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
  "ActivityManager",
  "Secretary",
  "Scanner",
  "Member",
] as const;
```

The existing seven keep their relative order — `computeMemberRoles` sorts the `roles` claim by this array, so reordering the incumbents would churn every provisioned member's claim for nothing.

- [ ] **Step 4: Rewrite the role table**

In `packages/types/src/role-definition.ts`, replace `BUILT_IN_ROLE_PERMS` (`:21-65`) with:

```ts
/** Coarse, non-conditional perms each built-in role confers. Object-scoped grants
 *  (own-profile read/update, attendance check-in scope) live in CASL + firestore.rules,
 *  NOT here.
 *
 *  Canonical SEED for the editable `roles/` docs (beacon seeds from this). Once a
 *  built-in role doc is seeded it becomes the live source of truth (admins may
 *  edit non-locked ones); this constant is intentionally a snapshot. To change a
 *  built-in's defaults, edit here and run the `reseedBuiltInRolePerms` callable —
 *  `seedRoles` uses create() and will NOT move an existing doc. */
export const BUILT_IN_ROLE_PERMS: Record<Role, PermissionCode[]> = {
  Admin: ["manage:all"],
  Membership: ["manage:Member", "read:MemberPoints", "read:Position"],
  Treasury: ["read:Member", "read:MemberPoints"],
  ExecutiveCommittee: [
    "read:Member",
    "read:Ally",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
    "read:Notification",
    "create:Notification",
    "read:Lead",
    "read:PointRule",
  ],
  ProjectManager: [
    "manage:Project",
    "manage:Program",
    "manage:Activity",
    "checkIn:Attendance",
    "read:Ally",
  ],
  // Meant for a JDL dirección — prod data created in /positions, never seeded onto a cargo.
  ActivityManager: ["manage:Activity", "checkIn:Attendance"],
  Secretary: ["manage:Notification", "manage:Lead", "manage:Ally"],
  // Coarse now, replacing the CASL eventId conditional. The Attendee-only restriction is a
  // Scanner-specific conjunct in firestore.rules, independent of where the perm came from.
  Scanner: ["read:Activity", "checkIn:Attendance"],
  // Member-facing read access: roster + leaderboard, own points, and the activities /
  // programs / projects catalogs. Read-only; every write stays gated. Deliberately NOT
  // read:PointRule — /point-rules gates on it with no role allowlist, so granting it would
  // put the admin page in every member's nav.
  Member: ["read:Member", "read:MemberPoints", "read:Activity", "read:Program", "read:Project"],
};
```

Then extend `ROLE_LABELS` — insert two entries so the object literal reads in `ROLES` order:

```ts
  ProjectManager: "Director de Proyecto",
  ActivityManager: "Actividades",
  Secretary: "Secretaría",
  Scanner: "Escáner",
  Member: "Miembro",
```

(`ProjectManager`'s label is renamed in Task 5 — leave it alone here so the two changes stay separable.)

And extend `ROLE_DESCRIPTIONS`, replacing the four entries whose text the new table falsifies:

```ts
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Admin: "Acceso total a la plataforma.",
  Membership: "Crear y editar miembros; ver puntos y cargos.",
  Treasury: "Gestionar pagos; ver miembros y puntos.",
  ExecutiveCommittee: "Ver la gestión del capítulo; enviar notificaciones.",
  ProjectManager: "Gestionar proyectos, programas y actividades; registrar asistencia.",
  ActivityManager: "Crear y editar actividades; registrar asistencia.",
  Secretary: "Comunicación del capítulo: notificaciones, prospectos y aliados.",
  Scanner: "Registrar asistencia en las actividades del capítulo.",
  Member: "Ver y editar su propio perfil; ver puntos y eventos.",
};
```

- [ ] **Step 5: Mirror all three into the plain-Node seed lib**

In `tools/scripts/lib/role-seed.mjs`, replace `BUILT_IN_ROLE_PERMS`, `ROLE_LABELS` and `ROLE_DESCRIPTIONS` with byte-identical copies of the three objects above (JS, so no `as const` and no type annotations beyond the existing `@type` JSDoc). Also update the two stale doc comments:

- the header comment's "Keep in sync with role-definition.ts" stays;
- `buildBuiltInRoleDocs`'s JSDoc currently says "The 7 built-in role docs (id = role name)" → change to "The built-in role docs (id = role name), one per ROLES key. Admin is locked."

`permsForRoles` and `seedBuiltInRoles` need no change — both iterate the table.

- [ ] **Step 6: Fill in the two new layouts**

`packages/types` now has nine keys, so `ROLE_LAYOUTS` and `PRECEDENCE` in `apps/backstage/src/components/overview/board-home-layout.ts` fail to compile. Add to `PRECEDENCE`, between `Membership` and `Scanner`:

```ts
  "Secretary",
  "ActivityManager",
```

and to `ROLE_LAYOUTS`, between `ExecutiveCommittee` and `Scanner`:

```ts
  // Activity operations only (manage:Activity + checkIn:Attendance) — no member, points or
  // ally capability, so no KPI tile and no points chart.
  ActivityManager: ["upcomingEvents", "birthdays", "recentActivity"],
  // Communications: allies, prospects, notifications. quickActions carries "Registrar
  // aliado", which is theirs; kpis/chart read members + points, which they cannot.
  Secretary: ["upcomingEvents", "birthdays", "quickActions", "recentActivity"],
```

- [ ] **Step 7: Extend the pinned nav visibility sets**

In `apps/backstage/src/components/nav-config.test.ts`, the `cases` array (`:200-218`) pins exact built-in visibility per route. Two entries change:

```ts
    { route: "/point-rules", visible: ["Admin", "ExecutiveCommittee"], admits: "read:PointRule" },
    {
      route: "/activities",
      visible: ["Admin", "ProjectManager", "ActivityManager", "Scanner", "Member"],
      admits: "read:Activity",
    },
```

`/positions` (`["Admin", "Membership", "ExecutiveCommittee"]`) and `/initiatives` are unchanged — neither new role holds `manage:Position` or `read:Program`, and `/positions`'s allowlist is a `roles` array on the nav item, not a perm.

- [ ] **Step 8: Run the fast suites**

```bash
pnpm --filter @luminova/types exec vitest run
pnpm --filter backstage exec vitest run src/components src/lib/authz
```
Expected: PASS. `role-definition.mirror.test.ts` proves the `.mjs` mirror matches; `board-home-layout.test.ts` proves both maps are exhaustive; `is-member-only.test.ts` proves the two new roles are privileged.

- [ ] **Step 9: Teach the eslint role guard the new keys**

`eslint.config.js:70` hardcodes the seven role names in a regex. Left alone, a hand-written `Secretary: "Secretaría"` label map in backstage would slip past the no-second-role-table guard — a guard that silently stops covering part of its domain (guardrail #6).

Replace `:70`:

```js
const ROLE_KEY =
  "/^(Admin|Membership|Treasury|ExecutiveCommittee|ProjectManager|ActivityManager|Secretary|Scanner|Member)$/";
```

`ROLE_LAYOUTS` does not trip either selector: its values are `ArrayExpression`s, not string literals, and it has no nested `label`/`name`/`description` property.

- [ ] **Step 10: Run the full lint + typecheck gate**

```bash
pnpm lint
pnpm typecheck
```
Expected: PASS. If `tsc` reports a missing key in some other `Record<Role, …>` not listed in this plan, add the entry there — do not widen the type to `Partial`.

- [ ] **Step 11: Commit**

```bash
git add packages/types/src/permission-role.ts packages/types/src/role-definition.ts \
        packages/types/src/role-definition.test.ts tools/scripts/lib/role-seed.mjs \
        eslint.config.js \
        apps/backstage/src/components/overview/board-home-layout.ts \
        apps/backstage/src/components/overview/board-home-layout.test.ts \
        apps/backstage/src/components/nav-config.test.ts
git commit -m "feat(types): add ActivityManager + Secretary and rewrite the built-in role table"
```

---

## Task 5: rename the `ProjectManager` label to "Proyectos"

The spec's table gives every role a `nombre`; eight match today's `ROLE_LABELS` exactly and one does not — `ProjectManager` moves from "Director de Proyecto" to "Proyectos", matching the function-not-person naming of the two new roles ("Actividades", "Secretaría").

This is a **snapshot-only** change: the reseed callable writes `permissions` and never `name`, so no production role doc is renamed by it. Only a fresh seed and the bootstrap fallback (`roleDisplay` when no doc exists) see it.

**Files:**
- Modify: `packages/types/src/role-definition.ts`
- Modify: `tools/scripts/lib/role-seed.mjs`
- Modify: `apps/backstage/src/lib/role-display.test.ts`
- Modify: `apps/backstage/src/features/permissions/components/roles-panel.test.tsx`
- Modify: `apps/backstage/src/features/permissions/lib/role-overview.test.ts`

- [ ] **Step 1: Rename in both role tables**

In `packages/types/src/role-definition.ts` and `tools/scripts/lib/role-seed.mjs`, change the `ROLE_LABELS` entry:

```
  ProjectManager: "Proyectos",
```

- [ ] **Step 2: Run to see exactly which assertions break**

```bash
pnpm --filter @luminova/types exec vitest run
pnpm --filter backstage exec vitest run
```
Expected: `@luminova/types` PASSES (the mirror test compares the two tables to each other, and both moved). Backstage FAILS at five assertions:

| File | Line | Current |
|---|---|---|
| `apps/backstage/src/lib/role-display.test.ts` | `:29` | `expect(roleDisplay("ProjectManager", []).label).toBe("Director de Proyecto")` |
| `apps/backstage/src/lib/role-display.test.ts` | `:48` | `expect(roleDisplay("ProjectManager", [custom]).label).toBe("Director de Proyecto")` |
| `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` | `:47` | `label: "Director de Proyecto"` (fixture) |
| `apps/backstage/src/features/permissions/components/roles-panel.test.tsx` | `:117`, `:141` | `screen.getByText("Director de Proyecto")` |
| `apps/backstage/src/features/permissions/lib/role-overview.test.ts` | `:143` | `expect(projectManager.label).toBe("Director de Proyecto")` |

- [ ] **Step 3: Update every one of them to "Proyectos"**

Replace the string in all five places. Do **not** loosen an assertion to a regex or a `toContain` — the exact-label assertion is what proves the snapshot fallback is being read.

```bash
grep -rn "Director de Proyecto" apps packages tools
```
Expected after the edit: no hits outside `docs/`.

- [ ] **Step 4: Re-run**

```bash
pnpm --filter backstage exec vitest run
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/role-definition.ts tools/scripts/lib/role-seed.mjs \
        apps/backstage/src/lib/role-display.test.ts \
        apps/backstage/src/features/permissions/components/roles-panel.test.tsx \
        apps/backstage/src/features/permissions/lib/role-overview.test.ts
git commit -m "feat(types): rename the ProjectManager seed label to Proyectos"
```

---

## Task 6: `Secretario` grants `["Secretary", "Membership"]`

The seeded CEL cargo keeps the member CRUD it already does and gains the new communications duties. Every other CEL cargo is unchanged. `cel-seed.mirror.test.ts` guards the `.mjs` mirror.

**Files:**
- Modify: `packages/types/src/cel-positions.ts`
- Modify: `tools/scripts/lib/cel-seed.mjs`

- [ ] **Step 1: Change the canonical entry only, and watch the mirror test go red**

In `packages/types/src/cel-positions.ts`, the `Secretario` entry (`:37-44`):

```ts
  {
    title: "Secretario",
    titleFemale: "Secretaria",
    category: "CEL",
    grants: ["Secretary", "Membership"],
    term: null,
    description: "Actas, comunicación del capítulo y gestión de miembros.",
  },
```

- [ ] **Step 2: Run the mirror test to verify it fails**

```bash
pnpm --filter @luminova/types exec vitest run src/cel-seed.mirror.test.ts
```
Expected: FAIL — `CEL_SEED matches the canonical CEL_POSITIONS exactly`, diffing `grants` and `description` on the `Secretario` entry. This is the drift guard doing its job; it is why the canonical file is edited first.

- [ ] **Step 3: Update the mirror**

In `tools/scripts/lib/cel-seed.mjs`, the `Secretario` entry (`:30-37`) — apply the identical change:

```js
  {
    title: "Secretario",
    titleFemale: "Secretaria",
    category: "CEL",
    grants: ["Secretary", "Membership"],
    term: null,
    description: "Actas, comunicación del capítulo y gestión de miembros.",
  },
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter @luminova/types exec vitest run
```
Expected: PASS, both mirror suites.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/cel-positions.ts tools/scripts/lib/cel-seed.mjs
git commit -m "feat(types): Secretario cargo grants Secretary alongside Membership"
```

---

## Task 7: C1 — guard the cargo being *replaced*, and delete the CEL positions lane

`assignedCargoId()` reads `request.resource.data` — the **post-write** cargo. Nothing looks at `resource.data.positions[term].cargoId`. So any `manage:Member` holder can overwrite the president's `positions.<term>` with a grant-free cargo; `resolveTrustedGrants` then sees `grants.length === 0`, returns `[]`, and the president's `Admin` claim is gone. Strip both Admins and recovery requires the Firebase console.

The same commit deletes the ExecutiveCommittee positions-edit lane (`firestore.rules:327-331`), which the loss of `manage:Position` makes dead policy.

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Move the `TERM` constant so fixtures can use it**

`TERM` is declared at `tests/firestore-rules/rules.test.ts:1996`, below `beforeAll`. Step 2 needs it inside the fixture block. Cut these three lines from `:1994-1996`:

```ts
// Rules derive the term from request.time.year() (UTC); compute it from the client
// clock so this suite can't rot when the calendar year rolls over.
const TERM = String(new Date().getUTCFullYear());
```

and paste them immediately after the `MEMBER_DOC` declaration near `:41`.

- [ ] **Step 2: Write the failing tests**

Add a fixture inside the `withSecurityRulesDisabled` block in `beforeAll`, right after the `members/m_legacyname` fixture (around `:426`):

```ts
    // A member who ALREADY holds a power cargo. The C1 hole: nothing in
    // positionsAssignmentSafe() looked at the cargo being REPLACED, so a manage:Member
    // holder could overwrite this with a grant-free cargo and claims-sync would compute
    // grants.length === 0 — silently stripping the Admin claim.
    await setDoc(doc(db, "members/m_powercargo"), {
      name: "Franco",
      totalPoints: 0,
      uid: "franco-uid",
      active: true,
      deletedAt: null,
      positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
    });
```

Then add a new describe block immediately after the `firestore.rules — member positions assignment` block (which currently ends around `:2105`):

```ts
describe("firestore.rules — replacing an already-assigned power cargo (C1)", () => {
  it("BLOCKING: denies Membership replacing an Admin-granting cargo with a grant-free one", async () => {
    // The de-elevation attack: the NEW cargo is grant-free, so the old cargoGrantsEmpty()
    // check passed. currentCargoGrantsEmpty() is what looks at resource.data — the cargo
    // being displaced — and denies the write.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });

  it("BLOCKING: denies Membership clearing an Admin-granting cargo to null", async () => {
    // cargoId: null makes cargoGrantsEmpty() short-circuit true; only the old-side guard
    // catches it.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: null, comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });

  it("allows Admin to replace a power cargo (the legitimate hand-over)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "admin-uid" },
      }),
    );
  });
});
```

Order matters inside that block: the Admin case mutates the fixture, so it runs last.

- [ ] **Step 3: Run to verify the two denies fail**

```bash
pnpm --filter @luminova/firestore-rules-tests run test
```
(The script boots its own emulator via `with-emulator-lock.sh`; there is no per-file filter through `emulators:exec`, so the whole suite runs.)

Expected: FAIL on both `BLOCKING` cases — the writes currently SUCCEED, which is the hole. The Admin case passes already.

- [ ] **Step 4: Add the old-side guard to the rules**

In `firestore.rules`, immediately after `cargoGrantsEmpty()` (which ends at `:90`), add:

```
    // The OTHER side of cargoGrantsEmpty(): the cargo being REPLACED. assignedCargoId()
    // reads request.resource.data — the post-write cargo — so without this a manage:Member
    // holder could overwrite a president's positions.<term> with a grant-free cargo,
    // claims-sync would resolve grants.length == 0, and the Admin claim would be gone with
    // no way back but the Firebase console. Update-only: create has no prior resource.
    function currentCargoGrantsEmpty() {
      let prior = resource.data.get('positions', {}).get(currentTermKey(), {}).get('cargoId', null);
      return prior == null
        || get(/databases/$(database)/documents/positions/$(prior)).data.grants.size() == 0;
    }
```

Then change the last conjunct of `positionsAssignmentSafe()` (`:114`) from:

```
        && (hasAnyRole(['Admin']) || cargoGrantsEmpty());
```

to:

```
        && (hasAnyRole(['Admin']) || (cargoGrantsEmpty() && currentCargoGrantsEmpty()));
```

`createPositionsSafe()` is untouched — a create has no `resource.data` to read.

- [ ] **Step 5: Delete the ExecutiveCommittee positions lane**

Still in `firestore.rules`, delete `:327-331` in full — the comment and the whole `allow update` statement:

```
      // ExecutiveCommittee may edit only position assignments (org chart), nothing else.
      allow update: if hasAnyRole(['ExecutiveCommittee'])
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['positions'])
        && softDeleteSafe()
        && positionsAssignmentSafe();
```

The `allow delete: if false;` line directly below it stays.

- [ ] **Step 6: Flip the six ExecutiveCommittee allows to denies**

Six `assertSucceeds` cases in `tests/firestore-rules/rules.test.ts` now describe behaviour that no longer exists. Rewrite each as a deny that *names the reason*; do not delete them — they are the regression proof that both authorities were actually withdrawn.

**Positions collection (EC lost `manage:Position`):**

`:1624` — replace the whole `it`:

```ts
  it("denies ExecutiveCommittee creating a position (manage:Position withdrawn)", async () => {
    // Cargo/comisión curation is Admin-only now; CEL keeps read (positions read=signedIn).
    await assertFails(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/new1"), {
        title: "Director de Comunicación",
        titleFemale: "Directora de Comunicación",
        category: "JDL",
        grants: [],
        term: 2026,
        description: "Comunica.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("allows Admin to create a grant-free position (the surviving authority)", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "positions/new1"), {
        title: "Director de Comunicación",
        titleFemale: "Directora de Comunicación",
        category: "JDL",
        grants: [],
        term: 2026,
        description: "Comunica.",
        active: true,
        deletedAt: null,
      }),
    );
  });
```

`:1728` — replace:

```ts
  it("denies ExecutiveCommittee updating even non-grants fields (manage:Position withdrawn)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos1"), {
        description: "Actualizada.",
      }),
    );
  });
```

`:1735` — replace:

```ts
  it("denies ExecutiveCommittee soft-deleting a live position (manage:Position withdrawn)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos_soft"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
  });
  it("allows Admin to soft-delete a live position (the surviving authority)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "positions/pos_soft"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
  });
```

> `positions/pos_soft` is `active: true` in the fixtures and is also the grant-free cargo several member-positions tests assign. Soft-deleting it here does not affect them: `cargoGrantsEmpty()` reads `grants`, not `active`.

**Member positions lane (the EC lane is gone; EC holds no `update:Member`):**

`:1999` — replace:

```ts
  it("denies ExecutiveCommittee assigning any cargo (the positions-only lane is gone)", async () => {
    // CEL used to have a dedicated hasOnly(['positions']) lane. It was deleted with
    // manage:Position; cargo assignment is Admin + manage:Member only, until PR 4's flag.
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("allows Membership to assign a grant-free cargo with self assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
```

`:2074` — the intentional comisión gap. Re-point it at a principal that can still write member positions:

```ts
  it("allows a non-Admin to assign a power-conferring comisión (rules pass; beacon trust gate drops the grant)", async () => {
    // INTENTIONAL: rules cannot iterate comisionIds, so comisión grants are NOT
    // gated here. The beacon onMemberWritten trust gate honors comisión power
    // grants only when assignedBy is an Admin (see apps/beacon claims-sync).
    // Membership, not ExecutiveCommittee: CEL no longer has a member-write lane at all,
    // so an EC context would pass this test for the wrong reason.
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: null, comisionIds: ["pos1"], assignedBy: "mem-uid" } },
      }),
    );
  });
```

`:2091` — the production dot-path shape, same re-pointing:

```ts
  it("allows the production dot-path write shape (Membership, current term, grant-free cargo)", async () => {
    // setPositions / toMemberUpdateDoc emit positions.<term> dot-paths, not a full
    // positions map — assert that exact production shape passes the rules.
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });
```

**Three further EC cases now deny for the wrong reason** — re-point them so they still test what their names claim:

- `:2034` `"denies ExecutiveCommittee touching non-position fields"` — the lane it guarded is gone. Replace the whole `it` with:

```ts
  it("denies ExecutiveCommittee any member write, positions or otherwise", async () => {
    // The hasOnly(['positions']) lane was CEL's only member-write authority. With it gone,
    // read:Member is all they hold.
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), { name: "Hacked" }),
    );
  });
```

- `:2047` `"denies a forged assignedBy on the ExecutiveCommittee path"` — re-point to Membership and rename:

```ts
  it("denies a forged assignedBy on the manage:Member path", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "not-mem" } },
      }),
    );
  });
```

- `:2084` `"denies a non-Admin assigning a dangling cargoId"` and `:2100` `"denies the dot-path shape under a non-current term"` — swap `as("exec-uid", ["ExecutiveCommittee"])` for `as("mem-uid", ["Membership"])` in both, leaving names and payloads alone.

`:2006` (`denies ExecutiveCommittee assigning a power-conferring cargo`) still denies for a valid reason and needs no change, but rename it to `"denies ExecutiveCommittee assigning a cargo at all (no member-write lane)"` so it does not imply a surviving grant-based gate.

- [ ] **Step 7: Run the rules suite**

```bash
pnpm --filter @luminova/firestore-rules-tests run test
```
Expected: PASS. The two `BLOCKING` C1 denies are now denied by `currentCargoGrantsEmpty()`; every rewritten EC case denies with `PERMISSION_DENIED`.

- [ ] **Step 8: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "fix(rules): guard the cargo being replaced; drop the CEL positions lane"
```

---

## Task 8: C2 — a coarse `checkIn:Attendance` must not bypass the Scanner Attendee restriction

Today the create rule is `canDo('checkIn','Attendance') || (hasAnyRole(['Scanner']) && role == 'Attendee' && <assigned event> && exists(member))`. Task 4 gave Scanner the coarse perm, so the **first** arm is now satisfied and the `role == 'Attendee'` clause is never evaluated. A scanner could write `{memberId: self, activityId: any, role: "Director"}` — 5 pts for `DirectActivity`, 10 for `DirectProgram`, against 3 for `AttendActivity` — and, through the matching delete arm, remove a real director's 10-point row.

The fix makes the restriction a **conjunct** keyed on the Scanner role, independent of where the perm came from. The now-unreachable `scannerEventIds` sub-arm goes with it, and its `exists(members/…)` phantom-member guard moves into the conjunct so nothing is silently narrowed away.

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/firestore-rules/rules.test.ts`, add to the `firestore.rules — checkIns` describe, immediately after the existing `"denies Scanner registering a non-Attendee role"` case (`:1434-1439`):

```ts
  it("BLOCKING: a Scanner holding the coarse checkIn:Attendance perm still cannot register a Director row", async () => {
    // C2: giving Scanner the coarse perm satisfies the rule's first arm, so the
    // role == 'Attendee' clause on the Scanner-specific arm is never reached. 10 pts for
    // DirectProgram vs 3 for AttendActivity — a scanner could self-award, and undo a real
    // director's row through the matching delete arm.
    await assertFails(
      setDoc(doc(as("s_coarse", ["Scanner"]), "checkIns/c_coarse_dir"), {
        memberId: "m1",
        activityId: "a1",
        role: "Director",
      }),
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @luminova/firestore-rules-tests run test
```
Expected: FAIL — the write SUCCEEDS. `as("s_coarse", ["Scanner"])` mints `permsForRoles(["Scanner"])`, which after Task 4 is `["checkIn:Attendance","read:Activity"]`, so `canDo('checkIn','Attendance')` short-circuits the whole gate.

- [ ] **Step 3: Restructure both checkIns arms**

In `firestore.rules`, replace the create and delete rules (`:492-509`) with:

```
      // Every check-in author holds checkIn:Attendance (Admin/PM/ActivityManager/Scanner or
      // a custom role) and is bound to the activity's check-in window. A Scanner is then
      // confined to Attendee rows on top of that — a CONJUNCT, not an alternative arm,
      // because Scanner now holds the same coarse perm everyone else does: an OR would let
      // that perm satisfy the gate and skip the restriction entirely (a scanner self-awarding
      // 10-pt Director rows). manage:Attendance is the explicit escape hatch for a custom
      // role that legitimately manages the whole roster. exists() rides in the Scanner
      // conjunct — it was the Scanner arm's phantom-member guard and stays Scanner-scoped.
      allow read: if signedIn();
      allow create: if withinCheckInWindow(request.resource.data.activityId)
        && canDo('checkIn', 'Attendance')
        && (!hasAnyRole(['Scanner'])
            || canDo('manage', 'Attendance')
            || (request.resource.data.role == 'Attendee'
                && exists(/databases/$(database)/documents/members/$(request.resource.data.memberId))));
      // Undo a check-in (mis-scan correction). Same authority + window binding as create,
      // but read from the existing doc (resource.data) since delete carries no
      // request.resource — so the Attendee conjunct reads resource.data.role.
      allow delete: if withinCheckInWindow(resource.data.activityId)
        && canDo('checkIn', 'Attendance')
        && (!hasAnyRole(['Scanner'])
            || canDo('manage', 'Attendance')
            || resource.data.role == 'Attendee');
      allow update: if false;
```

- [ ] **Step 4: Rewrite the Scanner check-in tests**

The seven `asClaims(..., { roles: ["Scanner"], scannerEventIds: [...] })` contexts mint no `perms`, so after Step 3 every one of them is denied for the wrong reason. Replace them with `as(uid, ["Scanner"])`, which mints the production perm set.

`:1422-1426` — replace:

```ts
  it("allows a Scanner to create an Attendee check-in", async () => {
    await assertSucceeds(
      setDoc(doc(as("s1", ["Scanner"]), "checkIns/c_scan"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
```

`:1428-1433` (`denies Scanner creating for an out-of-scope activity`) — **delete the whole `it`.** Scanner event scoping is abandoned deliberately; replace it with the test that documents the widening:

```ts
  it("allows a Scanner on any in-window activity (event scoping deliberately abandoned)", async () => {
    // The scannerEventIds claim is gone. A Scanner's blast radius is now bounded by the
    // check-in WINDOW and the Attendee conjunct, not by an event allowlist.
    await assertSucceeds(
      setDoc(doc(as("s_any", ["Scanner"]), "checkIns/c_scan_any"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
```

`:1434-1439` — swap the context and sharpen the name:

```ts
  it("denies a Scanner registering a non-Attendee role (no self-award of director points)", async () => {
    await assertFails(
      setDoc(doc(as("s3", ["Scanner"]), "checkIns/c_dir"), {
        memberId: "s3",
        activityId: "a1",
        role: "Director",
      }),
    );
  });
```

The `BLOCKING` case added in Step 1 now duplicates this one. Keep both: the Step 1 case names the bypass explicitly and is the regression proof, this one is the plain policy statement. Add `// C2 regression: see the BLOCKING case above.` above it rather than deleting either.

`:1440-1449` — swap the context:

```ts
  it("denies a Scanner creating for a non-existent member (no phantom check-ins)", async () => {
    await assertFails(
      setDoc(doc(as("s4", ["Scanner"]), "checkIns/c_ghost"), {
        memberId: "ghost",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
```

Add the escape-hatch case immediately after it:

```ts
  it("allows a Scanner that also holds manage:Attendance to register a Director row", async () => {
    // The named escape hatch in the conjunct: a custom role granted manage:Attendance
    // legitimately manages the whole roster, Scanner name or not.
    await assertSucceeds(
      setDoc(
        doc(
          as("s_mgr", ["Scanner"], ["checkIn:Attendance", "manage:Attendance", "read:Activity"]),
          "checkIns/c_scan_mgr",
        ),
        { memberId: "m1", activityId: "a1", role: "Director" },
      ),
    );
  });
```

`:1537-1539` (delete arm) — swap the context:

```ts
  it("allows a Scanner to delete an Attendee row within the window", async () => {
    await assertSucceeds(deleteDoc(doc(as("s1", ["Scanner"]), "checkIns/c_del_scan")));
  });
```

`:1540-1544` (`denies a Scanner deleting on an out-of-scope activity`) — **delete the whole `it`.** With scoping gone it would now succeed and destroy `checkIns/c1`, a fixture two later tests still read.

`:1550-1554` — swap the context:

```ts
  it("denies a Scanner deleting a non-Attendee row (the delete-side conjunct)", async () => {
    await assertFails(deleteDoc(doc(as("s1", ["Scanner"]), "checkIns/c_del_director")));
  });
```

- [ ] **Step 5: Remove the now-unused `asClaims` helper**

Those were its only seven callers. Delete `asClaims` (`:1396-1398`) or `pnpm lint` fails on the unused function.

```bash
grep -n "asClaims" tests/firestore-rules/rules.test.ts
```
Expected: no output.

- [ ] **Step 6: Run the rules suite + lint**

```bash
pnpm --filter @luminova/firestore-rules-tests run test
pnpm lint
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "fix(rules): confine Scanner check-ins to Attendee rows via a conjunct"
```

---

## Task 9: remove Scanner event scoping — claim, CASL grant, UI gate

`scannerEventIds` is now minted by nothing the rules read. Left in place it is configuration implying a guarantee nothing enforces (guardrail #6). Removing it from `AuthClaims` first makes the compiler find every consumer.

The UI gate matters here beyond tidiness: `canRemoveEntry` distinguished a Scanner from a coarse holder *through CASL*, by whether the grant carried an `eventId` condition. With Scanner on the same coarse perm as everyone else, that distinction is gone — the UI would offer "undo" on a Director row that the rules deny. It must ask the ROLE, exactly as the rules conjunct does.

**Files:**
- Modify: `packages/auth/src/roles.ts`, `packages/auth/src/ability.ts`, `packages/auth/src/ability.test.ts`
- Modify: `apps/backstage/src/lib/authz/claims.ts`, `apps/backstage/src/lib/authz/claims.test.ts`, `apps/backstage/src/lib/authz/use-can.ts`
- Modify: `apps/backstage/src/features/check-in/lib/can-remove-entry.ts`, `.test.ts`
- Modify: `apps/backstage/src/features/check-in/components/activity-check-in.tsx`

- [ ] **Step 1: Write the failing UI-gate test**

Replace `apps/backstage/src/features/check-in/lib/can-remove-entry.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims } from "@luminova/auth/roles";
import { canRemoveEntry } from "./can-remove-entry";

function gate(claims: AuthClaims) {
  return { ability: buildAbility(claims, "self"), claims };
}

describe("canRemoveEntry", () => {
  it("coarse checkIn:Attendance holder may undo any role", () => {
    const { ability, claims } = gate(roleClaims("ProjectManager"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(true);
    expect(canRemoveEntry(ability, claims, { role: "Director" })).toBe(true);
  });

  it("manage:all (Admin) may undo any role", () => {
    const { ability, claims } = gate(roleClaims("Admin"));
    expect(canRemoveEntry(ability, claims, { role: "Team" })).toBe(true);
  });

  it("a Scanner may undo Attendee rows", () => {
    const { ability, claims } = gate(roleClaims("Scanner"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(true);
  });

  it("BLOCKING: a Scanner may NOT undo non-Attendee rows despite the coarse perm", () => {
    // Scanner now holds the SAME checkIn:Attendance perm as a ProjectManager, so the
    // ability alone can no longer tell them apart — the gate must ask the role, exactly as
    // the firestore.rules delete conjunct does. Otherwise the UI offers an undo the rules
    // deny (render-then-die on a destructive action).
    const { ability, claims } = gate(roleClaims("Scanner"));
    expect(canRemoveEntry(ability, claims, { role: "Director" })).toBe(false);
    expect(canRemoveEntry(ability, claims, { role: "Team" })).toBe(false);
  });

  it("a Scanner that also holds manage:Attendance may undo any role (the escape hatch)", () => {
    const claims: AuthClaims = {
      roles: ["Scanner"],
      perms: ["checkIn:Attendance", "manage:Attendance", "read:Activity"],
    };
    expect(canRemoveEntry(buildAbility(claims, "self"), claims, { role: "Director" })).toBe(true);
  });

  it("a principal without checkIn:Attendance may undo nothing", () => {
    const { ability, claims } = gate(roleClaims("Member"));
    expect(canRemoveEntry(ability, claims, { role: "Attendee" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter backstage exec vitest run src/features/check-in/lib/can-remove-entry.test.ts
```
Expected: FAIL — `canRemoveEntry` takes `(ability, activityId, entry)`, so the arity is wrong; and the BLOCKING case would pass `true` under the old logic once Scanner holds the coarse perm.

- [ ] **Step 3: Drop the claim from `AuthClaims`**

In `packages/auth/src/roles.ts`, delete the `scannerEventIds?: string[];` line (`:12`) and its blank-line neighbour. The interface becomes:

```ts
export interface AuthClaims {
  roles: Role[];
  /** Resolved effective coarse permission set, minted by claims-sync. When absent
   *  the member has zero coarse abilities — `buildAbility` does not fall back to a
   *  role table. */
  perms?: PermissionCode[];
}
```

- [ ] **Step 4: Drop the Scanner conditional grant**

In `packages/auth/src/ability.ts`, delete the entire `case "Scanner":` block (`:17-22`). `applyConditional` becomes:

```ts
/** Conditional / object-scoped grants that can't be expressed as coarse perms.
 *  These stay hardcoded per built-in role name and are NOT editable in the UI.
 *
 *  Scanner used to live here with `checkIn Attendance { eventId ∈ scannerEventIds }`.
 *  Event scoping was abandoned: Scanner now carries coarse `read:Activity` +
 *  `checkIn:Attendance` in BUILT_IN_ROLE_PERMS, and the Attendee-only restriction is a
 *  Scanner-specific conjunct in firestore.rules (mirrored by
 *  features/check-in/lib/can-remove-entry.ts), not a CASL condition. */
function applyConditional(role: Role, claims: AuthClaims, uid: string, can: Can): void {
  switch (role) {
    case "Member":
      can(["read", "update"], "Member", { uid });
      can("read", ["MemberPoints", "Project", "Position"]);
      break;
    default:
      // Other built-in roles carry only coarse grants, applied via the perms claim.
      break;
  }
}
```

`claims` is still a parameter (unused by the `Member` case, which reads `uid`) — if `tsc`/eslint flags it as unused, drop it from the signature and from the call site at `:48`.

> The `Member` case is deliberately left intact even though `read:MemberPoints` and `read:Project` are now also coarse perms. It is belt-and-braces for a token minted before the reseed runs; the two authorities agree, so there is no drift to resolve.

- [ ] **Step 5: Rewrite the three Scanner ability tests**

In `packages/auth/src/ability.test.ts`, replace `:63-79` (the three `Scanner` cases) with:

```ts
  it("Scanner check-in and activity reads come from the perms claim, not a conditional grant", () => {
    const a = ability(roleClaims("Scanner"));
    expect(a.can("checkIn", "Attendance")).toBe(true);
    expect(a.can("read", "Activity")).toBe(true);
    expect(a.can("read", "Member")).toBe(false);
    expect(a.can("update", "Activity")).toBe(false);
  });

  it("a roles-only Scanner claim (no perms) grants nothing — event scoping is gone", () => {
    // The old conditional grant meant {roles:['Scanner']} alone conferred a scoped
    // checkIn. It no longer does: authority is the perms claim, full stop.
    const a = ability({ roles: ["Scanner"] });
    expect(a.can("checkIn", "Attendance")).toBe(false);
    expect(a.can("read", "Activity")).toBe(false);
  });
```

Also fix `:34-40` and `:90-93` and `:153-159`, which assert `ExecutiveCommittee` `can("manage","Position")` — Task 4 withdrew that perm. Change each `expect(a.can("manage", "Position")).toBe(true)` to `.toBe(false)` and rename the surrounding `it`s from "…and manages positions" / "lets ExecutiveCommittee manage the position catalog" to "…and no longer manages positions".

```bash
grep -n 'manage", "Position"' packages/auth/src/ability.test.ts
```
Expected: three hits, all now asserting `false`.

- [ ] **Step 6: Drop the claim decode**

Replace `apps/backstage/src/lib/authz/claims.ts` in full:

```ts
import { isValidRole, type AuthClaims, type Role } from "@luminova/auth/roles";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";

export function decodeClaims(tokenClaims: Record<string, unknown> | null | undefined): AuthClaims {
  if (!tokenClaims || !Array.isArray(tokenClaims.roles)) {
    return { roles: [] };
  }
  const roles = tokenClaims.roles.filter((r): r is Role => isValidRole(r));
  const rawPerms = tokenClaims.perms;
  const perms = Array.isArray(rawPerms)
    ? rawPerms.filter((p): p is PermissionCode => isValidPermissionCode(p))
    : undefined;
  return { roles, ...(perms ? { perms } : {}) };
}
```

In `apps/backstage/src/lib/authz/claims.test.ts`, replace the `"passes through scannerEventIds when present"` case (`:16-21`) with:

```ts
  it("drops a legacy scannerEventIds claim (event scoping removed)", () => {
    // A token minted before the removal still carries it; decoding it back into AuthClaims
    // would resurrect a field nothing reads.
    expect(decodeClaims({ roles: ["Scanner"], scannerEventIds: ["evt_1"] })).toEqual({
      roles: ["Scanner"],
    });
  });
```

Also fix the comment at `apps/backstage/src/lib/authz/ability-context.tsx:31` — "(roles/perms/scannerEventIds)" becomes "(roles/perms)".

- [ ] **Step 7: Rewrite the UI gate**

Replace `apps/backstage/src/features/check-in/lib/can-remove-entry.ts` in full:

```ts
import type { AppAbility } from "@luminova/auth/ability";
import { hasAnyRole, type AuthClaims } from "@luminova/auth/roles";
import type { ParticipationRole } from "@luminova/types/engine";
import { abilityAllows } from "../../../lib/authz/probe";

/** May the caller undo THIS roster row? Mirrors the `checkIns` delete rule
 *  (firestore.rules): every `checkIn:Attendance` holder may undo a row, EXCEPT a Scanner,
 *  which is confined to `Attendee` rows unless it also holds `manage:Attendance`.
 *
 *  The Scanner clause reads the ROLE, not a CASL condition. It used to ride on the
 *  ability: Scanner's grant carried an `eventId` condition, so the empty-instance probe
 *  failed for it and the scoped probe passed only for its own events. Event scoping is
 *  gone — Scanner now holds the same coarse `checkIn:Attendance` as a ProjectManager — so
 *  an ability-only gate would offer "undo" on a Director row the rules deny. */
export function canRemoveEntry(
  ability: AppAbility,
  claims: AuthClaims,
  entry: { role: ParticipationRole },
): boolean {
  if (!abilityAllows(ability, "checkIn", "Attendance")) return false;
  if (!hasAnyRole(claims, ["Scanner"])) return true;
  if (abilityAllows(ability, "manage", "Attendance")) return true;
  return entry.role === "Attendee";
}
```

- [ ] **Step 8: Update the two call sites**

In `apps/backstage/src/lib/authz/use-can.ts`, the interface member (`:27`):

```ts
  /** May the caller undo THIS roster row? (features/check-in/lib/can-remove-entry) */
  canRemoveCheckIn(entry: { role: ParticipationRole }): boolean;
```

and the implementation (`:52`):

```ts
    canRemoveCheckIn: (entry) => canRemoveEntry(ability, claims, entry),
```

In `apps/backstage/src/features/check-in/components/activity-check-in.tsx:155`:

```tsx
        canRemove={(entry) => gate.canRemoveCheckIn(entry)}
```

`activityId` may now be unused in that closure's scope — leave the surrounding component alone; `tsc` will flag it only if the whole binding becomes unused.

- [ ] **Step 9: Build the auth package, then run both suites**

`@luminova/auth` maps types to `src/*.ts` but runtime to `dist/*.js`, so backstage's vitest resolves the built output:

```bash
pnpm --filter @luminova/auth run build
pnpm --filter @luminova/auth exec vitest run
pnpm --filter backstage exec vitest run
pnpm typecheck
```
Expected: PASS. `tsc` finding a `scannerEventIds` reference anywhere else means a consumer this plan missed — remove it there, do not re-add the field.

- [ ] **Step 10: Commit**

```bash
git add packages/auth/src/roles.ts packages/auth/src/ability.ts packages/auth/src/ability.test.ts \
        apps/backstage/src/lib/authz/claims.ts apps/backstage/src/lib/authz/claims.test.ts \
        apps/backstage/src/lib/authz/ability-context.tsx apps/backstage/src/lib/authz/use-can.ts \
        apps/backstage/src/features/check-in/lib/can-remove-entry.ts \
        apps/backstage/src/features/check-in/lib/can-remove-entry.test.ts \
        apps/backstage/src/features/check-in/components/activity-check-in.tsx
git commit -m "refactor(auth): drop Scanner event scoping from the claim and the UI gate"
```

> That is 10 files including `ability-context.tsx`, exactly at the checkpoint limit. If the comment fix there is skipped, it is 9.

---

## Task 10: remove Scanner event scoping — beacon, and fix the false `sync.ts` comment

Beacon still validates, carries and writes a claim nothing reads. The same commit corrects the comment at `apps/beacon/src/claims-sync/sync.ts:38-42`, which asserts "rules already deny non-Admin writes while a power cargo is assigned" — false until Task 7, and now true for a different reason that must be named.

**Files:**
- Modify: `apps/beacon/src/set-user-roles.ts`, `.test.ts`
- Modify: `apps/beacon/src/claims-sync/sync.ts`, `.test.ts`
- Modify: `apps/beacon/src/claims-sync/firestore-deps.ts`
- Modify: `apps/beacon/src/provision-member-login.ts`, `.test.ts`

- [ ] **Step 1: Write the failing callable test**

In `apps/beacon/src/set-user-roles.test.ts`, delete the five `scannerEventIds` cases (`:10-16`, `:27-31`, `:33-37`, `:59-63`, `:64-69`) and the `scannerEventIds: undefined` expectation at `:7`. Replace them with:

```ts
  it("validates a plain role assignment", () => {
    const r = validateSetRolesInput({ targetUid: "u1", roles: ["Admin"] });
    expect(r).toEqual({ targetUid: "u1", roles: ["Admin"] });
  });

  it("accepts the Scanner role with no event scoping", () => {
    // Event scoping was abandoned: Scanner's authority is the coarse checkIn:Attendance
    // perm, and the Attendee-only restriction is a firestore.rules conjunct.
    expect(validateSetRolesInput({ targetUid: "u1", roles: ["Scanner"] })).toEqual({
      targetUid: "u1",
      roles: ["Scanner"],
    });
  });

  it("ignores a legacy scannerEventIds argument instead of minting it", () => {
    // An old client still sending it must not get the field written into custom claims.
    const r = validateSetRolesInput({
      targetUid: "u1",
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
    expect(r).toEqual({ targetUid: "u1", roles: ["Scanner"] });
    expect(r).not.toHaveProperty("scannerEventIds");
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter beacon exec vitest run src/set-user-roles.test.ts
```
Expected: FAIL — `validateSetRolesInput({roles:["Scanner"]})` throws `Scanner role requires at least one scannerEventIds entry`, and the third case returns the field.

- [ ] **Step 3: Strip the callable**

In `apps/beacon/src/set-user-roles.ts`:

- delete the two constants `MAX_SCANNER_EVENT_IDS` and `MAX_EVENT_ID_LENGTH` (`:11-12`);
- delete `scannerEventIds?: string[];` from `SetUserRolesInput` and `scannerEventIds?: unknown;` from `RawInput`;
- delete the whole `let scannerEventIds …` block and the `roles.includes("Scanner") && …` throw (`:45-77`);
- the return becomes `return { targetUid: raw.targetUid, roles };`;
- in the `onCall` body, drop `scannerEventIds: input.scannerEventIds,` from the `setCustomUserClaims` payload (`:108`).

Add a one-line comment above `validateSetRolesInput` recording why the field is silently dropped rather than rejected:

```ts
/** Extra keys are ignored, not rejected: an older client may still send the removed
 *  `scannerEventIds`, and failing its call would break role assignment for no gain — the
 *  field is simply never written into the claim. */
```

- [ ] **Step 4: Strip the claims-sync carry-through and fix the false comment**

In `apps/beacon/src/claims-sync/sync.ts`:

- `MemberClaims` drops `scannerEventIds?: string[];`;
- `getExistingClaims`'s return type becomes `Promise<{ roles: Role[]; perms?: PermissionCode[] }>`;
- `sameClaims`'s first parameter type drops the field, and its body drops the third conjunct:

```ts
function sameClaims(
  a: { roles: Role[]; perms?: PermissionCode[] },
  b: MemberClaims,
): boolean {
  return sameList(a.roles, b.roles) && sameList(a.perms ?? [], b.perms);
}
```

- the `next` construction (`:119-122`) collapses to:

```ts
  const next: MemberClaims = { roles, perms };
```

`hadScanner` is still needed — `computeMemberRoles` uses it to preserve the Scanner role itself — so leave `:97` alone.

Then replace the false sentence in `resolveTrustedGrants`'s JSDoc (`:38-42`). The paragraph currently reads "…can no longer strip Admin-granted power: rules already deny non-Admin writes while a power cargo is assigned." Replace that clause with:

```
 *  Ignoring it entirely also means a permitted non-Admin positions edit (which restamps
 *  the shared `assignedBy`) can no longer strip Admin-granted power. That last part was
 *  NOT true of the rules until currentCargoGrantsEmpty() landed: the rules denied
 *  ASSIGNING a power cargo, never OVERWRITING one, so a manage:Member holder could
 *  replace a president's cargo with a grant-free one and this function would resolve
 *  grants.length == 0. The old-side guard in positionsAssignmentSafe() is what makes the
 *  claim true; do not re-loosen it without re-reading this comment.
```

- [ ] **Step 5: Strip the reader and the provisioner**

In `apps/beacon/src/claims-sync/firestore-deps.ts`, `getExistingClaims` (`:57-70`) becomes:

```ts
    getExistingClaims: async (uid) => {
      const user = await loadUser(uid);
      const claims = user?.customClaims as Record<string, unknown> | undefined;
      const roles = rolesFromClaims(claims);
      const perms = permsFromClaims(claims);
      return { roles, ...(perms ? { perms } : {}) };
    },
```

In `apps/beacon/src/provision-member-login.ts`:

- `RawClaims` drops `scannerEventIds?: unknown;`;
- `nextClaims`'s return type becomes `{ roles: Role[] }`, its body drops the `scannerEventIds` const and returns `{ roles }`; its JSDoc becomes "Merge a role into existing custom claims without clobbering other roles.";
- `adoptedClaims` returns `{ roles }` and its JSDoc loses the "(with its scannerEventIds; same email = same person, so event-scoped scan authority travels)" parenthetical — the Scanner ROLE still travels, the scoping does not.

- [ ] **Step 6: Update the beacon tests**

`apps/beacon/src/claims-sync/sync.test.ts`:
- `type Claims` (`:9`) drops `scannerEventIds?: string[];`;
- the case at `:110-127` becomes:

```ts
  it("preserves the Scanner role while recomputing org roles + perms", async () => {
    // The ROLE survives a positions-driven recompute (it is not position-derived); the
    // removed scannerEventIds claim does not come back.
```
  with the fixture's `existing` dropping `scannerEventIds: ["e1"]` and the expected claim object dropping `scannerEventIds: ["e1"]`.

`apps/beacon/src/provision-member-login.test.ts`:
- `:25-29` becomes:

```ts
  it("merges Member without clobbering existing roles", () => {
    expect(nextClaims({ roles: ["ProjectManager"] }, "Member")).toEqual({
      roles: ["ProjectManager", "Member"],
    });
  });
```
- `:167` drops `scannerEventIds: ["e1"]` from `customClaims`;
- `:178` becomes `expect(claimsWrites).toEqual([{ roles: ["Scanner", "Member"] }]);`.

- [ ] **Step 7: Run the beacon suite**

```bash
pnpm --filter beacon run ci
grep -rn "scannerEventIds" apps packages tools firestore.rules
```
Expected: `ci` PASSES (eslint → tsc → vitest). The grep returns **no** hits outside `docs/`.

- [ ] **Step 8: Commit**

```bash
git add apps/beacon/src/set-user-roles.ts apps/beacon/src/set-user-roles.test.ts \
        apps/beacon/src/claims-sync/sync.ts apps/beacon/src/claims-sync/sync.test.ts \
        apps/beacon/src/claims-sync/firestore-deps.ts \
        apps/beacon/src/provision-member-login.ts apps/beacon/src/provision-member-login.test.ts
git commit -m "refactor(beacon): stop minting scannerEventIds; correct the trust-gate comment"
```

---

## Task 11: the `reseedBuiltInRolePerms` callable

`seedBuiltInRoles` uses `create()` and swallows `ALREADY_EXISTS`, deliberately, so an admin's edits survive a re-run. That also means editing the snapshot **does not move production**. Without this callable, Tasks 4–5 change nothing for the live chapter.

**Files:**
- Modify: `apps/beacon/src/recompute-claims.ts`
- Create: `apps/beacon/src/recompute-claims.test.ts`
- Modify: `apps/beacon/src/index.ts`

- [ ] **Step 1: Write the failing planner test**

Create `apps/beacon/src/recompute-claims.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { planRolePermReseed, type RoleSnapshot } from "./recompute-claims.js";

function snap(over: Partial<RoleSnapshot> & { id: string }): RoleSnapshot {
  return {
    exists: true,
    builtInKey: over.id,
    locked: false,
    permissions: [],
    ...over,
  };
}

describe("planRolePermReseed", () => {
  it("plans an update for a built-in role whose perms drifted from the snapshot", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", permissions: ["read:Member"] })]);
    expect(plan.applied).toEqual([
      { id: "Treasury", changedFields: ["permissions"], proposed: BUILT_IN_ROLE_PERMS.Treasury },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.failed).toEqual([]);
  });

  it("skips a doc that already matches, ignoring order", () => {
    const plan = planRolePermReseed([
      snap({ id: "Treasury", permissions: [...BUILT_IN_ROLE_PERMS.Treasury].reverse() }),
    ]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "unchanged" }]);
  });

  it("skips a locked doc even when it drifted", () => {
    // The admin SDK bypasses the `locked` rule the client is held to, so roles/Admin must
    // be excluded EXPLICITLY, not by assumption.
    const plan = planRolePermReseed([snap({ id: "Admin", locked: true, permissions: [] })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Admin", reason: "locked" }]);
  });

  it("skips a doc whose builtInKey does not match its id", () => {
    const plan = planRolePermReseed([snap({ id: "Secretary", builtInKey: "Membership" })]);
    expect(plan.skipped).toEqual([{ id: "Secretary", reason: "not-built-in" }]);
  });

  it("reports a missing doc as failed, not applied (update() would abort the batch)", () => {
    const plan = planRolePermReseed([snap({ id: "Secretary", exists: false })]);
    expect(plan.applied).toEqual([]);
    expect(plan.failed).toEqual(["Secretary"]);
  });

  it("covers every ROLES key when handed a full, empty snapshot set", () => {
    const plan = planRolePermReseed(ROLES.map((id) => snap({ id, locked: id === "Admin" })));
    const touched = [...plan.applied.map((a) => a.id), ...plan.skipped.map((s) => s.id)];
    expect(touched.sort()).toEqual([...ROLES].sort());
  });

  it("stays far under the 500-write batch limit", () => {
    expect(ROLES.length).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter beacon exec vitest run src/recompute-claims.test.ts
```
Expected: FAIL — `planRolePermReseed` is not exported from `./recompute-claims.js`.

- [ ] **Step 3: Write the planner and the callable**

Append to `apps/beacon/src/recompute-claims.ts`, and extend its imports:

```ts
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode } from "@luminova/types/permission";
```

(`onCall` is already imported — merge, do not duplicate.)

```ts
const RESEED_CONFIRM = "overwrite-builtin-roles";

export interface RoleSnapshot {
  id: string;
  exists: boolean;
  builtInKey: string | null;
  locked: boolean;
  permissions: PermissionCode[];
}

export interface ReseedPlan {
  applied: { id: string; changedFields: string[]; proposed: PermissionCode[] }[];
  skipped: { id: string; reason: "locked" | "unchanged" | "not-built-in" }[];
  /** Ids that could not be reseeded — the doc does not exist. `update()` on a missing doc
   *  aborts the WHOLE batch, so these are excluded from the write and surfaced instead.
   *  Fix by running `seedRoles` first. */
  failed: string[];
}

/** Order-insensitive set compare. `permissions` is an unordered capability set, so a
 *  reordered array is NOT a change — writing it would fire onRoleWritten and re-scan the
 *  entire members collection for nothing. Multiset-safe: compares deduped sizes too, so a
 *  doc carrying a duplicate code is correctly seen as different. */
function permsEqual(a: readonly PermissionCode[], b: readonly PermissionCode[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (a.length !== b.length || left.size !== right.size) return false;
  for (const code of left) if (!right.has(code)) return false;
  return true;
}

/** Pure: decide what a reseed would do, given the current role docs. Writes `permissions`
 *  ONLY — never `name`, never `description`. The doc owns display text, which is precisely
 *  what lets this coexist with role renaming: an operator re-running the reseed must not
 *  silently revert every rename. */
export function planRolePermReseed(snapshots: readonly RoleSnapshot[]): ReseedPlan {
  const plan: ReseedPlan = { applied: [], skipped: [], failed: [] };
  for (const snapshot of snapshots) {
    const proposed = BUILT_IN_ROLE_PERMS[snapshot.id as keyof typeof BUILT_IN_ROLE_PERMS];
    if (!proposed) continue;
    if (!snapshot.exists) {
      plan.failed.push(snapshot.id);
      continue;
    }
    if (snapshot.builtInKey !== snapshot.id) {
      plan.skipped.push({ id: snapshot.id, reason: "not-built-in" });
      continue;
    }
    if (snapshot.locked) {
      plan.skipped.push({ id: snapshot.id, reason: "locked" });
      continue;
    }
    if (permsEqual(snapshot.permissions, proposed)) {
      plan.skipped.push({ id: snapshot.id, reason: "unchanged" });
      continue;
    }
    plan.applied.push({ id: snapshot.id, changedFields: ["permissions"], proposed });
  }
  return plan;
}

/** Admin-only: move the LIVE built-in role docs onto the current BUILT_IN_ROLE_PERMS
 *  snapshot. `seedRoles` uses create() and swallows ALREADY_EXISTS by design, so editing
 *  the snapshot alone never reaches production — this is the path that does.
 *
 *  Destructive, so it takes an explicit `confirm` beyond requireAdmin (the same gate the
 *  read-only admin ops use). Supports `dryRun`, which writes nothing and returns the
 *  per-doc before/after.
 *
 *  ONE WriteBatch: the doc-by-doc loop `seedRoles` uses would leave half the role set on
 *  new perms and half on old, with onRoleWritten fan-outs already fired for the first half
 *  and no rollback.
 *
 *  BLAST RADIUS — read apps/beacon/CLAUDE.md before running this in production.
 *  Every applied doc fires onRoleWritten, which scans the ENTIRE members collection for
 *  docs carrying a builtInKey. Run recomputeAllClaims afterwards as the observable backstop. */
export const reseedBuiltInRolePerms = onCall(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    requireAdmin(request);
    const data = (request.data ?? {}) as { confirm?: unknown; dryRun?: unknown };
    const dryRun = data.dryRun === true;
    if (!dryRun && data.confirm !== RESEED_CONFIRM) {
      throw new HttpsError("invalid-argument", `confirm must be "${RESEED_CONFIRM}"`);
    }
    ensureApp();
    const db = getFirestore();
    // Bounded by ROLES.length (9) — no chunk() needed, and asserted by the unit test.
    const snaps = await db.getAll(...ROLES.map((role) => db.doc(`roles/${role}`)));
    const snapshots: RoleSnapshot[] = snaps.map((snap, index) => ({
      id: ROLES[index]!,
      exists: snap.exists,
      builtInKey: typeof snap.get("builtInKey") === "string" ? snap.get("builtInKey") : null,
      locked: snap.get("locked") === true,
      permissions: (snap.get("permissions") ?? []) as PermissionCode[],
    }));
    const plan = planRolePermReseed(snapshots);

    if (dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        preview: plan.applied.map((entry, index) => ({
          id: entry.id,
          current: snapshots.find((s) => s.id === entry.id)?.permissions ?? [],
          proposed: entry.proposed,
          index,
        })),
        applied: [],
        skipped: plan.skipped,
        failed: plan.failed,
      };
    }

    const batch = db.batch();
    for (const entry of plan.applied) {
      // update(), not set(): a missing doc must fail loudly rather than be created with a
      // partial shape. plan.failed already excludes them from the batch.
      batch.update(db.doc(`roles/${entry.id}`), { permissions: entry.proposed });
    }
    if (plan.applied.length > 0) await batch.commit();

    return {
      ok: true as const,
      dryRun: false as const,
      applied: plan.applied.map(({ id, changedFields }) => ({ id, changedFields })),
      skipped: plan.skipped,
      failed: plan.failed,
    };
  },
);
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter beacon exec vitest run src/recompute-claims.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Export the callable**

In `apps/beacon/src/index.ts:442`:

```ts
export { seedRoles, recomputeAllClaims, reseedBuiltInRolePerms } from "./recompute-claims.js";
```

- [ ] **Step 6: Run the beacon gate + dispatch the reviewer**

```bash
pnpm --filter beacon run ci
```
Expected: PASS.

Then dispatch the `firebase-functions-reviewer` subagent on `apps/beacon` — this is a new admin-guarded, destructive callable on the server-side trust boundary, and CLAUDE.md requires it before "done".

- [ ] **Step 7: Commit**

```bash
git add apps/beacon/src/recompute-claims.ts apps/beacon/src/recompute-claims.test.ts apps/beacon/src/index.ts
git commit -m "feat(beacon): add the reseedBuiltInRolePerms admin callable"
```

---

## Task 12: fix the seed contract test and the docs the change falsifies

**Files:**
- Modify: `tests/firestore-rules/seed-contract.test.ts`
- Modify: `docs/data-models.md`
- Modify: `apps/beacon/CLAUDE.md`
- Modify: `packages/auth/CLAUDE.md`

- [ ] **Step 1: Rewrite the seed contract's ally assertions**

`seed-contract.test.ts` proves the exact claims the seed scripts mint satisfy `firestore.rules`. Membership losing `read:Ally` flips one of its allows.

Replace the second test (`"a seed:roles Membership grant can read allies (read:Ally)"`, `:64-67`) with:

```ts
  it("a seed:roles Membership grant is now DENIED allies (Secretaría owns them)", async () => {
    const db = as("mem-uid", { roles: ["Membership"], perms: permsForRoles(["Membership"]) });
    await assertFails(getDoc(doc(db, "allies/a1")));
  });

  it("a seed:roles Membership grant still reads members (manage:Member)", async () => {
    const db = as("mem-uid", { roles: ["Membership"], perms: permsForRoles(["Membership"]) });
    await assertSucceeds(getDoc(doc(db, "members/m1")));
  });

  it("a seed:roles Secretary grant reads allies (manage:Ally covers read)", async () => {
    // The new owner of the ally surface. Proves the seed producer mints a perm the rules
    // actually honour — the PR #107 class of bug, one role over.
    const db = as("sec-uid", { roles: ["Secretary"], perms: permsForRoles(["Secretary"]) });
    await assertSucceeds(getDoc(doc(db, "allies/a1")));
  });

  it("a seed:roles ActivityManager grant is denied members and allies", async () => {
    // Activity-only slice: neither collection is in its capability set.
    const db = as("act-uid", { roles: ["ActivityManager"], perms: permsForRoles(["ActivityManager"]) });
    await assertFails(getDoc(doc(db, "members/m1")));
    await assertFails(getDoc(doc(db, "allies/a1")));
  });
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @luminova/firestore-rules-tests run test
```
Expected: PASS — `seed-contract.test.ts` reports 6 tests.

- [ ] **Step 3: Update `docs/data-models.md`**

Four passages are now false:

- `:85` — "An existing `Scanner` role (event-scoped, set by `setUserRoles`) is preserved and `scannerEventIds` carried through unchanged." → "An existing `Scanner` role (set by `setUserRoles`) is preserved; event scoping was removed, so a Scanner's authority is the coarse `checkIn:Attendance` perm plus the Attendee-only conjunct in `firestore.rules`."
- `:161` — the `members` write column reads "perm-gated (`create/update:Member`); ExecutiveCommittee (positions-only); self (profilePicture only)". Drop the ExecutiveCommittee clause.
- `:170` — the `checkIns` row reads "…`checkIn:Attendance` holders, or Scanner (Attendee-only on assigned activities)…" → "…`checkIn:Attendance` holders; a Scanner among them is confined to `Attendee` rows unless it also holds `manage:Attendance`…".
- `:180` — the numbered "members write rules (three tiers)" list: delete tier 2 (ExecutiveCommittee) and renumber; `:190`'s "positions write rule" paragraph loses its "ExecutiveCommittee may create/update only when `grants` is empty or unchanged" sentence — position writes are `manage:Position` holders only now.
- `:344-345` — "or Scanner (Attendee-only) when `activityId ∈ token.scannerEventIds`" → "a Scanner is confined to `Attendee` rows (`manage:Attendance` is the escape hatch); event scoping was removed".

Add a new bullet under the roles section recording the role set itself:

```md
> **built-in roles:** nine keys — `Admin`, `Membership`, `Treasury`, `ExecutiveCommittee`,
> `ProjectManager`, `ActivityManager`, `Secretary`, `Scanner`, `Member` — with their coarse
> perms in `packages/types/src/role-definition.ts` (`BUILT_IN_ROLE_PERMS`), mirrored for the
> plain-Node seed scripts in `tools/scripts/lib/role-seed.mjs`. `seedRoles` only ever
> CREATES; to move an existing production doc onto a new snapshot run the
> `reseedBuiltInRolePerms` callable (see `apps/beacon/CLAUDE.md`).
```

- [ ] **Step 4: Update `apps/beacon/CLAUDE.md`**

Add a `### reseedBuiltInRolePerms — onCall` subsection under "Functions", after `setUserRoles`:

```md
### `reseedBuiltInRolePerms` — `onCall`

Admin-guarded. Moves the LIVE `roles/{id}` docs onto the current `BUILT_IN_ROLE_PERMS`
snapshot. `seedRoles` uses `create()` and swallows `ALREADY_EXISTS` by design, so editing
the snapshot alone never reaches production — this is the path that does.

- Writes **`permissions` only.** Never `name`, never `description`: the doc owns display
  text, which is what lets a reseed coexist with role renaming. An operator re-running it
  must not silently revert every rename.
- Requires `confirm: "overwrite-builtin-roles"`. `requireAdmin` is the same gate the
  read-only admin ops use; a destructive one should not be one click away.
- `dryRun: true` writes nothing and returns per-doc `{id, current, proposed}`.
- Skips `locked === true`. The admin SDK bypasses the `locked` rule the client is held to,
  so `roles/Admin` is excluded explicitly rather than by assumption.
- One `WriteBatch` (≤ 9 docs, far under the 500 limit). The doc-by-doc loop would leave half
  the role set on new perms and half on old, with fan-outs already fired for the first half
  and no rollback.
- Returns `{ok, dryRun, applied: [{id, changedFields}], skipped, failed}`. `failed` = doc
  does not exist; run `seedRoles` first.

**BLAST RADIUS.** `onRoleWritten` scans the **entire** members collection for any doc
carrying a `builtInKey`. Five roles changing perms means five full scans × N members of
sequential `getUser` plus possible `setCustomUserClaims`, inside a 540 s budget with
`retry: false`. A timeout strands the members not yet reached in that scan. **Operator
instruction: run `recomputeAllClaims` afterwards as the observable backstop.** Re-running
the reseed is free — `roleClaimsChanged` short-circuits a no-op write.
```

- [ ] **Step 5: Update `packages/auth/CLAUDE.md`**

Two passages in "The two-layer model" are now false:

- the "genuinely object-scoped" bullet names "`Scanner`'s `checkIn` limited to `scannerEventIds`" — delete that clause, leaving the `Member` own-uid case;
- the "unconditioned reads that look exactly like coarse perms but aren't" bullet says "and `Scanner` gets `read` on `Activity`" — delete it; `read:Activity` is a coarse perm on `BUILT_IN_ROLE_PERMS.Scanner` now. The same bullet claims `BUILT_IN_ROLE_PERMS.Member` is "deliberately `[]`", which the previous PR already falsified — correct it to list Member's five coarse reads.

Also fix "`ROLES` has 7" in `apps/beacon/src/claims-sync/firestore-deps.ts:73` → "`ROLES` has 9".

- [ ] **Step 6: Commit**

```bash
git add tests/firestore-rules/seed-contract.test.ts docs/data-models.md \
        apps/beacon/CLAUDE.md packages/auth/CLAUDE.md \
        apps/beacon/src/claims-sync/firestore-deps.ts
git commit -m "docs: record the nine-role set, the reseed callable and its blast radius"
```

---

## Task 13: full verification and the deploy-ordering note

- [ ] **Step 1: Run the monorepo gate**

```bash
pnpm pr-tests
```
Expected: PASS. **Known pre-existing failure:** `pnpm audit` reports brace-expansion advisories repo-wide. Not introduced here; do not attempt to fix it in this PR.

If the rules suites fail on a port collision with a running dev emulator, use the repo's emulator-lock wrapper (`.claude`/`tools` script referenced by `pnpm pr-tests`) rather than starting a second emulator by hand.

- [ ] **Step 2: Confirm the removal is total**

```bash
grep -rn "scannerEventIds" apps packages tools tests firestore.rules eslint.config.js
grep -rn "manage:Position" packages/types tools/scripts
```
Expected: the first returns nothing. The second returns only the nav `orCan` / custom-role fixtures — no `BUILT_IN_ROLE_PERMS` hit.

- [ ] **Step 3: Dispatch the two mandated reviewers**

- `firestore-security-reviewer` — this diff changes `firestore.rules` (two lanes, one new function) and the member-write authority tiers.
- `firebase-functions-reviewer` — already dispatched in Task 11; re-dispatch only if `apps/beacon` changed afterwards.

- [ ] **Step 4: Record the deploy ordering in the branch**

Append to `docs/data-models.md`'s role section (or, if the orchestrator prefers, carry it in the PR body only — it must appear in one of the two):

```md
> **Deploy ordering for the nine-role rollout.** Rules and functions deploy separately; one
> PR is not one atomic deploy.
> 1. Deploy **functions** — `reseedBuiltInRolePerms` and the claims-sync changes.
> 2. Run `reseedBuiltInRolePerms` with `dryRun: true`, review the preview, then run it with
>    `confirm: "overwrite-builtin-roles"`.
> 3. Run `recomputeAllClaims` — the observable backstop for members stranded by an
>    `onRoleWritten` timeout.
> 4. Deploy **rules** last.
>
> Rules-before-reseed leaves a window where the CEL positions lane is gone while CEL role
> docs still carry `manage:Position`: the positions form renders for CEL users whose writes
> are already denied — render-then-die. Hosting deploys after the reseed for the same
> reason (a Scanner's UI check-in affordances read the reseeded `perms` claim).
```

- [ ] **Step 5: Commit**

```bash
git add docs/data-models.md
git commit -m "docs: deploy ordering for the nine-role rollout"
```

Hand back to the orchestrator: routing the diff, running the mandated review set, stamping the trailer and opening the PR are its job, not this plan's.

---

## Self-review notes

**Spec coverage.** Role table → Task 4. Labels/descriptions → Tasks 4–5. `.mjs` mirror → Tasks 4–6. Cargo mapping → Task 6. The four hand-written lists → Tasks 1–3 (before the keys, per the spec). C1 + the false comment → Tasks 7 and 10. C2 → Task 8. Scanner scoping removal → Tasks 9–10. Reseed callable → Task 11. Broken tests → Tasks 4, 5, 7, 8, 9, 10, 12. New rules tests → Tasks 7 and 8. Docs → Task 12. `pnpm pr-tests` + deploy ordering → Task 13.

**Type consistency.** `canRemoveEntry(ability, claims, entry)` has the same three-arg shape in its definition (Task 9 Step 7), its test (Step 1) and both call sites (Step 8). `planRolePermReseed(snapshots) → ReseedPlan` matches between Task 11 Steps 1 and 3, including `RoleSnapshot`'s five fields. `PRECEDENCE` is exported in Task 2 Step 3 and imported in Task 2 Step 1.

**Deliberate red-then-green.** Task 1's test is green when written — stated explicitly, with the reason (it is Task 4's regression guard, not Task 1's driver). Every other task's test goes red first.

---

## Concerns

Places where the spec turned out to be wrong about the codebase, or where following it exposes something it did not consider. None of these were silently deviated from — each is resolved in the tasks above as described.

1. **`permissions-overview.ts`'s `MANAGED_ROLES` does not exist.** The spec says "`permissions-overview.ts`'s `MANAGED_ROLES` already derives correctly (`ROLES` minus an explicit unmanaged list). Copy that pattern." That file was **deleted** by PR #216 (`docs/plans/2026-08-02-role-display-single-source.md`, Task 4 Step 9). `grep -rn MANAGED_ROLES apps/backstage/src` returns nothing. The *pattern* is still right and Task 1 applies it; there is just no file to copy it from. The nearest surviving example is `features/permissions/lib/role-overview.ts`, which emits one row per `ROLES` key.

2. **The spec undercounts the ExecutiveCommittee allow→deny flips: six, not three.** The task brief said three. The real set, with line numbers, is `rules.test.ts:1624`, `:1728`, `:1735` (positions collection, EC loses `manage:Position`) and `:1999`, `:2074`, `:2091` (member positions, the EC lane is deleted). Three *further* EC cases — `:2034`, `:2047`, `:2084` — still deny but now for the wrong reason (EC has no member-write lane at all rather than failing the specific guard each names), so Task 7 Step 6 re-points them at a `Membership` principal to keep them testing what they claim. Two additional `assertSucceeds` cases are added so the surviving Admin/Membership authority is not left unproven.

3. **The Scanner `scannerEventIds` blast radius is thirteen sites, not two.** The spec names `set-user-roles.ts` and `ability.ts`. The claim is also read or carried by `packages/auth/src/roles.ts` (`AuthClaims`), `apps/beacon/src/claims-sync/sync.ts`, `firestore-deps.ts`, `provision-member-login.ts`, `apps/backstage/src/lib/authz/claims.ts`, `apps/backstage/src/features/check-in/lib/can-remove-entry.ts`, and `firestore.rules:500,509` — plus six test files. Removing only the two named sites would leave a claim minted by nothing and read by the rules, which is the guardrail-6 lie the spec itself invokes. Tasks 9–10 remove all of them.

4. **The spec's C2 snippet is create-only, and dropping the old Scanner arm would silently lose the phantom-member guard.** The spec gives `request.resource.data.role == 'Attendee'`; the delete arm has no `request.resource`, so it must read `resource.data.role` — Task 8 does. Separately, the `exists(/…/members/$(memberId))` check lived **only** in the Scanner OR-arm the coarse perm makes unreachable. Deleting that arm without moving `exists()` into the new conjunct would let a Scanner create a check-in for a nonexistent member, a narrowing loss the spec does not mention. Task 8 Step 3 moves it, keeping it Scanner-scoped exactly as before.

5. **`eslint.config.js:70` hardcodes the seven role names.** `ROLE_KEY` is a literal regex feeding the "no second role→label map" `no-restricted-syntax` guard. Nothing in the spec mentions it. Left alone, the guard would silently stop covering `ActivityManager` and `Secretary` — a guard that gates less than it claims. Task 4 Step 9 updates it.

6. **`ROLE_LABELS.ProjectManager` is the one label the spec changes, and it is load-bearing in five test assertions.** Eight of the spec's nine `nombre` values match today's labels exactly; `ProjectManager` moves from "Director de Proyecto" to "Proyectos". Read as deliberate (it matches the function-not-person naming of "Actividades"/"Secretaría"), and implemented in its own commit (Task 5) so it can be reverted independently if the intent was only shorthand in the spec's table. **Worth confirming with the user.**

7. **NOT FIXED, and it will be visible on day one: `DashboardPage` unconditionally queries members, allies, activities, memberPoints and initiatives.** `apps/backstage/src/components/overview/dashboard-page.tsx:15-21` fires `useMembers()` with no capability gate, and any one query erroring paints "No se pudo cargar el panel." for the whole page. A `Secretary`-only user holds no `read:Member`, so after Task 1 correctly stops bouncing them to `/me`, they land on `/` and see that error card — the exhaustive layout in Task 2 never gets a chance to matter. `ActivityManager` is in the same position, and so is the **existing** `ProjectManager` (it holds no `read:Member` either), which is why I read this as a pre-existing defect the new roles make more visible rather than one this PR introduces. Fixing it means gating each query on its capability and degrading the model, which is a separate change with its own spec threshold. **Flagging for the orchestrator to decide whether to pull it into this PR or file it.**

8. **`ROLE_DESCRIPTIONS.Treasury` is left saying "Gestionar pagos"** although `Treasury` holds no payment capability (there is no Finance subject yet — the J-track is queued). Out of scope and cosmetic; the doc owns display text and the reseed never writes it. Noted so it is not mistaken for an oversight.
