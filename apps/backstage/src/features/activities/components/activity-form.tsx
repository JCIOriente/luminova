import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  Input,
  Select,
  Combobox,
  MultiSelect,
  type ComboboxOption,
} from "@luminova/ui";
import { activitySchema, type ActivityInput, type ActivityCategory, ACTIVITY_CATEGORIES } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";
import { ParentPicker } from "./parent-picker";

interface ActivityFormProps {
  defaultValues?: Partial<ActivityInput>;
  memberOptions: ComboboxOption[];
  programOptions: ComboboxOption[];
  projectOptions: ComboboxOption[];
  /** Restrict the category select (default: all categories). */
  categoryOptions?: readonly ActivityCategory[];
  /** Lock category + startAt (edit mode with existing check-ins). */
  locked?: boolean;
  /** Fix category to ProjectExecution and hide category + parent picker (child-activity create). */
  lockParent?: boolean;
  isSaving: boolean;
  submitLabel?: string;
  onSubmit: (data: ActivityInput) => void;
}

const EMPTY: ActivityInput = {
  title: "",
  description: "",
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "",
  endAt: null,
  directorId: null,
  coDirectorIds: [],
};

export function ActivityForm({
  defaultValues,
  categoryOptions = ACTIVITY_CATEGORIES,
  memberOptions,
  programOptions,
  projectOptions,
  locked = false,
  lockParent = false,
  isSaving,
  submitLabel = "Guardar",
  onSubmit,
}: ActivityFormProps) {
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivityInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const category = watch("category");
  const isExecution = category === "ProjectExecution";

  useEffect(() => {
    if (lockParent) return;
    if (!isExecution) {
      setValue("parentType", null);
      setValue("parentId", null);
    }
  }, [isExecution, lockParent, setValue]);

  useEffect(() => {
    if (lockParent) setValue("category", "ProjectExecution");
  }, [lockParent, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Título" htmlFor="title" required error={errors.title?.message}>
        <Input id="title" {...register("title")} />
      </Field>
      {!lockParent && (
        <Field label="Categoría" htmlFor="category" required error={errors.category?.message}>
          <Select id="category" disabled={locked} {...register("category")}>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          {locked && (
            <p className="mt-1 text-sm text-ink-3">No editable: ya hay registros de asistencia.</p>
          )}
        </Field>
      )}

      <Field label="Fecha y hora" htmlFor="startAt" required error={errors.startAt?.message}>
        <Input id="startAt" type="datetime-local" disabled={locked} {...register("startAt")} />
      </Field>

      {isExecution && !lockParent && (
        <Controller
          control={control}
          name="parentId"
          render={({ field: idField }) => (
            <Controller
              control={control}
              name="parentType"
              render={({ field: typeField }) => (
                <ParentPicker
                  parentType={typeField.value}
                  parentId={idField.value}
                  programOptions={programOptions}
                  projectOptions={projectOptions}
                  onParentTypeChange={typeField.onChange}
                  onParentIdChange={idField.onChange}
                  error={errors.parentId?.message}
                />
              )}
            />
          )}
        />
      )}

      <Field label="Director" htmlFor="director" error={errors.directorId?.message}>
        <Controller
          control={control}
          name="directorId"
          render={({ field }) => (
            <Combobox
              id="director"
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir director (opcional)"
            />
          )}
        />
      </Field>
      <Field label="Codirectores" htmlFor="coDirectors" error={errors.coDirectorIds?.message}>
        <Controller
          control={control}
          name="coDirectorIds"
          render={({ field }) => (
            <MultiSelect
              id="coDirectors"
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir codirectores (opcional)"
            />
          )}
        />
      </Field>

      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
