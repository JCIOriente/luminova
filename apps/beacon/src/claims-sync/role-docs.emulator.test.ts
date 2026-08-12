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
//   - claims-sync/sync.ts        (onMemberWritten / onRoleWritten)
//   - set-user-roles.ts          (the setUserRoles admin callable)
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
