import { useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, MultiSelect, Select, Textarea } from "@luminova/ui";
import {
  positionSchema,
  POSITION_CATEGORIES,
  ROLES,
  femaleTitle,
  type PositionCategory,
  type PositionInput,
} from "@luminova/types";
import { PERMISSION_ROLE_INFO } from "../lib/permission-labels";

const CATEGORY_LABELS: Record<PositionCategory, string> = {
  CEL: "CEL",
  JDL: "JDL",
  Comision: "Comisión",
};

const GRANT_OPTIONS = ROLES.map((role) => ({
  value: role,
  label: PERMISSION_ROLE_INFO[role].label,
}));

const EMPTY: PositionInput = {
  title: "",
  titleFemale: "",
  sigla: "",
  category: "CEL",
  grants: [],
  term: null,
  description: "",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase">{children}</h3>
  );
}

interface PositionFormProps {
  defaultValues?: Partial<PositionInput>;
  submitLabel: string;
  canEditGrants: boolean;
  onSubmit: (data: PositionInput) => Promise<void>;
}

export function PositionForm({
  defaultValues,
  submitLabel,
  canEditGrants,
  onSubmit,
}: PositionFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PositionInput>({
    resolver: zodResolver(positionSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const categoryField = register("category");
  const category = watch("category");
  const title = watch("title");
  const isTermVisible = category === "JDL";
  const isComision = category === "Comision";

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
      <div className="flex flex-col gap-4">
        <SectionLabel>Datos del cargo</SectionLabel>
        <Field
          label={isComision ? "Nombre" : "Cargo"}
          htmlFor="title"
          required
          error={errors.title?.message}
        >
          <Input id="title" {...register("title")} />
        </Field>
        {!isComision && (
          <Field
            label="Variante femenina (opcional)"
            htmlFor="titleFemale"
            hint="Vacío = se deriva del nombre."
          >
            <Input
              id="titleFemale"
              {...register("titleFemale")}
              placeholder={title ? femaleTitle(title) : "Se deriva automáticamente"}
            />
          </Field>
        )}
        {isComision && (
          <Field label="Sigla" htmlFor="sigla" required error={errors.sigla?.message}>
            <Input id="sigla" {...register("sigla")} placeholder="CCE" />
          </Field>
        )}
        <Field label="Categoría" htmlFor="category" required error={errors.category?.message}>
          <Select
            id="category"
            {...categoryField}
            onChange={(e) => {
              void categoryField.onChange(e);
              const newCategory = e.target.value;
              setValue(
                "term",
                newCategory === "JDL" ? (defaultValues?.term ?? new Date().getFullYear()) : null,
              );
              if (newCategory === "Comision") {
                setValue("grants", []);
                setValue("titleFemale", "");
              } else {
                setValue("sigla", "");
              }
            }}
          >
            {POSITION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </Select>
        </Field>
        {isTermVisible && (
          <Field label="Gestión" htmlFor="term" required error={errors.term?.message}>
            <Input id="term" type="number" {...register("term", { valueAsNumber: true })} />
          </Field>
        )}
        <Field
          label="Descripción"
          htmlFor="description"
          required
          error={errors.description?.message}
        >
          <Textarea id="description" rows={3} {...register("description")} />
        </Field>
      </div>

      {canEditGrants && !isComision && (
        <div className="flex flex-col gap-4">
          <SectionLabel>Permisos</SectionLabel>
          <Field
            label="Permisos que otorga"
            htmlFor="grants"
            error={errors.grants?.message}
            hint="Vacío = solo distintivo, sin accesos."
          >
            <Controller
              control={control}
              name="grants"
              render={({ field }) => (
                <MultiSelect
                  id="grants"
                  options={GRANT_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Elegir permisos (opcional)"
                />
              )}
            />
          </Field>
        </div>
      )}

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
        {isSubmitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
