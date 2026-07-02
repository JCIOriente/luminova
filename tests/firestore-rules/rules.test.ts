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
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
// Build claims with the REAL seed producer (not a local re-implementation), so every
// role-based context exercises the exact perms a seeded user receives → this whole suite
// is a "seed-output ⊨ firestore.rules" contract. The packages/types drift guard proves the
// .mjs mirror matches the canonical @luminova/types table.
import { permsForRoles } from "../../tools/scripts/lib/role-seed.mjs";

let env: RulesTestEnvironment;

/** Authenticated context. `perms` defaults to the built-in roles' effective set;
 *  pass an explicit array to simulate a custom role / override grant. */
function as(uid: string, roles: string[], perms?: string[]) {
  return env.authenticatedContext(uid, { roles, perms: perms ?? permsForRoles(roles) }).firestore();
}
function anon() {
  return env.unauthenticatedContext().firestore();
}

const MEMBER_DOC = { name: "Ana", totalPoints: 0, uid: "owner-uid", active: true, deletedAt: null };
const DELETED_AT = new Date("2026-01-01T00:00:00Z");
// Fixed instant for the activity-lock fixtures so echo-update tests can resend
// the exact same startAt value.
const LOCK_TS = new Date("2026-06-10T18:00:00Z");

beforeAll(async () => {
  const rulesPath = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010),
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members/m1"), MEMBER_DOC);
    await setDoc(doc(db, "members/m_deleted"), {
      name: "Bea",
      totalPoints: 0,
      uid: "bea-uid",
      active: false,
      deletedAt: DELETED_AT,
    });
    await setDoc(doc(db, "allies/a1"), { companyName: "ACME", active: true, deletedAt: null });
    await setDoc(doc(db, "events/e1"), { title: "Gala" });
    await setDoc(doc(db, "pointRules/r1"), { points: 10 });
    await setDoc(doc(db, "roles/Admin"), {
      name: "Administrador",
      description: "",
      builtIn: true,
      builtInKey: "Admin",
      permissions: ["manage:all"],
      locked: true,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/Treasury"), {
      name: "Tesorería",
      description: "",
      builtIn: true,
      builtInKey: "Treasury",
      permissions: ["manage:Payment"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/custom_existing"), {
      name: "Coordinador",
      description: "",
      builtIn: false,
      builtInKey: null,
      permissions: ["read:Event"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "terms/2026"), { status: "Activo" });
    await setDoc(doc(db, "activities/act1"), { termId: "2026", category: "Assembly" });
    await setDoc(doc(db, "activities/act_dir"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_dir",
      title: "Actividad del Proyecto Eco",
    });
    await setDoc(doc(db, "activities/act_standalone"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Actividad sin parent",
    });
    const inWindow = new Date();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await setDoc(doc(db, "activities/a1"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: inWindow,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_old"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: twoDaysAgo,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_old_cancel"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: twoDaysAgo,
      status: "Cancelada",
    });
    await setDoc(doc(db, "projects/p_closed"), {
      termId: "2026",
      title: "Cerrado",
      status: "Finalizado",
    });
    await setDoc(doc(db, "activities/act_old_closed_parent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_closed",
      startAt: twoDaysAgo,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_closed_parent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_closed",
      startAt: inWindow,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_cancel"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: inWindow,
      status: "Cancelada",
    });
    await setDoc(doc(db, "activities/act_badparent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Committee",
      parentId: "p_closed",
      startAt: inWindow,
      status: "Programada",
    });
    // Activity-lock fixtures: hasCheckIns is beacon-maintained; true locks
    // category/startAt/parentId/parentType against every client writer.
    await setDoc(doc(db, "activities/act_locked"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Bloqueada",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: true,
    });
    await setDoc(doc(db, "activities/act_unlocked_flag"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Libre",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: false,
    });
    await setDoc(doc(db, "activities/act_dir_locked"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_dir",
      title: "Actividad bloqueada del Eco",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: true,
    });
    await setDoc(doc(db, "checkIns/c1"), { memberId: "m1", activityId: "a1", role: "Attendee" });
    await setDoc(doc(db, "checkIns/c_del_admin"), {
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_scan"), {
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_old"), {
      memberId: "m1",
      activityId: "act_old",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_director"), {
      memberId: "m1",
      activityId: "a1",
      role: "Director",
    });
    await setDoc(doc(db, "checkIns/c_del_old_admin"), {
      memberId: "m1",
      activityId: "act_old",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_cancel"), {
      memberId: "m1",
      activityId: "act_cancel",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_closed"), {
      memberId: "m1",
      activityId: "act_closed_parent",
      role: "Attendee",
    });
    await setDoc(doc(db, "participations/part1"), { memberId: "m1", termId: "2026" });
    await setDoc(doc(db, "projects/p1"), { title: "P" });
    await setDoc(doc(db, "programs/prog1"), { termId: "2026", title: "Programa X" });
    await setDoc(doc(db, "projects/p_dir"), {
      termId: "2026",
      title: "Eco",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_done"), {
      termId: "2026",
      title: "Done",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: { filedAt: new Date("2026-05-01T00:00:00Z"), filedBy: "owner-uid" },
      impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" },
      status: "Finalizado",
    });
    await setDoc(doc(db, "programs/prog_dir"), {
      termId: "2026",
      title: "Eco Prog",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // Pristine pending fixtures dedicated to the completion-SUCCESS tests, which mutate
    // their target (status -> Finalizado). Keeping them separate leaves p_dir/prog_dir
    // pristine for the deny tests regardless of run order (suite seeds once, no reset).
    await setDoc(doc(db, "projects/p_complete"), {
      termId: "2026",
      title: "Por cerrar (direction)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_pm"), {
      termId: "2026",
      title: "Por cerrar (PM)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: [],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // Dedicated targets for the featured-flag SUCCESS tests, which persist featured:true.
    // Kept separate so p_dir stays pristine (featured absent) for the deny test —
    // the suite seeds once with no per-test reset.
    await setDoc(doc(db, "projects/p_feat"), {
      termId: "2026",
      title: "Destacable (admin)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "programs/prog_feat"), {
      termId: "2026",
      title: "Destacable (PM)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "memberPoints/2025/03/e1"), { points: 5 });
    await setDoc(doc(db, "positions/pos1"), {
      title: "Tesorero",
      titleFemale: "Tesorera",
      category: "CEL",
      grants: ["Treasury"],
      term: null,
      description: "Finanzas.",
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "positions/pos_deleted"), {
      title: "Tesorero",
      titleFemale: "Tesorera",
      category: "CEL",
      grants: ["Treasury"],
      term: null,
      description: "Finanzas.",
      active: false,
      deletedAt: DELETED_AT,
    });
    await setDoc(doc(db, "members/m_positions"), {
      name: "Carlos",
      totalPoints: 0,
      uid: "carlos-uid",
      active: true,
      deletedAt: null,
    });
    // An un-invited member: NO uid field (the common case — only invited members
    // get a uid). Exercises the absent-field path in unchanged()/self-edit rules.
    await setDoc(doc(db, "members/m_nouid"), {
      name: "Dora",
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "positions/pos_soft"), {
      title: "Vocal",
      titleFemale: "Vocal",
      category: "JDL",
      grants: [],
      term: 2026,
      description: "Vocal del directorio.",
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "showcase/s1"), { id: "s1", kind: "Project", title: "Eco" });
    await setDoc(doc(db, "allyShowcase/a1"), {
      id: "a1",
      name: "Unifranz",
      logoUrl: "https://cdn/x.png",
      category: "University",
    });
    await setDoc(doc(db, "siteConfig/current"), { version: 1, stats: {}, allies: [] });
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
  it("BLOCKING: denies Membership creating with a forged assignedBy + power cargo (escalation on create)", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_evil"), {
        name: "Evil",
        totalPoints: 0,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-victim-uid" } },
      }),
    );
  });
  it("denies setting uid on create (uid is admin-SDK only)", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_uid"), {
        name: "X",
        totalPoints: 0,
        uid: "mem-uid",
      }),
    );
  });
  it("denies Membership creating with a power cargo even when self-stamped", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_pow"), {
        name: "X",
        totalPoints: 0,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Membership creating with self assignedBy + empty-grants cargo", async () => {
    await assertSucceeds(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_ok"), {
        name: "X",
        totalPoints: 0,
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Admin creating with a power cargo + self assignedBy", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "members/new_admin"), {
        name: "X",
        totalPoints: 0,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
      }),
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
  it("allows Admin to update a member that has NO uid field", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_nouid"), { name: "Dora2" }),
    );
  });
  it("allows Admin to assign a power cargo to a uid-less member (self-stamped)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_nouid"), {
        [`positions.${TERM}`]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" },
      }),
    );
  });
  it("still denies adding a uid to a uid-less member via client update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_nouid"), { uid: "sneak" }));
  });
  it("still denies removing an existing uid via client update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m1"), { uid: deleteField() }));
  });
  it("denies a signed-in user self-editing a uid-less member's profilePicture", async () => {
    await assertFails(
      updateDoc(doc(as("anyone", ["Member"]), "members/m_nouid"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  it("allows the owning member to set only their own profilePicture (H1 self-upload)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  it("denies the owning member changing another field alongside profilePicture", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
        name: "Hijack",
      }),
    );
  });
  it("denies a non-owner member setting another member's profilePicture", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  it("allows soft-deleting a live member (active true -> false)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m1"), {
        active: false,
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
  });
  it("denies resurrecting a soft-deleted member (active false -> true)", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_deleted"), { active: true }));
  });
  it("denies unsetting deletedAt on a soft-deleted member", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_deleted"), { deletedAt: null }));
  });
  it("denies a Member from updating their own profile", async () => {
    await assertFails(
      updateDoc(doc(as("bea-uid", ["Member"]), "members/m_deleted"), { name: "X" }),
    );
  });
  it("denies hard delete even for Admin", async () => {
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
    await assertFails(
      updateDoc(doc(as("u", ["ProjectManager"]), "allies/a1"), { companyName: "X" }),
    );
  });
  it("allows Admin to write allies", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "allies/a1"), { companyName: "X" }));
  });
  it("allows Membership to soft-delete an ally", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "allies/a1"), {
        active: false,
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
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
  it("denies non-admin create (seed path)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "pointRules/2026__DirectProgram"), { points: 5 }),
    );
  });
});

