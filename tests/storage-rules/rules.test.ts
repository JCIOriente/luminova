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
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes, deleteObject } from "firebase/storage";

let env: RulesTestEnvironment;

function storageAs(uid: string, roles: string[]) {
  return env.authenticatedContext(uid, { roles }).storage();
}
function storageAnon() {
  return env.unauthenticatedContext().storage();
}

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const JPEG = { contentType: "image/jpeg" };
const PATH = "members/m1/profile.jpg";
const MISSING_PATH = "members/m_missing/profile.jpg";

beforeAll(async () => {
  const storageRules = resolve(fileURLToPath(new URL("../../storage.rules", import.meta.url)));
  const firestoreRules = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  const firestorePort = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010);
  const storagePort = Number(process.env.STORAGE_EMULATOR_PORT ?? 9199);
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    storage: { host: "127.0.0.1", port: storagePort, rules: readFileSync(storageRules, "utf8") },
    firestore: {
      host: "127.0.0.1",
      port: firestorePort,
      rules: readFileSync(firestoreRules, "utf8"),
    },
  });
  await env.clearStorage();
  await env.clearFirestore();
  // Seed the member doc so the rule's firestore.get(memberId).data.uid resolves.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "members/m1"), {
      name: "Ana",
      uid: "owner-uid",
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(ctx.firestore(), "projects/proj1"), {
      termId: "2026",
      title: "Proyecto Uno",
      directionUids: ["dir-uid"],
    });
    await setDoc(doc(ctx.firestore(), "activities/act_child"), {
      termId: "2026",
      title: "Curso A",
      parentType: "Project",
      parentId: "proj1",
    });
    await setDoc(doc(ctx.firestore(), "activities/act_standalone"), {
      termId: "2026",
      title: "Asamblea",
      parentType: null,
      parentId: null,
    });
    await setDoc(doc(ctx.firestore(), "programs/prog1"), {
      termId: "2026",
      title: "Programa Uno",
      directionUids: ["dir-uid"],
    });
    await setDoc(doc(ctx.firestore(), "projects/proj_nodir"), {
      termId: "2026",
      title: "Sin Direccion",
    });
    await setDoc(doc(ctx.firestore(), "activities/act_prog_child"), {
      termId: "2026",
      title: "Curso Programa",
      parentType: "Program",
      parentId: "prog1",
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("storage.rules — member profile photos", () => {
  it("denies anonymous writes", async () => {
    await assertFails(uploadBytes(ref(storageAnon(), PATH), PHOTO, JPEG));
  });

  it("denies anonymous reads", async () => {
    await assertFails(getBytes(ref(storageAnon(), PATH)));
  });

  it("allows a privileged role (Admin) to write any member's photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("admin1", ["Admin"]), PATH), PHOTO, JPEG));
  });

  it("allows a privileged role (Membership) to write any member's photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("staff1", ["Membership"]), PATH), PHOTO, JPEG));
  });

  it("allows the owning member to write their own photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("owner-uid", ["Member"]), PATH), PHOTO, JPEG));
  });

  it("denies a non-owner member writing another member's photo", async () => {
    await assertFails(uploadBytes(ref(storageAs("stranger", ["Member"]), PATH), PHOTO, JPEG));
  });

  it("denies a write when the member document does not exist", async () => {
    await assertFails(uploadBytes(ref(storageAs("ghost", ["Member"]), MISSING_PATH), PHOTO, JPEG));
  });

  it("denies a non-jpeg content type even for a privileged role", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("admin1", ["Admin"]), PATH), PHOTO, {
        contentType: "application/octet-stream",
      }),
    );
  });

  it("denies an oversize upload even for a privileged role", async () => {
    const tooBig = new Uint8Array(5 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storageAs("admin1", ["Admin"]), PATH), tooBig, JPEG));
  });

  it("allows any authenticated user to read a member photo", async () => {
    await assertSucceeds(getBytes(ref(storageAs("any", ["Member"]), PATH)));
  });

  it("denies writes outside the members tree", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("admin1", ["Admin"]), "secret/x.jpg"), PHOTO, JPEG),
    );
  });

  it("denies writing a non-profile.jpg file under a member folder", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("admin1", ["Admin"]), "members/m1/evil.exe"), PHOTO, JPEG),
    );
  });
});

