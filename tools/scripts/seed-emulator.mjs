// Seeds the Firestore emulator with current-shape sample data for local development,
// including a slice of the Recognition Engine so the Members, Member profile, and
// Leaderboard pages render real data.
//
// Run via:   pnpm seed:emulator
// Manually:  FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node tools/scripts/seed-emulator.mjs
//
// The project id must match the emulator + your app (default: jci-oriente). Override
// with GCLOUD_PROJECT if you run the emulator under a different project.
//
// NOTE: pointRules are NOT seeded here — initialize them from the backstage UI
// ("Reglas de puntos" -> Inicializar, as an Admin), which also creates the term doc.
// This seed creates terms/2026 too (setDoc merge keeps them compatible).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? "jci-oriente";
initializeApp({ projectId });
const db = getFirestore();

const TERM = "2026";
const ts = (iso) => Timestamp.fromDate(new Date(iso));

// A ready-to-login Admin, created in the Auth emulator + linked to member m1.
// Dev-only credentials (the Auth emulator never authenticates against prod).
const ADMIN = { uid: "admin", email: "admin@jci.test", password: "jci-oriente-dev" };

// --- Members (current shape: joinDate/birthdate/status required) ---
const members = [
  { id: "m1", name: "Ana Rivas", email: "ana@example.com", role: "Presidenta", totalPoints: 13 },
  { id: "m2", name: "Bruno Paz", email: "bruno@example.com", role: "Secretario", totalPoints: 7 },
  { id: "m3", name: "Carla Soto", email: "carla@example.com", role: "Tesorera", totalPoints: 4 },
].map((m) => ({
  ...m,
  ...(m.id === "m1" ? { uid: ADMIN.uid } : {}),
  phone: "",
  profession: "",
  joinDate: ts("2021-03-01T00:00:00Z"),
  birthdate: ts("1992-07-01T00:00:00Z"),
  status: "Activo",
  profilePicture: null,
  active: true,
  deletedAt: null,
  isPastPresident: false,
}));

// --- Term (the gestión; board empty until Term admin lands) ---
const term = {
  status: "Activo",
  conventionDate: null,
  pointsCutoffAt: null,
  board: [],
  bestMemberId: null,
};

// --- Activities (the attendable units) ---
const activities = [
  {
    id: "a1",
    category: "Assembly",
    parentType: null,
    parentId: null,
    startAt: ts("2026-06-10T18:00:00Z"),
  },
  {
    id: "a2",
    category: "TM",
    parentType: null,
    parentId: null,
    startAt: ts("2026-05-15T18:00:00Z"),
  },
  {
    id: "a3",
    category: "ProjectExecution",
    parentType: "Project",
    parentId: "p1",
    startAt: ts("2026-06-20T18:00:00Z"),
  },
].map((a) => ({
  ...a,
  termId: TERM,
  organizers: { directorId: null, coDirectorId: null },
  status: "Ejecutada",
}));

// --- Participations (confirmed ledger rows the engine would have derived) ---
function participation(activity, memberId, code, points) {
  const month = activity.startAt.toDate().toISOString().slice(0, 7);
  return {
    id: `${activity.id}__${memberId}__Attendee`,
    memberId,
    termId: TERM,
    activityId: activity.id,
    parentType: activity.parentType,
    parentId: activity.parentId,
    role: "Attendee",
    pointRuleCode: code,
    basePoints: points,
    punctualityFactor: 1,
    computedPoints: points,
    monthBucket: month,
    state: "confirmed",
    gates: { attendanceRegistered: true, finalReportFiled: true },
    checkInAt: activity.startAt,
    voidReason: null,
    createdAt: activity.startAt,
  };
}
const [a1, a2, a3] = activities;
const participations = [
  participation(a1, "m1", "AttendAssembly", 4),
  participation(a1, "m2", "AttendAssembly", 4),
  participation(a1, "m3", "AttendAssembly", 4),
  participation(a2, "m1", "AttendTM", 6),
  participation(a3, "m1", "AttendActivity", 3),
  participation(a3, "m2", "AttendActivity", 3),
];

// --- MemberPoints aggregates (id = `${memberId}__${termId}`) ---
const memberPoints = [
  { memberId: "m1", cumulative: 13, byMonth: { "2026-06": 7, "2026-05": 6 } },
  { memberId: "m2", cumulative: 7, byMonth: { "2026-06": 7 } },
  { memberId: "m3", cumulative: 4, byMonth: { "2026-06": 4 } },
].map((mp) => ({ ...mp, termId: TERM, updatedAt: ts("2026-06-20T18:00:00Z") }));

// Create (or refresh) the Admin login in the Auth emulator. Skipped if the Auth
// emulator host isn't set, so a Firestore-only run still works.
async function seedAdminUser() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.warn(
      "Skipping auth user: FIREBASE_AUTH_EMULATOR_HOST is not set. " +
        "Run `pnpm seed:emulator` (which sets it) to also create the Admin login.",
    );
    return;
  }
  const auth = getAuth();
  try {
    await auth.createUser({ uid: ADMIN.uid, email: ADMIN.email, password: ADMIN.password });
  } catch (error) {
    if (error?.code !== "auth/uid-already-exists") throw error;
    await auth.updateUser(ADMIN.uid, { email: ADMIN.email, password: ADMIN.password });
  }
  await auth.setCustomUserClaims(ADMIN.uid, { roles: ["Admin"] });
  console.log(`Auth: ${ADMIN.email} / ${ADMIN.password} (Admin, uid ${ADMIN.uid}).`);
}

async function seed() {
  for (const m of members) await db.doc(`members/${m.id}`).set(m);
  await db.doc(`terms/${TERM}`).set(term, { merge: true });
  for (const a of activities) {
    const { id, ...data } = a;
    await db.doc(`activities/${id}`).set(data);
  }
  for (const p of participations) {
    const { id, ...data } = p;
    await db.doc(`participations/${id}`).set(data);
  }
  for (const mp of memberPoints) await db.doc(`memberPoints/${mp.memberId}__${TERM}`).set(mp);

  await seedAdminUser();

  console.log(
    `Seeded ${members.length} members, term ${TERM}, ${activities.length} activities, ` +
      `${participations.length} participations, ${memberPoints.length} memberPoints ` +
      `(project ${projectId}). Initialize point rules from the UI.`,
  );
}

seed().then(() => process.exit(0));
