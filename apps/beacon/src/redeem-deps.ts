import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";
import { hasToMillis, isSafeDocId, logError, logWarn } from "./firestore-util.js";
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
  // isSafeDocId, not merely "non-empty string": both are interpolated into doc paths
  // (`members/${memberId}` twice, and `auth.getUser(uid)`), and a slash-bearing id throws
  // synchronously inside the claim transaction, surfacing as an opaque `internal`. Beacon is
  // the only writer and screens memberId at issue, so this is depth, not a known hole — but
  // it is the discipline this codebase already applies at every other path template.
  if (!isSafeDocId(memberId)) return null;
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
          if (!isSafeDocId(memberId)) return;

          // ONLY touch the projection if it still names THIS invite.
          //
          // Without this check: invite A is claimed (projection { used, A }); setPassword
          // hangs; in that window the operator re-issues — pendingInviteHash sees `used`, so
          // A is correctly NOT revoked, B is minted and the projection becomes
          // { pending, B }. This write would then stamp { failed, B }, and the next issue
          // sees a non-pending status and never revokes B. B stays pending and redeemable
          // for its full seven days with nothing naming it — no `where` query on
          // memberInvites, no client access, no key. That is precisely the unrevocable live
          // token commitInviteBatch exists to make impossible.
          const memberRef = db.doc(`members/${memberId}`);
          const memberSnap = await tx.get(memberRef);
          const projected = (memberSnap.data() as { invite?: { tokenHash?: unknown } } | undefined)
            ?.invite?.tokenHash;
          if (projected !== tokenHash) {
            logWarn("a newer invite owns the projection; leaving it alone", {
              memberId,
              tokenPrefix: tokenHash.slice(0, 8),
            });
            return;
          }
          tx.update(memberRef, { "invite.status": "failed" });
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
