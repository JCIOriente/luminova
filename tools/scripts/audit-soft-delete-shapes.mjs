// The BLOCKING pre-deploy audit for the soft-delete well-formedness rules (owner-op 4 of
// docs/specs/position-assignment-lane.md). Those rules make a members/positions/allies doc
// missing `active` or `deletedAt`, or holding a non-bool `active`, admin-SDK-only to edit —
// so the malformed count must be known (ideally zero) BEFORE the rules deploy.
//
// What this script provides is a blocking gate plus COMPLETE detection. It is NOT a public
// takedown tool: `--repair` removes no boardShowcase row, and the one direction it CAN move
// the public surface — adding a row — is announced per doc and withheld behind
// `--allow-publish` (see the `--repair` contract below):
//   - A repaired doc declares the member LIVE (`active: true` / `deletedAt: null`), so the
//     re-fired onBoardMemberWritten RE-PUBLISHES it. The row correctly stays up.
//   - The shape that actually matters — a non-bool `active`, the string "false" — is REFUSED,
//     so nothing is written, no trigger fires, and a row already published under the old
//     fail-open projection SURVIVES. That one is remediated by hand; the script's job is to
//     name it. The two remedies are printed per doc: a Firebase console edit of `active`, or
//     an Admin `publicProfile: false` write — the members takedown arm in firestore.rules
//     deliberately does not call `softDeleteSafe()` and stays open on exactly these docs
//     (pinned by rules.test.ts, "keeps the Admin takedown arm open on a malformed member").
//
// Note the new rules do NOT deny every client write to such a doc: that takedown arm is left
// open on purpose. What makes the remedy awkward is the client side — `memberDocSchema` drops
// a malformed member, so backstage never lists it and offers no affordance. The write has to
// come from the console, this script, or a direct admin/Admin-authenticated write.
//
// Read-only by default; exits non-zero when anything is found so it can gate a deploy.
//   exit 1 → the run completed and found malformed docs (the gate)
//   exit 2 → the run did NOT complete (a per-doc read/write failed, or repair was refused
//            confirmation). Distinct on purpose: a crash must not look like a clean gate.
//
// `--repair` fixes ONLY the unambiguous shapes and refuses to guess:
//   deletedAt missing            → deletedAt: null (the value the create arm would have
//                                  stamped; missing can only mean "never soft-deleted" —
//                                  a deletion always writes the timestamp)
//   active missing, deletedAt    → active: true (never deleted ⇒ live; every fail-open
//     null/missing                 reader has treated the doc as live all along)
//   active present but non-bool  → NEVER coerced, even the string "false" — whether that
//                                  doc was meant to be inactive is a human call. `active:
//                                  null` counts as present and is refused too, while a
//                                  MISSING `active` on the same nullish `deletedAt` is
//                                  repaired: an explicit null is a value somebody wrote and
//                                  may have meant, absence is just absence.
//   active missing, deletedAt    → reported for a human (the two fields disagree about
//     non-null                     what state the doc is in)
//   active: true AND deletedAt   → the GHOST: reported for a human, same disagreement as
//     non-null                     the row above, mirrored. Unlike the other shapes this one
//                                  is client-REACHABLE (softDeleteSafe permits it) and
//                                  memberDocSchema accepts it, so the doc renders as an
//                                  ordinary live member while deletedAt-aware readers treat
//                                  it as gone.
//   deletedAt present, non-null, → reported, never repaired: junk (an ISO string, a number)
//     not a Timestamp              that the zod doc-schemas reject and the rules pin
//                                  immutable — invisible and unwritable at once.
// Repair is all-or-nothing per doc, by design: when `active` is ambiguous the unambiguous
// `deletedAt: null` is withheld too, so the human who resolves the doc sees the shape the
// audit reported rather than one this script half-changed underneath them.
//
// `--repair` can also PUBLISH, and that is opt-in. Writing `active: true` un-blocks the
// fail-CLOSED projectBoard gate, so a member who also has publicProfile: true (the stamped
// org-wide default), a uid, a pinned portrait and a current-term CEL/JDL cargo is ADDED to
// the world-readable Directiva by the re-fired trigger — a new publication nobody asked for,
// as a side effect of a shape fix. Every such member gets a `WILL PUBLISH:` line, and their
// repair is WITHHELD (counted apart from the ambiguous refusals) unless `--allow-publish` is
// passed. The forecast fails safe: any gate it cannot settle is reported as unknown and the
// member is still announced, never quietly repaired.
//
// Targets PRODUCTION via Application Default Credentials, like seed-production.mjs. A
// production `--repair` writes to members and, through the trigger, to the world-readable
// Directiva, so it demands an explicit confirmation (typed, or `--confirm=<token>` for a
// non-interactive shell) — the same posture as seed-production.mjs and the
// `confirm: "overwrite-builtin-roles"` token on reseedBuiltInRolePerms. Adding
// `--allow-publish` changes the token to `repair-production-shapes-and-publish`: the string
// the operator types names the consequence, so the one flag that can ADD public exposure is
// not the one the confirmation is silent about.
//   gcloud auth application-default login && pnpm audit:soft-delete-shapes
// Or the emulator, by setting the env first (no confirmation there):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 pnpm audit:soft-delete-shapes
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { createInterface } from "node:readline/promises";

