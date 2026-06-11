# Member Roles K4 — Claims Sync, Edit Page, Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final K-track slice — a beacon trigger that recomputes member custom claims from current-term position grants (gated so only Admin-authored power assignments confer power), a full member edit page with per-term history and an effective-permissions panel, ExecutiveCommittee positions-only editing, category-colored cargo chips in the table, and removal of the legacy `Member.role` field.

**Architecture:** Position assignments gain a `assignedBy` audit field (uid of the writer). Two independent layers gate escalation: (1) `firestore.rules` forces `assignedBy == request.auth.uid` and lets non-Admins assign only empty-`grants` cargos (via `get()` on the position); (2) the beacon `onMemberWritten` trigger re-resolves `assignedBy`'s live claims and honors power grants only when that uid is Admin. The trigger uses a port + in-memory-fake pattern (mirroring `award-points/process.ts`) so its logic is fully unit-tested; a manual emulator run is the e2e. Org roles flow only from positions; the `Scanner` role (event-scoped, set by `setUserRoles`) is preserved.

**Tech Stack:** Firebase Cloud Functions (firebase-admin, Node 24, NodeNext ESM), Firestore + `@firebase/rules-unit-testing`, React 19, TanStack Router/Query v5, RHF + Zod, CASL, `@luminova/ui`, vitest.

**Spec:** `docs/specs/2026-06-10-member-roles-invitations-design.md` (see "K4 Addendum").

**Worktree / branch:** `.worktrees/member-roles`, branch `feat/k4-claims-permissions` (already created off main). **Before every commit run `git branch --show-current` — the working tree is shared and the branch can change underneath you.**

---

## File structure

**Create:**
- `apps/beacon/src/claims-sync/compute-roles.ts` — pure role-set computation (+ `.test.ts`)
- `apps/beacon/src/claims-sync/sync.ts` — `ClaimsSyncDeps` port + `syncMemberClaims` orchestration + `resolveTrustedGrants` (+ `.test.ts`)
- `apps/beacon/src/claims-sync/firestore-deps.ts` — admin-SDK impl of `ClaimsSyncDeps`
- `apps/backstage/src/features/members/components/member-cargo-chips.tsx` — category-colored chips (+ `.test.tsx`)
- `apps/backstage/src/features/members/components/member-permissions-panel.tsx` — effective-abilities panel (+ `.test.tsx`)
- `apps/backstage/src/features/members/components/member-position-history.tsx` — read-only per-term timeline (+ `.test.tsx`)
- `apps/backstage/src/features/members/components/member-positions-form.tsx` — EC positions-only editor (+ `.test.tsx`)
- `apps/backstage/src/features/members/lib/member-permissions.ts` — `effectiveRoles()` pure derivation (+ `.test.ts`)
- `apps/backstage/src/features/members/hooks/use-set-member-positions.ts` — positions-only mutation hook

**Modify:**
- `packages/types/src/position.ts` — `TermPositions.assignedBy?`
- `packages/types/src/member.ts` — drop `role`
- `apps/beacon/src/index.ts` — export `onMemberWritten`
- `apps/beacon/src/index.test.ts` — assert export
- `firestore.rules` — `members` update gates
- `tests/firestore-rules/rules.test.ts` — assignedBy + power-cargo gate tests (and update K2 EC tests)
- `apps/backstage/src/features/members/repositories/member-mapper.ts` — stamp `assignedBy`, drop `role`
- `apps/backstage/src/features/members/repositories/member-mapper.test.ts`
- `apps/backstage/src/features/members/repositories/member-repository.ts` — pass current uid; `setPositions()`
- `apps/backstage/src/features/members/lib/member-display.ts` — drop `role` fallback
- `apps/backstage/src/features/members/lib/member-display.test.ts`
- `apps/backstage/src/features/members/lib/member-filter.ts` — resolved-label search
- `apps/backstage/src/features/members/lib/member-filter.test.ts`
- `apps/backstage/src/features/members/components/member-table.tsx` — chips column
- `apps/backstage/src/routes/_app.members.tsx` — pass `positionsById`, resolved-label filter
- `apps/backstage/src/routes/_app.members_.$memberId.tsx` — edit form + history + panel
- `docs/data-models.md`, `docs/firebase-setup.md`

## Verification commands

