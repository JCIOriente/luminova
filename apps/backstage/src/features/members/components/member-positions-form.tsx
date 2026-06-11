import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Combobox, Field, MultiSelect } from "@luminova/ui";
import { positionTitle, currentTermKey, type MemberGender, type Position } from "@luminova/types";

export const positionsSchema = z.object({
  cargoId: z.string().min(1).nullable(),
  comisionIds: z.array(z.string().min(1)),
});

export type PositionsInput = z.infer<typeof positionsSchema>;

export function MemberPositionsForm({
  positions,
  gender,
  defaultValues,
  onSubmit,
}: {
  positions: Position[];
  gender: MemberGender | undefined;
  defaultValues: PositionsInput;
  onSubmit: (data: PositionsInput) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PositionsInput>({ resolver: zodResolver(positionsSchema), defaultValues });

  const term = currentTermKey();
  const cargoOptions = positions
    .filter(
      (p) => p.active && p.category !== "Comision" && (p.term === null || String(p.term) === term),
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
            />
          )}
        />
      </Field>
      {formError && (
        <div role="alert" className="text-[13px] text-error">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" disabled={isSubmitting} className="w-full justify-center">
        {isSubmitting ? "Guardando…" : "Guardar cargos"}
      </Button>
    </form>
  );
}
