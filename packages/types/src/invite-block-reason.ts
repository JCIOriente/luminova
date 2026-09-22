/** Why `describeInvite` / `redeemInvite` refused a token. Beacon carries the tag on the
 *  HttpsError's `details.reason`; the redemption page keys its Spanish message table on it.
 *
 *  Same cross-boundary contract as PROVISION_BLOCK_REASONS, and here for the same reason: the
 *  two ends are an unauthenticated callable and a public page, with nothing else coupling
 *  them, so a renamed literal would silently degrade a specific refusal to the generic
 *  "este enlace ya no es válido" — the dead end the table exists to remove.
 *
 *  Beacon imports the TYPE only; the runtime array exists so the client's table can be proved
 *  exhaustive by iterating the contract rather than re-listing it. */
export const INVITE_BLOCK_REASONS = [
  // Unknown or malformed token. DELIBERATELY generic: this is the only state reachable
  // without already holding a real token, so it must not distinguish "never existed" from
  // anything else.
  "invite-invalid",
  // Past `expiresAt`. Distinct from the generic tag on purpose — you cannot reach this state
  // without holding a real token, so naming it leaks nothing and it is what makes the page
  // actionable ("expiró — pide otro" rather than a dead end).
  "invite-expired",
  // Already redeemed. The remedy is to sign in, not to ask for another link.
  "invite-used",
  // Superseded by a later issue for the same member.
  "invite-revoked",
  // The member document vanished between issue and redemption.
  "invite-member-missing",
  // The member was deactivated or desafiliado after the link was sent.
  "invite-member-inactive",
  // `members.email` changed after issue. firestore.rules never pins email, so any
  // update:Member holder can move it; honouring the stale link would set a password on an
  // account whose address an operator has since corrected.
  "invite-account-changed",
  "invite-email-changed",
  // The member became privileged (cargo, direct grants, or a privileged claim) after the link
  // was minted. The token outlives the authorization decision by up to 7 days, so the guards
  // re-run at redemption. Exempt when the invite was issued by an Admin.
  "invite-member-now-privileged",
  // The Auth account was disabled out of band — a containment measure we must not undo.
  "invite-account-disabled",
  // The submitted password fails the shared policy. Checked BEFORE the token is claimed, so a
  // typo does not burn the link.
  "invite-password-weak",
  // Too many calls in the last minute, from the in-process limiter in front of both
  // callables. The ONLY tagged reason that is TEMPORARY: the bucket refills continuously, so
  // the same token works again seconds later. The client's retryability table keys on that —
  // every other tagged reason is permanent for this token.
  "invite-too-many-attempts",
  // The token was claimed but the Auth write failed. The link is spent and the member still
  // has no password: the operator must issue a new one. Surfaced as its own invite state so
  // it cannot read as a successful redemption.
  "invite-update-failed",
] as const;

export type InviteBlockReason = (typeof INVITE_BLOCK_REASONS)[number];