- Types: `pnpm --filter @luminova/types test`
- Beacon units: `pnpm --filter beacon run ci` (eslint → tsc → vitest)
- Backstage: `pnpm --filter backstage exec vitest run <path>`
- Auth: `pnpm --filter @luminova/auth test`
- **Rules (emulator already running — user's case):** `pnpm --filter @luminova/firestore-rules-tests run test:run`
- **Rules (no emulator running):** `pnpm --filter @luminova/firestore-rules-tests run test` (spawns its own Firestore emulator)
- Full gate **without racing running emulators:** `turbo run ci --filter='!@luminova/firestore-rules-tests' --filter='!@luminova/storage-rules-tests'` then the rules command above separately.

---

## Phase A — Data model + claims engine (beacon)

### Task 1: `assignedBy` on `TermPositions`

**Files:**
- Modify: `packages/types/src/position.ts:23-27`
- Test: `packages/types/src/position.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `packages/types/src/position.test.ts`:

```ts
import type { TermPositions } from "./position";

describe("TermPositions.assignedBy", () => {
  it("accepts an optional assignedBy uid", () => {
    const term: TermPositions = { cargoId: "p1", comisionIds: [], assignedBy: "uid-1" };
    expect(term.assignedBy).toBe("uid-1");
  });
  it("allows omitting assignedBy (legacy K2 docs)", () => {
    const term: TermPositions = { cargoId: null, comisionIds: [] };
    expect(term.assignedBy).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @luminova/types test position.test`
Expected: FAIL — `assignedBy` not assignable on `TermPositions` (TS error).

- [ ] **Step 3: Implement** — in `packages/types/src/position.ts` replace the `TermPositions` interface:

```ts
/** A member's assignments within one term: at most one cargo + any comisiones. */
export interface TermPositions {
  cargoId: string | null;
  comisionIds: string[];
  /** Uid of whoever wrote this term's assignment. Drives the claims-sync trust
   *  gate: power grants are honored only when this uid is an Admin. Absent on
   *  pre-K4 (K2) docs → treated as untrusted (power grants dropped). */
  assignedBy?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types test position.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect feat/k4-claims-permissions
git add packages/types/src/position.ts packages/types/src/position.test.ts
git commit -m "feat(types): assignedBy audit field on TermPositions"
```

### Task 2: Pure `computeMemberRoles`

**Files:**
- Create: `apps/beacon/src/claims-sync/compute-roles.ts`
- Test: `apps/beacon/src/claims-sync/compute-roles.test.ts`

Beacon uses NodeNext ESM — relative imports need explicit `.js`. `Role`/`ROLES` come from `@luminova/auth/roles` (already a beacon dependency).

- [ ] **Step 1: Write the failing test** — `apps/beacon/src/claims-sync/compute-roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeMemberRoles } from "./compute-roles.js";

describe("computeMemberRoles", () => {
  it("always includes Member", () => {
    expect(computeMemberRoles({ trustedGrants: [], hadScanner: false })).toEqual(["Member"]);
  });
  it("unions trusted grants with Member, in ROLES order, deduped", () => {
    expect(
      computeMemberRoles({ trustedGrants: ["Membership", "Admin", "Membership"], hadScanner: false }),
    ).toEqual(["Admin", "Membership", "Member"]);
  });
  it("preserves Scanner when previously present", () => {
    expect(computeMemberRoles({ trustedGrants: ["Treasury"], hadScanner: true })).toEqual([
      "Treasury",
      "Scanner",
      "Member",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/compute-roles.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `apps/beacon/src/claims-sync/compute-roles.ts`:

```ts
import { ROLES, type Role } from "@luminova/auth/roles";

/** Org roles flow only from positions; Scanner (event-scoped, set by
 *  setUserRoles) is preserved when it was already present. Output is ordered by
 *  ROLES so equality checks against existing claims are stable. */
export function computeMemberRoles(input: {
  trustedGrants: Role[];
  hadScanner: boolean;
}): Role[] {
  const set = new Set<Role>(["Member", ...input.trustedGrants]);
  if (input.hadScanner) set.add("Scanner");
  return ROLES.filter((role) => set.has(role));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/compute-roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/beacon/src/claims-sync/compute-roles.ts apps/beacon/src/claims-sync/compute-roles.test.ts
git commit -m "feat(beacon): computeMemberRoles pure helper"
```

### Task 3: Trust gate + sync orchestration (port + fake)

**Files:**
- Create: `apps/beacon/src/claims-sync/sync.ts`
- Test: `apps/beacon/src/claims-sync/sync.test.ts`

This is the security core. `syncMemberClaims` runs against a `ClaimsSyncDeps` port; the test drives it with an in-memory fake (no emulator) — exactly the `award-points/process.ts` pattern. **This is where the blocking escalation test lives.**

- [ ] **Step 1: Write the failing test** — `apps/beacon/src/claims-sync/sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { syncMemberClaims, type ClaimsSyncDeps } from "./sync.js";

type Claims = { roles: Role[]; scannerEventIds?: string[] };

function fakeDeps(opts: {
  positions: Record<string, { grants: Role[] }>;
  userRoles: Record<string, Role[]>;
  existing: Record<string, Claims>;
}) {
  const writes: Record<string, Claims> = {};
  const deps: ClaimsSyncDeps = {
    getPosition: async (id) => opts.positions[id] ?? null,
    getUserRoles: async (uid) => opts.userRoles[uid] ?? [],
    getExistingClaims: async (uid) => opts.existing[uid] ?? { roles: [] },
    setClaims: async (uid, claims) => {
      writes[uid] = claims;
    },
  };
  return { deps, writes };
}

describe("syncMemberClaims", () => {
  it("BLOCKING: Membership assigns Presidente cargo → no Admin claim", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "membership-uid": ["Membership", "Member"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "membership-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toBeUndefined(); // already ['Member'] → no-op
  });

  it("honors power grants when assignedBy is Admin", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "admin-uid": ["Admin", "Member"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Admin", "Member"] });
  });

  it("drops power grants when assignedBy is missing (legacy doc)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: {},
      existing: { "target-uid": { roles: ["Admin", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] }); // Admin revoked
  });

  it("preserves Scanner + scannerEventIds while recomputing org roles", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member", "Scanner"], scannerEventIds: ["e1"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-tes", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({
      roles: ["Treasury", "Scanner", "Member"],
      scannerEventIds: ["e1"],
    });
  });

  it("no-ops when member has no uid (not provisioned)", async () => {
    const { deps, writes } = fakeDeps({ positions: {}, userRoles: {}, existing: {} });
    await syncMemberClaims(deps, { positions: { "2026": { cargoId: "x", comisionIds: [] } } }, "2026");
    expect(writes).toEqual({});
  });

  it("revokes to ['Member'] when the current-term cargo is cleared", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Treasury", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: null, comisionIds: [], assignedBy: "admin-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/sync.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `apps/beacon/src/claims-sync/sync.ts`:

```ts
import type { Role } from "@luminova/auth/roles";
import type { TermPositions } from "@luminova/types";
import { computeMemberRoles } from "./compute-roles.js";

export interface ClaimsSyncDeps {
  /** Catalog position by id, or null if missing/deleted. */
  getPosition(id: string): Promise<{ grants: Role[] } | null>;
  /** The assigner's current claim roles (for the power-grant trust gate). */
  getUserRoles(uid: string): Promise<Role[]>;
  /** The target member's existing custom claims. */
  getExistingClaims(uid: string): Promise<{ roles: Role[]; scannerEventIds?: string[] }>;
  setClaims(uid: string, claims: { roles: Role[]; scannerEventIds?: string[] }): Promise<void>;
}

type MemberLike = { uid?: string; positions?: Record<string, TermPositions> };

/** Union of grants from the term's positions, gating power-conferring positions
 *  (non-empty grants) on an Admin `assignedBy`. The assigner lookup is performed
 *  at most once and only when a power position is actually present. */
async function resolveTrustedGrants(
  deps: ClaimsSyncDeps,
  positionIds: string[],
  assignedBy: string | undefined,
): Promise<Role[]> {
  const grants = new Set<Role>();
  let assignerIsAdmin: boolean | null = null;
  for (const id of positionIds) {
    const position = await deps.getPosition(id);
    if (!position || position.grants.length === 0) continue;
    if (assignerIsAdmin === null) {
      assignerIsAdmin = assignedBy ? (await deps.getUserRoles(assignedBy)).includes("Admin") : false;
    }
    if (assignerIsAdmin) for (const grant of position.grants) grants.add(grant);
  }
  return [...grants];
}

function sameClaims(
  a: { roles: Role[]; scannerEventIds?: string[] },
  b: { roles: Role[]; scannerEventIds?: string[] },
): boolean {
  const sameRoles = a.roles.length === b.roles.length && a.roles.every((r, i) => r === b.roles[i]);
  const sa = a.scannerEventIds ?? [];
  const sb = b.scannerEventIds ?? [];
  const sameScanner = sa.length === sb.length && sa.every((s, i) => s === sb[i]);
  return sameRoles && sameScanner;
}

/** Recompute custom claims for a member from their current-term positions.
 *  No-op when unprovisioned or when the computed claims already match (idempotent;
 *  avoids a self-retrigger storm — note this writes Auth claims, NOT the member doc). */
export async function syncMemberClaims(
  deps: ClaimsSyncDeps,
  member: MemberLike,
  termKey: string,
): Promise<void> {
  if (!member.uid) return;
  const term = member.positions?.[termKey];
  const positionIds = term
    ? [term.cargoId, ...term.comisionIds].filter((id): id is string => id !== null && id.length > 0)
    : [];
  const trustedGrants = await resolveTrustedGrants(deps, positionIds, term?.assignedBy);

  const existing = await deps.getExistingClaims(member.uid);
  const roles = computeMemberRoles({ trustedGrants, hadScanner: existing.roles.includes("Scanner") });
  const next =
    existing.roles.includes("Scanner") && existing.scannerEventIds
      ? { roles, scannerEventIds: existing.scannerEventIds }
      : { roles };

  if (sameClaims(existing, next)) return;
  await deps.setClaims(member.uid, next);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/claims-sync/sync.test.ts`
Expected: PASS (6 tests, including the BLOCKING escalation case).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/beacon/src/claims-sync/sync.ts apps/beacon/src/claims-sync/sync.test.ts
git commit -m "feat(beacon): claims-sync trust gate + orchestration"
```

### Task 4: `onMemberWritten` trigger glue + firestore deps

**Files:**
- Create: `apps/beacon/src/claims-sync/firestore-deps.ts`
- Modify: `apps/beacon/src/index.ts:1-3` (imports), append export
- Modify: `apps/beacon/src/index.test.ts` (export assertion)

The glue is impure (admin SDK), exercised by the manual emulator e2e, not units — same boundary policy as `award-points/firestore-store.ts`.

- [ ] **Step 1: Write the failing test** — add to `apps/beacon/src/index.test.ts` (it already asserts other exports are defined; mirror that):

```ts
import { onMemberWritten } from "./index.js";

it("exports the onMemberWritten trigger", () => {
  expect(onMemberWritten).toBeDefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/index.test.ts`
Expected: FAIL — `onMemberWritten` is not exported.

- [ ] **Step 3: Implement the deps** — `apps/beacon/src/claims-sync/firestore-deps.ts`:

```ts
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import type { ClaimsSyncDeps } from "./sync.js";

function rolesFromClaims(claims: Record<string, unknown> | undefined): Role[] {
  const raw = claims?.roles;
  return Array.isArray(raw) ? raw.filter((r): r is Role => isValidRole(r)) : [];
}

export function firestoreClaimsDeps(db: Firestore, auth: Auth): ClaimsSyncDeps {
  return {
    getPosition: async (id) => {
      const snap = await db.doc(`positions/${id}`).get();
      if (!snap.exists) return null;
      const grants = (snap.data()?.grants ?? []) as unknown[];
      return { grants: grants.filter((g): g is Role => isValidRole(g)) };
    },
    getUserRoles: async (uid) => {
      const user = await auth.getUser(uid).catch(() => null);
      return user ? rolesFromClaims(user.customClaims as Record<string, unknown> | undefined) : [];
    },
    getExistingClaims: async (uid) => {
      const user = await auth.getUser(uid).catch(() => null);
      const claims = user?.customClaims as Record<string, unknown> | undefined;
      const scannerEventIds = Array.isArray(claims?.scannerEventIds)
        ? (claims.scannerEventIds as unknown[]).filter((s): s is string => typeof s === "string")
        : undefined;
      return scannerEventIds
        ? { roles: rolesFromClaims(claims), scannerEventIds }
        : { roles: rolesFromClaims(claims) };
    },
    setClaims: async (uid, next) => {
      await auth.setCustomUserClaims(uid, next);
    },
  };
}
```

- [ ] **Step 4: Wire the trigger in `index.ts`** — add imports near the top (after the existing firebase-admin imports):

```ts
import { getAuth } from "firebase-admin/auth";
import type { TermPositions } from "@luminova/types";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { syncMemberClaims } from "./claims-sync/sync.js";
```

Add this helper above the exports (term = current UTC year; inlined to avoid pulling the `@luminova/types` root + zod into this bundle path):

```ts
function currentTermKey(): string {
  return String(new Date().getUTCFullYear());
}
```

Then add the trigger export (place it next to the other `onDocumentWritten` exports):

```ts
export const onMemberWritten = onDocumentWritten("members/{id}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return; // deletes leave the Auth user untouched
  const member = after.data() as { uid?: string; positions?: Record<string, TermPositions> };
  if (!member.uid) return; // not provisioned → no Auth user to claim
  await syncMemberClaims(firestoreClaimsDeps(db(), getAuth()), member, currentTermKey());
});
```

- [ ] **Step 5: Run test + beacon CI**

Run: `pnpm --filter beacon run ci`
Expected: eslint clean, tsc clean, vitest PASS (including the new export test). If tsc complains that `@luminova/types` has no type export resolvable under NodeNext, confirm `TermPositions` is exported from the package root (it is, via `position.ts` → index) — import as `import type` only.

- [ ] **Step 6: Manual emulator e2e (the trigger's real e2e — document the result)**

```bash
firebase emulators:start   # Auth 4030, Firestore 4010, Functions 4020
```

In a second shell, using the Emulator UI (Firestore 4100) or a scratch admin script:
1. Seed `positions/pos-pres` = `{ grants: ["Admin"], ... }` and a member with a linked `uid` (provision one via backstage first).
2. As that member's doc, set `positions.2026 = { cargoId: "pos-pres", comisionIds: [], assignedBy: "<a Membership user's uid>" }`.
3. Inspect the target user's custom claims in the Auth emulator → **roles must NOT contain `Admin`** (escalation blocked).
4. Repeat with `assignedBy = "<an Admin user's uid>"` → roles now include `Admin` (heals).
5. Clear the cargo → roles fall back to `["Member"]`.

Record pass/fail in the PR description. (No automated functions-emulator harness exists in this repo; Task 3's fake-driven suite is the automated guarantee, this is the integration check.)

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/beacon/src/claims-sync/firestore-deps.ts apps/beacon/src/index.ts apps/beacon/src/index.test.ts
git commit -m "feat(beacon): onMemberWritten claims-sync trigger"
```

---

## Phase B — firestore.rules gates

### Task 5: `assignedBy`-self + power-cargo gate on member updates

**Files:**
- Modify: `firestore.rules:72-91` (members block + helpers)
- Modify: `tests/firestore-rules/rules.test.ts`

Rules derive the current term from `request.time.year()` (UTC — matches `currentTermKey()`). Non-Admins may assign only empty-`grants` cargos (checked via `get()` on the position); every positions write must stamp `assignedBy == request.auth.uid`. Comisión power grants are not loop-checkable in rules — the trigger's trust gate (Task 3) is their backstop.

- [ ] **Step 1: Write/adjust the failing tests** — in `tests/firestore-rules/rules.test.ts`:

First, **update the two existing K2 "member positions by ExecutiveCommittee" tests** (they assigned `pos1`, which has `grants:["Treasury"]` — now denied for a non-Admin, and they lacked `assignedBy`). Replace that describe block with:

```ts
describe("firestore.rules — member positions assignment", () => {
  it("allows ExecutiveCommittee to assign an empty-grants cargo with self assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("denies ExecutiveCommittee assigning a power-conferring cargo (Treasury)", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("BLOCKING: denies Membership assigning a power-conferring cargo (Presidente/Treasury)", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Admin to assign a power-conferring cargo", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
      }),
    );
  });
  it("denies a forged assignedBy (not the caller's uid)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos1", comisionIds: [], assignedBy: "someone-else" } },
      }),
    );
  });
  it("denies ExecutiveCommittee touching non-position fields", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { "2026": { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
        name: "Hacked",
      }),
    );
  });
  it("still allows Membership to edit non-position fields without assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), { name: "Renamed" }),
    );
  });
});
```

Note: the test year is the real current year. These cases hardcode `"2026"`; if running in a later calendar year, change the key to that year (rules use `request.time.year()`). Add a comment to that effect in the test file.

- [ ] **Step 2: Run it to verify it fails**

Run (emulator already up): `pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: FAIL — the new power-cargo denials/`assignedBy` rules don't exist yet (current rules allow EC any positions write).

