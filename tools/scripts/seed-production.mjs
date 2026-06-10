// Bootstraps a PRODUCTION Admin login WITH custom claims (roles: ["Admin"]).
// The Firebase console can create a user + password but CANNOT set custom claims,
// so this admin-SDK script does both. Run once after the first deploy; change the
// password from the Firebase console afterwards.
//
// Requires Application Default Credentials for the prod project:
//   gcloud auth application-default login
//   (or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json)
//
// Run:       pnpm seed:production
// Override:  SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... pnpm seed:production
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Hard guard: never let emulator env vars silently redirect a production seed.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: emulator env vars are set (FIREBASE_AUTH_EMULATOR_HOST / " +
      "FIRESTORE_EMULATOR_HOST). This script targets PRODUCTION — unset them and retry.",
  );
  process.exit(1);
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "jci-oriente";
const email = process.env.SEED_ADMIN_EMAIL ?? "jci.orienteolm@gmail.com";
const password = process.env.SEED_ADMIN_PASSWORD ?? "Secret1";

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();

async function seedAdmin() {
  let user;
  try {
    user = await auth.createUser({ email, password });
    console.log(`Created Auth user ${email} (uid ${user.uid}).`);
  } catch (error) {
    if (error?.code !== "auth/email-already-exists") throw error;
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log(`Auth user ${email} already existed (uid ${user.uid}); password reset.`);
  }

  // Merge, never clobber: preserve any existing claims/roles, ensure Admin is present.
  const existingRoles = Array.isArray(user.customClaims?.roles) ? user.customClaims.roles : [];
  const roles = Array.from(new Set([...existingRoles, "Admin"]));
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, roles });

  console.log(`Set claims roles=${JSON.stringify(roles)} on ${email} (project ${projectId}).`);
  console.log(
    `\nLog in to backstage with:\n  ${email} / ${password}\n` +
      "Then change this password from the Firebase console.",
  );
}

seedAdmin().then(() => process.exit(0));
