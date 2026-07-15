import { useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  Combobox,
  DatePicker,
  Field,
  Input,
  MultiSelect,
  SegmentedControl,
  Select,
  initials,
} from "@luminova/ui";
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

interface MemberFormProps {
  positions: Position[];
  defaultValues?: Partial<MemberInput>;
  submitLabel: string;
  pendingLabel?: string;
  onSubmit: (data: MemberInput) => Promise<void>;
  showPreview?: boolean;
  avatarSeed?: string;
  /** Whether the editor may assign power-granting cargos — Admin only (rules'
   *  `cargoGrantsEmpty` / `createPositionsSafe`). Non-Admin sees only grant-free
   *  cargos plus the current selection. */
  allowPowerGrants?: boolean;
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
    <h3 className="text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase">{children}</h3>
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
  allowPowerGrants = false,
  children,
}: MemberFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const gender = watch("gender");
  const currentCargoId = watch("cargoId");
  const currentComisionIds = watch("comisionIds");
  // A member whose cargo is a CEL position belongs to the Comité Ejecutivo Local, not a
  // comisión. Show that as a locked chip (derived from the cargo). comisionIds is cleared
  // only when the user actively switches TO a CEL cargo (see the Cargo onChange) — never
  // force-cleared at submit, so a bio edit of a legacy CEL member with stored comisiones
  // doesn't trigger a positions write the editor may not be allowed to make.
  const isExecutiveCommitteeCargo =
    positions.find((p) => p.id === currentCargoId)?.category === "CEL";
  const term = currentTermKey();
  // Keep the member's ORIGINALLY-assigned cargo selectable for a non-Admin even if it
  // grants power — but off the static default, not the reactive selection, so switching
  // away and back still works (matches MemberPositionsForm).
  const assignedCargoId = defaultValues?.cargoId ?? null;
  // If that assigned cargo grants power and the editor isn't Admin, any positions write
  // is rule-denied (cargoGrantsEmpty) — lock the cargo/comisiones so bio edits still save
  // (the mapper omits the unchanged slot) but a futile positions change can't be attempted.
  const positionsLocked =
    !allowPowerGrants && (positions.find((p) => p.id === assignedCargoId)?.grants.length ?? 0) > 0;
  const activeCargoOptions = positions
    .filter(
      (p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term),
    )
    .filter((p) => allowPowerGrants || p.grants.length === 0 || p.id === assignedCargoId)
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
        <Card padding="none" className="flex items-center gap-3 bg-surface-2 p-3.5 shadow-none">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-ui-md font-semibold text-white"
            style={{ backgroundColor: avatarColor(seed) }}
          >
            {initials(previewName || "")}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink-1">
              {previewName?.trim() || "Nuevo miembro"}
            </div>
            <div className="truncate text-ui-sm text-ink-3">{previewRole}</div>
          </div>
        </Card>
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
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <SegmentedControl
                id="gender"
                aria-label="Género"
                aria-required
                options={MEMBER_GENDERS.map((g) => ({ value: g as string, label: g }))}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
          <Input
            id="phone"
            inputMode="numeric"
            maxLength={16}
            autoComplete="tel-national"
            placeholder="8 dígitos"
            {...register("phone")}
          />
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
                onChange={(v) => {
                  field.onChange(v);
                  // Switching to a CEL cargo drops any picked comisiones (CEL members
                  // belong to the Comité Ejecutivo Local, not a comisión).
                  if (positions.find((p) => p.id === v)?.category === "CEL") {
                    setValue("comisionIds", []);
                  }
                }}
                placeholder="Sin cargo"
                disabled={positionsLocked}
              />
            )}
          />
        </Field>
        <Field
          label="Comisiones (pertenece a)"
          htmlFor="comisionIds"
          error={errors.comisionIds?.message}
        >
          {isExecutiveCommitteeCargo ? (
            <div
              role="note"
              className="flex items-center gap-2 rounded-card bg-surface-2 px-3 py-2 text-ui-sm text-ink-2"
            >
              <span aria-hidden="true">🔒</span>
              Comité Ejecutivo Local
            </div>
          ) : (
            <Controller
              control={control}
              name="comisionIds"
              render={({ field }) => (
                <MultiSelect
                  id="comisionIds"
                  options={comisionOptions}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={positionsLocked}
                />
              )}
            />
          )}
        </Field>
        {isExecutiveCommitteeCargo && (
          <p role="note" className="text-ui-xs text-ink-3">
            Asignado automáticamente por su cargo del Comité Ejecutivo Local.
          </p>
        )}
        {positionsLocked && (
          <p role="note" className="text-ui-xs text-ink-3">
            Solo un Admin puede cambiar el cargo de un miembro con permisos. Puedes editar el resto
            de sus datos.
          </p>
        )}
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
        <div role="alert" className="text-ui-sm text-error">
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