- [ ] **Step 3: Implement the rules** — in `firestore.rules`, add helpers inside the `match /databases/{database}/documents` block (near the other functions):

```
function currentTermKey() {
  return string(request.time.year());
}
function assignedTerm() {
  return request.resource.data.get('positions', {}).get(currentTermKey(), {});
}
function assignedBySelf() {
  return assignedTerm().get('assignedBy', '') == request.auth.uid;
}
function assignedCargoId() {
  return assignedTerm().get('cargoId', null);
}
function cargoGrantsEmpty() {
  return assignedCargoId() == null
    || get(/databases/$(database)/documents/positions/$(assignedCargoId())).data.grants.size() == 0;
}
function positionsTouched() {
  return request.resource.data.diff(resource.data).affectedKeys().hasAny(['positions']);
}
// A positions write is well-formed when the writer stamped themselves and either
// they are Admin or the assigned cargo confers no power.
function positionsAssignmentSafe() {
  return assignedBySelf() && (hasAnyRole(['Admin']) || cargoGrantsEmpty());
}
```

Then replace the `members` update rules (the Admin/Membership rule and the ExecutiveCommittee rule) with:

```
allow update: if hasAnyRole(['Admin', 'Membership'])
  && unchanged('totalPoints')
  && unchanged('uid')
  && softDeleteSafe()
  && (!positionsTouched() || positionsAssignmentSafe());
// A member may set only their own profilePicture (H1 self-upload on /me).
allow update: if signedIn()
  && resource.data.uid == request.auth.uid
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['profilePicture'])
  && softDeleteSafe();
// ExecutiveCommittee may edit only position assignments (org chart), nothing else.
allow update: if hasAnyRole(['ExecutiveCommittee'])
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['positions'])
  && softDeleteSafe()
  && positionsAssignmentSafe();
```

