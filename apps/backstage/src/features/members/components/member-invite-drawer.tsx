import { useState } from "react";
import { Button, Checkbox, Sheet } from "@luminova/ui";
import { type MemberInput, type Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { actionMessage } from "../lib/member-display";

interface MemberInviteDrawerProps {
  open: boolean;
  positions: Position[];
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;
  onProvision: (memberId: string) => Promise<void>;
}

interface DoneState {
  name: string;
  email: string;
  provisioned: boolean;
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

  const reset = () => {
    setDone(null);
    setSendAccess(true);
  };

  const close = () => {
    onClose();
    reset();
  };

  const handleSubmit = async (data: MemberInput) => {
    const id = await onCreate(data);
    let provisioned = false;
    if (sendAccess) {
      await onProvision(id);
      provisioned = true;
    }
    setDone({ name: data.name, email: data.email, provisioned });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Invitar miembro"
    >
      {done ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] font-semibold text-ink-1">
            {actionMessage(done.name, "created")}
          </p>
          <p className="text-[14px] text-ink-2">
            {done.provisioned
              ? `${done.email} recibirá un enlace para crear su contraseña y acceder a la app.`
              : "Aún no tiene acceso a la app. Podrás invitarlo desde el menú de su fila."}
          </p>
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
