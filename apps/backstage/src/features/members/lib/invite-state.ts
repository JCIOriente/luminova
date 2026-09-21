import type { InviteState, Member } from "@luminova/types";

/** The operator-facing invite state for a member.
 *
 *  ONE predicate, read by all three surfaces (the profile header, the drawer's done screen and
 *  the members table's "Acceso" column), so the label a delegate sees cannot drift from the
 *  one an Admin sees — which is how the two cargo forms drifted before.
 *
 *  TWO STATES ARE DERIVED, not stored, so no migration and no beacon write is needed for them
 *  to read correctly:
 *
 *  - "expired" — pending past `expiresAt`. A link goes stale on the clock, not on a write.
 *  - "legacy"  — `uid && !invite`: provisioned before this feature existed. Without this
 *    branch THE ENTIRE EXISTING ROSTER renders "Sin invitar" on day one, which makes the new
 *    column useless at launch and invites operators to re-issue links for people who already
 *    have accounts — and for a delegate, each such re-issue is the impersonation primitive.
 *
 *  A spent invite (used / revoked / failed) is NOT re-derived as expired once its expiresAt
 *  passes: what the operator needs to know is that it was used, revoked, or failed. */
export function memberInviteState(member: Member, now: number): InviteState {
  const invite = member.invite;
  const hasLogin = typeof member.uid === "string" && member.uid.length > 0;
  if (invite === undefined || invite === null) return hasLogin ? "legacy" : "never";

  switch (invite.status) {
    case "pending":
      return invite.expiresAt.toMillis() <= now ? "expired" : "pending";
    case "used":
      return "used";
    case "revoked":
      return "revoked";
    case "failed":
      return "failed";
    default:
      // A projection shape this build does not understand. Fall back to what the uid tells us
      // rather than inventing a state — the member demonstrably has (or has not) an account.
      return hasLogin ? "legacy" : "never";
  }
}

const ACTION_LABELS: Readonly<Record<InviteState, string>> = {
  never: "Invitar acceso",
  // Both mean "this person can already sign in; make them a new way in".
  legacy: "Recuperar acceso",
  used: "Recuperar acceso",
  // The old link is still live, so this re-sends rather than replacing — but beacon revokes
  // on every issue, and the copy dialog says so.
  pending: "Reenviar enlace",
  expired: "Generar enlace nuevo",
  revoked: "Generar enlace nuevo",
  failed: "Generar enlace nuevo",
};

/** The button / menu-item label for a state. Derived, never hand-typed per surface — the row
 *  menu and the profile header used to carry different strings for the same action. */
export function inviteActionLabel(state: InviteState): string {
  return ACTION_LABELS[state];
}