describe("firestore.rules — terms", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "terms/2026")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "terms/2026")));
  });
  it("allows Admin to create a term", async () => {
    await assertSucceeds(setDoc(doc(as("u", ["Admin"]), "terms/2027"), { status: "Activo" }));
  });
  it("allows Admin to update a term", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "terms/2026"), { status: "Cerrado" }));
  });
  it("denies a non-Admin write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "terms/2028"), { status: "Activo" }));
  });
  it("denies delete even for Admin", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "terms/2026")));
  });
});

describe("firestore.rules — activities", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "activities/act1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "activities/act1")));
  });
  it("allows Admin to create an activity", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "activities/act2"), { termId: "2026", category: "Course" }),
    );
  });
  it("allows ProjectManager to create and update an activity", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "activities/act3"), {
        termId: "2026",
        category: "ProjectExecution",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("u", ["ProjectManager"]), "activities/act1"), { category: "Course" }),
    );
  });
  it("denies a plain Member create", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Member"]), "activities/act4"), { termId: "2026", category: "Assembly" }),
    );
  });
  it("denies delete even for Admin", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "activities/act1")));
  });
});

describe("firestore.rules — programs", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "programs/prog1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "programs/prog1")));
  });
  it("allows ProjectManager to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "programs/prog2"), { termId: "2026", title: "Y" }),
    );
  });
  it("allows Admin to update", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "programs/prog1"), { title: "Z" }));
  });
  it("denies a non-privileged role write", async () => {
    await assertFails(updateDoc(doc(as("u", ["Treasury"]), "programs/prog1"), { title: "Nope" }));
  });
  it("denies delete even for Admin", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "programs/prog1")));
  });
});

