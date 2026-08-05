import type { Can } from "../../../lib/authz/use-can";

/** Which member editor the profile page offers: the full `MemberForm`, the positions-only
 *  form, or none. */
export type MemberEditMode = "full" | "positions" | "none";

/** Gates on the capability that governs the WRITE, not on a role and not on the subject the
 *  form is named after. Both editors submit to `members/{id}`, whose update rule is
 *  `canDo('update','Member')` (+ `positionsAssignmentSafe()`); `update:Position` governs the
 *  separate `positions` cargo catalog, so reading it here rendered the Cargos form to a
 *  principal whose every submit is denied — the render-then-die shape this gate exists to
 *  remove, just relocated. Cargo assignment is Admin-only until PR 4 adds the
 *  members-positions write lane keyed on `update:Position`; the `"positions"` arm comes back
 *  then, together with the `firestore.rules` lane that makes it true. */
export function memberEditMode(gate: Pick<Can, "can">): MemberEditMode {
  return gate.can("update", "Member") ? "full" : "none";
}
