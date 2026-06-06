# F1 — Roles & Permissions Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the access-control spine — a shared CASL ability model, custom-claim-backed roles, a role-aware `firestore.rules`, and a trusted backend path to grant roles.

**Architecture:** A new built package `@luminova/auth` owns role constants + `AuthClaims` (framework-free, `@luminova/auth/roles`) and the CASL ability builder (`@luminova/auth/ability`). Roles live in Firebase Auth custom claims; rules read `request.auth.token.roles` (zero extra reads); the backstage client decodes the ID token into an `AppAbility`; a beacon `setUserRoles` callable (Admin-guarded) writes claims; a seed script bootstraps the first Admin.

**Tech Stack:** TypeScript 6 (strict, `moduleResolution: bundler`, `verbatimModuleSyntax`), `@casl/ability@7.0.0` + `@casl/react@7.0.0` (pinned exact), Firebase Auth custom claims, Cloud Functions v2 (`onCall`), `@firebase/rules-unit-testing`, Vitest, TanStack Router/Query, Zod.

**Key constraints baked in:**
- `@luminova/auth` **emits JS** (`dist/`) so beacon (tsc→node) can import it at runtime; turbo `^build` ordering already covers dependents (`turbo.json` `ci`/`build`/`typecheck` all `dependsOn: ["^build"]`).
- `ability.ts` imports **only types** from `roles.ts` (`import type`) → emitted `.js` are self-contained, no relative-extension runtime issue.
- Rules unit tests pass custom claims via `env.authenticatedContext(uid, { roles: [...] })`.
- Firestore-rules + functions tests need Java on PATH — prepend inline:
  `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk"`.
- **Known deferral (not this branch):** production functions packaging of workspace deps (beacon bundling). F1 verifies the callable in the **emulator** only, where pnpm symlinks resolve `@luminova/auth`. Matches the roadmap's deferred "functions-deploy packaging".

---

## File Structure

**Create:**
- `packages/auth/package.json` — `@luminova/auth`, built, exports `./roles` + `./ability`.
- `packages/auth/tsconfig.json` — emits to `dist`.
- `packages/auth/src/roles.ts` — `ROLES`, `Role`, `AuthClaims`, plain helpers.
- `packages/auth/src/roles.test.ts`
- `packages/auth/src/ability.ts` — `Action`, `Subject`, `AppAbility`, `buildAbility`.
- `packages/auth/src/ability.test.ts`
- `apps/beacon/src/set-user-roles.ts` — the `setUserRoles` callable.
- `apps/beacon/src/set-user-roles.test.ts`
- `apps/beacon/scripts/seed-roles.ts` — first-Admin bootstrap.
- `apps/backstage/src/lib/authz/claims.ts` — `decodeClaims` pure helper.
- `apps/backstage/src/lib/authz/claims.test.ts`
- `apps/backstage/src/lib/authz/ability-context.tsx` — `AbilityProvider` + `useAbility` + `Can`.

**Modify:**
- `firestore.rules` — role-aware rewrite.
- `tests/firestore-rules/rules.test.ts` — allow/deny matrix per role.
- `apps/beacon/src/index.ts` — export `setUserRoles`.
- `apps/beacon/package.json` — `@luminova/auth` dep + `seed:roles` script.
- `apps/backstage/src/lib/auth/auth-store.ts` — decode claims into `AuthState`.
- `apps/backstage/src/lib/auth/auth-store.test.ts` — claims assertions.
- `apps/backstage/src/lib/router-context.ts` — no change to shape (ability built in provider, not router context) — confirm only.
- `apps/backstage/src/components/app-sidebar.tsx` — gate nav items with `Can`.
- `apps/backstage/src/features/members/components/MemberTable.tsx` (+ allies) — gate row-actions.
- `apps/backstage/package.json` — `@luminova/auth` + `@casl/react` deps.
- root `package.json` — none expected (deps go in workspaces).

---

## Task 1: `@luminova/auth` package skeleton + `roles.ts`

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/roles.ts`
- Test: `packages/auth/src/roles.test.ts`

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@luminova/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./roles": {
      "types": "./src/roles.ts",
      "import": "./dist/roles.js",
      "default": "./dist/roles.js"
    },
    "./ability": {
      "types": "./src/ability.ts",
      "import": "./dist/ability.js",
      "default": "./dist/ability.js"
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
    "@casl/ability": "7.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/auth/tsconfig.json`**

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

