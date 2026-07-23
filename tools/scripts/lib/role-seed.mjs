// Plain-Node mirror of the built-in role → perms table and the role-doc seeder,
// shared by BOTH seed scripts (tools/scripts/seed-emulator.mjs +
// tools/scripts/seed-production.mjs) and the president claim builder
// (./seed-president.mjs). These scripts run from a raw-Node context that cannot
// import the workspace packages, so the source of truth in
// packages/types/src/role-definition.ts is mirrored here. `role-seed.test.mjs`
// snapshots these values so a drift shows up as a failing unit test.
//
// Coarse, non-conditional perms each built-in role confers; conditional grants
// live in CASL + firestore.rules. Keep in sync with role-definition.ts.

/** @type {Record<string, string[]>} */
export const BUILT_IN_ROLE_PERMS = {
  Admin: ["manage:all"],
  Membership: [
    "manage:Member",
    "read:Ally",
    "create:Ally",
    "update:Ally",
    "read:MemberPoints",
    "read:Position",
  ],
  Treasury: ["read:Member", "read:MemberPoints"],
  ExecutiveCommittee: [
    "read:Member",
    "read:Ally",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
    "manage:Position",
    "create:Notification",
    "read:Notification",
  ],
  ProjectManager: [
    "manage:Project",
    "manage:Activity",
    "manage:Program",
    "read:Ally",
    "checkIn:Attendance",
  ],
  Scanner: [],
  Member: ["read:Member", "read:Activity", "read:Program"],
};

/** @type {Record<string, string>} */
export const ROLE_LABELS = {
  Admin: "Administrador",
  Membership: "Membresía",
  Treasury: "Tesorería",
  ExecutiveCommittee: "Comité Ejecutivo",
  ProjectManager: "Director de Proyecto",
  Scanner: "Escáner",
  Member: "Miembro",
};

/** Effective coarse perms for a set of built-in roles: deduped, sorted union of
 *  each role's BUILT_IN_ROLE_PERMS. Mirrors resolveEffectivePerms in
 *  @luminova/auth for the built-in, no-override path the seeds use. */
export function permsForRoles(roles) {
  return [...new Set(roles.flatMap((role) => BUILT_IN_ROLE_PERMS[role] ?? []))].sort();
}

/** The 7 built-in role docs (id = role name). Admin is locked. */
export function buildBuiltInRoleDocs() {
  return Object.entries(BUILT_IN_ROLE_PERMS).map(([role, permissions]) => ({
    id: role,
    name: ROLE_LABELS[role],
    description: "",
    builtIn: true,
    builtInKey: role,
    permissions,
    locked: role === "Admin",
    active: true,
    deletedAt: null,
  }));
}

/** Idempotently create the built-in role docs — never clobbers an admin's later
 *  edits (create() fails on an existing doc; code 6 = ALREADY_EXISTS is swallowed).
 *  Mirrors apps/beacon seedBuiltInRoles + the seedRoles callable. Returns the count
 *  created. */
export async function seedBuiltInRoles(db) {
  let created = 0;
  for (const { id, ...data } of buildBuiltInRoleDocs()) {
    try {
      await db.doc(`roles/${id}`).create(data);
      created += 1;
    } catch (error) {
      if (error?.code !== 6) throw error; // 6 = ALREADY_EXISTS
    }
  }
  return created;
}