const COLLECTIONS = ["members", "positions", "allies"];
// Page size and the getAll fan-out both mirror the beacon chunk() bound (guardrail #5).
// MAX_PRINT caps ONLY the benign listing — a repairable doc with no public exposure. Ids
// that need a hand fix (refused) and every PUBLISHED / unknown-publication line always
// print: this output is the operator's worklist, and truncating it would hide exactly the
// docs that must be acted on. The counts are always complete.
const PAGE = 300;
const GETALL_CHUNK = 300;
const MAX_PRINT = 20;
const CONFIRM_TOKEN = "repair-production-shapes";
/** `--allow-publish` is the one flag that can ADD world-readable exposure, so it gets its
 *  own token: the string the operator types has to NAME the consequence they are accepting,
 *  or the confirmation prompt is silent about the only irreversible half of the run. */
const PUBLISH_CONFIRM_TOKEN = "repair-production-shapes-and-publish";
const CONFIRM_FLAG = "--confirm=";
/** Opt-in for the one repair that ADDS public exposure — see the publication forecast. */
const ALLOW_PUBLISH_FLAG = "--allow-publish";

const EXIT_MALFORMED = 1;
const EXIT_INCOMPLETE = 2;

const REPAIR = process.argv.includes("--repair");
const ALLOW_PUBLISH = process.argv.includes(ALLOW_PUBLISH_FLAG);
const confirmArg = process.argv
  .find((arg) => arg.startsWith(CONFIRM_FLAG))
  ?.slice(CONFIRM_FLAG.length);
/** What a `WILL PUBLISH:` line may truthfully claim the run is doing about that doc. The
 *  forecast prints in READ-ONLY mode too — where nothing is written no matter which flags
 *  were passed — so the outcome text has to branch on REPAIR before ALLOW_PUBLISH. */
const publishOutcome = !REPAIR
  ? `Read-only — nothing was written. A --repair run would ${
      ALLOW_PUBLISH
        ? "apply this repair and publish the member"
        : `WITHHOLD it (no ${ALLOW_PUBLISH_FLAG})`
    }.`
  : ALLOW_PUBLISH
    ? `${ALLOW_PUBLISH_FLAG} was passed — repairing it.`
    : `Withheld: re-run with ${ALLOW_PUBLISH_FLAG} to repair these too, or set publicProfile: false on the member first (the opt-out this member never exercised).`;
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "jci-oriente";

console.log(
  `Auditing soft-delete shapes in ${emulator ? `EMULATOR (${emulator})` : "PRODUCTION"} ` +
    `project ${projectId}${REPAIR ? " — repair mode" : " — read-only"}\n`,
);

