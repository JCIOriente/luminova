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

  // Seed siteConfig/current with default org facts (idempotent — safe to re-run).
  // Allies stored as string[] (the mapper in backstage inflates to {nombre} row objects).
  await db.doc("siteConfig/current").set({
    version: 1,
    updatedAt: Timestamp.now(),
    stats: {
      programCount: 5,
      countries: "100+",
      membersWorldwide: "200.000+",
      nationalAwards: 11,
      efficiencyPct: 100,
      standoutOrg: { year: "2021", title: "Organización Local Más Sobresaliente" },
    },
    allies: ["Unifranz", "JCI Bolivia", "JCI Worldwide", "Cámara de Industria SC", "Fexpocruz"],
    timeline: [
      {
        year: "1915",
        title: "Nace la Junior Chamber",
        description:
          "St. Louis, Missouri. Henry Giessenbier funda lo que se convertirá en JCI Worldwide.",
      },
      {
        year: "1993",
        title: "Se funda JCI Oriente",
        description: "El capítulo Santa Cruz se establece como parte de JCI Bolivia.",
      },
      {
        year: "2018",
        title: "Expansión de programas",
        description: "Lanzamiento de Madre Emprendedora y consolidación de Emprende Oriente.",
      },
      {
        year: "2019",
        title: "100% de eficiencia",
        description: "Primera certificación nacional de eficiencia operativa.",
      },
      {
        year: "2020",
        title: "Eficiencia ratificada",
        description: "Segundo año consecutivo cumpliendo el 100% de los indicadores JCI Bolivia.",
      },
      {
        year: "2021",
        title: "Organización Local más Sobresaliente",
        description: "Reconocimiento nacional al desempeño del capítulo.",
      },
      {
        year: "Hoy",
        title: "Una nueva generación",
        description: "Más de 11 reconocimientos acumulados y proyectos vigentes en cinco frentes.",
      },
    ],
    mvv: {
      mision:
        "Brindar oportunidades de desarrollo que empoderen a las personas jóvenes a crear cambios positivos en el Oriente boliviano.",
      vision:
        "Ser la organización referente de jóvenes líderes activos en Santa Cruz, reconocida por su impacto, ética y red global.",
      valores:
        "Liderazgo con propósito · Servicio · Hermandad internacional · Empresa libre · Fe en Dios · Dignidad humana.",
    },
    reasons: [
      {
        number: "01",
        title: "Una red que abre puertas",
        body: "Acceso directo a 200.000+ miembros activos en 100+ países. Conferencias regionales, mundiales y oportunidades de movilidad real.",
      },
      {
        number: "02",
        title: "Proyectos con impacto medible",
        body: "No reuniones que no van a ningún lado: programas estructurados con cohortes, indicadores y resultados publicados al cierre de año.",
      },
      {
        number: "03",
        title: "Liderazgo en práctica",
        body: "Mentoría 1:1, posiciones de comité que se renuevan cada año, oratoria y formación financiada por la red JCI.",
      },
    ],
    contact: {
      email: "jci.orienteolm@gmail.com",
      location: "Santa Cruz de la Sierra, Bolivia",
      meetingSchedule: "Cada miércoles · 19:30 hrs",
      links: [
        { label: "JCI Worldwide ↗", url: "https://jci.cc" },
        { label: "JCI Bolivia ↗", url: "#" },
        { label: "JCI Americas ↗", url: "#" },
      ],
    },
  });
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
