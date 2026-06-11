import { Timestamp } from "firebase-admin/firestore";
import { CEL_SEED, toPositionDoc } from "./cel-seed.mjs";

const ADMIN_GRANT = "Admin";

/** The catalog id of the Presidente cargo — the active CEL position granting Admin. */
export function findPresidentPositionId(positions) {
  const match = positions.find(
    (p) =>
      p.active !== false &&
      p.category === "CEL" &&
      Array.isArray(p.grants) &&
      p.grants.includes(ADMIN_GRANT),
  );
  if (!match) {
    throw new Error("No active CEL position grants Admin; cannot seed president.");
  }
  return match.id;
}

/** Claims the president must hold so the self-assigned Admin cargo stays trusted
 *  on every onMemberWritten re-derivation. Matches what the trigger computes. */
export function presidentClaims() {
  return { roles: ["Member", "Admin"] };
}

/** Firestore member-doc body for the seeded president. `joinDate`/`birthdate`
 *  are caller-provided Timestamps (kept opaque so this stays unit-testable). */
export function buildPresidentMember({
  uid,
  name,
  email,
  gender,
  term,
  cargoId,
  joinDate,
  birthdate,
}) {
  return {
    name,
    email,
    uid,
    gender,
    phone: "",
    profession: "",
    joinDate,
    birthdate,
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    isPastPresident: false,
    positions: { [term]: { cargoId, comisionIds: [], assignedBy: uid } },
    active: true,
    deletedAt: null,
  };
}

/** Create the Auth user, or reuse + reset password if the email/uid already
 *  exists. Returns the resolved uid. `uid` is optional (dev pins a fixed uid). */
export async function upsertAuthUser(auth, { email, password, uid }) {
  try {
    const user = await auth.createUser(uid ? { uid, email, password } : { email, password });
    return user.uid;
  } catch (error) {
    if (error?.code !== "auth/email-already-exists" && error?.code !== "auth/uid-already-exists") {
      throw error;
    }
    // Resolve the existing user by the pinned uid when we have one (its email may
    // differ from the one we asked for — e.g. a re-seed that changed the email);
    // otherwise resolve by email. Then reconcile both email and password.
    const user = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { email, password });
    return user.uid;
  }
}

/**
 * Seed a durable Presidente (Admin via cargo), idempotently.
 *
 * Order is load-bearing: claims are set BEFORE the member doc is written, so that
 * when onMemberWritten fires it reads the assigner's (self) live claims, sees
 * Admin, and honors the self-assigned power grant. Reversing the order would let
 * the trigger drop Admin on the first re-derivation.
 */
export async function seedPresident({
  db,
  auth,
  president,
  term,
  joinDate,
  birthdate,
  memberId,
  force = false,
}) {
  const bootstrapRef = db.doc("meta/bootstrap");
  const bootstrap = await bootstrapRef.get();
  if (bootstrap.exists && !force) {
    return { skipped: true, reason: "already-seeded", presidentUid: bootstrap.get("presidentUid") };
  }

  const posCol = db.collection("positions");
  const probe = await posCol.limit(1).get();
  if (probe.empty) {
    const batch = db.batch();
    for (const entry of CEL_SEED) batch.set(posCol.doc(), toPositionDoc(entry));
    await batch.commit();
  }
  const snap = await posCol.get();
  const positions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cargoId = findPresidentPositionId(positions);

  const uid = await upsertAuthUser(auth, president);

  // Claims FIRST — see the order note above.
  await auth.setCustomUserClaims(uid, presidentClaims());

  const id = memberId ?? db.collection("members").doc().id;
  await db.doc(`members/${id}`).set(
    buildPresidentMember({
      uid,
      name: president.name,
      email: president.email,
      gender: president.gender,
      term,
      cargoId,
      joinDate,
      birthdate,
    }),
    { merge: true },
  );

  await bootstrapRef.set({ seededAt: Timestamp.now(), presidentUid: uid });

  return { skipped: false, presidentUid: uid, memberId: id, cargoId };
}