- [ ] **Step 4: Run rules tests to verify they pass**

Run: `pnpm --filter @luminova/firestore-rules-tests run test:run`
Expected: PASS — all existing cases plus the new ones. If any prior members-update test wrote `positions` without `assignedBy`, update it to include `assignedBy: <caller uid>`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): assignedBy-self + power-cargo gate on member positions"
```

---

## Phase C — Mapper, repository, provision alignment

### Task 6: Mapper stamps `assignedBy`; repo passes current uid; `setPositions`

**Files:**
- Modify: `apps/backstage/src/features/members/repositories/member-mapper.ts`
- Modify: `apps/backstage/src/features/members/repositories/member-mapper.test.ts`
- Modify: `apps/backstage/src/features/members/repositories/member-repository.ts`

(`role` is removed in Task 8 — this task keeps `role: ""` in create for now so the member type stays valid until then. **Do Task 8 immediately after to avoid leaving a dangling `role`.** If executing strictly TDD, you may merge Tasks 6 and 8 into one commit train.)

- [ ] **Step 1: Write the failing test** — update `member-mapper.test.ts` so the mapper takes `assignedBy`:

```ts
it("stamps assignedBy into the created term slot", () => {
  const doc = toMemberCreateDoc(input, "uid-admin", "2026");
  expect(doc.positions["2026"]).toEqual({
    cargoId: input.cargoId,
    comisionIds: input.comisionIds,
    assignedBy: "uid-admin",
  });
});

it("stamps assignedBy into the dot-path update slot", () => {
  const doc = toMemberUpdateDoc(input, "uid-admin", "2026");
  expect(doc["positions.2026"]).toEqual({
    cargoId: input.cargoId,
    comisionIds: input.comisionIds,
    assignedBy: "uid-admin",
  });
});
```

(Keep the existing create/update assertions; add `assignedBy` to their expected `positions` objects.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/members/repositories/member-mapper.test.ts`
Expected: FAIL — `toMemberCreateDoc` takes 2 args; no `assignedBy` in output.

- [ ] **Step 3: Implement** — in `member-mapper.ts` thread `assignedBy` through:

```ts
export function toMemberCreateDoc(data: MemberInput, assignedBy: string, termKey = currentTermKey()) {
  return {
    ...editableFields(data),
    role: "",
    positions: {
      [termKey]: { cargoId: data.cargoId, comisionIds: data.comisionIds, assignedBy },
    },
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
  };
}

type UpdateDoc = ReturnType<typeof editableFields> & Record<`positions.${string}`, TermPositions>;

export function toMemberUpdateDoc(
  data: MemberInput,
  assignedBy: string,
  termKey = currentTermKey(),
): UpdateDoc {
  return {
    ...editableFields(data),
    [`positions.${termKey}`]: { cargoId: data.cargoId, comisionIds: data.comisionIds, assignedBy },
  } as UpdateDoc;
}
```

- [ ] **Step 4: Update the repository** — `member-repository.ts`: read the current uid and a `setPositions` method. Add at the top of the class a private helper and pass it through:

```ts
private currentUid(): string {
  return getFirebase().auth.currentUser?.uid ?? "";
}

async create(data: MemberInput): Promise<string> {
  const ref = await addDoc(this.collection, toMemberCreateDoc(data, this.currentUid()));
  return ref.id;
}

async update(id: string, data: MemberInput): Promise<void> {
  await updateDoc(doc(this.collection, id), toMemberUpdateDoc(data, this.currentUid()));
}

/** ExecutiveCommittee org-chart edit: writes ONLY the current term's assignment
 *  (dot-path) so the positions-only rule path applies. */
async setPositions(
  id: string,
  assignment: { cargoId: string | null; comisionIds: string[] },
  termKey = currentTermKey(),
): Promise<void> {
  await updateDoc(doc(this.collection, id), {
    [`positions.${termKey}`]: { ...assignment, assignedBy: this.currentUid() },
  });
}
```

Add `currentTermKey` to the `@luminova/types` import at the top of the repository, and confirm `getFirebase().auth` exists (the firebase singleton exposes `auth`; if the property differs, match the existing usage in `apps/backstage/src/lib/auth/*`).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter backstage exec vitest run src/features/members/repositories/member-mapper.test.ts`
Expected: PASS. (`pnpm typecheck` may still flag `role` until Task 8 — that's expected; proceed to Task 8 before the green checkpoint.)

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/backstage/src/features/members/repositories/
git commit -m "feat(backstage): stamp assignedBy on member positions writes"
```

### Task 7: provisionMemberLogin alignment (verification only)

No code change: `provisionMemberLogin` bootstraps `['Member']` (merged, preserving existing claims) and writes `uid`; that write fires `onMemberWritten`, which recomputes from positions and heals a pre-assigned member. Confirm the two agree.

- [ ] **Step 1: Add an explanatory comment** in `apps/beacon/src/provision-member-login.ts` above the `setCustomUserClaims` call:

