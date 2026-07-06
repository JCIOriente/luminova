import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Textarea,
  Select,
  Combobox,
  DatePicker,
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
  featured: false,
};

interface InitiativeFormProps {
  memberOptions: ComboboxOption[];
  defaultValues?: Partial<InitiativeInput>;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (data: InitiativeInput) => void;
  lockStatus?: boolean;
  /** Whether the caller may set `featured` — Admin/ProjectManager only, mirroring
   *  the rules' `featuredUpdateSafe`. A direction/perm editor sees it disabled. */
  canFeature?: boolean;
}

export function InitiativeForm({
  memberOptions,
  defaultValues,
  submitLabel,
  isSaving,
  onSubmit,
  lockStatus = false,
  canFeature = false,
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

  // Lock the status field on any already-finalized initiative — the wizard owns the
  // Finalizado transition, and the report locks it. Derive from the data as a fallback
  // so a caller that forgets `lockStatus` can never expose an editable status here.
  const statusLocked = lockStatus || defaultValues?.status === "Finalizado";

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
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <DatePicker id="startDate" value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Field label="Cierre estimado" htmlFor="endDate" required error={errors.endDate?.message}>
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <DatePicker id="endDate" value={field.value} onChange={field.onChange} />
            )}
          />
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
      {statusLocked ? (
        <Field label="Estado" htmlFor="status-locked">
          <Input type="hidden" {...register("status")} />
          <div
            id="status-locked"
            className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-ui-md text-ink-2"
          >
            <span>{statusLabel("Finalizado")}</span>
            <span aria-hidden>🔒</span>
          </div>
          <p className="mt-1 text-ui-xs text-ink-3">
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
      {/* `featured` curation is Admin/ProjectManager-only (rules' featuredUpdateSafe);
          a non-curator can never set it here, so hide the control entirely. The form
          still submits the initiative's current value (unchanged), which the rule allows. */}
      {canFeature && (
        <div className="flex flex-col gap-1">
          <Controller
            control={control}
            name="featured"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                label="Destacar en /programas"
              />
            )}
          />
          <p className="text-ui-xs text-ink-3">
            Las iniciativas destacadas aparecen en la página pública de programas al finalizar.
          </p>
        </div>
      )}
      <Button as="button" type="submit" className="mt-1 w-full justify-center" disabled={isSaving}>
        {isSaving ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
