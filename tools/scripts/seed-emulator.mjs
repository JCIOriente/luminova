// Seeds the Firestore emulator with sample data for local development.
// Run via: pnpm seed:emulator
// Or manually: FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node tools/scripts/seed-emulator.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}

initializeApp({ projectId: "jci-oriente" });
const db = getFirestore();

const members = [
  {
    id: "m1",
    name: "Ana Rivas",
    email: "ana@example.com",
    role: "Presidente",
    active: true,
    totalPoints: 0,
    profilePicture: null,
    deletedAt: null,
  },
  {
    id: "m2",
    name: "Bruno Paz",
    email: "bruno@example.com",
    role: "Secretario",
    active: true,
    totalPoints: 0,
    profilePicture: null,
    deletedAt: null,
  },
];

const pointRules = [
  {
    id: "pr1",
    type: "Program",
    role: "Director",
    points: 10,
    description: "Director de Programa",
  },
  {
    id: "pr2",
    type: "Program",
    role: "Participant",
    points: 2,
    description: "Participante de Programa",
  },
];

const events = [
  {
    id: "e1",
    type: "Program",
    name: "Kickoff",
    scope: "Local",
    directorId: "m1",
    coDirectorIds: [],
    collaboratorIds: [],
    participantIds: ["m2"],
    startDate: Timestamp.fromDate(new Date("2026-01-15")),
    endDate: Timestamp.fromDate(new Date("2026-01-15")),
  },
];

async function seed() {
  for (const m of members) await db.doc(`members/${m.id}`).set(m);
  for (const r of pointRules) await db.doc(`pointRules/${r.id}`).set(r);
  for (const e of events) await db.doc(`events/${e.id}`).set(e);
  console.log("Seeded members, pointRules, events.");
}

seed().then(() => process.exit(0));
