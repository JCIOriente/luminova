import type { Can } from "../../../lib/authz/use-can";

/** Which member editor the profile page offers: the full `MemberForm`, the positions-only
 *  form, or none. */
export type MemberEditMode = "full" | "positions" | "none";

/** Gates on the CAPABILITY, not the ExecutiveCommittee role. The role gate was written for
 *  the dedicated `hasOnly(['positions'])` allow-rule CEL used to hold; that rule is gone
 *  with `manage:Position`, so a role gate would render CEL an org-chart form whose every
 *  submit is denied — permanently, not just during the deploy window. Reading the
 *  capability means the positions editor goes dark now and lights up on its own once PR 4's
 *  flag restores a member-positions write lane keyed on `update:Position`. */
export function memberEditMode(gate: Pick<Can, "can">): MemberEditMode {
  if (gate.can("update", "Member")) return "full";
  return gate.can("update", "Position") ? "positions" : "none";
}