describe("firestore.rules — initiative direction branch", () => {
  it("lets a direction uid update status", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies a non-direction member", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies direction touching directionUids", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        directionUids: ["owner-uid", "evil-uid"],
      }),
    );
  });
  it("denies changing termId even for Admin", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { termId: "2027" }));
  });
  it("locks status once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { status: "EnEjecucion" }),
    );
  });
  it("locks finalReport and impact once filed", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { finalReport: null }));
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        impact: { personsImpacted: 9, volunteers: 9, custom: [], closingSummary: "edit" },
      }),
    );
  });
  it("still allows title edits on a completed initiative", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { title: "Done (renombrado)" }),
    );
  });
  it("lets Admin set the featured flag", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "projects/p_feat"), { featured: true }));
  });
  it("lets ProjectManager set the featured flag", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["ProjectManager"]), "programs/prog_feat"), { featured: true }),
    );
  });
  it("denies a direction-only editor setting featured true (project)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { featured: true }),
    );
  });
  it("denies a direction-only editor setting featured true (program)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { featured: true }),
    );
  });
  it("lets a direction-only editor update other fields while featured is untouched", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { title: "Eco (dir edit)" }),
    );
  });
  it("lets a direction-only editor echo featured:false on a legacy doc (absent == false)", async () => {
    // The form always sends `featured`; on a pre-feature doc (no field) that value is
    // false. Treating absent as false must NOT deny the edit. Regression guard.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), {
        title: "Eco Prog (dir)",
        featured: false,
      }),
    );
  });
  it("denies create with non-empty directionUids", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new"), {
        termId: "2026",
        title: "X",
        directionUids: ["u"],
        finalReport: null,
      }),
    );
  });
  it("allows PM create without directionUids", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new2"), {
        termId: "2026",
        title: "X",
        finalReport: null,
      }),
    );
  });
  it("denies create with status Finalizado", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new3"), {
        termId: "2026",
        title: "X",
        status: "Finalizado",
        finalReport: null,
      }),
    );
  });
  it("denies create with pre-filled impact", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new4"), {
        termId: "2026",
        title: "X",
        impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" },
        finalReport: null,
      }),
    );
  });
  it("lets a direction uid update a program status (mirrored)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { status: "Planificacion" }),
    );
  });
  it("denies a non-direction member on a program (mirrored)", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "programs/prog_dir"), { status: "Planificacion" }),
    );
  });
  it("direction may edit roster (documented escalation: mirrors new co-director uids)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: [] },
      }),
    );
  });
  it("legacy doc without directionUids: Admin may edit, nobody is direction", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "projects/p1"), { title: "Legacy" }));
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p1"), { title: "Nope" }),
    );
  });
  it("denies setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies Admin setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies completing a program without a finalReport (mirrored)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { status: "Finalizado" }),
    );
  });
  it("lets direction complete with the full trio", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_complete"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "owner-uid" },
        impact: {
          personsImpacted: 120,
          volunteers: 8,
          custom: [],
          closingSummary: "Cerrado con éxito.",
        },
      }),
    );
  });
  it("allows ProjectManager (non-direction) to complete with the full trio", async () => {
    await assertSucceeds(
      updateDoc(doc(as("pm-uid", ["ProjectManager"]), "projects/p_pm"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "pm-uid" },
        impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "Cierre PM." },
      }),
    );
  });
  it("denies a plain Member (non-direction) completing even with the full trio", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "other-uid" },
        impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "Cierre." },
      }),
    );
  });
  it("denies completing with a forged filedBy (not the caller)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "someone-else" },
        impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "Forjado." },
      }),
    );
  });
  it("denies completing with a report but null impact", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "owner-uid" },
        impact: null,
      }),
    );
  });
});

