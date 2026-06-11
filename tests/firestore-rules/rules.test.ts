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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

function as(uid: string, roles: string[]) {
  return env.authenticatedContext(uid, { roles }).firestore();
}
function anon() {
  return env.unauthenticatedContext().firestore();
}

const MEMBER_DOC = { name: "Ana", totalPoints: 0, uid: "owner-uid", active: true, deletedAt: null };
const DELETED_AT = new Date("2026-01-01T00:00:00Z");

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
    await setDoc(doc(db, "terms/2026"), { status: "Activo" });
    await setDoc(doc(db, "activities/act1"), { termId: "2026", category: "Assembly" });
    await setDoc(doc(db, "checkIns/c1"), { memberId: "m1", activityId: "a1", role: "Attendee" });
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
    await setDoc(doc(db, "memberPoints/2025/03/e1"), { points: 5 });
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
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { termId: "2027" }),
    );
  });
  it("locks status once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { status: "EnEjecucion" }),
    );
  });
  it("locks finalReport and impact once filed", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { finalReport: null }),
    );
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
  it("denies update and delete", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "checkIns/c1"), { role: "Director" }));
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c1")));
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
