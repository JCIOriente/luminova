import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";
import { logError } from "./firestore-util.js";
import { memberEmailMalformed } from "./provision-errors.js";
import type { InviteCommit, InviteDeps } from "./issue-member-invite.js";

function authCode(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

/** Identity Toolkit rejects addresses the SHAPE screen cannot: `a@.`, `.a@b.co`, `a..b@c.co`
 *  each carry one `@`, no whitespace and no control characters, so they pass
 *  `ADMIN_SDK_EMAIL_SHAPE` and the Admin SDK's own isEmail alike and only fail server-side.
 *  Rethrown raw, that is an opaque `internal` with no `details.reason` and a member nobody can
 *  provision without knowing why. Tagged HERE rather than by chasing regex precision: this
 *  closes the class whatever the pattern does next.
 *
 *  Residual, deliberately not chased further: a rejection that maps to `auth/invalid-argument`
 *  rather than `auth/invalid-email` still reaches the client opaque. The shape screen plus this
 *  tag cover the reachable cases. */
function tagInvalidEmail(err: unknown): never {
  if (authCode(err) === "auth/invalid-email") {
    // The HttpsError replaces the original, and firebase-functions treats a thrown HttpsError
    // as an EXPECTED refusal — no "Unhandled error" line. Without this the failure class would
    // leave zero trace in Cloud Logging (guardrail #4). Code only, never the address: PII.
    logError("provision refused: Auth rejected the stored email", { code: authCode(err) });
    throw memberEmailMalformed();
  }
  throw err;
}

// Null only for the "account does not exist" outcome — a transient Auth error
// must propagate, not read as deleted (the relink guard trusts that contract).
function nullIfUserNotFound(err: unknown): null {
  if (authCode(err) === "auth/user-not-found") return null;
  return tagInvalidEmail(err);
}

export function firestoreInviteDeps(db: Firestore, auth: Auth): InviteDeps {
  return {
    getMember: async (id) => {
      const snap = await db.doc(`members/${id}`).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    getUserByEmail: (email) => auth.getUserByEmail(email).catch(nullIfUserNotFound),
    getUserByUid: (uid) => auth.getUser(uid).catch(nullIfUserNotFound),
    // Tolerate a concurrent create (a parallel invite would otherwise throw
    // auth/email-already-exists) — and ONLY that. A blanket catch also swallowed quota,
    // disabled-provider and invalid-email errors and re-surfaced them as an unrelated
    // auth/user-not-found, destroying the diagnostic.
    createUser: (email) =>
      auth.createUser({ email }).catch((err: unknown) => {
        if (authCode(err) !== "auth/email-already-exists") return tagInvalidEmail(err);
        return auth.getUserByEmail(email);
      }),
    setClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    linkUid: async (id, uid) => {
      await db.doc(`members/${id}`).update({ uid });
    },
    now: () => Date.now(),
    commitInvite: (commit) => commitInviteBatch(db, commit),
    getPositionGrants: (cargoId) => readPositionGrants(db, cargoId, logError),
  };
}

/** The three invite writes as ONE batch.
 *
 *  This is the single most important implementation constraint in the design. If the
 *  projection write alone failed, the result would be a live `pending` invite whose token the
 *  operator has already sent, with `members/{id}.invite` still pointing at the OLD revoked
 *  hash — and nothing could ever revoke that orphan: there is no `where` query on
 *  memberInvites, firestore.rules denies every client lane, and the only key into the
 *  collection no longer names it. It would stay redeemable for the full seven days.
 *
 *  The member doc is contended (awardPoints mirrors totalPoints on every check-in, and
 *  onMemberWritten fires on every member write), so this is not a theoretical failure.
 *
 *  `set` on the new invite rather than `create`: the id is a sha256 of 256 bits of CSPRNG
 *  output, so a collision is not a scenario worth a second round-trip to rule out. */
async function commitInviteBatch(db: Firestore, commit: InviteCommit): Promise<void> {
  const { invite } = commit;
  const batch = db.batch();

  if (commit.revokeTokenHash !== null) {
    // `set` with merge, NOT `update`. update() rejects the WHOLE BATCH when the target is
    // missing, and the target can legitimately be gone: the projection keeps
    // `status: "pending"` forever on a link nobody redeemed ("expired" is derived, nothing
    // writes a terminal status), while the invite DOCUMENT is reaped at issuedAt+90d by the
    // purgeAt TTL policy. With update(), from day 91 every re-issue for that member would
    // fail identically and opaquely, with no retry able to clear it — including the
    // locked-out-Admin recovery path, which is now the only in-product remedy.
    //
    // A resurrected stub is harmless: it carries no memberId/uid/kind, so parseInvite rejects
    // it and it reads as the generic `invite-invalid`. purgeAt rides along so the stub is
    // reaped again rather than lingering forever.
    batch.set(
      db.doc(`memberInvites/${commit.revokeTokenHash}`),
      {
        status: "revoked",
        revokedAt: Timestamp.now(),
        revokedBy: commit.revokedBy,
        purgeAt: Timestamp.fromMillis(invite.purgeAtMs),
      },
      { merge: true },
    );
  }

  const issuedAt = Timestamp.fromMillis(invite.issuedAtMs);
  const expiresAt = Timestamp.fromMillis(invite.expiresAtMs);
  batch.set(db.doc(`memberInvites/${commit.tokenHash}`), {
    memberId: invite.memberId,
    uid: invite.uid,
    email: invite.email,
    kind: invite.kind,
    issuedBy: invite.issuedBy,
    issuedByAdmin: invite.issuedByAdmin,
    issuedAt,
    expiresAt,
    status: "pending",
    usedAt: null,
    revokedAt: null,
    revokedBy: null,
    purgeAt: Timestamp.fromMillis(invite.purgeAtMs),
  });

  // The projection clients actually read. Built HERE, from the same values, so the invite doc
  // and its mirror cannot drift.
  batch.update(db.doc(`members/${invite.memberId}`), {
    invite: {
      status: "pending",
      kind: invite.kind,
      tokenHash: commit.tokenHash,
      issuedAt,
      expiresAt,
      issuedBy: invite.issuedBy,
      usedAt: null,
    },
  });

  await batch.commit();
}
