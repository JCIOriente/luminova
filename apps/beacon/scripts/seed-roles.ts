import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isValidRole, type Role } from "@luminova/auth/roles";

function assertEmulator(): void {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is not set (this script is emulator-only).",
    );
  }
  const projectId = process.env.GCLOUD_PROJECT ?? "demo-roles";
  if (!projectId.startsWith("demo-")) {
    throw new Error(
      `Refusing to run: GCLOUD_PROJECT must be a demo- project for emulator use (got "${projectId}").`,
    );
  }
}

async function main(): Promise<void> {
  assertEmulator();

  const [uid, ...roleArgs] = process.argv.slice(2);
  if (!uid || roleArgs.length === 0) {
    throw new Error("Usage: pnpm --filter beacon seed:roles -- <uid> <Role> [Role...]");
  }
  for (const role of roleArgs) {
    if (!isValidRole(role)) throw new Error(`unknown role: ${role}`);
  }
  const roles = roleArgs as Role[];

  if (!getApps().length) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-roles" });
  }
  await getAuth().setCustomUserClaims(uid, { roles });

  console.log(`Granted ${roles.join(", ")} to ${uid}`);
}

void main();
