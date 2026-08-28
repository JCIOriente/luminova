import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { type MemberGender, type Position } from "@luminova/types";
import {
  cargoGrantNeedsAdminAssigner,
  cargoNoteId,
  cargoOptionsForEditor,
  noAssignableCargos,
} from "../lib/assignable-cargo";
// Directly from the rules-mirroring module, not through assignable-cargo.ts: the file a
// predicate comes from is what says the emulator parity test holds it to firestore.rules.
import { cargoTakedownOnly, positionsLockedForEditor } from "../lib/assignable-cargo-core";
import { cargoNoteIds, MintPendingNote, NoAssignableCargosNote } from "./no-assignable-cargos-note";

const NOTE_IDS = cargoNoteIds("positions");

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
  allowReplacePowerCargo,
  assignerIsAdmin,
  isSelfAssignment,
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
  /** Whether the caller may REPLACE a cargo that already confers power (rules'
   *  `currentCargoGrantsEmpty`, the other conjunct). Admin role only — `update:BoardSeat`
   *  deliberately does NOT lift this one, so it must not be folded into `allowPowerGrants`.
   *  See positionsLockedForEditor(). */
  allowReplacePowerCargo: boolean;
  /** Whether the CALLER holds the Admin role, which is what beacon's `resolveTrustedGrants`
   *  keys the mint on. Named after the minting authority, not after `allowReplacePowerCargo`,
   *  which mirrors a different rules predicate and only happens to equal it today. */
  assignerIsAdmin: boolean;
  /** Whether the member being edited IS the caller. The trust gate refuses to mint a
   *  self-assignment of any granting cargo from a non-Admin — confer power on others, never on
   *  yourself — so the picker must say so before the click. */
  isSelfAssignment: boolean;
  onSubmit: (data: PositionsInput) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<PositionsInput>({ resolver: zodResolver(positionsSchema), defaultValues });

  // A power-granting current cargo locks the whole slot for anyone but an Admin: every save
  // re-stamps that cargoId, and `currentCargoGrantsEmpty()` blocks clearing it too, so nothing
  // they can submit succeeds. A grant-free CEL seat is the asymmetric case — keeping it is
  // denied, CLEARING it is allowed on purpose — so the form stays open, the seat renders as a
  // disabled option (the trigger must not claim "Sin cargo" for a seated member) and only the
  // takedown can be saved. See positionsLockedForEditor() / cargoTakedownOnly().
  const assignedCargo = positions.find((p) => p.id === defaultValues.cargoId);
  const locked = positionsLockedForEditor(assignedCargo, allowReplacePowerCargo);
  const cargoOptions = cargoOptionsForEditor({
    positions,
    gender,
    allowPowerGrants,
    assignedCargoId: defaultValues.cargoId,
  });
  const selectedCargo = positions.find((p) => p.id === watch("cargoId"));
  const takedownOnly = cargoTakedownOnly(selectedCargo, allowPowerGrants);
  const noCargos = noAssignableCargos({ cargoOptions, allowPowerGrants, locked });
  const mintPending = cargoGrantNeedsAdminAssigner(
    selectedCargo,
    assignerIsAdmin,
    isSelfAssignment,
  );
  // Every note explaining the picker sits after the field in the DOM, so without this a
  // screen-reader user reaching the trigger hears "Sin resultados" or a disabled control and
  // never meets the reason. Priority order and the co-firing rules live in cargoNoteId().
  const describedBy = cargoNoteId(
    { noCargos, locked, takedown: takedownOnly, mintPending },
    NOTE_IDS,
  );
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
                aria-describedby={describedBy}
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
        <p id={NOTE_IDS.locked} role="note" className="text-ui-xs text-ink-3">
          Solo un administrador puede cambiar los cargos de un miembro cuyo cargo otorga permisos.
        </p>
      )}
      {/* Suppressed while locked: the picker is disabled there, so nothing about what the save
          would mint is actionable. */}
      {!locked && mintPending && <MintPendingNote id={NOTE_IDS.mintPending} />}
      {takedownOnly && (
        <p id={NOTE_IDS.takedown} role="note" className="text-ui-xs text-ink-3">
          Este cargo es del Comité Ejecutivo Local: solo un administrador puede asignarlo. Puedes
          quitárselo con «Quitar cargo» y guardar, o elegir otro cargo.
        </p>
      )}
      {noCargos && <NoAssignableCargosNote id={NOTE_IDS.noCargos} />}
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
