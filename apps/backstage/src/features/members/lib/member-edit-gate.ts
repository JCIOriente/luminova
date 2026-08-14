import type { Can } from "../../../lib/authz/use-can";

/** Which member editor the profile page offers: the full `MemberForm`, the positions-only
 *  form, or none. */
export type MemberEditMode = "full" | "positions" | "none";

/** Gates on the capability that governs the WRITE, not on a role and not on the subject the
 *  form is named after. Both editors submit to `members/{id}`, and each arm maps to a real
 *  `firestore.rules` lane on that doc:
 *    - `"full"`    → the institutional arm, `canDo('update','Member')`;
 *    - `"positions"` → the members-positions arm, `canDo('update','Position')` confined to
 *      `hasOnly(['positions'])` + `positionsAssignmentSafe()` — so an org-chart editor who is
 *      not a member editor may assign and clear GRANT-FREE cargos only, on both sides of a
 *      swap. `read:Position` (which a plain Member carries for chip resolution on /me) is
 *      deliberately not enough: it writes nothing, and rendering the form for it would be the
 *      render-then-PERMISSION_DENIED shape this gate exists to remove.
 *  Order is load-bearing: `update:Member` is checked first so a principal holding both never
 *  mounts two competing editors over the same doc. */
export function memberEditMode(gate: Pick<Can, "can">): MemberEditMode {
  if (gate.can("update", "Member")) return "full";
  if (gate.can("update", "Position")) return "positions";
  return "none";
}
