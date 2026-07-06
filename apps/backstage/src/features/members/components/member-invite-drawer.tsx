import { useEffect, useState } from "react";
import { Button, Checkbox, Sheet } from "@luminova/ui";
import { type MemberInput, type Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { actionMessage } from "../lib/member-display";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
import { useCan } from "../../../lib/authz/use-can";

interface MemberInviteDrawerProps {
  open: boolean;
  positions: Position[];
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;
  onProvision: (memberId: string) => Promise<{ email: string; actionLink: string }>;
}

interface DoneState {
  name: string;
  email: string;
  provisioned: boolean;
  emailSent: boolean;
  actionLink: string | null;
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
  // Provisioning login is Admin-role-only (provisionMemberLogin → requireAdmin). A
  // non-Admin may still create the member; they just can't send access here, so hide
  // the option and default it off — otherwise the provision step fails silently after
  // the member is already created.
  const { isAdmin, canAssignPowerGrants } = useCan();
  const [done, setDone] = useState<DoneState | null>(null);
  const [sendAccess, setSendAccess] = useState(isAdmin);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // The drawer mounts with the page, before the auth token's claims decode (the store
  // emits with empty claims first, then re-emits). Re-sync the default each time it
  // OPENS — by then isAdmin is resolved — so an Admin's first invite doesn't silently
  // default "Enviar acceso" off. Won't clobber a manual toggle (deps stable while open).
  useEffect(() => {
    if (open) setSendAccess(isAdmin);
  }, [open, isAdmin]);

  const reset = () => {
    setDone(null);
    setSendAccess(isAdmin);
    setCopyState("idle");
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
    if (sendAccess) {
      // The member is already created; if provisioning fails, fall through to the
      // done screen with provisioned=false ("aún no tiene acceso, invítalo desde su
      // fila") instead of throwing — a thrown error reads as a create failure and
      // would invite a duplicate-create retry.
      try {
        const result = await onProvision(id);
        provisioned = true;
        actionLink = result.actionLink;
        try {
          await requestPasswordReset(data.email);
          emailSent = true;
        } catch {
          emailSent = false;
        }
      } catch {
        provisioned = false;
      }
    }
    setDone({ name: data.name, email: data.email, provisioned, emailSent, actionLink });
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
          ) : done.provisioned && !done.emailSent ? (
            <>
              <p role="alert" className="text-ui-md text-error">
                El correo no se pudo enviar. Comparte el enlace de acceso manualmente.
              </p>
              <Button
                as="button"
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard
                    .writeText(done.actionLink ?? "")
                    .then(() => setCopyState("copied"))
                    .catch(() => setCopyState("failed"));
                }}
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
          ) : (
            <p className="text-ui-md text-ink-2">
              Aún no tiene acceso a la app. Podrás invitarlo desde el menú de su fila.
            </p>
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
          allowPowerGrants={canAssignPowerGrants}
          defaultValues={{ joinDate: today(), status: "Activo", cargoId: null, comisionIds: [] }}
          onSubmit={handleSubmit}
        >
          {isAdmin && (
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
