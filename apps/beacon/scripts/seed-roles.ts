import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isValidRole, type Role } from "@luminova/auth/roles";

// The only guard: FIREBASE_AUTH_EMULATOR_HOST. When it is set the Admin SDK can only
// reach the local Auth emulator — it physically cannot touch prod — so this is both
// necessary and sufficient. (The frontend's VITE_FIREBASE_EMULATOR_ENABLED is a build-
// time var that isn't visible to this Node script.)
function assertEmulator(): void {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is not set (this script is emulator-only).",
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
