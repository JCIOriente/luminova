import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { positionTitle, currentTermKey, type MemberGender, type Position } from "@luminova/types";
import { cargoAssignableByNonAdmin, positionsLockedForNonAdmin } from "../lib/assignable-cargo";

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
  /** Whether the caller may assign the cargos the rules reserve to an Admin — power-granting
   *  ones and CEL seats alike (rules' `cargoAssignableByNonAdmin`). A non-Admin sees only
   *  assignable cargos (plus the current assignment, so an existing selection still
   *  renders). */
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
  // A power-granting current cargo locks the whole slot for a non-Admin: every save re-stamps
  // that cargoId, and `currentCargoGrantsEmpty()` blocks clearing it too, so nothing they can
  // submit succeeds. A grant-free CEL seat is the asymmetric case — keeping it is denied,
  // CLEARING it is allowed on purpose — so the form stays open and the cargo is simply not
  // offered. See positionsLockedForNonAdmin().
  const assignedCargo = positions.find((p) => p.id === defaultValues.cargoId);
  const locked = !allowPowerGrants && positionsLockedForNonAdmin(assignedCargo);
  const keepsCurrentCargo =
    allowPowerGrants || (assignedCargo !== undefined && cargoAssignableByNonAdmin(assignedCargo));
  const cargoOptions = positions
    .filter(
      (p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term),
    )
    .filter(
      (p) =>
        allowPowerGrants ||
        cargoAssignableByNonAdmin(p) ||
        (keepsCurrentCargo && p.id === defaultValues.cargoId),
    )
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
        <p role="note" className="text-ui-xs text-ink-3">
          Solo un Admin puede cambiar los cargos de un miembro del Comité Ejecutivo Local o con
          permisos.
        </p>
      )}
      {formError && (
        <div role="alert" className="text-ui-sm text-error">
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