function asClaims(uid: string, claims: Record<string, unknown>) {
  return env.authenticatedContext(uid, claims).firestore();
}

describe("firestore.rules — checkIns", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "checkIns/c1")));
  });
  it("allows Admin to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_admin"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows ProjectManager to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_pm"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows Scanner to create only for an in-scope activity", async () => {
    const ctx = asClaims("s1", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertSucceeds(
      setDoc(doc(ctx, "checkIns/c_scan"), { memberId: "m1", activityId: "a1", role: "Attendee" }),
    );
  });
  it("denies Scanner creating for an out-of-scope activity", async () => {
    const ctx = asClaims("s2", { roles: ["Scanner"], scannerEventIds: ["other"] });
    await assertFails(
      setDoc(doc(ctx, "checkIns/c_bad"), { memberId: "m1", activityId: "a1", role: "Attendee" }),
    );
  });
  it("denies Scanner registering a non-Attendee role (no self-award of director points)", async () => {
    const ctx = asClaims("s3", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertFails(
      setDoc(doc(ctx, "checkIns/c_dir"), { memberId: "s3", activityId: "a1", role: "Director" }),
    );
  });
  it("denies Scanner creating for a non-existent member (no phantom check-ins)", async () => {
    const ctx = asClaims("s4", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertFails(
      setDoc(doc(ctx, "checkIns/c_ghost"), {
        memberId: "ghost",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("denies a plain Member from creating", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Member"]), "checkIns/c_m"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("denies a non-Admin check-in once the activity's day has passed", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_old"), {
        memberId: "m1",
        activityId: "act_old",
        role: "Attendee",
      }),
    );
  });
  it("allows an Admin to backdate a check-in (day-window escape hatch)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_admin"), {
        memberId: "m1",
        activityId: "act_old",
        role: "Attendee",
      }),
    );
  });
  it("keeps an Admin blocked on a backdated cancelled activity (hatch is day-window only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_cancel"), {
        memberId: "m1",
        activityId: "act_old_cancel",
        role: "Attendee",
      }),
    );
  });
  it("keeps an Admin blocked when a backdated activity's parent is Finalizado (hatch is day-window only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_closed"), {
        memberId: "m1",
        activityId: "act_old_closed_parent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in when the parent initiative is Finalizado", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_closed"), {
        memberId: "m1",
        activityId: "act_closed_parent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in for a cancelled activity", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_cancel"), {
        memberId: "m1",
        activityId: "act_cancel",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in when the activity has a malformed parentType (fails closed)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_badparent"), {
        memberId: "m1",
        activityId: "act_badparent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in for a non-existent activity", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_ghostact"), {
        memberId: "m1",
        activityId: "does_not_exist",
        role: "Attendee",
      }),
    );
  });
  it("denies update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "checkIns/c1"), { role: "Director" }));
  });
  it("allows Admin to delete a check-in within the window (mis-scan correction)", async () => {
    await assertSucceeds(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_admin")));
  });
  it("allows a Scanner to delete an Attendee row on an in-scope activity", async () => {
    const ctx = asClaims("s1", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertSucceeds(deleteDoc(doc(ctx, "checkIns/c_del_scan")));
  });
  it("denies a Scanner deleting on an out-of-scope activity", async () => {
    const ctx = asClaims("s2", { roles: ["Scanner"], scannerEventIds: ["other"] });
    await assertFails(deleteDoc(doc(ctx, "checkIns/c1")));
  });
  it("denies a plain Member from deleting", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Member"]), "checkIns/c1")));
  });
  it("denies a non-Admin delete once the activity's day has passed (window binds delete too)", async () => {
    await assertFails(deleteDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_del_old")));
  });
  it("denies a Scanner deleting a non-Attendee row even on an in-scope activity", async () => {
    const ctx = asClaims("s1", { roles: ["Scanner"], scannerEventIds: ["a1"] });
    await assertFails(deleteDoc(doc(ctx, "checkIns/c_del_director")));
  });
  it("allows Admin to delete a past-day check-in (day-window bypass on delete)", async () => {
    await assertSucceeds(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_old_admin")));
  });
  it("denies delete on a cancelled activity (window binds delete)", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_cancel")));
  });
  it("denies delete when the parent initiative is Finalizado", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_closed")));
  });
});

