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

let env: RulesTestEnvironment;

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
});

afterAll(async () => {
  await env.cleanup();
});

describe("firestore.rules", () => {
  it("allows anyone to read public projects", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "projects/p1")));
  });

  it("denies anonymous writes to projects", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "projects/p1"), { title: "x" }));
  });

  it("denies anonymous reads of members", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "members/m1")));
  });

  it("allows authenticated reads of members", async () => {
    const db = env.authenticatedContext("admin").firestore();
    await assertSucceeds(getDoc(doc(db, "members/m1")));
  });

  it("allows authenticated writes to members", async () => {
    const db = env.authenticatedContext("admin").firestore();
    await assertSucceeds(setDoc(doc(db, "members/m1"), { name: "Ana" }));
  });
});
