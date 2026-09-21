import { Badge, type BadgeTone } from "@luminova/ui";
import { formatDate } from "@luminova/utils/datetime";
import type { InviteState, Member } from "@luminova/types";
import { memberInviteState } from "../lib/invite-state";

const TONES: Readonly<Record<InviteState, BadgeTone>> = {
  never: "gray",
  legacy: "gray",
  pending: "amber",
  used: "green",
  expired: "gray",
  revoked: "red",
  // Red, like revoked: the token is spent and the member still has no password.
  failed: "red",
};

/** THE single renderer for invite state, used by the profile header, the drawer's done screen
 *  and the members table's "Acceso" column. One component rather than three copies of a
 *  label/tone table — the row menu and the profile header already carried different strings
 *  for the same action once. */
export function InviteStateBadge({ member, now }: { member: Member; now: number }) {
  const state = memberInviteState(member, now);
  return <Badge tone={TONES[state]}>{label(state, member)}</Badge>;
}

function label(state: InviteState, member: Member): string {
  const invite = member.invite;
  switch (state) {
    case "never":
      return "Sin invitar";
    case "legacy":
      return "Con acceso";
    case "pending":
      // The date is the point: it is what tells the operator whether to chase the member or
      // re-issue. `formatDate` is the shared UTC-pinned es-BO formatter.
      return invite ? `Pendiente · vence el ${formatDate(invite.expiresAt)}` : "Pendiente";
    case "used":
      // Guard the date: a projection written before `usedAt` existed, or a partial write,
      // must not render "Usada el undefined".
      return invite?.usedAt ? `Usada el ${formatDate(invite.usedAt)}` : "Usada";
    case "expired":
      return "Expirada";
    case "revoked":
      return "Revocada";
    case "failed":
      return "Falló al usarse — genera otro";
  }
}
