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
import { initiativeFormSchema, INITIATIVE_STATUSES, type InitiativeInput } from "@luminova/types";

const STATUS_LABELS: Record<(typeof INITIATIVE_STATUSES)[number], string> = {
  Planificacion: "Planificación",
  EnEjecucion: "En ejecución",
  Finalizado: "Finalizado",
};

const EMPTY: InitiativeInput = {
  title: "",
  roster: { directorId: "", coDirectorId: null, teamIds: [] },
  status: "Planificacion",
};

interface InitiativeFormProps {
  memberOptions: ComboboxOption[];
  defaultValues?: Partial<InitiativeInput>;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (data: InitiativeInput) => void;
}

export function InitiativeForm({
  memberOptions,
  defaultValues,
  submitLabel,
  isSaving,
  onSubmit,
}: InitiativeFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InitiativeInput>({
    resolver: zodResolver(initiativeFormSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Título" htmlFor="title" required error={errors.title?.message}>
        <Input id="title" {...register("title")} />
      </Field>
      <Field
        label="Director"
        htmlFor="director"
        required
        error={errors.roster?.directorId?.message}
      >
        <Controller
          control={control}
          name="roster.directorId"
          render={({ field }) => (
            <Combobox
              id="director"
              options={memberOptions}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? "")}
              placeholder="Elegir director"
            />
          )}
        />
      </Field>
      <Field label="Codirector" htmlFor="coDirector" error={errors.roster?.coDirectorId?.message}>
        <Controller
          control={control}
          name="roster.coDirectorId"
          render={({ field }) => (
            <Combobox
              id="coDirector"
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir codirector (opcional)"
            />
          )}
        />
      </Field>
      <Field label="Equipo" htmlFor="team" error={errors.roster?.teamIds?.message}>
        <Controller
          control={control}
          name="roster.teamIds"
          render={({ field }) => (
            <MultiSelect
              id="team"
              options={memberOptions}
              value={field.value}
              onChange={field.onChange}
              placeholder="Elegir equipo"
            />
          )}
        />
      </Field>
      <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
        <Select id="status" {...register("status")}>
          {INITIATIVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
