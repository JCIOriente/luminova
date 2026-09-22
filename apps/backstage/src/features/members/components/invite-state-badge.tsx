import { Badge, type BadgeTone } from "@luminova/ui";
import { formatInstant, formatInstantDate } from "@luminova/utils/datetime";
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

/** THE single renderer for invite state: the profile header and the members table's "Acceso"
 *  column. One component rather than two copies of a label/tone table — the row menu and the
 *  profile header already carried different strings for the same action once, which is the
 *  drift this exists to prevent. (The row menu renders `inviteActionLabel` instead; the
 *  drawer's done screen shows the link itself, since the state there is always "just
 *  issued".) */
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
      // The deadline is the point: it is what tells the operator whether to chase the member
      // or re-issue. Date AND TIME, unlike `usedAt` below — a 48 h window is not legible as a
      // bare date.
      return invite ? `Pendiente · vence el ${formatInstant(invite.expiresAt)}` : "Pendiente";
    case "used":
      // Date only is right here: this one is a past event, not a deadline someone must beat.
      //
      // But BOLIVIAN date. Both fields on this badge are real instants — `expiresAt` is
      // `issuedAt + INVITE_TTL_MS` and `usedAt` is `Timestamp.fromMillis(deps.now())` — so
      // both belong on the `formatInstant*` side. This line used the UTC-pinned `formatDate`
      // under a comment asserting usedAt "is only ever a date", which confused GRANULARITY
      // (no clock, correct) with ZONE (UTC, wrong): a redemption at 21:30 local is 01:30Z the
      // next day, so every redemption after 20:00 rendered tomorrow's date.
      //
      // Guard it: a projection written before `usedAt` existed, or a partial write, must not
      // render "Usada el undefined".
      return invite?.usedAt ? `Usada el ${formatInstantDate(invite.usedAt)}` : "Usada";
    case "expired":
      return "Expirada";
    case "revoked":
      return "Revocada";
    case "failed":
      return "Falló al usarse — genera otro";
  }
}
