import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Combobox,
  MultiSelect,
  type ComboboxOption,
} from "@luminova/ui";
import {
  initiativeFormSchema,
  INITIATIVE_STATUSES,
  AREAS_OF_OPPORTUNITY,
  AREA_OF_OPPORTUNITY_LABELS,
  type InitiativeInput,
} from "@luminova/types";
import { statusLabel } from "../features/initiatives/lib/derive";

const EMPTY: InitiativeInput = {
  title: "",
  description: "",
  category: "DesarrolloComunitario",
  startDate: "",
  endDate: "",
  roster: { directorId: "", coDirectorIds: [], teamIds: [] },
  status: "Planificacion",
};

interface InitiativeFormProps {
  memberOptions: ComboboxOption[];
  defaultValues?: Partial<InitiativeInput>;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (data: InitiativeInput) => void;
  lockStatus?: boolean;
}

export function InitiativeForm({
  memberOptions,
  defaultValues,
  submitLabel,
  isSaving,
  onSubmit,
  lockStatus = false,
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
      <Field label="Descripción" htmlFor="description" required error={errors.description?.message}>
        <Textarea id="description" rows={3} {...register("description")} />
      </Field>
      <Field
        label="Área de oportunidad"
        htmlFor="category"
        required
        error={errors.category?.message}
      >
        <Select id="category" {...register("category")}>
          {AREAS_OF_OPPORTUNITY.map((a) => (
            <option key={a} value={a}>
              {AREA_OF_OPPORTUNITY_LABELS[a]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio" htmlFor="startDate" required error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="Cierre estimado" htmlFor="endDate" required error={errors.endDate?.message}>
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
      </div>
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
      <Field
        label="Codirectores"
        htmlFor="coDirectors"
        error={errors.roster?.coDirectorIds?.message}
      >
        <Controller
          control={control}
          name="roster.coDirectorIds"
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
      {lockStatus ? (
        <Field label="Estado" htmlFor="status-locked">
          <Input type="hidden" {...register("status")} />
          <div
            id="status-locked"
            className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink-2"
          >
            <span>{statusLabel("Finalizado")}</span>
            <span aria-hidden>🔒</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            No se puede reabrir una iniciativa finalizada.
          </p>
        </Field>
      ) : (
        <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
          <Select id="status" {...register("status")}>
            {INITIATIVE_STATUSES.filter((s) => s !== "Finalizado").map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
