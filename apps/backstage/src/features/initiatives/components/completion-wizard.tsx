import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Textarea } from "@luminova/ui";
import { initiativeImpactSchema, type InitiativeImpactInput } from "@luminova/types";
import type { Photo } from "@luminova/types";
import { PhotoManager } from "./photo-manager";

interface CompletionWizardProps {
  initiativeLabel: string;
  isSaving: boolean;
  onComplete: (impact: InitiativeImpactInput) => void;
  photos: Photo[];
  onUploadPhoto: (blob: Blob) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
  onSetCover: (photoId: string) => Promise<void>;
  onSetCaption: (photoId: string, caption: string) => Promise<void>;
}

const EMPTY: InitiativeImpactInput = {
  closingSummary: "",
  personsImpacted: 0,
  volunteers: 0,
  custom: [],
};

export function CompletionWizard({
  initiativeLabel,
  isSaving,
  onComplete,
  photos,
  onUploadPhoto,
  onRemovePhoto,
  onSetCover,
  onSetCaption,
}: CompletionWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const {
    register,
    control,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<InitiativeImpactInput>({
    resolver: zodResolver(initiativeImpactSchema),
    defaultValues: EMPTY,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "custom" });

  const goToStep2 = async () => {
    if (await trigger("closingSummary")) setStep(2);
  };

  const goToStep3 = async () => {
    if (await trigger(["personsImpacted", "volunteers", "custom"])) setStep(3);
  };

  return (
    <form
      onSubmit={handleSubmit((data) => onComplete(data))}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-ui-sm text-ink-3">Paso {step} de 3</p>

      {step === 1 && (
        <>
          <Field
            label="Resumen de cierre"
            htmlFor="closingSummary"
            required
            error={errors.closingSummary?.message}
          >
            <Textarea id="closingSummary" rows={5} {...register("closingSummary")} />
          </Field>
          <Button
            as="button"
            type="button"
            className="justify-center"
            onClick={() => void goToStep2()}
          >
            Siguiente →
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Personas impactadas"
              htmlFor="personsImpacted"
              required
              error={errors.personsImpacted?.message}
            >
              <Input
                id="personsImpacted"
                type="number"
                min={0}
                {...register("personsImpacted", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Voluntarios"
              htmlFor="volunteers"
              required
              error={errors.volunteers?.message}
            >
              <Input
                id="volunteers"
                type="number"
                min={0}
                {...register("volunteers", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field
                  label="Etiqueta"
                  htmlFor={`custom-label-${i}`}
                  error={errors.custom?.[i]?.label?.message}
                >
                  <Input id={`custom-label-${i}`} {...register(`custom.${i}.label`)} />
                </Field>
                <Field
                  label="Valor"
                  htmlFor={`custom-value-${i}`}
                  error={errors.custom?.[i]?.value?.message}
                >
                  <Input id={`custom-value-${i}`} {...register(`custom.${i}.value`)} />
                </Field>
                <Button
                  as="button"
                  type="button"
                  variant="ghost"
                  onClick={() => remove(i)}
                  aria-label={`Quitar métrica ${i + 1}`}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={() => append({ label: "", value: "" })}
            >
              + Agregar métrica
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              as="button"
              type="button"
              variant="secondary"
              className="flex-1 justify-center"
              onClick={() => setStep(1)}
            >
              ← Atrás
            </Button>
            <Button
              as="button"
              type="button"
              className="flex-1 justify-center"
              onClick={() => void goToStep3()}
            >
              Siguiente →
            </Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-ui-sm font-medium text-ink-1">Destacadas (opcional)</p>
          <PhotoManager
            photos={photos}
            onUpload={onUploadPhoto}
            onRemove={onRemovePhoto}
            onSetCover={onSetCover}
            onSetCaption={onSetCaption}
            disabled={isSaving}
          />
          <div className="flex gap-2">
            <Button
              as="button"
              type="button"
              variant="secondary"
              className="flex-1 justify-center"
              onClick={() => setStep(2)}
            >
              ← Atrás
            </Button>
            <Button as="button" type="submit" className="flex-1 justify-center" disabled={isSaving}>
              {isSaving ? "Finalizando…" : `Finalizar ${initiativeLabel}`}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