describe("firestore.rules — participations", () => {
  it("allows signed-in read (ledger behind the points table)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "participations/part1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "participations/part1")));
  });
  it("denies all client writes (engine-only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "participations/part2"), { memberId: "m1", termId: "2026" }),
    );
  });
});

describe("firestore.rules — memberPoints", () => {
  it("allows signed-in read (public to members)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "memberPoints/2025/03/e1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "memberPoints/2025/03/e1")));
  });
  it("denies all client writes", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "memberPoints/2025/03/e1"), { p: 1 }));
  });
});

describe("firestore.rules — public + deny-all", () => {
  it("denies anonymous read of projects (D1 restricted; was public)", async () => {
    await assertFails(getDoc(doc(anon(), "projects/p1")));
  });
  it("allows a signed-in user to read projects", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "projects/p1")));
  });
  it("allows anonymous read of board", async () => {
    await assertSucceeds(getDoc(doc(anon(), "board/b1")));
  });
  it("denies access to an unlisted collection", async () => {
    await assertFails(getDoc(doc(as("u", ["Admin"]), "settings/s1")));
  });
});

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
  it("denies ExecutiveCommittee creating a position with grants", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/new_priv"), {
        title: "Cargo Sombra",
        titleFemale: "Cargo Sombra",
        category: "JDL",
        grants: ["Admin"],
        term: 2026,
        description: "Escalación.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("allows Admin to create a position with grants", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "positions/admin_created"), {
        title: "Presidente",
        titleFemale: "Presidenta",
        category: "CEL",
        grants: ["Admin"],
        term: null,
        description: "Dirige el capítulo.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies ExecutiveCommittee mutating grants on an existing position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos1"), { grants: ["Admin"] }),
    );
  });
  it("allows ExecutiveCommittee updating non-grants fields", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos1"), {
        description: "Actualizada.",
      }),
    );
  });
  it("allows ExecutiveCommittee to soft-delete a live position", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos_soft"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
  });
  it("denies ExecutiveCommittee resurrecting a soft-deleted position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos_deleted"), { active: true }),
    );
  });
});

