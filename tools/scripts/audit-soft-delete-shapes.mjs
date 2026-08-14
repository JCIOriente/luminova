// The BLOCKING pre-deploy audit for the soft-delete well-formedness rules (owner-op 4 of
// docs/specs/position-assignment-lane.md). Those rules make a members/positions/allies doc
// missing `active` or `deletedAt`, or holding a non-bool `active`, admin-SDK-only to edit —
// so the malformed count must be known (ideally zero) BEFORE the rules deploy, and this
// script is also the remedy, not just the count: for members specifically, a fail-open
// `active` may sit PUBLISHED on the world-readable boardShowcase. project-board.ts is now
// fail-closed, but onBoardMemberWritten fires only on a members/{id} write — the very write
// the new rules deny to clients — so repairing the doc through the admin SDK here is what
// re-fires the trigger and removes (or refreshes) the public row.
//
// Read-only by default; exits non-zero when anything is found so it can gate a deploy.
// `--repair` fixes ONLY the unambiguous shapes and refuses to guess:
//   deletedAt missing            → deletedAt: null (the value the create arm would have
//                                  stamped; missing can only mean "never soft-deleted" —
//                                  a deletion always writes the timestamp)
//   active missing, deletedAt    → active: true (never deleted ⇒ live; every fail-open
//     null/missing                 reader has treated the doc as live all along)
//   active present but non-bool  → NEVER coerced, even the string "false" — whether that
//                                  doc was meant to be inactive is a human call
//   active missing, deletedAt    → reported for a human (the two fields disagree about
//     non-null                     what state the doc is in)
//
// Targets PRODUCTION via Application Default Credentials, like seed-production.mjs:
//   gcloud auth application-default login && pnpm audit:soft-delete-shapes
// Or the emulator, by setting the env first:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 pnpm audit:soft-delete-shapes
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

const COLLECTIONS = ["members", "positions", "allies"];
// Page size mirrors the beacon chunk() bound; MAX_PRINT keeps the report readable on a
// large malformed set — the counts are always complete, the listing is capped.
const PAGE = 300;
const MAX_PRINT = 20;

const REPAIR = process.argv.includes("--repair");
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "jci-oriente";

initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();

console.log(
  `Auditing soft-delete shapes in ${emulator ? `EMULATOR (${emulator})` : "PRODUCTION"} ` +
    `project ${projectId}${REPAIR ? " — repair mode" : " — read-only"}\n`,
);

/** Classify one doc. Returns null when well-formed, else { problems, repair | null }. */
function classify(data) {
  const problems = [];
  const repair = {};
  let ambiguous = false;

  const hasActive = "active" in data;
  const hasDeletedAt = "deletedAt" in data;
  const deletedAtNullish = !hasDeletedAt || data.deletedAt === null;

  if (!hasDeletedAt) {
    problems.push("missing deletedAt");
    repair.deletedAt = null;
  }
  if (!hasActive) {
    problems.push("missing active");
    if (deletedAtNullish) repair.active = true;
    else ambiguous = true; // deletedAt set but active missing: the fields disagree
  } else if (typeof data.active !== "boolean") {
    problems.push(`non-bool active (${JSON.stringify(data.active)})`);
    ambiguous = true; // never coerced — a human decides what "false"-the-string meant
  }

  if (problems.length === 0) return null;
  return { problems, repair: ambiguous ? null : repair };
}

async function* scan(coll) {
  let cursor = null;
  for (;;) {
    let q = db.collection(coll).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) return;
    yield* snap.docs;
    if (snap.size < PAGE) return;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

let found = 0;
let repaired = 0;
let refused = 0;

for (const coll of COLLECTIONS) {
  const rows = [];
  for await (const doc of scan(coll)) {
    const verdict = classify(doc.data());
    if (verdict) rows.push({ doc, ...verdict });
  }
  found += rows.length;
  console.log(`${coll}: ${rows.length} malformed doc(s)`);

  for (const [i, { doc, problems, repair }] of rows.entries()) {
    if (i < MAX_PRINT) console.log(`  - ${coll}/${doc.id}: ${problems.join(", ")}`);
    else if (i === MAX_PRINT) console.log(`  … and ${rows.length - MAX_PRINT} more`);

    if (coll === "members") {
      // The board-showcase consequence: under the old fail-open reader this doc may be
      // published RIGHT NOW on the world-readable Directiva, and no client write can fix
      // it any more. Only an admin-SDK write (this script's --repair, or the console)
      // re-fires onBoardMemberWritten, whose now-fail-closed projection removes the row.
      const showcase = await db.doc(`boardShowcase/${doc.id}`).get();
      if (showcase.exists && i < MAX_PRINT) {
        console.log(
          `    PUBLISHED: boardShowcase/${doc.id} exists — this malformed member is on ` +
            "the public Directiva; repairing the doc via the admin SDK re-fires " +
            "onBoardMemberWritten and takes the row down",
        );
      }
    }

    if (!REPAIR) continue;
    if (repair) {
      await doc.ref.update(repair);
      repaired += 1;
      if (i < MAX_PRINT) console.log(`    repaired: ${JSON.stringify(repair)}`);
    } else {
      refused += 1;
      if (i < MAX_PRINT) console.log("    REFUSED to repair (ambiguous) — fix by hand");
    }
  }
}

const remaining = REPAIR ? found - repaired : found;
console.log(
  `\n${found} malformed doc(s) found` +
    (REPAIR ? `; ${repaired} repaired, ${refused} refused (ambiguous)` : "") +
    `; ${remaining} remaining`,
);
if (remaining > 0) {
  console.log(
    REPAIR ? "Ambiguous docs need a human — see above." : "Run with --repair, or fix by hand.",
  );
  process.exit(1);
}
console.log("Audit clean — the soft-delete rules can ship.");
process.exit(0);