```ts
// Bootstrap the base Member claim; onMemberWritten (fired by the uid write below)
// recomputes ['Member', ...trusted grants] from positions, healing pre-assigned
// members. Both authorities share the same ['Member', ...] base — no conflict.
```

- [ ] **Step 2: Verify the existing provision unit tests still pass**

Run: `pnpm --filter beacon exec vitest run src/provision-member-login.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/beacon/src/provision-member-login.ts
git commit -m "docs(beacon): note provision/trigger claims alignment"
```

---

## Phase D — Drop legacy `Member.role`

### Task 8: Remove `Member.role` end-to-end

**Files:**
- Modify: `packages/types/src/member.ts:17` (remove `role`)
- Modify: `apps/backstage/src/features/members/repositories/member-mapper.ts` (drop `role: ""`)
- Modify: `apps/backstage/src/features/members/lib/member-display.ts` + `.test.ts`
- Modify: `apps/backstage/src/features/members/lib/member-filter.ts` + `.test.ts`

- [ ] **Step 1: Update the failing tests first** — `member-display.test.ts`: the legacy-role fallback case must change. Replace the role-fallback assertions with:

```ts
describe("memberPositionLabel", () => {
  it("resolves the gendered cargo title for the term", () => {
    const member = {
      gender: "Femenino" as const,
      positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } },
    };
    expect(memberPositionLabel(member, positions, "2026")).toBe("Presidenta");
  });
  it("falls back to Miembro when no cargo is set", () => {
    expect(memberPositionLabel({ positions: {} }, positions, "2026")).toBe("Miembro");
  });
});
```

(where `positions = new Map([["pos-pres", { title: "Presidente", titleFemale: "Presidenta" }]])`.)

`member-filter.test.ts`: `filterMembers` now takes a `resolveLabel` callback. Add/replace:

```ts
const resolve = (m: Member) => (m.id === "m1" ? "Presidenta" : "Miembro");

it("matches on the resolved cargo label", () => {
  const out = filterMembers(members, { search: "presi", status: "Todos" }, resolve);
  expect(out.map((m) => m.id)).toEqual(["m1"]);
});
```

(Build `members` fixtures without a `role` field.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter backstage exec vitest run src/features/members/lib/member-display.test.ts src/features/members/lib/member-filter.test.ts`
Expected: FAIL (compile — `role` gone / `filterMembers` arity).

- [ ] **Step 3: Implement**

`packages/types/src/member.ts` — delete the `role: string;` line.

`member-mapper.ts` — remove `role: ""` from `toMemberCreateDoc`.

`member-display.ts` — `memberPositionLabel`:

```ts
type LabelSource = {
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
  return cargo ? positionTitle(cargo, member.gender) : "Miembro";
}
```

(Drop the now-unused `Pick<Member, "role">` import usage; keep `Member`/`MemberGender`.)

`member-filter.ts`:

```ts
export function filterMembers(
  members: Member[],
  { search, status }: MemberFilter,
  resolveLabel: (member: Member) => string,
): Member[] {
  const q = search.trim().toLowerCase();
  return members.filter((m) => {
    if (status !== "Todos" && m.status !== status) return false;
    if (!q) return true;
    return `${m.name} ${m.email} ${resolveLabel(m)}`.toLowerCase().includes(q);
  });
}
```

- [ ] **Step 4: Update the call site** — `_app.members.tsx:64`:

```tsx
const filtered = useMemo(
  () => filterMembers(all, { search, status }, roleLabel),
  [all, search, status, roleLabel],
);
```

(`roleLabel` is already defined above; move the `roleLabel`/`positionsById` `useMemo`s above `filtered` if needed for declaration order.)

- [ ] **Step 5: Run tests + full backstage typecheck**

Run: `pnpm --filter backstage exec vitest run src/features/members && pnpm --filter @luminova/types test && pnpm typecheck`
Expected: PASS. Fix any remaining `member.role` references the compiler surfaces (grep `\.role\b` under `apps/backstage/src/features/members` and any seed/dev scripts). Update dev seed data to write `gender` + `positions` instead of `role`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/types/src/member.ts apps/backstage/src/features/members/
git commit -m "feat: drop legacy Member.role; resolved-label member search"
```

---

## Phase E — Member edit page UI

> **DESIGN STEP (run before coding Tasks 9–12):** invoke `frontend-design:frontend-design` first (aesthetic direction for the edit page: details card, history timeline, permissions panel), then `ui-ux-pro-max:ui-ux-pro-max` (validate palette/typography/a11y/contrast for the admin form + panel). The code below is the functional baseline those skills refine — keep the component APIs, adjust presentation.

### Task 9: Effective-permissions derivation + panel

**Files:**
- Create: `apps/backstage/src/features/members/lib/member-permissions.ts` + `.test.ts`
- Create: `apps/backstage/src/features/members/components/member-permissions-panel.tsx` + `.test.tsx`

Truthful because the rules (Task 5) prevent non-Admin power assignment — so the catalog-derived view matches the live claim.

- [ ] **Step 1: Write the failing test** — `member-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Position } from "@luminova/types";
import { effectiveRoles } from "./member-permissions";

const pos = (id: string, grants: Position["grants"]): Position => ({
  id, title: id, titleFemale: id, category: "CEL", grants, term: null,
  description: "", active: true, deletedAt: null,
});

const byId = new Map([pos("pres", ["Admin"]), pos("etica", [])].map((p) => [p.id, p]));

describe("effectiveRoles", () => {
  it("always includes Member", () => {
    expect(effectiveRoles({ positions: {} }, byId, "2026")).toEqual(["Member"]);
  });
  it("unions current-term cargo + comisión grants in ROLES order", () => {
    const member = { positions: { "2026": { cargoId: "pres", comisionIds: ["etica"] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Admin", "Member"]);
  });
  it("ignores other terms", () => {
    const member = { positions: { "2025": { cargoId: "pres", comisionIds: [] } } };
    expect(effectiveRoles(member, byId, "2026")).toEqual(["Member"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm --filter backstage exec vitest run src/features/members/lib/member-permissions.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `member-permissions.ts`:

```ts
import { ROLES, type Member, type Position, type Role } from "@luminova/types";

export function effectiveRoles(
  member: Pick<Member, "positions">,
  positionsById: Map<string, Position>,
  termKey: string,
): Role[] {
  const term = member.positions?.[termKey];
  const ids = term ? [term.cargoId, ...term.comisionIds].filter((id): id is string => !!id) : [];
  const set = new Set<Role>(["Member"]);
  for (const id of ids) for (const g of positionsById.get(id)?.grants ?? []) set.add(g);
  return ROLES.filter((r) => set.has(r));
}
```

(Confirm `ROLES` is exported from `@luminova/types` — it is, re-exported from `permission-role.ts`.)

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Write the panel test** — `member-permissions-panel.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberPermissionsPanel } from "./member-permissions-panel";

