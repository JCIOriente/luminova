// One-shot e2e for A3 check-in → A2 awardPoints, against the running emulator suite.
// Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node tools/scripts/e2e-check-in.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}
const projectId = process.env.GCLOUD_PROJECT ?? "jci-oriente";
initializeApp({ projectId });
const db = getFirestore();

const TERM = "2026";
const MEMBER = "e2e_member";
const ACTIVITY = "e2e_activity";
const ROLE = "Attendee";
const checkInId = `${ACTIVITY}__${MEMBER}__${ROLE}`;
const partId = checkInId;
const pointsId = `${MEMBER}__${TERM}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Seed prerequisites (idempotent).
  await db.doc(`members/${MEMBER}`).set({
    name: "E2E Tester",
    email: "e2e@jci.test",
    role: "Miembro",
    phone: "",
    profession: "",
    joinDate: Timestamp.fromDate(new Date("2024-01-01T00:00:00Z")),
    birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    isPastPresident: false,
  });
  await db.doc(`terms/${TERM}`).set(
    {
      status: "Activo",
      conventionDate: null,
      pointsCutoffAt: null,
      board: [],
      bestMemberId: null,
    },
    { merge: true },
  );
  // Assembly starting now → Attendee within 15 min → punctuality factor 1.
  await db.doc(`activities/${ACTIVITY}`).set({
    termId: TERM,
    category: "Assembly",
    parentType: null,
    parentId: null,
    organizers: { directorId: null, coDirectorId: null },
    startAt: FieldValue.serverTimestamp(),
    status: "Programada",
  });

  // Clean any prior run so we observe a fresh trigger.
  await db
    .doc(`participations/${partId}`)
    .delete()
    .catch(() => {});
  await db
    .doc(`memberPoints/${pointsId}`)
    .delete()
    .catch(() => {});

  console.log("Writing checkIn:", checkInId);
  await db.doc(`checkIns/${checkInId}`).set({
    memberId: MEMBER,
    activityId: ACTIVITY,
    role: ROLE,
    checkInAt: FieldValue.serverTimestamp(),
  });

  // Poll for the engine-derived docs.
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const part = await db.doc(`participations/${partId}`).get();
    const pts = await db.doc(`memberPoints/${pointsId}`).get();
    if (part.exists && pts.exists) {
      console.log("\nPARTICIPATION:", JSON.stringify(part.data()));
      console.log("MEMBER_POINTS:", JSON.stringify(pts.data()));
      const member = await db.doc(`members/${MEMBER}`).get();
      console.log("MEMBER.totalPoints:", member.data()?.totalPoints);
      console.log("\n✅ E2E PASS — checkIn derived participation + memberPoints");
      process.exit(0);
    }
    if (i % 5 === 4) console.log(`  …waiting (${i + 1}s) part=${part.exists} pts=${pts.exists}`);
  }
  console.error(
    "\n❌ E2E FAIL — engine docs not derived within 30s (functions emulator running awardPoints?)",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
