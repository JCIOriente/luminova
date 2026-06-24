// Bootstraps the PRODUCTION president (a real member who is Admin via the
// Presidente cargo) — ONCE, and seeds siteConfig/current with default org facts so
// spotlight works immediately after deploy. The Firebase console cannot set custom
// claims, so this admin-SDK script does it, then self-assigns the Admin cargo so
// the claims-sync trigger keeps Admin durably. A `meta/bootstrap` doc makes
// president re-runs a no-op (siteConfig is always (re-)written on each run).
//
// Requires Application Default Credentials for the prod project:
//   gcloud auth application-default login
//   (or GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json)
//
// Run:  pnpm seed:production
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createInterface } from "node:readline/promises";
import { seedPresident } from "./lib/seed-president.mjs";
import { seedBuiltInRoles, BUILT_IN_ROLE_PERMS } from "./lib/role-seed.mjs";
import { SITE_CONFIG_CONTENT } from "./lib/site-config-seed-data.mjs";

if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: emulator env vars are set (FIREBASE_AUTH_EMULATOR_HOST / " +
      "FIRESTORE_EMULATOR_HOST). This script targets PRODUCTION — unset them and retry.",
  );
  process.exit(1);
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "jci-oriente";
// Mirror of currentTermKey() in packages/types/src/position.ts (UTC year).
const TERM = String(new Date().getUTCFullYear());

const rl = createInterface({ input: process.stdin, output: process.stdout });

// Intercept echo so askHidden can suppress the typed password characters. When
// muted, still honor a write callback (Node may pass one) so nothing hangs.
const realWrite = rl.output.write.bind(rl.output);
rl.output.write = (chunk, ...rest) => {
  if (!rl.output.muted) return realWrite(chunk, ...rest);
  const cb = rest[rest.length - 1];
  if (typeof cb === "function") cb();
  return true;
};

async function ask(label, validate) {
  for (;;) {
    const value = (await rl.question(`${label}: `)).trim();
    const error = validate(value);
    if (!error) return value;
    console.error(`  ✗ ${error}`);
  }
}

async function askHidden(label, validate) {
  for (;;) {
    process.stdout.write(`${label}: `);
    rl.output.muted = true;
    const value = (await rl.question("")).trim();
    rl.output.muted = false;
    process.stdout.write("\n");
    const error = validate(value);
    if (!error) return value;
    console.error(`  ✗ ${error}`);
  }
}

const nonEmpty = (v) => (v.length === 0 ? "required" : null);
const emailOk = (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "invalid email");
const genderOk = (v) =>
  ["Masculino", "Femenino"].includes(v) ? null : "type Masculino or Femenino";
const dateOk = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
    ? null
    : "use YYYY-MM-DD";
// Mirror of the app password policy (apps/backstage .../auth/types/password-policy).
const passwordOk = (v) =>
  v.length >= 6 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)
    ? null
    : "min 6 chars with a lowercase, an uppercase, and a digit";

// Touch every member so the deployed onMemberWritten trigger re-mints their custom
// claims (roles + the new `perms` set) using the production resolution logic. Must run
// BEFORE the perm-based firestore.rules are deployed, else tokens without `perms` are
// denied coarse access until their next member write.
async function backfillMemberClaims(db) {
  const snap = await db.collection("members").get();
  for (const doc of snap.docs) {
    await doc.ref.set({ claimsSyncedAt: Timestamp.now() }, { merge: true });
  }
  return snap.size;
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const auth = getAuth();

  // Permissions bootstrap — runs on EVERY invocation (idempotent), before the
  // president guard, so an already-bootstrapped org still gets roles seeded + claims
  // backfilled. New orgs: members don't exist yet, so backfill is a no-op and the
  // president created below mints its own claims via onMemberWritten.
  const rolesCreated = await seedBuiltInRoles(db);
  const roleTotal = Object.keys(BUILT_IN_ROLE_PERMS).length;
  console.log(
    `✓ built-in roles: ${rolesCreated} created, ${roleTotal - rolesCreated} already existed.`,
  );
  const touched = await backfillMemberClaims(db);
  console.log(
    `✓ ${touched} member(s) touched — onMemberWritten will re-mint roles + perms (~1-2 min).`,
  );

  // Guard before prompting so a re-run doesn't make the operator re-enter
  // everything; seedPresident also guards this internally (without `force`).
  const existing = await db.doc("meta/bootstrap").get();
  if (existing.exists) {
    console.log(
      `Already seeded (president uid ${existing.get("presidentUid")}). ` +
        "Manage members and cargos from backstage. Nothing to do.",
    );
    rl.close();
    process.exit(0);
  }

  // Only the FIRST-RUN president bootstrap below prompts interactively, so the TTY
  // requirement is enforced here — not at module load. This lets the idempotent
  // roles-seed + perms-backfill above run headlessly (e.g. for an already-bootstrapped
  // org) while a non-TTY first run still fails fast before any prompt would hang.
  if (!process.stdin.isTTY) {
    console.error(
      "Refusing to run the first-time president bootstrap: stdin is not a TTY. " +
        "Run it from an interactive terminal.",
    );
    rl.close();
    process.exit(1);
  }

  // Seed siteConfig/current with default org facts (idempotent — safe to re-run).
  // Content is shared with the emulator seed; allies stored as string[] (the backstage
  // mapper inflates them to {nombre} row objects).
  await db.doc("siteConfig/current").set(
    {
      version: 1,
      updatedAt: Timestamp.now(),
      ...SITE_CONFIG_CONTENT,
    },
    { merge: true },
  );
  console.log("✓ siteConfig/current seeded.");

  console.log(`Seeding the initial president for project ${projectId} (term ${TERM}).\n`);
  const name = await ask("President full name", nonEmpty);
  const email = await ask("President email", emailOk);
  const gender = await ask("Gender (Masculino/Femenino)", genderOk);
  const birthdate = await ask("Birthdate (YYYY-MM-DD)", dateOk);
  const password = await askHidden("Temp password", passwordOk);

  const result = await seedPresident({
    db,
    auth,
    president: { name, email, password, gender },
    term: TERM,
    joinDate: Timestamp.now(), // joins the platform today
    birthdate: Timestamp.fromDate(new Date(`${birthdate}T00:00:00Z`)),
  });

  rl.close();
  console.log(
    `\n✓ Seeded president ${email} (Admin via cargo ${result.cargoId}, uid ${result.presidentUid}).\n` +
      `Log in to backstage with ${email} and the password you set, then change it from the Firebase console.`,
  );
  process.exit(0);
}

main().catch((error) => {
  rl.close();
  console.error(error);
  process.exit(1);
});