- [ ] **Step 3: Write the failing test `packages/auth/src/roles.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ROLES, isValidRole, hasRole, hasAnyRole, type AuthClaims } from "./roles";

describe("roles", () => {
  it("lists the seven permission roles", () => {
    expect(ROLES).toEqual([
      "Admin",
      "Membership",
      "Treasury",
      "ExecutiveCommittee",
      "ProjectManager",
      "Scanner",
      "Member",
    ]);
  });

  it("validates known role names", () => {
    expect(isValidRole("Treasury")).toBe(true);
    expect(isValidRole("isCEL")).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });

  it("hasRole checks a single role", () => {
    const claims: AuthClaims = { roles: ["Membership"] };
    expect(hasRole(claims, "Membership")).toBe(true);
    expect(hasRole(claims, "Admin")).toBe(false);
  });

  it("hasAnyRole checks intersection (additive roles)", () => {
    const claims: AuthClaims = { roles: ["Membership", "ExecutiveCommittee"] };
    expect(hasAnyRole(claims, ["Admin", "ExecutiveCommittee"])).toBe(true);
    expect(hasAnyRole(claims, ["Admin", "Treasury"])).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @luminova/auth test`
Expected: FAIL — cannot resolve `./roles`.

- [ ] **Step 5: Implement `packages/auth/src/roles.ts`**

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

export interface AuthClaims {
  roles: Role[];
  scannerEventIds?: string[];
}

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasRole(claims: AuthClaims, role: Role): boolean {
  return claims.roles.includes(role);
}