describe("firestore.rules — activity parent-initiative direction", () => {
  it("lets the parent initiative's direction update a parented activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir"), {
        photos: [
          {
            id: "ph1",
            url: "https://x/ph1.jpg",
            caption: null,
            uploadedAt: new Date("2026-06-12T00:00:00Z"),
            uploadedBy: "m_owner",
          },
        ],
      }),
    );
  });
  it("still lets Admin update a parented activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_dir"), { title: "Renombrada" }),
    );
  });
  it("denies a non-direction member updating a parented activity", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "activities/act_dir"), { title: "Hack" }),
    );
  });
  it("denies a direction member updating a standalone activity (no parent direction)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_standalone"), { title: "X" }),
    );
  });
});

describe("firestore.rules — initiative featured create-gate", () => {
  // Curation authority is the Admin/ProjectManager ROLE; a custom role holding only
  // the create perm may create initiatives but never born-featured ones.
  function asCustom(uid: string, perms: string[]) {
    return env.authenticatedContext(uid, { roles: ["Member"], perms }).firestore();
  }

  it("denies a custom create:Project holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c1"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("denies a custom manage:Project holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["manage:Project"]), "projects/p_feat_c2"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("denies a custom create:Program holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Program"]), "programs/prog_feat_c1"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("allows a custom create:Project holder creating featured:false", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c3"), {
        termId: "2026",
        title: "Normal",
        featured: false,
      }),
    );
  });
  it("allows a custom create:Project holder creating without the field", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c4"), {
        termId: "2026",
        title: "Normal",
      }),
    );
  });
  it("featured:false does not bypass the other create guards (parenthesization)", async () => {
    // Regression pin: if the featured arm ever loses its parens, `&& A || B`
    // re-associates and a featured:false create would skip every other guard.
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c5"), {
        termId: "2026",
        title: "X",
        featured: false,
        status: "Finalizado",
      }),
    );
  });
  it("allows Admin creating featured:true", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "projects/p_feat_admin_create"), {
        termId: "2026",
        title: "Curada",
        featured: true,
      }),
    );
  });
  it("allows ProjectManager creating featured:true (program)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "programs/prog_feat_pm_create"), {
        termId: "2026",
        title: "Curada",
        featured: true,
      }),
    );
  });
});

describe("firestore.rules — activity lock (hasCheckIns)", () => {
  it("denies Admin changing category on a locked activity", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), { category: "Course" }),
    );
  });
  it("denies Admin changing startAt on a locked activity", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), {
        startAt: new Date("2026-06-11T18:00:00Z"),
      }),
    );
  });
  it("denies Admin re-parenting a locked activity", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), {
        parentType: "Project",
        parentId: "p_dir",
      }),
    );
  });
  it("allows Admin editing title on a locked activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), { title: "Renombrada" }),
    );
  });
  it("allows an echo update resending unchanged locked fields", async () => {
    // The backstage mapper always sends the full editable field set.
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), {
        category: "Assembly",
        startAt: LOCK_TS,
        parentType: null,
        parentId: null,
        title: "Bloqueada (echo)",
      }),
    );
  });
  it("allows category change while hasCheckIns is false", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_unlocked_flag"), { category: "Course" }),
    );
  });
  it("allows category change on a legacy doc without the flag", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act1"), { category: "Course" }),
    );
  });
  it("denies client setting hasCheckIns:true on create (even Admin)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "activities/act_forge1"), {
        termId: "2026",
        category: "Assembly",
        hasCheckIns: true,
      }),
    );
  });
  it("denies client setting hasCheckIns:false on create (beacon-only field)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "activities/act_forge2"), {
        termId: "2026",
        category: "Assembly",
        hasCheckIns: false,
      }),
    );
  });
  it("denies client clearing hasCheckIns on update (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), { hasCheckIns: false }),
    );
  });
  it("denies client removing hasCheckIns via deleteField", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_unlocked_flag"), {
        hasCheckIns: deleteField(),
      }),
    );
  });
  it("lets the parent direction edit a locked activity while locked fields are untouched", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir_locked"), {
        title: "Editada por dirección",
      }),
    );
  });
  it("denies the parent direction changing category on a locked activity", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir_locked"), {
        category: "Course",
      }),
    );
  });
});

describe("showcase (public read, beacon-only write)", () => {
  it("anyone (anon) can read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "showcase/s1")));
  });
  it("signed-in member can read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "showcase/s1")));
  });
  it("anon cannot write", async () => {
    await assertFails(setDoc(doc(anon(), "showcase/s2"), { title: "x" }));
  });
  it("admin cannot write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "showcase/s2"), { title: "x" }));
  });
});

describe("allyShowcase (public read, beacon-only write)", () => {
  it("allows anonymous read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "allyShowcase/a1")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "allyShowcase/a2"), { name: "x" }));
  });
  it("denies Admin write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "allyShowcase/a2"), { name: "x" }));
  });
});

