import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isValidRole, type Role } from "@luminova/auth/roles";

function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? "demo-roles";
}

function assertEmulator(): void {
  // The real safety guard: with FIREBASE_AUTH_EMULATOR_HOST set, the Admin SDK can
  // only reach the local Auth emulator — it physically cannot touch prod, regardless
  // of the project id. So this alone makes the script safe to run.
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is not set (this script is emulator-only).",
    );
  }
  // `demo-*` is the convention for throwaway emulator runs, but to grant roles to the
  // user your app actually sees, GCLOUD_PROJECT must match the app's project (e.g.
  // jci-oriente). Warn — don't refuse — when it isn't a demo project.
  if (!projectId().startsWith("demo-")) {
    console.warn(
      `Note: GCLOUD_PROJECT="${projectId()}" is not a demo- project. Fine for the emulator ` +
        `(FIREBASE_AUTH_EMULATOR_HOST is set); just ensure it matches the project your app ` +
        `connects to so the claims land on the right user.`,
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
    initializeApp({ projectId: projectId() });
  }
  await getAuth().setCustomUserClaims(uid, { roles });

  console.log(`Granted ${roles.join(", ")} to ${uid}`);
}

void main();
