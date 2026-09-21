import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";
import { hasToMillis, logError } from "./firestore-util.js";
import type { InviteDoc, RedeemDeps } from "./redeem-invite.js";

function millis(value: unknown): number | null {
  return hasToMillis(value) ? value.toMillis() : null;
}

/** Parse the stored invite, fail-closed. A malformed document is treated as no document —
 *  the caller then returns the generic `invite-invalid` rather than reasoning about a shape
 *  nothing in this codebase writes. */
function parseInvite(data: Record<string, unknown>): InviteDoc | null {
  const { memberId, uid, email, kind, issuedBy, issuedByAdmin, status } = data;
  const issuedAtMs = millis(data.issuedAt);
  const expiresAtMs = millis(data.expiresAt);
  if (typeof memberId !== "string" || memberId.length === 0) return null;
  if (typeof uid !== "string" || uid.length === 0) return null;
  if (typeof email !== "string") return null;
  if (kind !== "initial" && kind !== "recovery") return null;
  if (status !== "pending" && status !== "used" && status !== "revoked" && status !== "failed")
    return null;
  if (issuedAtMs === null || expiresAtMs === null) return null;
  return {
    memberId,
    uid,
    email,
    kind,
    issuedBy: typeof issuedBy === "string" ? issuedBy : "",
    // Fail CLOSED: anything but an explicit `true` means the privilege guards re-run. A
    // missing or junk field must never read as "an Admin issued this".
    issuedByAdmin: issuedByAdmin === true,
    issuedAtMs,
    expiresAtMs,
    status,
  };
}

export function firestoreRedeemDeps(db: Firestore, auth: Auth): RedeemDeps {
  return {
    now: () => Date.now(),
    getInvite: async (tokenHash) => {
      const snap = await db.doc(`memberInvites/${tokenHash}`).get();
      return snap.exists ? parseInvite(snap.data() as Record<string, unknown>) : null;
    },
    getMember: async (memberId) => {
      const snap = await db.doc(`members/${memberId}`).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    getUserByUid: (uid) =>
      auth.getUser(uid).catch((err: unknown) => {
        if ((err as { code?: unknown } | null)?.code === "auth/user-not-found") return null;
        throw err;
      }),
    getPositionGrants: (cargoId) => readPositionGrants(db, cargoId, logError),

    /** Flip `pending -> used` inside a transaction.
     *
     *  The transaction is the single-use guarantee AND the mutual-exclusion primitive for two
     *  tabs racing: the loser re-reads a non-pending status and is refused. Expiry is
     *  re-checked HERE, against the transactional read, so a link cannot be redeemed on the
     *  strength of a stale pre-transaction load. */
    claimInvite: async (tokenHash, nowMs) => {
      const ref = db.doc(`memberInvites/${tokenHash}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { claimed: false as const, status: "revoked" as const };
        const invite = parseInvite(snap.data() as Record<string, unknown>);
        if (invite === null) return { claimed: false as const, status: "revoked" as const };
        if (invite.status !== "pending") return { claimed: false as const, status: invite.status };
        if (invite.expiresAtMs <= nowMs)
          return { claimed: false as const, status: "revoked" as const };
        const usedAt = Timestamp.fromMillis(nowMs);
        tx.update(ref, { status: "used", usedAt });
        // Mirror onto the projection the operator surfaces read, in the SAME transaction.
        tx.update(db.doc(`members/${invite.memberId}`), {
          "invite.status": "used",
          "invite.usedAt": usedAt,
        });
        return { claimed: true as const, status: "used" as const };
      });
    },

    /** The token is spent but the Auth write failed. A distinct state so the badge cannot read
     *  green while the member has no password. Best-effort: the redemption is already being
     *  refused, so a failure here must not mask that refusal. */
    markInviteFailed: async (tokenHash) => {
      try {
        const ref = db.doc(`memberInvites/${tokenHash}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) return;
          const memberId = (snap.data() as { memberId?: unknown }).memberId;
          tx.update(ref, { status: "failed" });
          if (typeof memberId === "string" && memberId.length > 0) {
            tx.update(db.doc(`members/${memberId}`), { "invite.status": "failed" });
          }
        });
      } catch (err) {
        // Not swallowed silently (guardrail #4): the invite stays `used`, so the operator sees
        // a green badge for a member with no password. That is exactly the state this write
        // exists to prevent, so it must leave a trace.
        logError("could not mark a spent invite as failed", {
          tokenPrefix: tokenHash.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },

    setPassword: (uid, password) => auth.updateUser(uid, { password }).then(() => undefined),
  };
}