// Rules derive the term from request.time.year() (UTC); compute it from the client
// clock so this suite can't rot when the calendar year rolls over.
const TERM = String(new Date().getUTCFullYear());

describe("firestore.rules — member positions assignment", () => {
  it("allows ExecutiveCommittee to assign an empty-grants cargo with self assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("denies ExecutiveCommittee assigning a power-conferring cargo (Treasury)", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("BLOCKING: denies Membership assigning a power-conferring cargo", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Admin to assign a power-conferring cargo", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
      }),
    );
  });
  it("denies a forged assignedBy (not the caller's uid)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "someone-else" } },
      }),
    );
  });
  it("denies ExecutiveCommittee touching non-position fields", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
        name: "Hacked",
      }),
    );
  });
  it("still allows Membership to edit non-position fields without assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), { name: "Renamed" }),
    );
  });
  it("denies a forged assignedBy on the ExecutiveCommittee path", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "not-exec" } },
      }),
    );
  });
  it("BLOCKING: denies a non-current-term ride-along power cargo", async () => {
    // current term is safe (empty-grants, self), but a future term sneaks a power
    // cargo with a forged assignedBy — must be denied (only current term may change).
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: {
          [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
          "2099": { cargoId: "pos1", comisionIds: [], assignedBy: "someone-else" },
        },
      }),
    );
  });
  it("denies a member setting positions via the self update path", async () => {
    // members/m1.uid === "owner-uid"; the self rule only allows profilePicture.
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "owner-uid" } },
      }),
    );
  });
  it("allows a non-Admin to assign a power-conferring comisión (rules pass; beacon trust gate drops the grant)", async () => {
    // INTENTIONAL: rules cannot iterate comisionIds, so comisión grants are NOT
    // gated here. The beacon onMemberWritten trust gate honors comisión power
    // grants only when assignedBy is an Admin (see apps/beacon claims-sync).
    await assertSucceeds(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: null, comisionIds: ["pos1"], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("denies a non-Admin assigning a dangling cargoId (get() on missing position fails closed)", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_ghost", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("allows the production dot-path write shape (EC, current term, empty-grants cargo)", async () => {
    // setPositions / toMemberUpdateDoc emit positions.<term> dot-paths, not a full
    // positions map — assert that exact production shape passes the rules.
    await assertSucceeds(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" },
      }),
    );
  });
  it("denies the dot-path shape under a non-current term (past-term immutability)", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        "positions.2099": { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" },
      }),
    );
  });
});

describe("firestore.rules — roles collection", () => {
  const ROLE_DOC = {
    name: "Coordinador",
    description: "",
    builtIn: false,
    builtInKey: null,
    permissions: ["manage:Event"],
    locked: false,
    active: true,
    deletedAt: null,
  };

  it("allows any signed-in user to read role definitions", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "roles/Admin")));
  });
  it("denies anonymous reads of role definitions", async () => {
    await assertFails(getDoc(doc(anon(), "roles/Admin")));
  });
  it("allows Admin to create a custom role", async () => {
    await assertSucceeds(setDoc(doc(as("admin-uid", ["Admin"]), "roles/custom1"), ROLE_DOC));
  });
  it("denies a non-Admin (Membership) creating a role", async () => {
    await assertFails(setDoc(doc(as("mem-uid", ["Membership"]), "roles/custom2"), ROLE_DOC));
  });
  it("BLOCKING: denies a client creating a role that spoofs a built-in key", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/impostor"), {
        ...ROLE_DOC,
        builtIn: true,
        builtInKey: "Treasury",
        permissions: ["manage:all"],
      }),
    );
  });
  it("allows Admin to edit a custom role's permissions", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/custom_existing"), {
        permissions: ["read:Event", "manage:Ally"],
      }),
    );
  });
  it("allows Admin to edit a non-locked built-in role's permissions", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Treasury"), {
        permissions: ["read:Member"],
      }),
    );
  });
  it("denies a non-Admin updating a role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/custom_existing"), {
        permissions: ["manage:all"],
      }),
    );
  });
  it("BLOCKING: denies editing the locked Admin role", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), { permissions: ["read:Member"] }),
    );
  });
  it("denies changing a role's identity fields (builtInKey)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/custom_existing"), {
        builtInKey: "Treasury",
      }),
    );
  });
  it("denies deactivating a built-in role (would restore seed perms via the trigger)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Treasury"), { active: false }),
    );
  });
  it("denies hard-deleting a role even for Admin", async () => {
    await assertFails(deleteDoc(doc(as("admin-uid", ["Admin"]), "roles/custom_existing")));
  });
});

