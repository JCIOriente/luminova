import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { type MemberGender, type Position } from "@luminova/types";
import {
  cargoOptionsForEditor,
  cargoTakedownOnly,
  noAssignableCargos,
  positionsLockedForNonAdmin,
} from "../lib/assignable-cargo";
import { NoAssignableCargosNote } from "./no-assignable-cargos-note";

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
   *  assignable cargos, plus the seat the member already holds rendered DISABLED, so the
   *  trigger names the real cargo without putting a denied write one click away. */
  allowPowerGrants: boolean;
  onSubmit: (data: PositionsInput) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<PositionsInput>({ resolver: zodResolver(positionsSchema), defaultValues });

  // A power-granting current cargo locks the whole slot for a non-Admin: every save re-stamps
  // that cargoId, and `currentCargoGrantsEmpty()` blocks clearing it too, so nothing they can
  // submit succeeds. A grant-free CEL seat is the asymmetric case — keeping it is denied,
  // CLEARING it is allowed on purpose — so the form stays open, the seat renders as a disabled
  // option (the trigger must not claim "Sin cargo" for a seated member) and only the takedown
  // can be saved. See positionsLockedForNonAdmin() / cargoTakedownOnly().
  const assignedCargo = positions.find((p) => p.id === defaultValues.cargoId);
  const locked = !allowPowerGrants && positionsLockedForNonAdmin(assignedCargo);
  const cargoOptions = cargoOptionsForEditor({
    positions,
    gender,
    allowPowerGrants,
    assignedCargoId: defaultValues.cargoId,
  });
  const selectedCargo = positions.find((p) => p.id === watch("cargoId"));
  const takedownOnly = cargoTakedownOnly(selectedCargo, allowPowerGrants);
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
            <div className="flex flex-col items-start gap-2">
              <Combobox
                id="cargoId"
                options={cargoOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Sin cargo"
                disabled={locked}
              />
              {takedownOnly && (
                <Button
                  as="button"
                  type="button"
                  variant="link"
                  tone="danger"
                  onClick={() => field.onChange(null)}
                >
                  Quitar cargo
                </Button>
              )}
            </div>
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
          Solo un Admin puede cambiar los cargos de un miembro cuyo cargo otorga permisos.
        </p>
      )}
      {takedownOnly && (
        <p role="note" className="text-ui-xs text-ink-3">
          Este cargo es del Comité Ejecutivo Local: solo un Admin puede asignarlo. Puedes quitárselo
          con «Quitar cargo» y guardar, o elegir otro cargo.
        </p>
      )}
      {noAssignableCargos({ cargoOptions, allowPowerGrants, locked }) && <NoAssignableCargosNote />}
      {formError && (
        <div role="alert" className="text-ui-sm text-error">
          {formError}
        </div>
      )}
      {/* takedownOnly disables the save, not the form: every positions write this page makes
          re-stamps the whole slot (MemberRepository.setPositions), so saving while the CEL seat
          is still selected is the 403 the rules promise. Clearing it (or picking another cargo)
          re-enables the save — that takedown is exactly what the rules keep open. */}
      <Button
        as="button"
        type="submit"
        disabled={isSubmitting || locked || takedownOnly}
        className="w-full justify-center"
      >
        {isSubmitting ? "Guardando…" : "Guardar cargos"}
      </Button>
    </form>
  );
}
