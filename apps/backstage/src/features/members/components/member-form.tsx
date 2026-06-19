import { useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Combobox, DatePicker, Field, Input, MultiSelect, Select } from "@luminova/ui";
import {
  memberSchema,
  positionTitle,
  currentTermKey,
  type MemberInput,
  type Position,
  MEMBER_STATUSES,
  MEMBER_GENDERS,
} from "@luminova/types";
import { avatarColor } from "../lib/member-display";
import { initials } from "../../../lib/initials";

interface MemberFormProps {
  positions: Position[];
  defaultValues?: Partial<MemberInput>;
  submitLabel: string;
  pendingLabel?: string;
  onSubmit: (data: MemberInput) => Promise<void>;
  showPreview?: boolean;
  avatarSeed?: string;
  children?: ReactNode;
}

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  profession: "",
  joinDate: "",
  birthdate: "",
  status: "Activo",
  cargoId: null,
  comisionIds: [],
} satisfies Partial<MemberInput>;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">{children}</h3>
  );
}

export function MemberForm({
  positions,
  defaultValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  showPreview,
  avatarSeed,
  children,
}: MemberFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const gender = watch("gender");
  const currentCargoId = watch("cargoId");
  const currentComisionIds = watch("comisionIds");
  const term = currentTermKey();
  const activeCargoOptions = positions
    .filter(
      (p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term),
    )
    .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));
  const assignedInactiveCargo =
    currentCargoId && !activeCargoOptions.some((o) => o.value === currentCargoId)
      ? positions
          .filter((p) => p.id === currentCargoId)
          .map((p) => ({ value: p.id, label: `${positionTitle(p, gender)} (inactivo)` }))
      : [];
  const cargoOptions = [...activeCargoOptions, ...assignedInactiveCargo];

  const comisionLabel = (p: Position) => (p.sigla ? `${p.sigla} — ${p.title}` : p.title);
  const activeComisionOptions = positions
    .filter((p) => p.active && p.category === "Comision")
    .map((p) => ({ value: p.id, label: comisionLabel(p) }));
  const assignedInactiveComisiones = (currentComisionIds ?? [])
    .filter((id) => !activeComisionOptions.some((o) => o.value === id))
    .flatMap((id) =>
      positions
        .filter((p) => p.id === id)
        .map((p) => ({ value: p.id, label: `${comisionLabel(p)} (inactivo)` })),
    );
  const comisionOptions = [...activeComisionOptions, ...assignedInactiveComisiones];

  const previewName = watch("name");
  const previewRole = cargoOptions.find((o) => o.value === watch("cargoId"))?.label ?? "Miembro";
  const seed = avatarSeed?.trim() || previewName?.trim() || "nuevo";

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {showPreview && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3.5">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
            style={{ backgroundColor: avatarColor(seed) }}
          >
            {initials(previewName || "")}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink-1">
              {previewName?.trim() || "Nuevo miembro"}
            </div>
            <div className="truncate text-[13px] text-ink-3">{previewRole}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <SectionLabel>Datos personales</SectionLabel>
        <Field label="Nombre" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register("name")} />
        </Field>
        <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </Field>
        <Field label="Género" htmlFor="gender" required error={errors.gender?.message}>
          <Select id="gender" {...register("gender")}>
            <option value="">Seleccionar…</option>
            {MEMBER_GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" {...register("phone")} />
        </Field>
        <Field label="Profesión" htmlFor="profession" error={errors.profession?.message}>
          <Input id="profession" {...register("profession")} />
        </Field>
        <Field
          label="Fecha de nacimiento"
          htmlFor="birthdate"
          required
          error={errors.birthdate?.message}
        >
          <Controller
            control={control}
            name="birthdate"
            render={({ field }) => (
              <DatePicker id="birthdate" value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Membresía</SectionLabel>
        <Field label="Cargo" htmlFor="cargoId" error={errors.cargoId?.message}>
          <Controller
            control={control}
            name="cargoId"
            render={({ field }) => (
              <Combobox
                id="cargoId"
                options={cargoOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Sin cargo"
              />
            )}
          />
        </Field>
        <Field
          label="Comisiones (pertenece a)"
          htmlFor="comisionIds"
          error={errors.comisionIds?.message}
        >
          <Controller
            control={control}
            name="comisionIds"
            render={({ field }) => (
              <MultiSelect
                id="comisionIds"
                options={comisionOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field
          label="Fecha de ingreso"
          htmlFor="joinDate"
          required
          error={errors.joinDate?.message}
        >
          <Controller
            control={control}
            name="joinDate"
            render={({ field }) => (
              <DatePicker id="joinDate" value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
          <Select id="status" {...register("status")}>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {children}

      {formError && (
        <div role="alert" className="text-[13px] text-error">
          {formError}
        </div>
      )}
      <Button
        as="button"
        type="submit"
        disabled={isSubmitting}
        className="mt-1 w-full justify-center"
      >
        {isSubmitting ? (pendingLabel ?? "Guardando…") : submitLabel}
      </Button>
    </form>
  );
}
