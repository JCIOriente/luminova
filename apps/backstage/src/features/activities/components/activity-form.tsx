import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Select } from "@luminova/ui";
import { activitySchema, type ActivityInput, ACTIVITY_CATEGORIES } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";

interface ActivityFormProps {
  defaultValues?: Partial<ActivityInput>;
  isSaving: boolean;
  onSubmit: (data: ActivityInput) => void;
}

const EMPTY: ActivityInput = {
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "",
  directorId: null,
  coDirectorId: null,
};

const emptyToNull = (value: string) => (value === "" ? null : value);

export function ActivityForm({ defaultValues, isSaving, onSubmit }: ActivityFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivityInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Categoría" htmlFor="category" required error={errors.category?.message}>
        <Select id="category" {...register("category")}>
          {ACTIVITY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fecha y hora" htmlFor="startAt" required error={errors.startAt?.message}>
        <Input id="startAt" type="datetime-local" {...register("startAt")} />
      </Field>
      <Field label="Tipo de padre" htmlFor="parentType" error={errors.parentType?.message}>
        <Select id="parentType" {...register("parentType", { setValueAs: emptyToNull })}>
          <option value="">— Institucional (sin padre)</option>
          <option value="Program">Programa</option>
          <option value="Project">Proyecto</option>
        </Select>
      </Field>
      <Field label="Id del padre" htmlFor="parentId" error={errors.parentId?.message}>
        <Input id="parentId" {...register("parentId", { setValueAs: emptyToNull })} />
      </Field>
      <Field label="Id del director" htmlFor="directorId" error={errors.directorId?.message}>
        <Input id="directorId" {...register("directorId", { setValueAs: emptyToNull })} />
      </Field>
      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
