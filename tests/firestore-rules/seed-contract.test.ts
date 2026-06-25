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
import { doc, getDoc, setDoc } from "firebase/firestore";
// The contract under test: the EXACT claims the seed scripts mint must satisfy
// firestore.rules. This guards the class of bug PR #107 fixed — a seeded user whose
// claims don't carry the perms the rules gate on (every read failed closed → "No se
// pudieron cargar …"). Importing the real producers (not a re-implementation) is the point.
import { presidentClaims } from "../../tools/scripts/lib/president-claims.mjs";
import { permsForRoles } from "../../tools/scripts/lib/role-seed.mjs";

// Own projectId so this file's clearFirestore is isolated from rules.test.ts (both share
// the one emulator; vitest runs test files in parallel).
const PROJECT_ID = "demo-seed-contract";

let env: RulesTestEnvironment;

function as(uid: string, claims: { roles: string[]; perms: string[] }) {
  return env.authenticatedContext(uid, claims).firestore();
}

beforeAll(async () => {
  const rulesPath = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010),
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members/m1"), {
      name: "Ana",
      totalPoints: 0,
      uid: "ana-uid",
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "allies/a1"), { companyName: "ACME", active: true, deletedAt: null });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("seed claims satisfy firestore.rules", () => {
  it("the seeded president (manage:all) can read members and allies — the reads that broke", async () => {
    const db = as("pres-uid", presidentClaims());
    await assertSucceeds(getDoc(doc(db, "members/m1")));
    await assertSucceeds(getDoc(doc(db, "allies/a1")));
  });

  it("a seed:roles Membership grant can read allies (read:Ally)", async () => {
    const db = as("mem-uid", { roles: ["Membership"], perms: permsForRoles(["Membership"]) });
    await assertSucceeds(getDoc(doc(db, "allies/a1")));
  });

  it("a seed:roles Treasury grant can read members (read:Member)", async () => {
    const db = as("tre-uid", { roles: ["Treasury"], perms: permsForRoles(["Treasury"]) });
    await assertSucceeds(getDoc(doc(db, "members/m1")));
  });

  it("a seed:roles Treasury grant is denied allies (no read:Ally) — guards against the grant silently widening", async () => {
    const db = as("tre-uid", { roles: ["Treasury"], perms: permsForRoles(["Treasury"]) });
    await assertFails(getDoc(doc(db, "allies/a1")));
  });
});
