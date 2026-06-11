import { useState } from "react";
import { Button, Checkbox, Sheet } from "@luminova/ui";
import { type MemberInput, type Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { actionMessage } from "../lib/member-display";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";

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
  const [done, setDone] = useState<DoneState | null>(null);
  const [sendAccess, setSendAccess] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const reset = () => {
    setDone(null);
    setSendAccess(true);
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
      const result = await onProvision(id);
      provisioned = true;
      actionLink = result.actionLink;
      try {
        await requestPasswordReset(data.email);
        emailSent = true;
      } catch {
        emailSent = false;
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
          <p className="text-[15px] font-semibold text-ink-1">
            {actionMessage(done.name, "created")}
          </p>
          {done.provisioned && done.emailSent ? (
            <p className="text-[14px] text-ink-2">
              {`Invitación enviada a ${done.email}. Recibirá un correo para crear su contraseña y acceder a la app.`}
            </p>
          ) : done.provisioned && !done.emailSent ? (
            <>
              <p role="alert" className="text-[14px] text-error">
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
                <code className="text-[12px] break-all select-all text-ink-2">
                  {done.actionLink}
                </code>
              )}
            </>
          ) : (
            <p className="text-[14px] text-ink-2">
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
          defaultValues={{ joinDate: today(), status: "Activo", cargoId: null, comisionIds: [] }}
          onSubmit={handleSubmit}
        >
          <Checkbox checked={sendAccess} onChange={setSendAccess} label="Enviar acceso a la app" />
        </MemberForm>
      )}
    </Sheet>
  );
}
