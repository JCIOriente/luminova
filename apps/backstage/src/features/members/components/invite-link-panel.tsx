import { Timestamp } from "firebase/firestore";
import { Button } from "@luminova/ui";
import { formatInstant } from "@luminova/utils/datetime";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard";

/** The share-this-link body, rendered identically by all three operator surfaces: the profile
 *  header's dialog, the invite drawer's done screen, and the members table's row action.
 *
 *  Extracted at its THIRD occurrence (guardrail #1, rule of three). The same reasoning as
 *  `inviteLink()` itself, one layer up: three hand-maintained copies of "here is the link,
 *  here is when it dies, here is the warning that it is a credential" is how the row menu and
 *  the profile header came to describe the same action differently. Owns its own copy state,
 *  so no caller has to thread it. */
export function InviteLinkPanel({
  name,
  url,
  expiresAt,
}: {
  name: string;
  url: string;
  expiresAt: number | null;
}) {
  const { copyState, copy } = useCopyToClipboard();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui-sm text-ink-2">
        {`Comparte este enlace con ${name} para que cree su contraseña.`}
        {/* Date AND TIME, on the BOLIVIAN clock. At a seven-day TTL "vence el 23 de
            septiembre" was precise enough; at 48 hours a bare date is misleading — a link
            minted 23:00 Monday dies 23:00 Wednesday, which reads as "Wednesday, some time".
            `formatInstant`, not `formatDateTime`: expiresAt is a real instant, and the
            UTC-pinned formatter would name a deadline four hours late. */}
        {expiresAt !== null && ` Vence el ${formatInstant(Timestamp.fromMillis(expiresAt))}.`}
      </p>
      {/* A LINK IS A CREDENTIAL: whoever holds it sets this member's password, and there is no
          way to un-send one — the remedy is to re-issue, which revokes it. Said where the
          operator is about to paste it into a chat, not only in the operator notes. */}
      <p className="text-ui-xs text-ink-3">
        Cualquiera que tenga este enlace puede crear la contraseña. Envíalo en un chat directo, no
        en un grupo.
      </p>
      <code className="block w-full overflow-x-auto rounded-[8px] bg-ink-1/[0.04] px-3 py-2 text-ui-xs text-ink-2">
        {url}
      </code>
      <Button as="button" type="button" onClick={() => copy(url)}>
        {copyState === "copied" ? "Enlace copiado" : "Copiar enlace"}
      </Button>
      {/* Clipboard access can be denied outright (permissions, an insecure origin), and the
          link is the ONLY delivery mechanism — so a failed copy must leave it selectable
          rather than stranding the operator. */}
      {copyState === "failed" && (
        <p role="alert" className="text-ui-xs text-error">
          No se pudo copiar. Selecciona el enlace de arriba y cópialo manualmente.
        </p>
      )}
    </div>
  );
}
