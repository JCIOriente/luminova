import { useEffect, useState } from "react";
import { Button, Checkbox, Sheet } from "@luminova/ui";
import { type MemberInput, type Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { actionMessage } from "../lib/member-display";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
import { draftProvisionBlocked } from "../lib/provision-gate";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard";
import { useCan } from "../../../lib/authz/use-can";

interface MemberInviteDrawerProps {
  open: boolean;
  positions: Position[];
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;
  onProvision: (memberId: string) => Promise<{ email: string; actionLink: string }>;
}

interface DoneState {
  /** The invite was skipped because the member's cargo confers permissions and the caller is
   *  not an Admin — beacon would refuse it, so nothing was attempted. */
  blockedByCargo: boolean;
  /** The same predicate WITHOUT the sendAccess conjunct — a delegate who left the checkbox
   *  unticked is still blocked from the row action, so the done screen must not send them there. */
  provisionBlocked: boolean;
  name: string;
  email: string;
  provisioned: boolean;
  emailSent: boolean;
  actionLink: string | null;
  errorDetail: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MemberInviteDrawer({
  open,
  positions,
  onClose,
  onCreate,
  onProvision,
}: MemberInviteDrawerProps) {
  // Provisioning login is the Admin role OR the create:MemberLogin perm
  // (provisionMemberLogin → requireAdminOrPerm). A member creator without either may still
  // create the member; they just can't send access here, so hide the option and default it
  // off — otherwise the provision step fails silently after the member is already created.
  const { canProvisionLogin, canAssignBoardSeat, isAdmin } = useCan();
  const [done, setDone] = useState<DoneState | null>(null);
  const [sendAccess, setSendAccess] = useState(canProvisionLogin);
  const { copyState, copy, resetCopyState } = useCopyToClipboard();

  // The drawer mounts with the page, before the auth token's claims decode (the store
  // emits with empty claims first, then re-emits). Re-sync the default each time it
  // OPENS — by then the flag is resolved — so a provisioner's first invite doesn't silently
  // default "Enviar acceso" off. Won't clobber a manual toggle (deps stable while open).
  // This matters MORE now than it did for a role gate: `perms` is minted by claims-sync and
  // lands in the same late token, so a perm-derived flag is false for exactly as long.
  useEffect(() => {
    if (open) setSendAccess(canProvisionLogin);
  }, [open, canProvisionLogin]);

  const reset = () => {
    setDone(null);
    setSendAccess(canProvisionLogin);
    resetCopyState();
  };

  const close = () => {
    onClose();
    reset();
  };

  const handleSubmit = async (data: MemberInput) => {
    const id = await onCreate(data);
    let provisioned = false;
    let emailSent = false;
    let actionLink: string | null = null;
    let errorDetail: string | null = null;
    // beacon refuses a non-Admin provisioning a member seated on a granting cargo (the
    // power-seat guard). The rules DO let that member be created, so without this check the
    // drawer would create them, 403 on the invite, and send the user to a row action that
    // fails the same way on every retry. Decide before writing anything. Same predicate as
    // the row menu and the profile header — see provision-gate.ts.
    const provisionBlocked = draftProvisionBlocked(
      data.cargoId,
      (id) => positions.find((p) => p.id === id),
      isAdmin,
    );
    // Nothing is attempted when blocked: the done screen explains it instead of reporting a
    // failure that never happened.
    if (sendAccess && !provisionBlocked) {
      // The member is already created; if provisioning fails, fall through to the
      // done screen with provisioned=false ("aún no tiene acceso, invítalo desde su
      // fila") instead of throwing — a thrown error reads as a create failure and
      // would invite a duplicate-create retry. Surface the real cause (App Check,
      // quota, config) instead of swallowing it — this is the only diagnostic we get.
      try {
        const result = await onProvision(id);
        provisioned = true;
        actionLink = result.actionLink || null;
        try {
          await requestPasswordReset(data.email);
          emailSent = true;
        } catch (err) {
          console.error("No se pudo enviar el correo de acceso", err);
          errorDetail = err instanceof Error ? err.message : String(err);
        }
      } catch (err) {
        console.error("No se pudo aprovisionar el acceso del miembro", err);
        errorDetail = err instanceof Error ? err.message : String(err);
      }
    }
    setDone({
      blockedByCargo: sendAccess && provisionBlocked,
      provisionBlocked,
      name: data.name,
      email: data.email,
      provisioned,
      emailSent,
      actionLink,
      errorDetail,
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Invitar miembro"
      size="md"
    >
      {done ? (
        <div className="flex flex-col gap-5">
          <p className="text-ui-lg font-semibold text-ink-1">
            {actionMessage(done.name, "created")}
          </p>
          {done.provisioned && done.emailSent ? (
            <p className="text-ui-md text-ink-2">
              {`Invitación enviada a ${done.email}. Recibirá un correo para crear su contraseña y acceder a la app.`}
            </p>
          ) : done.blockedByCargo ? (
            <p role="alert" className="text-ui-md text-error">
              {`${done.name} fue creado, pero su cargo otorga permisos: solo un administrador puede enviarle el acceso. Pídele a un administrador que complete la invitación.`}
            </p>
          ) : done.provisioned && !done.emailSent ? (
            <>
              <p role="alert" className="text-ui-md text-error">
                {done.actionLink
                  ? "El correo no se pudo enviar. Comparte el enlace de acceso manualmente."
                  : "El correo no se pudo enviar. Pídele a un administrador que reenvíe la invitación."}
              </p>
              {done.errorDetail && (
                <p className="text-ui-xs text-ink-3">Detalle: {done.errorDetail}</p>
              )}
              {done.actionLink && (
                <>
                  <Button
                    as="button"
                    type="button"
                    variant="secondary"
                    onClick={() => copy(done.actionLink ?? "")}
                    className="w-full justify-center"
                  >
                    {copyState === "copied" ? "Enlace copiado" : "Copiar enlace de acceso"}
                  </Button>
                  {copyState === "failed" && (
                    <code className="text-ui-xs break-all select-all text-ink-2">
                      {done.actionLink}
                    </code>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Only promise the row action to someone who will actually SEE it. The row item
                  is gated on `canProvisionLogin && !provisionBlocked` (member-row-menu), so
                  both conjuncts have to be answered here or this sends a caller to an
                  affordance that is not there. `blockedByCargo` is the wrong flag for the
                  second one — it also requires sendAccess, and the same delegate lands here
                  with the checkbox unticked. A `create:Member` holder without
                  `create:MemberLogin` reaches this drawer too: the trigger only asks
                  `Can I="create" a="Member"`. */}
              <p className="text-ui-md text-ink-2">
                {done.provisionBlocked
                  ? "Aún no tiene acceso a la app. Su cargo otorga permisos, así que un administrador debe enviarle el acceso."
                  : canProvisionLogin
                    ? "Aún no tiene acceso a la app. Podrás invitarlo desde el menú de su fila."
                    : "Aún no tiene acceso a la app. Pídele a un administrador que le envíe el acceso."}
              </p>
              {done.errorDetail && (
                <p className="text-ui-xs text-ink-3">Detalle: {done.errorDetail}</p>
              )}
            </>
          )}
          <div className="flex flex-col gap-3">
            <Button as="button" type="button" onClick={reset} className="w-full justify-center">
              Invitar a otra persona
            </Button>
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={close}
              className="w-full justify-center"
            >
              Listo
            </Button>
          </div>
        </div>
      ) : (
        <MemberForm
          positions={positions}
          submitLabel="Enviar invitación"
          pendingLabel="Enviando…"
          showPreview
          allowPowerGrants={canAssignBoardSeat}
          allowReplacePowerCargo={isAdmin}
          assignerIsAdmin={isAdmin}
          defaultValues={{ joinDate: today(), status: "Activo", cargoId: null, comisionIds: [] }}
          onSubmit={handleSubmit}
        >
          {canProvisionLogin && (
            <Checkbox
              checked={sendAccess}
              onChange={setSendAccess}
              label="Enviar acceso a la app"
            />
          )}
        </MemberForm>
      )}
    </Sheet>
  );
}