const PROJ_PHOTO = "projects/proj1/photos/ph1.jpg";
const ACT_CHILD_PHOTO = "activities/act_child/photos/ph1.jpg";
const ACT_STANDALONE_PHOTO = "activities/act_standalone/photos/ph1.jpg";

describe("storage.rules — initiative photos", () => {
  it("allows Admin to write", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("allows ProjectManager to write", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("a", ["ProjectManager"]), PROJ_PHOTO), PHOTO, JPEG),
    );
  });
  it("allows the initiative direction to write", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("dir-uid", ["Member"]), PROJ_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies a non-direction member", async () => {
    await assertFails(uploadBytes(ref(storageAs("stranger", ["Member"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("denies anonymous", async () => {
    await assertFails(uploadBytes(ref(storageAnon(), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("denies a non-jpeg even for Admin", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), PHOTO, {
        contentType: "application/octet-stream",
      }),
    );
  });
  it("denies oversize even for Admin", async () => {
    await assertFails(
      uploadBytes(
        ref(storageAs("a", ["Admin"]), PROJ_PHOTO),
        new Uint8Array(5 * 1024 * 1024 + 1),
        JPEG,
      ),
    );
  });
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getBytes(ref(storageAs("any", ["Member"]), PROJ_PHOTO)));
  });
});

describe("storage.rules — activity photos", () => {
  it("allows Admin to write a parented activity photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), ACT_CHILD_PHOTO), PHOTO, JPEG));
  });
  it("allows the parent initiative's direction to write", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("dir-uid", ["Member"]), ACT_CHILD_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies a non-direction member on a parented activity", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("stranger", ["Member"]), ACT_CHILD_PHOTO), PHOTO, JPEG),
    );
  });
  it("allows Admin on a standalone activity", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("a", ["Admin"]), ACT_STANDALONE_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies a member (no parent direction) on a standalone activity", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("dir-uid", ["Member"]), ACT_STANDALONE_PHOTO), PHOTO, JPEG),
    );
  });
});

const PROG_PHOTO = "programs/prog1/photos/ph1.jpg";
const PROJ_NODIR_PHOTO = "projects/proj_nodir/photos/ph1.jpg";
const ACT_PROG_CHILD_PHOTO = "activities/act_prog_child/photos/ph1.jpg";

describe("storage.rules — programs path + Program-parented activity + missing directionUids", () => {
  it("allows Admin to write a program photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), PROG_PHOTO), PHOTO, JPEG));
  });
  it("allows the program's direction to write", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("dir-uid", ["Member"]), PROG_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies a non-direction member on a program photo", async () => {
    await assertFails(uploadBytes(ref(storageAs("stranger", ["Member"]), PROG_PHOTO), PHOTO, JPEG));
  });
  it("allows the parent PROGRAM's direction to write an activity photo", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("dir-uid", ["Member"]), ACT_PROG_CHILD_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies a non-direction member on a Program-parented activity", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("stranger", ["Member"]), ACT_PROG_CHILD_PHOTO), PHOTO, JPEG),
    );
  });
  it("denies (does not error) a member on an initiative lacking directionUids", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("anyone", ["Member"]), PROJ_NODIR_PHOTO), PHOTO, JPEG),
    );
  });
});

describe("storage.rules — photo deletes (request.resource is null on delete)", () => {
  it("lets an editor delete an initiative photo (not gated on isValidPhoto)", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), PHOTO, JPEG));
    await assertSucceeds(deleteObject(ref(storageAs("dir-uid", ["Member"]), PROJ_PHOTO)));
  });
  it("lets an editor delete an activity photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), ACT_CHILD_PHOTO), PHOTO, JPEG));
    await assertSucceeds(deleteObject(ref(storageAs("a", ["Admin"]), ACT_CHILD_PHOTO)));
  });
  it("denies a non-editor deleting an initiative photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), PROG_PHOTO), PHOTO, JPEG));
    await assertFails(deleteObject(ref(storageAs("stranger", ["Member"]), PROG_PHOTO)));
  });
});
