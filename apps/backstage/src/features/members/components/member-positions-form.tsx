import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { positionTitle, currentTermKey, type MemberGender, type Position } from "@luminova/types";

const positionsSchema = z.object({
  cargoId: z.string().min(1).nullable(),
  comisionIds: z.array(z.string().min(1)),
});

export type PositionsInput = z.infer<typeof positionsSchema>;

export function MemberPositionsForm({
  positions,
  gender,
  defaultValues,
  allowPowerGrants,
  onSubmit,
}: {
  positions: Position[];
  gender: MemberGender | undefined;
  defaultValues: PositionsInput;
  /** Whether the caller may assign power-granting cargos. Only Admin may (rules'
   *  `cargoGrantsEmpty`); a non-Admin sees only grant-free cargos (plus the current
   *  assignment, so an existing selection still renders). */
  allowPowerGrants: boolean;
  onSubmit: (data: PositionsInput) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PositionsInput>({ resolver: zodResolver(positionsSchema), defaultValues });

  const term = currentTermKey();
  // A non-Admin can't write positions at all for a member whose current cargo grants
  // power: the write re-stamps that cargoId and the rules' `cargoGrantsEmpty` denies it
  // (comisiones can't be changed either — the whole slot is rejected). Lock the form.
  const assignedCargoHasGrants =
    (positions.find((p) => p.id === defaultValues.cargoId)?.grants.length ?? 0) > 0;
  const locked = !allowPowerGrants && assignedCargoHasGrants;
  const cargoOptions = positions
    .filter(
      (p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term),
    )
    .filter((p) => allowPowerGrants || p.grants.length === 0 || p.id === defaultValues.cargoId)
    .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));
  const comisionOptions = positions
    .filter((p) => p.active && p.category === "Comision")
    .map((p) => ({ value: p.id, label: p.sigla ? `${p.sigla} — ${p.title}` : p.title }));

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Cargo" htmlFor="cargoId">
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
              disabled={locked}
            />
          )}
        />
      </Field>
      <Field label="Comisiones" htmlFor="comisionIds">
        <Controller
          control={control}
          name="comisionIds"
          render={({ field }) => (
            <MultiSelect
              id="comisionIds"
              options={comisionOptions}
              value={field.value}
              onChange={field.onChange}
              disabled={locked}
            />
          )}
        />
      </Field>
      {locked && (
        <p role="note" className="text-[12px] text-ink-3">
          Solo un Admin puede cambiar los cargos de un miembro con permisos.
        </p>
      )}
      {formError && (
        <div role="alert" className="text-[13px] text-error">
          {formError}
        </div>
      )}
      <Button
        as="button"
        type="submit"
        disabled={isSubmitting || locked}
        className="w-full justify-center"
      >
        {isSubmitting ? "Guardando…" : "Guardar cargos"}
      </Button>
    </form>
  );
}