describe("firestore.rules — member permission assignment (roleIds + overrides)", () => {
  it("allows Admin to set roleIds + permissionOverrides on a member", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        roleIds: ["custom1"],
        permissionOverrides: { grant: ["manage:Event"], revoke: [] },
      }),
    );
  });
  it("BLOCKING: denies Membership setting roleIds (privilege escalation vector)", async () => {
    // A distinct value (not whatever the Admin test left on m1) so this is a real
    // change — setting roleIds to its current value would be a legitimate no-op.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        roleIds: ["membership-self-grant"],
      }),
    );
  });
  it("BLOCKING: denies Membership setting permissionOverrides", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        permissionOverrides: { grant: ["manage:all"], revoke: [] },
      }),
    );
  });
  it("still allows Membership to edit ordinary fields (roleIds untouched)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), { name: "Renombrada" }),
    );
  });
  it("allows Admin to create a member carrying roleIds", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "members/m_admin_new"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
        roleIds: ["custom1"],
      }),
    );
  });
  it("BLOCKING: denies Membership creating a member with roleIds", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/m_mem_new"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
        roleIds: ["custom1"],
      }),
    );
  });
  it("allows Membership to create a member without permission fields", async () => {
    await assertSucceeds(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/m_mem_plain"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
      }),
    );
  });
});

describe("firestore.rules — perm-based coarse gates", () => {
  // A custom role confers no built-in role name; its power is entirely in `perms`.
  function asCustom(uid: string, perms: string[]) {
    return env.authenticatedContext(uid, { roles: ["Member"], perms }).firestore();
  }

  it("grants ally create to a custom role with manage:Ally and no privileged role", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("custom-uid", ["manage:Ally"]), "allies/a_custom"), {
        companyName: "Nueva",
        active: true,
        deletedAt: null,
      }),
    );
  });

  it("grants member read to a custom role with read:Member", async () => {
    await assertSucceeds(getDoc(doc(asCustom("custom-uid", ["read:Member"]), "members/m1")));
  });

  it("manage:all behaves as superuser for any subject", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("su-uid", ["manage:all"]), "events/e_su"), { title: "X" }),
    );
  });

  it("denies a coarse write when the perm is absent (role present, perm not)", async () => {
    // Member role carries no coarse perms; explicit empty perms → canDo denies.
    await assertFails(
      setDoc(doc(asCustom("plain-uid", []), "allies/a_denied"), {
        companyName: "No",
        active: true,
        deletedAt: null,
      }),
    );
  });

  it("fail-closed: denies a coarse write when the perms claim is absent (pre-backfill)", async () => {
    const ctx = env.authenticatedContext("legacy-uid", { roles: ["Membership"] }).firestore();
    await assertFails(
      setDoc(doc(ctx, "allies/a_legacy"), { companyName: "Legacy", active: true, deletedAt: null }),
    );
  });

  it("reconciled: Membership (via perms) can still create + update allies", async () => {
    await assertSucceeds(
      setDoc(doc(as("mem-uid", ["Membership"]), "allies/a_mem"), {
        companyName: "Aliado",
        active: true,
        deletedAt: null,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "allies/a1"), { companyName: "Editado" }),
    );
  });

  it("reconciled: ExecutiveCommittee (via perms) can create events", async () => {
    await assertSucceeds(
      setDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "events/e_ec"), { title: "Asamblea" }),
    );
  });

  it("grants activity create to a custom role with manage:Activity", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("act-uid", ["manage:Activity"]), "activities/a_custom"), {
        termId: "2026",
        category: "Assembly",
      }),
    );
  });

  it("fail-closed: ProjectManager with absent perms claim cannot create an activity", async () => {
    const ctx = env.authenticatedContext("legacy-pm", { roles: ["ProjectManager"] }).firestore();
    await assertFails(
      setDoc(doc(ctx, "activities/a_legacy"), { termId: "2026", category: "Assembly" }),
    );
  });
});

describe("firestore.rules — siteConfig", () => {
  it("allows anonymous read (public site)", async () => {
    await assertSucceeds(getDoc(doc(anon(), "siteConfig/current")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "siteConfig/current"), { version: 2 }));
  });
  it("denies non-admin signed-in write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "siteConfig/current"), { version: 2 }));
  });
  it("allows Admin write", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin", ["Admin"]), "siteConfig/current"), {
        version: 2,
        stats: {},
        allies: [],
      }),
    );
  });
});
