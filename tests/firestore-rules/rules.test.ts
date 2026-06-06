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
      port: 4010,
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
    await setDoc(doc(db, "projects/p1"), { title: "P" });
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
