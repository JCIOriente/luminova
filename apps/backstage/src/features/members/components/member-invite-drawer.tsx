import { useId, useState } from "react";
import { Button, Field, Input, Select, Checkbox, Sheet } from "@luminova/ui";
import {
  memberSchema,
  type MemberInput,
  type MemberStatus,
  MEMBER_STATUSES,
} from "@luminova/types";
import { ROLE_SUGGESTIONS } from "../lib/role-suggestions";
import { actionMessage } from "../lib/member-display";
import { initials } from "../../../lib/initials";

interface MemberInviteDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;
  onProvision: (memberId: string) => Promise<void>;
}

type Stage = "form" | "creating" | "done";

const EMAIL_RE = /\S+@\S+\.\S+/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY = {
  name: "",
  email: "",
  role: "",
  status: "Activo" as MemberStatus,
  joinDate: today(),
  birthdate: "",
  sendAccess: true,
};

export function MemberInviteDrawer({
  open,
  onClose,
  onCreate,
  onProvision,
}: MemberInviteDrawerProps) {
  const roleListId = useId();
  const [stage, setStage] = useState<Stage>("form");
  const [form, setForm] = useState(EMPTY);
  const [provisioned, setProvisioned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    form.name.trim().length >= 3 && EMAIL_RE.test(form.email) && form.birthdate.length > 0;

  const reset = () => {
    setForm({ ...EMPTY, joinDate: today() });
    setProvisioned(false);
    setError(null);
    setStage("form");
  };

  const close = () => {
    onClose();
    reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setStage("creating");
    try {
      const data: MemberInput = memberSchema.parse({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: "",
        role: form.role.trim() || "Miembro activo",
        profession: "",
        joinDate: form.joinDate,
        birthdate: form.birthdate,
        status: form.status,
      });
      const id = await onCreate(data);
      if (form.sendAccess) {
        await onProvision(id);
        setProvisioned(true);
      }
      setStage("done");
    } catch {
      setError("No se pudo completar la invitación. Intenta de nuevo.");
      setStage("form");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Invitar miembro"
    >
      {stage === "done" ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] font-semibold text-ink-1">
            {actionMessage(form.name.trim(), "created")}
          </p>
          <p className="text-[14px] text-ink-2">
            {provisioned
              ? `${form.email.trim()} recibirá un enlace para crear su contraseña y acceder a la app.`
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
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[14px] font-semibold text-white">
              {initials(form.name || "")}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink-1">
                {form.name.trim() || "Nuevo miembro"}
              </div>
              <div className="truncate text-[13px] text-ink-3">{form.role.trim() || "Rol"}</div>
            </div>
          </div>

          <Field label="Nombre" htmlFor="invite-name" required>
            <Input
              id="invite-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Correo" htmlFor="invite-email" required>
            <Input
              id="invite-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Rol" htmlFor="invite-role">
            <Input
              id="invite-role"
              list={roleListId}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <datalist id={roleListId}>
              {ROLE_SUGGESTIONS.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </Field>
          <Field label="Estado" htmlFor="invite-status" required>
            <Select
              id="invite-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as MemberStatus }))}
            >
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de ingreso" htmlFor="invite-join" required>
            <Input
              id="invite-join"
              type="date"
              value={form.joinDate}
              onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
            />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="invite-birth" required>
            <Input
              id="invite-birth"
              type="date"
              value={form.birthdate}
              onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))}
            />
          </Field>

          <Checkbox
            checked={form.sendAccess}
            onChange={(checked) => setForm((f) => ({ ...f, sendAccess: checked }))}
            label="Enviar acceso a la app"
          />

          {error && (
            <div role="alert" className="text-[13px] text-error">
              {error}
            </div>
          )}

          <Button
            as="button"
            type="submit"
            disabled={!valid || stage === "creating"}
            className="mt-1 w-full justify-center"
          >
            {stage === "creating" ? "Enviando…" : "Enviar invitación"}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
