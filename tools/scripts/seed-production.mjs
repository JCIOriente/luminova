// Bootstraps the PRODUCTION president (a real member who is Admin via the
// Presidente cargo) — ONCE. The Firebase console cannot set custom claims, so this
// admin-SDK script does it, then self-assigns the Admin cargo so the claims-sync
// trigger keeps Admin durably. A `meta/bootstrap` doc makes re-runs a no-op.
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

if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: emulator env vars are set (FIREBASE_AUTH_EMULATOR_HOST / " +
      "FIRESTORE_EMULATOR_HOST). This script targets PRODUCTION — unset them and retry.",
  );
  process.exit(1);
}

// This seed prompts interactively (by design — see the brainstorm). A non-TTY
// stdin (CI, pipe) would hang on the first prompt, so fail fast with a message.
if (!process.stdin.isTTY) {
  console.error(
    "Refusing to run: stdin is not a TTY. This seed prompts for the president's " +
      "details — run it from an interactive terminal.",
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

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const auth = getAuth();

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