async function confirmProductionRepair() {
  // --allow-publish widens what this run may do, so it widens the token that authorizes it.
  // The plain token never authorizes a publishing run: pass the flag and the plain token is
  // rejected, exactly like any other wrong string.
  const requiredToken = ALLOW_PUBLISH ? PUBLISH_CONFIRM_TOKEN : CONFIRM_TOKEN;
  if (confirmArg === requiredToken) return;
  if (confirmArg !== undefined) {
    console.error(`Refusing to repair: --confirm must be exactly "${requiredToken}".`);
    process.exit(EXIT_INCOMPLETE);
  }
  if (!process.stdin.isTTY) {
    console.error(
      `Refusing to repair PRODUCTION project ${projectId} without confirmation. ` +
        `No TTY to prompt on — re-run with ${CONFIRM_FLAG}${requiredToken}.`,
    );
    process.exit(EXIT_INCOMPLETE);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = (
      await rl.question(
        `About to WRITE to members/positions/allies in PRODUCTION project ${projectId}.\n` +
          "A members write re-fires onBoardMemberWritten and re-projects the world-readable " +
          "Directiva.\n" +
          (ALLOW_PUBLISH
            ? `${ALLOW_PUBLISH_FLAG} was passed: repairs that would ADD a member to the ` +
              "world-readable Directiva will be applied, not withheld. Every such member is " +
              "announced with a WILL PUBLISH line before it is written.\n"
            : "") +
          `Type ${requiredToken} to proceed: `,
      )
    ).trim();
  } catch {
    // Ctrl+D / a closed stdin rejects the question. Exiting through the normal abort path
    // keeps that out of EXIT_MALFORMED, which an unhandled rejection would collide with.
    answer = "";
  }
  rl.close();
  if (answer !== requiredToken) {
    console.error("Aborted — nothing was written.");
    process.exit(EXIT_INCOMPLETE);
  }
  console.log("");
}

if (REPAIR && !emulator) await confirmProductionRepair();

initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();

/** Duck-typed Timestamp test, mirroring apps/beacon/src/firestore-util.ts hasToMillis(). Not
 *  `instanceof Timestamp`: the admin SDK's Timestamp class identity is not guaranteed across
 *  a duplicated firebase-admin install, and an identity miss here would report every healthy
 *  doc in the collection as junk. Shape, not class. */
function isTimestamp(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.toMillis === "function" &&
    typeof value.toDate === "function"
  );
}

/** Short, non-throwing rendering of a field value for the operator's worklist. */
function preview(value) {
  if (isTimestamp(value)) {
    try {
      return value.toDate().toISOString();
    } catch {
      // A Timestamp outside the JS Date range. Not worth a failure — name it and move on.
      return "Timestamp (unrenderable)";
    }
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

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
  } else if (data.deletedAt !== null && !isTimestamp(data.deletedAt)) {
    // Reported, never repaired: the four zod doc-schemas require a Timestamp here, so this
    // doc is already dropped from every backstage list, and the rules' one-way
    // `resource.data.deletedAt == null || unchanged('deletedAt')` reads a non-null value and
    // pins it — the doc is client-unwritable and invisible at once. Whether the junk encodes
    // a real deletion (an ISO string somebody wrote by hand) or is a stray key is a human
    // call, and coercing it would either resurrect a deleted member or bury a live one.
    problems.push(`non-Timestamp deletedAt (${preview(data.deletedAt)})`);
    ambiguous = true;
  }
  if (!hasActive) {
    problems.push("missing active");
    if (deletedAtNullish) repair.active = true;
    else ambiguous = true; // deletedAt set but active missing: the fields disagree
  } else if (typeof data.active !== "boolean") {
    problems.push(`non-bool active (${JSON.stringify(data.active)})`);
    ambiguous = true; // never coerced — a human decides what "false"-the-string meant
  } else if (data.active === true && hasDeletedAt && data.deletedAt !== null) {
    // The GHOST: live and deleted at once. Client-REACHABLE, unlike the shapes above —
    // softDeleteSafe() permits it (its one-way half only fires once the STORED deletedAt is
    // non-null, and its well-formedness prefix is satisfied here), and memberDocSchema
    // accepts it, so backstage lists this doc as an ordinary live member while every
    // deletedAt-aware reader treats it as gone. The two fields disagree about what state the
    // doc is in and neither is more authoritative, so this is reported for a human exactly
    // like "active missing, deletedAt set" — the same disagreement, mirrored.
    problems.push(`active true with deletedAt set (ghost, deletedAt ${preview(data.deletedAt)})`);
    ambiguous = true;
  }

  if (problems.length === 0) return null;
  return { problems, repair: ambiguous ? null : repair };
}

