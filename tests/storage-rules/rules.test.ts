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
import { getBytes, ref, uploadBytes } from "firebase/storage";

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
    firestore: { host: "127.0.0.1", port: firestorePort, rules: readFileSync(firestoreRules, "utf8") },
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
