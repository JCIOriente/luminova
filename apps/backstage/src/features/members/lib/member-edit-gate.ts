import type { Can } from "../../../lib/authz/use-can";

/** Whether the member profile offers the positions-only editor instead of the full form.
 *
 *  Gates on the CAPABILITY, not the ExecutiveCommittee role. The role gate was written for
 *  the dedicated `hasOnly(['positions'])` allow-rule CEL used to hold; that rule is gone
 *  with `manage:Position`, so a role gate would render CEL an org-chart form whose every
 *  submit is denied — permanently, not just during the deploy window. Reading the
 *  capability means the editor goes dark now and lights up on its own once PR 4's flag
 *  restores a member-positions write lane keyed on `update:Position`. */
export function showsPositionsOnlyEditor(gate: Pick<Can, "can">): boolean {
  return !gate.can("update", "Member") && gate.can("update", "Position");
}