/**
 * Does the doc read as a LIVE member once `repair` is applied? That, not the repair itself,
 * decides which direction the re-fired projection moves the public row: projectBoard is now
 * fail-closed on `deletedAt != null || active !== true`.
 */
function liveAfterRepair(data, repair) {
  const active = "active" in repair ? repair.active : data.active;
  const deletedAt = "deletedAt" in repair ? repair.deletedAt : data.deletedAt;
  return active === true && (deletedAt === null || deletedAt === undefined);
}

// ── Publication forecast ──────────────────────────────────────────────────────────────
// Repairing a member missing `active` writes `active: true`, and projectBoard fail-CLOSES on
// `active !== true` — so before the repair that member is NOT published, and after it they
// may be. Publication defaults ON (`publicProfile` is stamped true server-side at create), so
// this is not hypothetical: an unpublished board member with a portrait and a current-term
// CEL/JDL cargo goes onto the world-readable Directiva as a SIDE EFFECT of a shape repair.
// The script announces the takedown direction, so it must announce this one.
//
// These predicates MIRROR apps/beacon/src/showcase/project-board.ts (projectBoard +
// currentCargoId + isMemberPhotoUrl) and packages/types/src/engine/board-public.ts
// (isSurfaceableStatus, boardGroupFromCategory). A .mjs operator script cannot import
// either — neither package resolves from the repo root — so this is a hand mirror, and it is
// built to FAIL SAFE in the one direction that matters: every gate answers true / false /
// UNKNOWN, and only a confident `false` suppresses the warning. Drift therefore over-warns
// (a member announced who would not have published) rather than under-warns (a silent
// publication). The unknown gates are named in the output instead of being guessed.
const SURFACEABLE_STATUSES = new Set(["Activo", "Inactivo"]);
const BOARD_CATEGORIES = new Set(["CEL", "JDL"]);
const MEMBER_PHOTO_HOST = "firebasestorage.googleapis.com";

/** Mirrors isSafeDocId (apps/beacon/src/firestore-util.ts) — an id this script is willing to
 *  interpolate into a `positions/${id}` path. */
function isSafeDocId(id) {
  if (typeof id !== "string" || id.length === 0 || id.includes("/")) return false;
  if (id === "." || id === "..") return false;
  if (id.startsWith("__") && id.endsWith("__")) return false;
  return new TextEncoder().encode(id).length <= 1500;
}

/** Mirrors currentTermKey() — getUTCFullYear(), the same key the rules derive from
 *  request.time.year(). The trigger reads the term at PROJECTION time, so "now" is right. */
function currentTermKey() {
  return String(new Date().getUTCFullYear());
}

function currentCargoId(data) {
  const positions = data.positions;
  if (!positions || typeof positions !== "object" || Array.isArray(positions)) return null;
  const term = positions[currentTermKey()];
  if (!term || typeof term !== "object") return null;
  return isSafeDocId(term.cargoId) ? term.cargoId : null;
}

/** Mirrors isMemberPhotoUrl: this project's own bucket AND this member's own object. */
function isMemberPhotoUrl(value, memberId) {
  if (typeof value !== "string" || !URL.canParse(value) || projectId.length === 0) return false;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== MEMBER_PHOTO_HOST) return false;
  const object = encodeURIComponent(`members/${memberId}/profile.jpg`);
  return [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].some(
    (bucket) => url.pathname === `/v0/b/${bucket}/o/${object}`,
  );
}