export function hasAnyRole(claims: AuthClaims, roles: readonly Role[]): boolean {
  return claims.roles.some((role) => roles.includes(role));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @luminova/auth test`
Expected: PASS (4 tests).

- [ ] **Step 7: Install workspace + build the package**

Run: `pnpm install && pnpm --filter @luminova/auth build`
Expected: install links `@casl/ability@7.0.0`; build emits `packages/auth/dist/roles.js`.

- [ ] **Step 8: Commit**

```bash
git add packages/auth pnpm-lock.yaml
git commit -m "feat(auth): add @luminova/auth package with role contract"
```

---

## Task 2: CASL ability builder (`ability.ts`)

**Files:**
- Create: `packages/auth/src/ability.ts`
- Test: `packages/auth/src/ability.test.ts`

- [ ] **Step 1: Write the failing test `packages/auth/src/ability.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { subject } from "@casl/ability";
import { buildAbility } from "./ability";
import type { AuthClaims } from "./roles";

const UID = "self-uid";
function ability(claims: AuthClaims) {
  return buildAbility(claims, UID);
}

describe("buildAbility", () => {
  it("Admin can manage everything", () => {
    const a = ability({ roles: ["Admin"] });
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("delete", "Member")).toBe(true);
  });

  it("Membership manages members, reads allies/events/points", () => {
    const a = ability({ roles: ["Membership"] });
    expect(a.can("create", "Member")).toBe(true);
    expect(a.can("update", "Member")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("manage", "Payment")).toBe(false);
  });

  it("Treasury manages payments and reads members/points only", () => {
    const a = ability({ roles: ["Treasury"] });
    expect(a.can("manage", "Payment")).toBe(true);
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("ExecutiveCommittee is read-only across the board", () => {
    const a = ability({ roles: ["ExecutiveCommittee"] });
    expect(a.can("read", "Member")).toBe(true);
    expect(a.can("read", "Project")).toBe(true);
    expect(a.can("update", "Member")).toBe(false);
    expect(a.can("create", "Event")).toBe(false);
  });

  it("ProjectManager manages projects and reads allies/events", () => {
    const a = ability({ roles: ["ProjectManager"] });
    expect(a.can("manage", "Project")).toBe(true);
    expect(a.can("read", "Ally")).toBe(true);
    expect(a.can("read", "Event")).toBe(true);
    expect(a.can("manage", "Program")).toBe(false);
    expect(a.can("update", "Member")).toBe(false);
  });

  it("Scanner can check in only assigned events", () => {
    const a = ability({ roles: ["Scanner"], scannerEventIds: ["evt_1"] });
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_1" }))).toBe(true);
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_2" }))).toBe(false);
  });

  it("Scanner with no assigned events cannot check in", () => {
    const a = ability({ roles: ["Scanner"] });
    expect(a.can("checkIn", subject("Attendance", { eventId: "evt_1" }))).toBe(false);
  });

  it("Member can read/update only their own profile", () => {
    const a = ability({ roles: ["Member"] });
    expect(a.can("read", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: UID }))).toBe(true);
    expect(a.can("update", subject("Member", { uid: "other" }))).toBe(false);
    expect(a.can("read", "MemberPoints")).toBe(true);
    expect(a.can("read", "Event")).toBe(true);
  });

  it("additive roles union their abilities", () => {
    const a = ability({ roles: ["Membership", "ProjectManager"] });
    expect(a.can("create", "Member")).toBe(true);
    expect(a.can("manage", "Project")).toBe(true);
  });

  it("no roles grants nothing", () => {
    const a = ability({ roles: [] });
    expect(a.can("read", "Member")).toBe(false);
    expect(a.can("read", "MemberPoints")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/auth test`
Expected: FAIL — cannot resolve `./ability`.

- [ ] **Step 3: Implement `packages/auth/src/ability.ts`**

```ts
import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { AuthClaims, Role } from "./roles";

export type Action = "manage" | "create" | "read" | "update" | "delete" | "checkIn";
export type Subject =
  | "all"
  | "Member"
  | "Ally"
  | "Event"
  | "PointRule"
  | "MemberPoints"
  | "Payment"
  | "Attendance"
  | "Program"
  | "Project"
  | "Activity";

export type AppAbility = MongoAbility<[Action, Subject]>;

type Can = AbilityBuilder<AppAbility>["can"];

function applyRole(role: Role, claims: AuthClaims, uid: string, can: Can): void {
  switch (role) {
    case "Admin":
      can("manage", "all");
      break;
    case "Membership":
      can("manage", "Member");
      can("read", ["Ally", "Event", "MemberPoints"]);
      break;
    case "Treasury":
      can("manage", "Payment");
      can("read", ["Member", "MemberPoints"]);
      break;
    case "ExecutiveCommittee":
      can("read", ["Member", "Ally", "Event", "MemberPoints", "Program", "Project"]);
      break;
    case "ProjectManager":
      can("manage", "Project");
      can("read", ["Ally", "Event"]);
      break;
    case "Scanner":
      can("checkIn", "Attendance", { eventId: { $in: claims.scannerEventIds ?? [] } });
      break;
    case "Member":
      can(["read", "update"], "Member", { uid });
      can("read", ["MemberPoints", "Event", "Project"]);
      break;
  }
}

export function buildAbility(claims: AuthClaims, uid: string): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const role of claims.roles) {
    applyRole(role, claims, uid, builder.can);
  }
  return builder.build();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/auth test`
Expected: PASS (all `buildAbility` tests).

- [ ] **Step 5: Build + typecheck the package**

Run: `pnpm --filter @luminova/auth build && pnpm --filter @luminova/auth run ci`
Expected: emits `dist/ability.js` + `dist/roles.js`; eslint + tsc + vitest clean.

- [ ] **Step 6: Commit**

```bash
git add packages/auth
git commit -m "feat(auth): add CASL ability builder for all roles"
```

---

## Task 3: Role-aware `firestore.rules` + rules tests

**Files:**
- Modify: `firestore.rules`
- Test: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Rewrite the failing tests `tests/firestore-rules/rules.test.ts`**

Replace the file with this (note `authenticatedContext` second arg = custom claims token):

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

function as(uid: string, roles: string[]) {
  return env.authenticatedContext(uid, { roles }).firestore();
}
function anon() {
  return env.unauthenticatedContext().firestore();
}

const MEMBER_DOC = { name: "Ana", totalPoints: 0, uid: "owner-uid", active: true, deletedAt: null };

beforeAll(async () => {
  const rulesPath = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 4010,
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
  // Seed docs bypassing rules for read/update test setup.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members/m1"), MEMBER_DOC);
    await setDoc(doc(db, "allies/a1"), { companyName: "ACME", active: true });
    await setDoc(doc(db, "events/e1"), { title: "Gala" });
    await setDoc(doc(db, "pointRules/r1"), { points: 10 });
    await setDoc(doc(db, "projects/p1"), { title: "P" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("firestore.rules — members", () => {
  it("denies anonymous reads", async () => {
    await assertFails(getDoc(doc(anon(), "members/m1")));
  });
  it("allows board roles to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["ExecutiveCommittee"]), "members/m1")));
  });
  it("allows a member to read their own profile", async () => {
    await assertSucceeds(getDoc(doc(as("owner-uid", ["Member"]), "members/m1")));
  });
  it("denies a member reading another profile", async () => {
    await assertFails(getDoc(doc(as("stranger", ["Member"]), "members/m1")));
  });
  it("allows Membership to create with totalPoints 0", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Membership"]), "members/new1"), { name: "B", totalPoints: 0 }),
    );
  });
  it("denies create when totalPoints != 0", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new2"), { name: "B", totalPoints: 5 }),
    );
  });
  it("denies a non-admin/non-membership role from creating", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Treasury"]), "members/new3"), { name: "B", totalPoints: 0 }),
    );
  });
  it("denies client mutation of totalPoints on update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "members/m1"), { totalPoints: 99 }));
  });
  it("denies client mutation of uid on update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "members/m1"), { uid: "hijack" }));
  });
  it("allows Membership to update a normal field", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Membership"]), "members/m1"), { name: "Ana2" }));
  });
  it("denies hard delete even for Admin", async () => {
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "members/m1")));
  });
});

describe("firestore.rules — allies", () => {
  it("allows ProjectManager to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["ProjectManager"]), "allies/a1")));
  });
  it("denies a plain Member from reading allies", async () => {
    await assertFails(getDoc(doc(as("u", ["Member"]), "allies/a1")));
  });
  it("denies ProjectManager from writing allies", async () => {
    await assertFails(updateDoc(doc(as("u", ["ProjectManager"]), "allies/a1"), { companyName: "X" }));
  });
  it("allows Admin to write allies", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "allies/a1"), { companyName: "X" }));
  });
});

describe("firestore.rules — events", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "events/e1")));
  });
  it("allows ProjectManager to write", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["ProjectManager"]), "events/e1"), { title: "G2" }));
  });
  it("denies Treasury from writing events", async () => {
    await assertFails(updateDoc(doc(as("u", ["Treasury"]), "events/e1"), { title: "G3" }));
  });
});

describe("firestore.rules — pointRules", () => {
  it("allows signed-in read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "pointRules/r1")));
  });
  it("allows Admin write", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "pointRules/r1"), { points: 20 }));
  });
  it("denies non-admin write", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "pointRules/r1"), { points: 20 }));
  });
});

describe("firestore.rules — memberPoints", () => {
  it("allows signed-in read (public to members)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "memberPoints/2025/03/e1")));
  });
  it("denies all client writes", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "memberPoints/2025/03/e1"), { p: 1 }));
  });
});

describe("firestore.rules — public + deny-all", () => {
  it("allows anonymous read of projects", async () => {
    await assertSucceeds(getDoc(doc(anon(), "projects/p1")));
  });
  it("allows anonymous read of board", async () => {
    await assertSucceeds(getDoc(doc(anon(), "board/b1")));
  });
  it("denies access to an unlisted collection", async () => {
    await assertFails(getDoc(doc(as("u", ["Admin"]), "settings/s1")));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk"
pnpm --filter @luminova/firestore-rules-tests test
```
Expected: FAIL — current coarse rules don't enforce role/field guards.

- [ ] **Step 3: Rewrite `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }
    function roles() {
      return request.auth.token.roles;
    }
    function hasAnyRole(rs) {
      return signedIn() && roles().hasAny(rs);
    }
    function unchanged(field) {
      return request.resource.data[field] == resource.data[field];
    }

    match /projects/{projectId} {
      allow read: if true;
      allow create, update: if hasAnyRole(['Admin', 'ProjectManager']);
      allow delete: if false;
    }

    match /board/{boardId} {
      allow read: if true;
      allow create, update: if hasAnyRole(['Admin']);
      allow delete: if false;
    }

    match /members/{memberId} {
      allow read: if hasAnyRole(['Admin', 'Membership', 'Treasury', 'ExecutiveCommittee'])
        || (signedIn() && resource.data.uid == request.auth.uid);
      allow create: if hasAnyRole(['Admin', 'Membership'])
        && request.resource.data.totalPoints == 0;
      allow update: if hasAnyRole(['Admin', 'Membership'])
        && unchanged('totalPoints')
        && unchanged('uid');
      allow delete: if false;
    }

    match /allies/{allyId} {
      allow read: if hasAnyRole(['Admin', 'Membership', 'ProjectManager', 'ExecutiveCommittee']);
      allow create, update: if hasAnyRole(['Admin', 'Membership']);
      allow delete: if false;
    }

    match /events/{eventId} {
      allow read: if signedIn();
      allow create, update: if hasAnyRole(['Admin', 'ExecutiveCommittee', 'ProjectManager']);
      allow delete: if false;
    }

    match /pointRules/{ruleId} {
      allow read: if signedIn();
      allow create, update: if hasAnyRole(['Admin']);
      allow delete: if false;
    }

    match /memberPoints/{document=**} {
      allow read: if signedIn();
      allow write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk"
pnpm --filter @luminova/firestore-rules-tests test
```
Expected: PASS (all describe blocks). If Java is unavailable in the shell, note it and continue — CI/manual run covers it.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): role-aware firestore.rules with field + delete guards"
```

---

## Task 4: beacon `setUserRoles` callable

**Files:**
- Create: `apps/beacon/src/set-user-roles.ts`
- Test: `apps/beacon/src/set-user-roles.test.ts`
- Modify: `apps/beacon/src/index.ts`
- Modify: `apps/beacon/package.json`

- [ ] **Step 1: Add `@luminova/auth` to `apps/beacon/package.json`**

Add to `dependencies` (keep firebase-admin/functions exact):

```json
"@luminova/auth": "workspace:*"
```

And add to `scripts`:

```json
"seed:roles": "node --experimental-strip-types scripts/seed-roles.ts"
```

Then run `pnpm install`.

- [ ] **Step 2: Write the failing test `apps/beacon/src/set-user-roles.test.ts`**

The callable's pure core is `validateSetRolesInput`. Test it directly (no emulator needed for unit level); the emulator e2e is manual.

```ts
import { describe, expect, it } from "vitest";
import { validateSetRolesInput } from "./set-user-roles";

describe("validateSetRolesInput", () => {
  it("accepts a valid Admin grant", () => {
    const r = validateSetRolesInput({ targetUid: "u1", roles: ["Admin"] });
    expect(r).toEqual({ targetUid: "u1", roles: ["Admin"], scannerEventIds: undefined });
  });

  it("accepts Scanner with scannerEventIds", () => {
    const r = validateSetRolesInput({
      targetUid: "u1",
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
    expect(r.scannerEventIds).toEqual(["evt_1"]);
  });

  it("rejects an empty targetUid", () => {
    expect(() => validateSetRolesInput({ targetUid: "", roles: ["Admin"] })).toThrow();
  });

  it("rejects unknown role names", () => {
    expect(() => validateSetRolesInput({ targetUid: "u1", roles: ["isCEL"] })).toThrow();
  });

  it("rejects scannerEventIds without the Scanner role", () => {
    expect(() =>
      validateSetRolesInput({ targetUid: "u1", roles: ["Member"], scannerEventIds: ["evt_1"] }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter beacon test`
Expected: FAIL — cannot resolve `./set-user-roles`.

- [ ] **Step 4: Implement `apps/beacon/src/set-user-roles.ts`**

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { ROLES, isValidRole, type Role } from "@luminova/auth/roles";

export interface SetUserRolesInput {
  targetUid: string;
  roles: Role[];
  scannerEventIds?: string[];
}

interface RawInput {
  targetUid?: unknown;
  roles?: unknown;
  scannerEventIds?: unknown;
}

export function validateSetRolesInput(data: unknown): SetUserRolesInput {
  const raw = (data ?? {}) as RawInput;

  if (typeof raw.targetUid !== "string" || raw.targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "targetUid is required");
  }
  if (!Array.isArray(raw.roles) || raw.roles.length === 0) {
    throw new HttpsError("invalid-argument", "roles must be a non-empty array");
  }
  for (const role of raw.roles) {
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", `unknown role: ${String(role)}`);
    }
  }
  const roles = raw.roles as Role[];

  let scannerEventIds: string[] | undefined;
  if (raw.scannerEventIds !== undefined) {
    if (!Array.isArray(raw.scannerEventIds) || raw.scannerEventIds.some((id) => typeof id !== "string")) {
      throw new HttpsError("invalid-argument", "scannerEventIds must be a string array");
    }
    if (!roles.includes("Scanner")) {
      throw new HttpsError("invalid-argument", "scannerEventIds requires the Scanner role");
    }
    scannerEventIds = raw.scannerEventIds as string[];
  }

  return { targetUid: raw.targetUid, roles, scannerEventIds };
}

function adminAuth() {
  if (!getApps().length) initializeApp();
  return getAuth();
}

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles) ? (token.roles as string[]) : [];
}

export const setUserRoles = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }

  const input = validateSetRolesInput(request.data);
  void ROLES; // contract anchor: roles validated against @luminova/auth/roles

  await adminAuth().setCustomUserClaims(input.targetUid, {
    roles: input.roles,
    scannerEventIds: input.scannerEventIds,
  });

  return { ok: true as const };
});
```

> Note: the `void ROLES;` line is intentional only if eslint flags `ROLES` as unused; if `isValidRole` already imports cleanly without the unused-`ROLES` warning, **remove the `ROLES` import and the `void ROLES;` line**. Prefer removing — keep the import surface minimal.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter beacon test`
Expected: PASS (5 `validateSetRolesInput` tests).

- [ ] **Step 6: Export the callable from `apps/beacon/src/index.ts`**

Add at the end of the file:

```ts
export { setUserRoles } from "./set-user-roles";
```

- [ ] **Step 7: Build + CI beacon**

Run: `pnpm --filter @luminova/auth build && pnpm --filter beacon run ci`
Expected: tsc resolves `@luminova/auth/roles`; eslint + tsc + vitest clean.

- [ ] **Step 8: Commit**

```bash
git add apps/beacon/src/set-user-roles.ts apps/beacon/src/set-user-roles.test.ts apps/beacon/src/index.ts apps/beacon/package.json pnpm-lock.yaml
git commit -m "feat(beacon): add Admin-guarded setUserRoles callable"
```

---

## Task 5: First-Admin bootstrap seed script

**Files:**
- Create: `apps/beacon/scripts/seed-roles.ts`

- [ ] **Step 1: Implement `apps/beacon/scripts/seed-roles.ts`**

Emulator-guarded (refuses to run unless `FIREBASE_AUTH_EMULATOR_HOST` is set), mirroring the existing seed guard pattern.

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isValidRole, type Role } from "@luminova/auth/roles";

function assertEmulator(): void {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is not set (this script is emulator-only).",
    );
  }
}

async function main(): Promise<void> {
  assertEmulator();

  const [uid, ...roleArgs] = process.argv.slice(2);
  if (!uid || roleArgs.length === 0) {
    throw new Error("Usage: pnpm --filter beacon seed:roles -- <uid> <Role> [Role...]");
  }
  for (const role of roleArgs) {
    if (!isValidRole(role)) throw new Error(`unknown role: ${role}`);
  }
  const roles = roleArgs as Role[];

  if (!getApps().length) initializeApp({ projectId: "demo-rules-test" });
  await getAuth().setCustomUserClaims(uid, { roles });

  // eslint-disable-next-line no-console
  console.log(`Granted ${roles.join(", ")} to ${uid}`);
}

void main();
```

- [ ] **Step 2: Verify it refuses to run outside the emulator**

Run: `pnpm --filter beacon seed:roles -- some-uid Admin`
Expected: throws "Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is not set".

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter beacon typecheck`
Expected: clean (scripts dir included by beacon tsconfig — if `scripts/` is outside `include`, add it to `apps/beacon/tsconfig.json` `include`).

- [ ] **Step 4: Commit**

```bash
git add apps/beacon/scripts/seed-roles.ts apps/beacon/tsconfig.json
git commit -m "feat(beacon): add emulator-guarded first-Admin seed script"
```

---

## Task 6: backstage — decode claims in the auth store

**Files:**
- Create: `apps/backstage/src/lib/authz/claims.ts`
- Test: `apps/backstage/src/lib/authz/claims.test.ts`
- Modify: `apps/backstage/src/lib/auth/auth-store.ts`
- Modify: `apps/backstage/src/lib/auth/auth-store.test.ts`
- Modify: `apps/backstage/package.json`

- [ ] **Step 1: Add deps to `apps/backstage/package.json`**

Add to `dependencies`:

```json
"@luminova/auth": "workspace:*",
"@casl/react": "7.0.0"
```

(`@casl/ability` comes transitively via `@luminova/auth`; `@casl/react` peer-needs it.) Run `pnpm install`.

- [ ] **Step 2: Write the failing test `apps/backstage/src/lib/authz/claims.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { decodeClaims } from "./claims";

describe("decodeClaims", () => {
  it("returns empty roles for null token claims", () => {
    expect(decodeClaims(null)).toEqual({ roles: [] });
    expect(decodeClaims(undefined)).toEqual({ roles: [] });
  });

  it("keeps only valid role names", () => {
    expect(decodeClaims({ roles: ["Admin", "bogus", "Treasury"] })).toEqual({
      roles: ["Admin", "Treasury"],
    });
  });

  it("passes through scannerEventIds when present", () => {
    expect(decodeClaims({ roles: ["Scanner"], scannerEventIds: ["evt_1"] })).toEqual({
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
  });

  it("ignores a non-array roles claim", () => {
    expect(decodeClaims({ roles: "Admin" })).toEqual({ roles: [] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter backstage test src/lib/authz/claims.test.ts`
Expected: FAIL — cannot resolve `./claims`.

- [ ] **Step 4: Implement `apps/backstage/src/lib/authz/claims.ts`**

```ts
import { isValidRole, type AuthClaims, type Role } from "@luminova/auth/roles";

export function decodeClaims(tokenClaims: Record<string, unknown> | null | undefined): AuthClaims {
  if (!tokenClaims || !Array.isArray(tokenClaims.roles)) {
    return { roles: [] };
  }
  const roles = tokenClaims.roles.filter((r): r is Role => isValidRole(r));
  const rawEventIds = tokenClaims.scannerEventIds;
  const scannerEventIds =
    Array.isArray(rawEventIds) && rawEventIds.every((id) => typeof id === "string")
      ? (rawEventIds as string[])
      : undefined;
  return scannerEventIds ? { roles, scannerEventIds } : { roles };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter backstage test src/lib/authz/claims.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Extend the auth store to carry claims**

Replace `apps/backstage/src/lib/auth/auth-store.ts` with:

```ts
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import type { AuthClaims } from "@luminova/auth/roles";
import { decodeClaims } from "../authz/claims";

type AuthStatus = "pending" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  claims: AuthClaims;
}

export interface AuthStore {
  ready: Promise<void>;
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
}

const READY_TIMEOUT_MS = 8000;
const EMPTY_CLAIMS: AuthClaims = { roles: [] };

export function createAuthStore(auth: Auth, readyTimeoutMs: number = READY_TIMEOUT_MS): AuthStore {
  let state: AuthState = { status: "pending", user: null, claims: EMPTY_CLAIMS };
  const listeners = new Set<() => void>();
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const timer = setTimeout(() => resolveReady(), readyTimeoutMs);
  (timer as { unref?: () => void }).unref?.();

  function emit(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  onAuthStateChanged(auth, (user) => {
    clearTimeout(timer);
    if (!user) {
      emit({ status: "unauthenticated", user: null, claims: EMPTY_CLAIMS });
      resolveReady();
      return;
    }
    emit({ status: "authenticated", user, claims: EMPTY_CLAIMS });
    resolveReady();
    void user
      .getIdTokenResult()
      .then((result) => {
        if (state.user === user) {
          emit({ status: "authenticated", user, claims: decodeClaims(result.claims) });
        }
      })
      .catch(() => {
        /* keep empty claims on token failure */
      });
  });

  return {
    ready,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 7: Update `apps/backstage/src/lib/auth/auth-store.test.ts`**

Update the mock so emitted users carry `getIdTokenResult`, and add claims assertions. Replace the mock block and the two user-emitting tests:

Change the mock + add a helper user factory at the top (after the existing `vi.mock`):

```ts
function fakeUser(uid: string, claims: Record<string, unknown> = {}): User {
  return {
    uid,
    getIdTokenResult: () => Promise.resolve({ claims } as never),
  } as unknown as User;
}
```

Update the "starts in pending" expectation to include claims:

```ts
expect(store.getState()).toEqual({ status: "pending", user: null, claims: { roles: [] } });
```

Update "becomes authenticated" to use `fakeUser` and assert the synchronous state then the async claims:

```ts
it("becomes authenticated when a user is emitted", () => {
  const store = createAuthStore({} as Auth);
  const user = fakeUser("u1");
  lastCallback()(user);
  expect(store.getState()).toEqual({ status: "authenticated", user, claims: { roles: [] } });
});

it("decodes roles from the id token after emission", async () => {
  const store = createAuthStore({} as Auth);
  const user = fakeUser("u1", { roles: ["Treasury"] });
  lastCallback()(user);
  await Promise.resolve();
  await Promise.resolve();
  expect(store.getState().claims).toEqual({ roles: ["Treasury"] });
});
```

Update "becomes unauthenticated" and "notifies subscribers" to include `claims: { roles: [] }` / use `fakeUser`:

```ts
it("becomes unauthenticated when null is emitted", () => {
  const store = createAuthStore({} as Auth);
  lastCallback()(null);
  expect(store.getState()).toEqual({ status: "unauthenticated", user: null, claims: { roles: [] } });
});

it("notifies subscribers on change", () => {
  const store = createAuthStore({} as Auth);
  const listener = vi.fn();
  store.subscribe(listener);
  lastCallback()(fakeUser("u1"));
  expect(listener).toHaveBeenCalledTimes(1);
});
```

The "ready via timeout" test still asserts `status` is `"pending"` — leave it, it remains true.

- [ ] **Step 8: Run the auth-store + claims tests**

Run: `pnpm --filter @luminova/auth build && pnpm --filter backstage test src/lib/auth/auth-store.test.ts src/lib/authz/claims.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backstage/src/lib/authz/claims.ts apps/backstage/src/lib/authz/claims.test.ts apps/backstage/src/lib/auth/auth-store.ts apps/backstage/src/lib/auth/auth-store.test.ts apps/backstage/package.json pnpm-lock.yaml
git commit -m "feat(backstage): decode role claims into the auth store"
```

---

## Task 7: backstage — ability context, `<Can>`, and affordance gating

**Files:**
- Create: `apps/backstage/src/lib/authz/ability-context.tsx`
- Test: `apps/backstage/src/lib/authz/ability-context.test.tsx`
- Modify: `apps/backstage/src/routes/__root.tsx`
- Modify: `apps/backstage/src/components/app-sidebar.tsx`
- Modify: `apps/backstage/src/features/members/components/MemberTable.tsx`
- Modify: `apps/backstage/src/features/allies/components/AllyTable.tsx`

- [ ] **Step 1: Write the failing test `apps/backstage/src/lib/authz/ability-context.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import { AbilityProvider, Can } from "./ability-context";

function renderWith(claims: AuthClaims) {
  return render(
    <AbilityProvider claims={claims} uid="self">
      <Can I="create" a="Member">
        <span>can-create-member</span>
      </Can>
      <Can not I="create" a="Member">
        <span>cannot-create-member</span>
      </Can>
    </AbilityProvider>,
  );
}

describe("AbilityProvider + Can", () => {
  it("renders the allowed branch for Membership", () => {
    renderWith({ roles: ["Membership"] });
    expect(screen.getByText("can-create-member")).toBeTruthy();
    expect(screen.queryByText("cannot-create-member")).toBeNull();
  });

  it("renders the denied branch for a plain Member", () => {
    renderWith({ roles: ["Member"] });
    expect(screen.queryByText("can-create-member")).toBeNull();
    expect(screen.getByText("cannot-create-member")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test src/lib/authz/ability-context.test.tsx`
Expected: FAIL — cannot resolve `./ability-context`.

- [ ] **Step 3: Implement `apps/backstage/src/lib/authz/ability-context.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createContextualCan } from "@casl/react";
import { buildAbility, type AppAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";

const AbilityContext = createContext<AppAbility>(buildAbility({ roles: [] }, ""));

export function AbilityProvider({
  claims,
  uid,
  children,
}: {
  claims: AuthClaims;
  uid: string;
  children: ReactNode;
}) {
  const ability = useMemo(() => buildAbility(claims, uid), [claims, uid]);
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

export function useAbility(): AppAbility {
  return useContext(AbilityContext);
}

export const Can = createContextualCan(AbilityContext.Consumer);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage test src/lib/authz/ability-context.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount `AbilityProvider` in `__root.tsx`**

Wrap the app in the provider, fed by the auth store. Replace `apps/backstage/src/routes/__root.tsx` with:

```tsx
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RouterContext } from "../lib/router-context";
import { queryClient } from "../lib/query-client";
import { useAuth } from "../lib/auth/auth";
import { AbilityProvider } from "../lib/authz/ability-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { user, claims } = useAuth();
  return (
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid={user?.uid ?? ""}>
        <Outlet />
      </AbilityProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Gate sidebar nav items with role checks**

Read `apps/backstage/src/components/app-sidebar.tsx` and its `nav-config.ts`. For each nav item that maps to a write-surface, wrap the rendered `<NavItem>` (or filter the config) with an ability check. Minimal approach: import `useAbility` and hide "Miembros"/"Aliados" management entries the active role cannot at least `read`. Example pattern to apply (adapt to the actual JSX):

```tsx
import { useAbility } from "../lib/authz/ability-context";
// inside the component:
const ability = useAbility();
// when rendering a nav item bound to subject S:
// {ability.can("read", S) && <NavItem .../>}
```

For F1, gate at minimum: Members nav requires `can("read","Member")`, Allies nav requires `can("read","Ally")`. Leave Overview ungated.

- [ ] **Step 7: Gate table row-actions with `<Can>`**

In `MemberTable.tsx`, wrap the edit/delete action buttons:

```tsx
import { Can } from "../../../lib/authz/ability-context";
// edit button:
<Can I="update" a="Member">{/* existing edit button */}</Can>
// delete button:
<Can I="delete" a="Member">{/* existing delete button */}</Can>
```

In `AllyTable.tsx`, same with subject `"Ally"` (`update`/`delete`). Keep the buttons' existing markup inside the `<Can>` wrapper.

> If `MemberTable`/`AllyTable` receive action handlers as props and rendering them conditionally would leave an empty actions column, that's acceptable — the column header can stay; an empty cell renders for read-only roles.

- [ ] **Step 8: Typecheck + run the full backstage suite**

Run: `pnpm --filter @luminova/auth build && pnpm --filter backstage run ci`
Expected: prettier + eslint + tsc + build + vitest + knip + size-limit clean. If knip flags `@casl/react` as unused, confirm it's imported in `ability-context.tsx` (it is) — knip should pass.

- [ ] **Step 9: Commit**

```bash
git add apps/backstage/src/lib/authz apps/backstage/src/routes/__root.tsx apps/backstage/src/components/app-sidebar.tsx apps/backstage/src/features/members/components/MemberTable.tsx apps/backstage/src/features/allies/components/AllyTable.tsx
git commit -m "feat(backstage): role-aware ability context and affordance gating"
```

---

## Task 8: Full verification + security review

**Files:** none (verification only)

- [ ] **Step 1: Workspace-wide build + CI**

Run: `pnpm build && pnpm pr-tests`
Expected: all package CIs green. The `firestore-rules-tests` step needs Java — if the non-interactive shell lacks it, run that one with the inline PATH export (Task 3 Step 4) and note the result.

- [ ] **Step 2: Manual emulator e2e**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk"
firebase emulators:start
```
In another shell: create an Auth user via the emulator REST `accounts:signUp` (port 4030), grant it Admin via `pnpm --filter beacon seed:roles -- <uid> Admin` (with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:4030`), then verify: (a) the callable rejects a non-Admin caller, (b) an Admin caller grants Treasury, (c) a Treasury user cannot write `members` but an Admin can. Record results.

- [ ] **Step 3: Dispatch read-only reviewers**

Dispatch `firestore-security-reviewer` (rules + repository access alignment) and `firebase-functions-reviewer` (the callable). Address any Critical/High findings before PR.

- [ ] **Step 4: `/security-review` on the branch diff**

Run `/security-review`. Triggers match (auth + rules + Cloud Function). Address Critical/High.

- [ ] **Step 5: Update the design memory note**

Append an F1-done summary to `project-luminova-v2.md` (what shipped, gotchas, deferred items) and the roadmap F1 row.

- [ ] **Step 6: Open the PR**

```bash
gh pr create --base main --title "feat: roles & permissions foundation (F1)" --body "..."
```
Body uses the repo PR template (Summary + Test plan with `/security-review` checkbox). Then run `pnpm pr-tests` once more locally.

---

## Self-Review notes

- **Spec coverage:** §1 roles → Task 1; §2 ability → Task 2; §3 rules → Task 3; §4 callable+bootstrap → Tasks 4–5; §5 integration+testing → Tasks 6–7; verification/reviews → Task 8. All sections covered.
- **Type consistency:** `AuthClaims`/`Role` defined in Task 1 used identically in Tasks 2,4,5,6,7; `AppAbility`/`buildAbility` defined Task 2 used in Task 7; `decodeClaims` defined Task 6 used in auth-store same task. `validateSetRolesInput` defined and tested in Task 4.
- **Known deferrals (flagged, not bugs):** production functions packaging of `@luminova/auth` (emulator-only in F1); forced claim refresh mid-session; `projects`/`board` public-read restriction (G2); role-assignment UI (D4); member self-login wiring (B1).
</content>
