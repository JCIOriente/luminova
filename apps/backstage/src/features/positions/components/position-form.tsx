import { useMemo, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, MultiSelect, Select, Textarea } from "@luminova/ui";
import {
  positionSchema,
  POSITION_CATEGORIES,
  femaleTitle,
  type PositionCategory,
  type PositionInput,
} from "@luminova/types";
import { roleOptions } from "../../../lib/role-display";
import { useRoles } from "../../permissions/hooks/use-roles";

const CATEGORY_LABELS: Record<PositionCategory, string> = {
  CEL: "CEL",
  JDL: "JDL",
  Comision: "Comisión",
};

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
  /** Admin-only authority over the fields the catalog rules pin for everyone else:
   *  `grants`, `category`, and — on a board cargo (CEL/JDL) — `title`/`titleFemale`.
   *  One prop, because firestore.rules keys all four on the same `hasAnyRole(['Admin'])`. */
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
  // Error deliberately unhandled: roleOptions derives from ROLES, so a roles outage costs
  // snapshot labels but never an option — no stored grant can disappear from the picker,
  // which is the only failure here that could change an authorization decision.
  const { data: roleDocs } = useRoles();
  const grantOptions = useMemo(() => roleOptions(roleDocs), [roleDocs]);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PositionInput>({
    resolver: zodResolver(positionSchema),
    // A non-Admin may only ever create a comisión (firestore.rules `boardSurfacingCategory()`),
    // so a NEW cargo must not start on the CEL default and die on save. On an EDIT the stored
    // category wins — it is pinned, not chosen.
    defaultValues:
      canEditGrants || defaultValues
        ? { ...EMPTY, ...defaultValues }
        : { ...EMPTY, category: "Comision" },
  });

  const categoryField = register("category");
  const category = watch("category");
  const title = watch("title");
  const isTermVisible = category === "JDL";
  const isComision = category === "Comision";
  // Mirror of the non-Admin pin on the positions update arm in firestore.rules. `category`
  // is an authority field (it decides the public board group), and on a board cargo so is
  // the TITLE — boardRank() orders the public Directiva by it, so 'Vicepresidente' renamed
  // to 'Presidente' sorts first. Rendering them editable to a non-Admin buys a generic
  // "No se pudo guardar" on save: the render-then-die shape this repo guards against.
  const areLabelsLocked = !canEditGrants && !isComision;

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
          <Input id="title" {...register("title")} disabled={areLabelsLocked} />
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
              disabled={areLabelsLocked}
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
            disabled={!canEditGrants}
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
        {!canEditGrants && (
          <p role="note" className="text-ui-xs text-ink-3">
            {areLabelsLocked
              ? "Solo un Admin puede cambiar la categoría o el nombre de un cargo del CEL o de una dirección: el nombre define el orden en la Directiva pública."
              : "Solo un Admin puede cambiar la categoría de un cargo."}
          </p>
        )}
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
                  options={grantOptions}
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
