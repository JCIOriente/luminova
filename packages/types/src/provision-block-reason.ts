/** Why `provisionMemberLogin` refused. Beacon carries the tag on the HttpsError's
 *  `details.reason`; backstage's `provisionErrorMessage` keys its operator-facing message
 *  table on it.
 *
 *  Declared here because that is a cross-boundary contract with nothing else coupling its
 *  two ends: renaming a literal in beacon used to leave the client's table silently
 *  unmatched, degrading every refusal to the generic "no se pudo" fallback — which is the
 *  dead-end ("a transient error the operator retries forever") the table exists to remove.
 *  Both apps already depend on `@luminova/types`, so the union turns that rename into a
 *  compile error on the consumer instead. Same reasoning as the Codegen-drift gate in
 *  CLAUDE.md; a shared union is the cheap form of it.
 *
 *  Beacon imports the TYPE only — the root barrel pulls zod, which the functions bundle has
 *  no other reason to carry. The runtime array exists so the client's message table can be
 *  proved exhaustive by iterating the contract rather than re-listing it. */
export const PROVISION_BLOCK_REASONS = [
  // The member's stored uid resolves to a different live Auth account than their email does
  // (an out-of-band email change). Relinking is a deliberate console op.
  "linked-to-different-login",
  // A non-Admin caller reached adoption or resend: an account already exists for this email,
  // or the member is already linked. Both are Admin-only.
  "reprovision-requires-admin",
  // A non-Admin caller reached a member carrying direct grants (roleIds / permissionOverrides).
  "granted-member-requires-admin",
  // A non-Admin caller reached a member seated on a cargo that confers roles.
  "power-seat-requires-admin",
  // The member's stored email is not an address the Auth SDK will accept, so the call would
  // fail as an opaque `internal` and that member would stay unprovisionable until someone
  // edits the doc. `firestore.rules` does not shape-validate email on the admin write lane.
  "member-email-malformed",
] as const;

export type ProvisionBlockReason = (typeof PROVISION_BLOCK_REASONS)[number];