/**
 * The gates projectBoard applies that this script can settle from the member doc alone.
 * Returns the names of the ones that definitively FAIL — empty means "nothing local stops
 * this publication". The cargo gate is not here; it needs a positions read.
 */
function localPublicationBlockers(id, data, repair) {
  const blockers = [];
  if (!liveAfterRepair(data, repair)) blockers.push("not live after repair");
  if (data.publicProfile !== true) blockers.push("publicProfile is not true");
  if (typeof data.uid !== "string" || data.uid.length === 0) blockers.push("no uid");
  if (!(data.status === undefined || SURFACEABLE_STATUSES.has(data.status))) {
    blockers.push(`status ${preview(data.status)} is not surfaceable`);
  }
  if (typeof data.name !== "string" || data.name.length === 0) blockers.push("no name");
  if (!isMemberPhotoUrl(data.profilePicture, id)) blockers.push("no pinned portrait URL");
  return blockers;
}

/**
 * Resolve the current-term cargo doc for every candidate, batched through getAll at the
 * chunk() bound. Map value: the cargo data, or null when the doc is missing, or the string
 * "unreadable" when the read itself failed — which is the UNKNOWN this must not flatten.
 */
async function cargoState(cargoIds) {
  const state = new Map();
  const ids = [...cargoIds];
  for (let i = 0; i < ids.length; i += GETALL_CHUNK) {
    const slice = ids.slice(i, i + GETALL_CHUNK);
    try {
      const snaps = await db.getAll(...slice.map((id) => db.doc(`positions/${id}`)));
      snaps.forEach((snap, j) => state.set(slice[j], snap.exists ? snap.data() : null));
    } catch (error) {
      for (const id of slice) {
        state.set(id, "unreadable");
        failed.push({ ref: `positions/${id}`, op: "read", message: String(error) });
      }
    }
  }
  return state;
}

/** true / false / null(unknown) — does this cargo put the member on the Directiva? */
function cargoPublishes(cargo) {
  // `undefined` = this id was never resolved, which currentTermKey() straddling a UTC-year
  // boundary between the two calls below can produce. Unknown, not benign: reported like an
  // unreadable read rather than TypeError-ing on `cargo.category` — same fail-safe direction
  // as every other gate here.
  if (cargo === undefined || cargo === "unreadable") return null;
  if (cargo === null) return false;
  if (!BOARD_CATEGORIES.has(cargo.category)) return false;
  return typeof cargo.title === "string" && cargo.title.trim().length > 0;
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
/** Repairable, but the repair would newly PUBLISH the member, and --allow-publish was not
 *  passed. Counted apart from `refused`: those are shapes the script cannot resolve, these
 *  are shapes it can — it is the CONSEQUENCE that needs a decision. */
let withheld = 0;
/** Per-doc read/write failures. Non-empty ⇒ the run did not complete ⇒ EXIT_INCOMPLETE. */
const failed = [];

/**
 * Publication state for every malformed member, batched through getAll at the chunk() bound
 * rather than a get() per doc. Map value: true published, false absent, null unreadable.
 */
async function showcaseState(rows) {
  const state = new Map();
  for (let i = 0; i < rows.length; i += GETALL_CHUNK) {
    const slice = rows.slice(i, i + GETALL_CHUNK);
    const refs = slice.map(({ doc }) => db.doc(`boardShowcase/${doc.id}`));
    try {
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, j) => state.set(slice[j].doc.id, snap.exists));
    } catch (error) {
      for (const { doc } of slice) {
        state.set(doc.id, null);
        failed.push({ ref: `boardShowcase/${doc.id}`, op: "read", message: String(error) });
      }
    }
  }
  return state;
}