describe("MemberPermissionsPanel", () => {
  it("lists each effective role's Spanish label and description", () => {
    render(<MemberPermissionsPanel roles={["Admin", "Member"]} />);
    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getByText("Acceso total a la plataforma.")).toBeInTheDocument();
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it → FAIL (module missing).**

- [ ] **Step 7: Implement the panel** — `member-permissions-panel.tsx`:

```tsx
import type { Role } from "@luminova/types";
import { PERMISSION_ROLE_INFO } from "../../positions/lib/permission-labels";

export function MemberPermissionsPanel({ roles }: { roles: Role[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <h3 className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">
        Permisos efectivos
      </h3>
      <ul className="flex flex-col gap-3">
        {roles.map((role) => {
          const info = PERMISSION_ROLE_INFO[role];
          return (
            <li key={role} className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink-1">{info.label}</span>
              <span className="text-[13px] text-ink-3">{info.description}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: Run test → PASS. Commit.**

```bash
git branch --show-current
git add apps/backstage/src/features/members/lib/member-permissions.ts apps/backstage/src/features/members/lib/member-permissions.test.ts apps/backstage/src/features/members/components/member-permissions-panel.tsx apps/backstage/src/features/members/components/member-permissions-panel.test.tsx
git commit -m "feat(backstage): effective-permissions panel"
```

### Task 10: Position history timeline + cargo chips

**Files:**
- Create: `apps/backstage/src/features/members/components/member-cargo-chips.tsx` + `.test.tsx`
- Create: `apps/backstage/src/features/members/components/member-position-history.tsx` + `.test.tsx`

Shared category→tone map (also used by the table in Task 11): CEL `navy`, JDL `teal`, Comisión `gray`.

- [ ] **Step 1: Write the chips test** — `member-cargo-chips.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { MemberCargoChips } from "./member-cargo-chips";

const pos = (id: string, category: Position["category"]): Position => ({
  id, title: id === "pres" ? "Presidente" : "Ética", titleFemale: id === "pres" ? "Presidenta" : "Ética",
  category, grants: [], term: null, description: "", active: true, deletedAt: null,
});
const byId = new Map([pos("pres", "CEL"), pos("etica", "Comision")].map((p) => [p.id, p]));

describe("MemberCargoChips", () => {
  it("renders the gendered cargo + comisión chips", () => {
    render(
      <MemberCargoChips
        member={{ gender: "Femenino", positions: { "2026": { cargoId: "pres", comisionIds: ["etica"] } } }}
        positionsById={byId}
        termKey="2026"
      />,
    );
    expect(screen.getByText("Presidenta")).toBeInTheDocument();
    expect(screen.getByText("Ética")).toBeInTheDocument();
  });
  it("shows a Miembro chip when nothing is assigned", () => {
    render(<MemberCargoChips member={{ positions: {} }} positionsById={byId} termKey="2026" />);
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement** — `member-cargo-chips.tsx`:

```tsx
import { Badge, type BadgeTone } from "@luminova/ui";
import { positionTitle, type Member, type MemberGender, type Position } from "@luminova/types";

export const CATEGORY_TONE: Record<Position["category"], BadgeTone> = {
  CEL: "navy",
  JDL: "teal",
  Comision: "gray",
};

type ChipSource = { gender?: MemberGender; positions?: Member["positions"] };

export function MemberCargoChips({
  member,
  positionsById,
  termKey,
}: {
  member: ChipSource;
  positionsById: Map<string, Position>;
  termKey: string;
}) {
  const term = member.positions?.[termKey];
  const cargo = term?.cargoId ? positionsById.get(term.cargoId) : undefined;
  const comisiones = (term?.comisionIds ?? [])
    .map((id) => positionsById.get(id))
    .filter((p): p is Position => Boolean(p));

  if (!cargo && comisiones.length === 0) return <Badge tone="gray">Miembro</Badge>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {cargo && <Badge tone={CATEGORY_TONE[cargo.category]}>{positionTitle(cargo, member.gender)}</Badge>}
      {comisiones.map((c) => (
        <Badge key={c.id} tone="gray">
          {positionTitle(c, member.gender)}
        </Badge>
      ))}
    </div>
  );
}
```

(Confirm `BadgeTone` includes `navy`/`teal` — they are used by the positions catalog page from K2. If a tone name differs, match the K2 `_app.positions.tsx` mapping.)

- [ ] **Step 3: Run → PASS.**

- [ ] **Step 4: Write the history test** — `member-position-history.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { MemberPositionHistory } from "./member-position-history";

const pos = (id: string, title: string): Position => ({
  id, title, titleFemale: title, category: "CEL", grants: [], term: null,
  description: "", active: true, deletedAt: null,
});
const byId = new Map([pos("tes", "Tesorero"), pos("sec", "Secretario")].map((p) => [p.id, p]));

describe("MemberPositionHistory", () => {
  it("lists past terms newest-first, excluding the current term", () => {
    render(
      <MemberPositionHistory
        member={{
          positions: {
            "2026": { cargoId: "sec", comisionIds: [] },
            "2024": { cargoId: "tes", comisionIds: [] },
            "2025": { cargoId: "sec", comisionIds: [] },
          },
        }}
        positionsById={byId}
        currentTermKey="2026"
      />,
    );
    const years = screen.getAllByTestId("history-term").map((el) => el.textContent);
    expect(years).toEqual(["2025", "2024"]); // current (2026) excluded, desc order
  });
  it("renders nothing when there is no past history", () => {
    const { container } = render(
      <MemberPositionHistory
        member={{ positions: { "2026": { cargoId: "sec", comisionIds: [] } } }}
        positionsById={byId}
        currentTermKey="2026"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 5: Run → FAIL. Implement** — `member-position-history.tsx`:

```tsx
import { type Member, type MemberGender, type Position } from "@luminova/types";
import { MemberCargoChips } from "./member-cargo-chips";

export function MemberPositionHistory({
  member,
  positionsById,
  currentTermKey,
}: {
  member: { gender?: MemberGender; positions?: Member["positions"] };
  positionsById: Map<string, Position>;
  currentTermKey: string;
}) {
  const pastTerms = Object.keys(member.positions ?? {})
    .filter((term) => term !== currentTermKey)
    .sort((a, b) => Number(b) - Number(a));

  if (pastTerms.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <h3 className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Historial</h3>
      <ul className="flex flex-col gap-3">
        {pastTerms.map((term) => (
          <li key={term} className="flex items-center gap-3">
            <span data-testid="history-term" className="tabular-nums text-[13px] text-ink-3">
              {term}
            </span>
            <MemberCargoChips
              member={{ gender: member.gender, positions: { [term]: member.positions![term] } }}
              positionsById={positionsById}
              termKey={term}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Run → PASS. Commit.**

```bash
git branch --show-current
git add apps/backstage/src/features/members/components/member-cargo-chips.tsx apps/backstage/src/features/members/components/member-cargo-chips.test.tsx apps/backstage/src/features/members/components/member-position-history.tsx apps/backstage/src/features/members/components/member-position-history.test.tsx
git commit -m "feat(backstage): cargo chips + position history timeline"
```

### Task 11: EC positions-only form + hook

**Files:**
- Create: `apps/backstage/src/features/members/components/member-positions-form.tsx` + `.test.tsx`
- Create: `apps/backstage/src/features/members/hooks/use-set-member-positions.ts`

Mirrors the cargo/comisiones half of `MemberForm` (Combobox + MultiSelect) but submits only `{ cargoId, comisionIds }`.

- [ ] **Step 1: Write the failing test** — `member-positions-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberPositionsForm } from "./member-positions-form";

const pos = (id: string, category: Position["category"]): Position => ({
  id, title: id, titleFemale: id, category, grants: [], term: category === "JDL" ? 2026 : null,
  description: "", active: true, deletedAt: null,
});
const positions = [pos("dir", "JDL"), pos("etica", "Comision")];

it("submits the selected cargo + comisiones", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <MemberPositionsForm
      positions={positions}
      gender="Masculino"
      defaultValues={{ cargoId: null, comisionIds: [] }}
      onSubmit={onSubmit}
    />,
  );
  // (drive the Combobox/MultiSelect per the existing member-form.test.tsx harness)
  await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
  expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] });
});
```

(Copy the Combobox/MultiSelect interaction harness from `member-form.test.tsx`; the assertion shape above is the contract.)

- [ ] **Step 2: Run → FAIL. Implement** — `member-positions-form.tsx`:

```tsx
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { positionTitle, currentTermKey, type MemberGender, type Position } from "@luminova/types";

export interface PositionsInput {
  cargoId: string | null;
  comisionIds: string[];
}

export function MemberPositionsForm({
  positions,
  gender,
  defaultValues,
  onSubmit,
}: {
  positions: Position[];
  gender: MemberGender | undefined;
  defaultValues: PositionsInput;
  onSubmit: (data: PositionsInput) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<PositionsInput>({
    defaultValues,
  });

  const term = currentTermKey();
  const cargoOptions = positions
    .filter((p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term))
    .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));
  const comisionOptions = positions
    .filter((p) => p.active && p.category === "Comision")
    .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Cargo" htmlFor="cargoId">
        <Controller
          control={control}
          name="cargoId"
          render={({ field }) => (
            <Combobox id="cargoId" options={cargoOptions} value={field.value} onChange={field.onChange} placeholder="Sin cargo" />
          )}
        />
      </Field>
      <Field label="Comisiones" htmlFor="comisionIds">
        <Controller
          control={control}
          name="comisionIds"
          render={({ field }) => (
            <MultiSelect id="comisionIds" options={comisionOptions} value={field.value} onChange={field.onChange} />
          )}
        />
      </Field>
      {formError && <div role="alert" className="text-[13px] text-error">{formError}</div>}
      <Button as="button" type="submit" disabled={isSubmitting} className="w-full justify-center">
        {isSubmitting ? "Guardando…" : "Guardar cargos"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Implement the hook** — `use-set-member-positions.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./use-members";
import type { PositionsInput } from "../components/member-positions-form";

export function useSetMemberPositions(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PositionsInput) => new MemberRepository().setPositions(memberId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["member", memberId] });
    },
  });
}
```

(Match the actual `memberKeys` export + the single-member query key used by `use-member.ts`.)

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git branch --show-current
git add apps/backstage/src/features/members/components/member-positions-form.tsx apps/backstage/src/features/members/components/member-positions-form.test.tsx apps/backstage/src/features/members/hooks/use-set-member-positions.ts
git commit -m "feat(backstage): ExecutiveCommittee positions-only editor"
```

### Task 12: Member edit page integration

**Files:**
- Modify: `apps/backstage/src/routes/_app.members_.$memberId.tsx`

Compose: details edit (full `MemberForm` for Admin/Membership; `MemberPositionsForm` for EC), `MemberPositionHistory`, `MemberPermissionsPanel`, keeping the existing points/QR/ledger sections.

- [ ] **Step 1: Read the current route file** (already shown in the plan header context) and the ability hook (`apps/backstage/src/lib/authz/ability-context.tsx`) for the `useAbility`/`Can` API and `use-member`/`use-update-member` hooks.

- [ ] **Step 2: Implement** — add inside `MemberProfilePage`, after the existing data hooks:

```tsx
const { data: positions } = usePositions();
const updateMember = useUpdateMember();
const setPositions = useSetMemberPositions(memberId);
const ability = useAbility();

const positionsById = useMemo(
  () => new Map((positions ?? []).map((p) => [p.id, p])),
  [positions],
);
const term = currentTermKey();
const roles = useMemo(
  () => (member ? effectiveRoles(member, positionsById, term) : ["Member"]),
  [member, positionsById, term],
);
const canEditAll = ability.can("update", "Member", member ?? undefined);
const canEditPositions = ability.can("manage", "Position");
```

Render (replace the single `MemberPointsSummary`+QR block with a two-column layout; the design skills set the final visual):

```tsx
<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
  <div className="flex flex-col gap-6">
    {canEditAll && positions && (
      <section className="rounded-card border border-line bg-surface p-5">
        <MemberForm
          positions={positions}
          defaultValues={toFormDefaults(member)}
          submitLabel="Guardar cambios"
          onSubmit={async (data) => {
            await updateMember.mutateAsync({ id: member.id, data });
          }}
        />
      </section>
    )}
    {!canEditAll && canEditPositions && positions && (
      <section className="rounded-card border border-line bg-surface p-5">
        <h3 className="mb-4 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Cargos</h3>
        <MemberPositionsForm
          positions={positions}
          gender={member.gender}
          defaultValues={{
            cargoId: member.positions?.[term]?.cargoId ?? null,
            comisionIds: member.positions?.[term]?.comisionIds ?? [],
          }}
          onSubmit={(data) => setPositions.mutateAsync(data)}
        />
      </section>
    )}
    <MemberPointsSummary points={points} termId={termId} />
    <ParticipationLedger rows={participations ?? []} />
  </div>
  <div className="flex flex-col gap-6">
    <MemberPermissionsPanel roles={roles} />
    <MemberPositionHistory member={member} positionsById={positionsById} currentTermKey={term} />
    <div className="flex w-fit flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-5">
      <QrCode value={encodeMemberQr(member.id)} size={176} />
      <p className="text-[12px] text-ink-3">QR personal · escanéalo en el check-in</p>
    </div>
  </div>
</div>
```

Add a `toFormDefaults(member)` helper in the file:

```tsx
function toFormDefaults(member: Member): Partial<MemberInput> {
  const term = member.positions?.[currentTermKey()];
  return {
    name: member.name,
    email: member.email,
    phone: member.phone ?? "",
    gender: member.gender,
    profession: member.profession ?? "",
    joinDate: dateInputValue(member.joinDate),
    birthdate: dateInputValue(member.birthdate),
    status: member.status,
    cargoId: term?.cargoId ?? null,
    comisionIds: term?.comisionIds ?? [],
  };
}
```

Add imports: `useMemo`, `usePositions`, `useUpdateMember`, `useSetMemberPositions`, `MemberForm`, `MemberPositionsForm`, `MemberPermissionsPanel`, `MemberPositionHistory`, `effectiveRoles`, `dateInputValue`, `currentTermKey`, `useAbility`, and the `MemberInput` type. (`MemberForm` reuses the `dateInputValue` mapper from `member-mapper.ts`.)

- [ ] **Step 3: Verify the route compiles + renders**

Run: `pnpm --filter backstage exec vitest run src/features/members && pnpm --filter backstage run build`
Expected: build PASS. (`react-best-practices` auto-triggers on these `.tsx` edits — heed memoization/re-render warnings.)

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/backstage/src/routes/_app.members_.$memberId.tsx
git commit -m "feat(backstage): member edit page — form, history, permissions"
```

### Task 13: Members table category chips + filter wiring

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-table.tsx`
- Modify: `apps/backstage/src/routes/_app.members.tsx`

- [ ] **Step 1: Update the table test** — in `member-table.test.tsx`, assert the cargo cell renders a chip. Add a `positionsById` prop fixture and expect the cargo title to appear inside a badge (query by text). (Mirror the existing table test setup; pass `positionsById={new Map()}` where chips fall back to a "Miembro" badge.)

- [ ] **Step 2: Run → FAIL. Implement** — `member-table.tsx`: add `positionsById` to props and swap the `role` column cell:

```tsx
interface MemberTableProps {
  members: Member[];
  pageSize: number;
  roleLabel: (member: Member) => string;
  positionsById: Map<string, Position>;
  // …rest unchanged
}
```

```tsx
import { currentTermKey, type Member, type MemberStatus, type Position } from "@luminova/types";
import { MemberCargoChips } from "./member-cargo-chips";
```

In `buildColumns(roleLabel, positionsById)` replace the `role` column `cell`:

```tsx
{
  id: "role",
  header: "Cargo",
  sortValue: roleLabel, // keep text sort
  cell: (member) => (
    <MemberCargoChips member={member} positionsById={positionsById} termKey={currentTermKey()} />
  ),
},
```

Thread `positionsById` through `buildColumns` and the `useMemo` deps.

- [ ] **Step 3: Wire the route** — `_app.members.tsx`: pass `positionsById={positionsById}` to `<MemberTable>` (the `positionsById` `useMemo` already exists at line 65).

- [ ] **Step 4: Run tests + build**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-table.test.tsx && pnpm --filter backstage run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/backstage/src/features/members/components/member-table.tsx apps/backstage/src/routes/_app.members.tsx
git commit -m "feat(backstage): category-colored cargo chips in members table"
```

---

## Phase F — Docs, verification, reviews, PR

### Task 14: Docs

**Files:**
- Modify: `docs/data-models.md`, `docs/firebase-setup.md`

- [ ] **Step 1: `docs/data-models.md`** — in the `members` section add the `positions.<term>.assignedBy` field (uid of writer; drives claims trust gate; absent = untrusted) and note `Member.role` is removed. In the rules matrix, add: member positions writes require `assignedBy == auth.uid` and non-Admin may assign only empty-`grants` cargos; claims = `['Member', ...trusted current-term grants]` (+ preserved Scanner), recomputed by `onMemberWritten`.

- [ ] **Step 2: `docs/firebase-setup.md`** — under the K3 invitation subsection, add the deferred owner-op note and the email-enumeration-protection caveat:

> **Email enumeration protection.** If Firebase Auth's email-enumeration protection is enabled, `sendPasswordResetEmail` resolves without revealing whether the address exists — the invite UI already treats a silent success as "sent" and offers the copy-link fallback. The password-reset email template (Spanish, JCI wording) is customized in the Firebase Console (Authentication → Templates) — owner op, still pending.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add docs/data-models.md docs/firebase-setup.md
git commit -m "docs: K4 claims model, assignedBy, enumeration caveat"
```

### Task 15: Full verification + required reviews

- [ ] **Step 1: Run the full gate (without racing running emulators)**

```bash
turbo run ci --filter='!@luminova/firestore-rules-tests' --filter='!@luminova/storage-rules-tests'
pnpm --filter @luminova/firestore-rules-tests run test:run   # emulator already up
```

Expected: all green. Debug any failure with `superpowers:systematic-debugging` before proceeding.

- [ ] **Step 2: Confirm the manual trigger e2e (Task 4 Step 6) was run and recorded.**

- [ ] **Step 3: Required reviews (functions + rules touched)** — run all three, apply findings via `superpowers:receiving-code-review`:
  - `/security-review` on the branch diff.
  - Dispatch the `firebase-functions-reviewer` subagent (beacon trigger).
  - Dispatch the `firestore-security-reviewer` subagent (rules + repositories + edit route).

- [ ] **Step 4: `/simplify`** on the diff (post-feature cleanup).

- [ ] **Step 5: Commit any review fixes** with a descriptive message.

### Task 16: PR

- [ ] **Step 1: Push + open the PR** targeting `main` per the repo template:

```bash
git branch --show-current   # feat/k4-claims-permissions
git push -u origin feat/k4-claims-permissions
gh pr create --base main --title "feat: member claims sync, edit page & permissions (K4)" --body "$(cat <<'EOF'
## Summary
- Beacon `onMemberWritten` trigger recomputes member custom claims from current-term position grants, gated so only Admin-authored power assignments confer power (signed `assignedBy` + trigger re-check).
- firestore.rules: positions writes require `assignedBy == auth.uid`; non-Admins may assign only empty-`grants` cargos.
- Member edit page: full form, per-term history timeline, effective-permissions panel; ExecutiveCommittee positions-only editor.
- Category-colored cargo chips in the members table; resolved-label search; legacy `Member.role` dropped.

## Test plan
- [ ] backstage-ci, beacon-ci, types/auth tests pass (`turbo run ci` minus emulator suites)
- [ ] firestore-rules suite pass (incl. "Membership/EC assigns power cargo → denied")
- [ ] beacon claims-sync units pass (incl. "Membership assigns Presidente → no Admin claim")
- [ ] manual emulator e2e for the trigger (escalation blocked + Admin heals + clear revokes)
- [ ] /security-review + firebase-functions-reviewer + firestore-security-reviewer run
EOF
)"
```

- [ ] **Step 2: Run `pnpm pr-tests` locally** (the post-pr-create hook reminds; it may race running emulators — if so, rely on the split commands from Task 15 Step 1 and note it on the PR).

---

## Self-review notes (plan author)

- **Spec coverage:** trigger + trust gate (Tasks 2–5), edit page + history + panel (Tasks 9–12), EC positions-only (Tasks 5, 11–12), drop `role` (Task 8), chips + filter (Tasks 10, 13), provision alignment (Task 7), docs + enumeration caveat (Task 14) — every K4-addendum item maps to a task.
- **Type consistency:** `TermPositions.assignedBy?` (Task 1) is read by mapper (6), rules (5), trigger (3), and is never required on read. `computeMemberRoles`/`syncMemberClaims`/`ClaimsSyncDeps` signatures are identical across Tasks 2–4. `effectiveRoles`/`MemberCargoChips`/`filterMembers(…, resolveLabel)` signatures match their call sites.
- **Known follow-up surfaced for the executor:** confirm `getFirebase().auth` property name (Task 6), `BadgeTone` includes `navy`/`teal` (Task 10), and the exact `memberKeys`/single-member query-key (Task 11) against the live code before committing each.