for (const coll of COLLECTIONS) {
  const rows = [];
  try {
    for await (const doc of scan(coll)) {
      const data = doc.data();
      const verdict = classify(data);
      if (verdict) rows.push({ doc, data, ...verdict });
    }
  } catch (error) {
    // A paging failure means this collection was only partially seen — never report its
    // (partial) count as a clean one; the run is incomplete.
    failed.push({ ref: coll, op: "scan", message: String(error) });
    console.log(`${coll}: FAILED to scan — ${error}`);
    continue;
  }
  found += rows.length;
  console.log(`${coll}: ${rows.length} malformed doc(s)`);

  const published = coll === "members" ? await showcaseState(rows) : new Map();

  // Which repairable members the repair could NEWLY publish. Only members have a
  // projection, and only a doc that is not already published can be newly published — but
  // "already published" must be KNOWN, so an unreadable boardShowcase counts as a candidate
  // (the same fail-safe direction as every gate below).
  const publishCandidates =
    coll === "members"
      ? rows.filter(
          ({ doc, data, repair }) =>
            repair !== null &&
            published.get(doc.id) !== true &&
            localPublicationBlockers(doc.id, data, repair).length === 0,
        )
      : [];
  const cargos = await cargoState(
    new Set(publishCandidates.map(({ data }) => currentCargoId(data)).filter((id) => id !== null)),
  );
  /** id -> { unknownPublication, unknownCargo } for every member the repair may publish. */
  const willPublish = new Map();
  for (const { doc, data } of publishCandidates) {
    const cargoId = currentCargoId(data);
    // No current-term cargo is a settled NO — projectBoard returns null on a null cargo.
    if (cargoId === null) continue;
    const verdict = cargoPublishes(cargos.get(cargoId));
    if (verdict === false) continue;
    willPublish.set(doc.id, {
      unknownPublication: published.get(doc.id) === null,
      unknownCargo: verdict === null ? cargoId : null,
    });
  }

  let shownBenign = 0;
  let hiddenBenign = 0;
  for (const { doc, data, problems, repair } of rows) {
    // `has ? get : false`, NOT `get(...) ?? false`: showcaseState uses null as the
    // "publication unreadable" sentinel, and ?? falls back on exactly null — collapsing an
    // UNKNOWN into "not published". That killed the branch below, dropped the promised
    // UNKNOWN line, and reclassified the doc as benign, i.e. truncatable — losing from the
    // worklist precisely the docs whose public exposure nobody knows. One rejected getAll
    // chunk (a transient 503) is enough to trigger it.
    const showcase = published.has(doc.id) ? published.get(doc.id) : false;
    const publishing = willPublish.get(doc.id);
    // Always print a doc a human must act on: ambiguous, publicly exposed, unverifiable, or
    // about to be published by its own repair.
    const mustShow = repair === null || showcase !== false || publishing !== undefined;
    let show = mustShow;
    if (!mustShow) {
      if (shownBenign < MAX_PRINT) {
        show = true;
        shownBenign += 1;
      } else {
        hiddenBenign += 1;
      }
    }
    if (show) console.log(`  - ${coll}/${doc.id}: ${problems.join(", ")}`);

    if (showcase === null) {
      console.log(
        `    UNKNOWN publication: boardShowcase/${doc.id} could not be read — treat this ` +
          "member as possibly on the public Directiva and check by hand",
      );
    } else if (showcase === true) {
      if (repair === null) {
        console.log(
          `    PUBLISHED: boardShowcase/${doc.id} exists and STAYS PUBLISHED. This doc is ` +
            "ambiguous, so this script writes nothing for it — no members write, no " +
            "onBoardMemberWritten, and the row survives under the old fail-open projection.\n" +
            "      Two remedies, both by hand:\n" +
            `      1. Firebase console → members/${doc.id}: set 'active' to a real boolean. ` +
            "That admin write re-fires the now fail-closed projection, which drops the row " +
            "when the member is not live.\n" +
            `      2. An Admin write of publicProfile: false on members/${doc.id}. The members ` +
            "takedown arm in firestore.rules deliberately skips softDeleteSafe(), so it stays " +
            "open on exactly these docs (a rules test pins it). Backstage will not list this " +
            "member — memberDocSchema drops it — so make that write from the console or directly.",
        );
      } else if (liveAfterRepair(data, repair)) {
        console.log(
          `    PUBLISHED: boardShowcase/${doc.id} exists — this member is on the public ` +
            "Directiva. The repair declares the doc LIVE (active true / deletedAt null), so " +
            "the re-fired onBoardMemberWritten RE-PUBLISHES it from the repaired doc. That is " +
            "correct, and it is NOT a takedown: to unpublish, write publicProfile: false as " +
            "an Admin.",
        );
      } else {
        console.log(
          `    PUBLISHED: boardShowcase/${doc.id} exists — this member is on the public ` +
            "Directiva. The repair leaves the doc NOT live, so the re-fired " +
            "onBoardMemberWritten removes the row.",
        );
      }
    }

    if (publishing) {
      console.log(
        `    WILL PUBLISH: repairing members/${doc.id} writes active: true, which un-blocks ` +
          "the fail-closed projectBoard gate. This member holds a current-term CEL/JDL " +
          "cargo, a pinned portrait and publicProfile: true, so the re-fired " +
          `onBoardMemberWritten ADDS boardShowcase/${doc.id} to the world-readable ` +
          "Directiva. That is a NEW publication, not a repair side effect anyone asked " +
          // REPAIR first: this forecast prints in read-only mode too, where NOTHING is
          // written and "--allow-publish was passed — repairing it" would be a false
          // statement about what the run just did.
          `for.\n      ${publishOutcome}`,
      );
      if (publishing.unknownCargo !== null) {
        console.log(
          `      (positions/${publishing.unknownCargo} could not be read — the cargo half of ` +
            "the forecast is a GUESS-FREE unknown, reported rather than assumed benign)",
        );
      }
      if (publishing.unknownPublication) {
        console.log(
          `      (boardShowcase/${doc.id} could not be read either, so this may be a ` +
            "re-publication rather than a new one)",
        );
      }
    }

    if (!REPAIR) continue;
    if (repair && (!publishing || ALLOW_PUBLISH)) {
      try {
        await doc.ref.update(repair);
        repaired += 1;
        if (show) console.log(`    repaired: ${JSON.stringify(repair)}`);
      } catch (error) {
        failed.push({ ref: `${coll}/${doc.id}`, op: "repair", message: String(error) });
        console.log(`    FAILED to repair ${coll}/${doc.id}: ${error}`);
      }
    } else if (repair) {
      withheld += 1;
      console.log(`    WITHHELD (would publish) — re-run with ${ALLOW_PUBLISH_FLAG} to apply`);
    } else {
      refused += 1;
      console.log("    REFUSED to repair (ambiguous) — fix by hand");
    }
  }
  if (hiddenBenign > 0) {
    console.log(
      `  … and ${hiddenBenign} more repairable, unpublished doc(s) not listed ` +
        "(counts are complete; ambiguous, PUBLISHED and WILL PUBLISH docs are never truncated)",
    );
  }
}

const remaining = REPAIR ? found - repaired : found;
console.log(
  `\n${found} malformed doc(s) found` +
    (REPAIR
      ? `; ${repaired} repaired, ${refused} refused (ambiguous), ${withheld} withheld (would publish)`
      : "") +
    `; ${remaining} remaining`,
);

if (failed.length > 0) {
  console.log(`\n${failed.length} failure(s) — THE RUN DID NOT COMPLETE:`);
  for (const { ref, op, message } of failed) console.log(`  - ${ref} (${op}): ${message}`);
  console.log(
    "Counts above are partial and the scan may have stopped early. Fix the cause and re-run; " +
      "repairs already written have already fired their triggers.",
  );
  process.exit(EXIT_INCOMPLETE);
}

if (remaining > 0) {
  console.log(
    REPAIR
      ? `Docs still needing a human — see above${withheld > 0 ? ` (${withheld} of them only need the ${ALLOW_PUBLISH_FLAG} decision)` : ""}.`
      : "Run with --repair, or fix by hand.",
  );
  process.exit(EXIT_MALFORMED);
}
console.log("Audit clean — the soft-delete rules can ship.");
process.exit(0);
