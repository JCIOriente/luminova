import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LINKTREE_ICONS, siteConfigSchema, type SiteConfigInput } from "@luminova/types";
import { Button, Checkbox, Field, Icon, Input, Select, Textarea, cn } from "@luminova/ui";
import { CollapsibleSection } from "./collapsible-section";
import { FieldArrayRows } from "./field-array-rows";

interface SiteConfigFormProps {
  defaultValues: SiteConfigInput;
  lastSaved: Date;
  onSubmit: (data: SiteConfigInput) => Promise<void>;
}

const LINKTREE_ICON_LABELS: Record<(typeof LINKTREE_ICONS)[number], string> = {
  user: "Persona",
  globe: "Globo",
  folder: "Carpeta",
  calendar: "Calendario",
  mail: "Correo",
  megaphone: "Megáfono",
  handshake: "Alianza",
  heart: "Corazón",
  target: "Objetivo",
  compass: "Brújula",
  briefcase: "Maletín",
  spark: "Destello",
};

const SOCIAL_LABELS = ["Instagram", "Facebook", "TikTok"] as const;

const stampFormatter = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function SiteConfigForm({ defaultValues, lastSaved, onSubmit }: SiteConfigFormProps) {
  const [attempted, setAttempted] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SiteConfigInput>({
    resolver: zodResolver(siteConfigSchema),
    defaultValues,
  });

  const stamp = useMemo(() => stampFormatter.format(lastSaved), [lastSaved]);
  const errorCount = Object.keys(errors).length;
  const hasErrors = attempted && errorCount > 0;

  const submit = handleSubmit(async (data) => {
    await onSubmit(data);
    // Re-baseline the form to the saved values so isDirty clears and Discard
    // restores what was actually persisted (RHF ignores defaultValues prop changes).
    reset(data);
    setAttempted(false);
  });

  const err = (message: string | undefined) => (attempted ? message : undefined);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 pb-28">
      <CollapsibleSection
        num="01"
        icon={Icon.barChart({ s: 18 })}
        title="Estadísticas"
        desc="Cifras de impacto en la página de inicio"
        defaultOpen
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Programas activos"
            htmlFor="programCount"
            error={err(errors.stats?.programCount?.message)}
          >
            <Input
              id="programCount"
              type="number"
              aria-invalid={attempted && !!errors.stats?.programCount}
              {...register("stats.programCount", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Reconocimientos nacionales"
            htmlFor="nationalAwards"
            error={err(errors.stats?.nationalAwards?.message)}
          >
            <Input
              id="nationalAwards"
              type="number"
              aria-invalid={attempted && !!errors.stats?.nationalAwards}
              {...register("stats.nationalAwards", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Países"
            htmlFor="countries"
            hint="Ej. 100+"
            error={err(errors.stats?.countries?.message)}
          >
            <Input
              id="countries"
              aria-invalid={attempted && !!errors.stats?.countries}
              {...register("stats.countries")}
            />
          </Field>
          <Field
            label="Miembros en el mundo"
            htmlFor="membersWorldwide"
            hint="Ej. 200.000+"
            error={err(errors.stats?.membersWorldwide?.message)}
          >
            <Input
              id="membersWorldwide"
              aria-invalid={attempted && !!errors.stats?.membersWorldwide}
              {...register("stats.membersWorldwide")}
            />
          </Field>
          <Field
            label="Eficiencia (%)"
            htmlFor="efficiencyPct"
            error={err(errors.stats?.efficiencyPct?.message)}
          >
            <Input
              id="efficiencyPct"
              type="number"
              min={0}
              max={100}
              aria-invalid={attempted && !!errors.stats?.efficiencyPct}
              {...register("stats.efficiencyPct", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-[12px] border border-line bg-surface-2 p-4">
          <span className="text-[12px] font-semibold tracking-[0.02em] text-ink-3 uppercase">
            Premio destacado
          </span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Año"
              htmlFor="standoutYear"
              error={err(errors.stats?.standoutOrg?.year?.message)}
            >
              <Input
                id="standoutYear"
                aria-invalid={attempted && !!errors.stats?.standoutOrg?.year}
                {...register("stats.standoutOrg.year")}
              />
            </Field>
            <Field
              label="Título"
              htmlFor="standoutTitle"
              error={err(errors.stats?.standoutOrg?.title?.message)}
            >
              <Input
                id="standoutTitle"
                aria-invalid={attempted && !!errors.stats?.standoutOrg?.title}
                {...register("stats.standoutOrg.title")}
              />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        num="02"
        icon={Icon.calendar({ s: 18 })}
        title="Hitos"
        desc="Línea de tiempo de la historia del capítulo"
      >
        <FieldArrayRows
          control={control}
          name="timeline"
          makeBlank={() => ({ year: "", title: "", description: "" })}
          addLabel="Agregar hito"
          itemNoun="hito"
          renderRow={(index) => (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                <Field
                  label="Año"
                  htmlFor={`timeline-year-${index}`}
                  error={err(errors.timeline?.[index]?.year?.message)}
                >
                  <Input
                    id={`timeline-year-${index}`}
                    aria-invalid={attempted && !!errors.timeline?.[index]?.year}
                    {...register(`timeline.${index}.year`)}
                  />
                </Field>
                <Field
                  label="Título"
                  htmlFor={`timeline-title-${index}`}
                  error={err(errors.timeline?.[index]?.title?.message)}
                >
                  <Input
                    id={`timeline-title-${index}`}
                    aria-invalid={attempted && !!errors.timeline?.[index]?.title}
                    {...register(`timeline.${index}.title`)}
                  />
                </Field>
              </div>
              <Field label="Descripción" htmlFor={`timeline-desc-${index}`}>
                <Textarea
                  id={`timeline-desc-${index}`}
                  {...register(`timeline.${index}.description`)}
                />
              </Field>
            </div>
          )}
        />
      </CollapsibleSection>

      <CollapsibleSection
        num="03"
        icon={Icon.compass({ s: 18 })}
        title="Misión · Visión · Valores"
        desc="Declaraciones institucionales"
      >
        <div className="flex flex-col gap-4">
          <Field label="Misión" htmlFor="mision" error={err(errors.mvv?.mision?.message)}>
            <Textarea
              id="mision"
              aria-invalid={attempted && !!errors.mvv?.mision}
              {...register("mvv.mision")}
            />
          </Field>
          <Field label="Visión" htmlFor="vision" error={err(errors.mvv?.vision?.message)}>
            <Textarea
              id="vision"
              aria-invalid={attempted && !!errors.mvv?.vision}
              {...register("mvv.vision")}
            />
          </Field>
          <Field label="Valores" htmlFor="valores" error={err(errors.mvv?.valores?.message)}>
            <Textarea
              id="valores"
              aria-invalid={attempted && !!errors.mvv?.valores}
              {...register("mvv.valores")}
            />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        num="04"
        icon={Icon.spark({ s: 18 })}
        title="Razones"
        desc="Motivos para unirse al capítulo"
      >
        <FieldArrayRows
          control={control}
          name="reasons"
          makeBlank={() => ({ number: "", title: "", body: "" })}
          addLabel="Agregar razón"
          itemNoun="razón"
          renderRow={(index) => (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                <Field label="Número" htmlFor={`reason-number-${index}`}>
                  <Input id={`reason-number-${index}`} {...register(`reasons.${index}.number`)} />
                </Field>
                <Field
                  label="Título"
                  htmlFor={`reason-title-${index}`}
                  error={err(errors.reasons?.[index]?.title?.message)}
                >
                  <Input
                    id={`reason-title-${index}`}
                    aria-invalid={attempted && !!errors.reasons?.[index]?.title}
                    {...register(`reasons.${index}.title`)}
                  />
                </Field>
              </div>
              <Field label="Cuerpo" htmlFor={`reason-body-${index}`}>
                <Textarea id={`reason-body-${index}`} {...register(`reasons.${index}.body`)} />
              </Field>
            </div>
          )}
        />
      </CollapsibleSection>

      <CollapsibleSection
        num="05"
        icon={Icon.mail({ s: 18 })}
        title="Contacto"
        desc="Correo, ubicación y enlaces del capítulo"
      >
        <div className="flex flex-col gap-4">
          <Field label="Correo" htmlFor="contactEmail" error={err(errors.contact?.email?.message)}>
            <Input
              id="contactEmail"
              type="email"
              aria-invalid={attempted && !!errors.contact?.email}
              {...register("contact.email")}
            />
          </Field>
          <Field
            label="Ubicación"
            htmlFor="contactLocation"
            error={err(errors.contact?.location?.message)}
          >
            <Input
              id="contactLocation"
              aria-invalid={attempted && !!errors.contact?.location}
              {...register("contact.location")}
            />
          </Field>
          <Field
            label="Horario de reuniones"
            htmlFor="contactSchedule"
            error={err(errors.contact?.meetingSchedule?.message)}
          >
            <Input
              id="contactSchedule"
              aria-invalid={attempted && !!errors.contact?.meetingSchedule}
              {...register("contact.meetingSchedule")}
            />
          </Field>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-1">Enlaces</span>
            <FieldArrayRows
              control={control}
              name="contact.links"
              makeBlank={() => ({ label: "", url: "" })}
              addLabel="Agregar enlace"
              itemNoun="enlace"
              renderRow={(index) => (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Etiqueta"
                    htmlFor={`link-label-${index}`}
                    error={err(errors.contact?.links?.[index]?.label?.message)}
                  >
                    <Input
                      id={`link-label-${index}`}
                      aria-invalid={attempted && !!errors.contact?.links?.[index]?.label}
                      {...register(`contact.links.${index}.label`)}
                    />
                  </Field>
                  <Field
                    label="URL"
                    htmlFor={`link-url-${index}`}
                    error={err(errors.contact?.links?.[index]?.url?.message)}
                  >
                    <Input
                      id={`link-url-${index}`}
                      aria-invalid={attempted && !!errors.contact?.links?.[index]?.url}
                      {...register(`contact.links.${index}.url`)}
                    />
                  </Field>
                </div>
              )}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        num="06"
        icon={Icon.globe({ s: 18 })}
        title="Enlaces (Linktree)"
        desc="Página pública /enlaces — botones, redes y encabezado"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Usuario" htmlFor="lt-handle" hint="Ej. @jci.oriente">
              <Input id="lt-handle" {...register("linktree.handle")} />
            </Field>
            <Field label="Lema" htmlFor="lt-tagline" hint="Ej. Sé el cambio.">
              <Input id="lt-tagline" {...register("linktree.tagline")} />
            </Field>
            <Field label="Lema (acento azul)" htmlFor="lt-accent" hint="Ej. Become the Change.">
              <Input id="lt-accent" {...register("linktree.taglineAccent")} />
            </Field>
          </div>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-1">Botones</span>
            <FieldArrayRows
              control={control}
              name="linktree.links"
              makeBlank={() => ({
                id: crypto.randomUUID(),
                icon: "globe" as const,
                title: "",
                description: "",
                url: "",
                isPrimary: false,
                badge: "",
                active: true,
              })}
              addLabel="Agregar botón"
              itemNoun="botón"
              renderRow={(index) => (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                    <Field label="Icono" htmlFor={`lt-link-icon-${index}`}>
                      <Select
                        id={`lt-link-icon-${index}`}
                        {...register(`linktree.links.${index}.icon`)}
                      >
                        {LINKTREE_ICONS.map((name) => (
                          <option key={name} value={name}>
                            {LINKTREE_ICON_LABELS[name]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Título"
                      htmlFor={`lt-link-title-${index}`}
                      error={err(errors.linktree?.links?.[index]?.title?.message)}
                    >
                      <Input
                        id={`lt-link-title-${index}`}
                        aria-invalid={attempted && !!errors.linktree?.links?.[index]?.title}
                        {...register(`linktree.links.${index}.title`)}
                      />
                    </Field>
                  </div>
                  <Field label="Descripción" htmlFor={`lt-link-desc-${index}`}>
                    <Input
                      id={`lt-link-desc-${index}`}
                      {...register(`linktree.links.${index}.description`)}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                    <Field
                      label="URL"
                      htmlFor={`lt-link-url-${index}`}
                      hint="http(s):// o mailto:"
                      error={err(errors.linktree?.links?.[index]?.url?.message)}
                    >
                      <Input
                        id={`lt-link-url-${index}`}
                        aria-invalid={attempted && !!errors.linktree?.links?.[index]?.url}
                        {...register(`linktree.links.${index}.url`)}
                      />
                    </Field>
                    <Field label="Insignia" htmlFor={`lt-link-badge-${index}`} hint="Opcional">
                      <Input
                        id={`lt-link-badge-${index}`}
                        {...register(`linktree.links.${index}.badge`)}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Controller
                      control={control}
                      name={`linktree.links.${index}.isPrimary`}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          onChange={field.onChange}
                          label="Destacado (azul)"
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name={`linktree.links.${index}.active`}
                      render={({ field }) => (
                        <Checkbox checked={field.value} onChange={field.onChange} label="Activo" />
                      )}
                    />
                  </div>
                </div>
              )}
            />
          </div>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-1">Redes sociales</span>
            <div className="flex flex-col gap-3">
              {SOCIAL_LABELS.map((label, index) => (
                <Field
                  key={label}
                  label={label}
                  htmlFor={`lt-social-${index}`}
                  error={err(errors.linktree?.socials?.[index]?.url?.message)}
                >
                  <Input
                    id={`lt-social-${index}`}
                    aria-invalid={attempted && !!errors.linktree?.socials?.[index]?.url}
                    {...register(`linktree.socials.${index}.url`)}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                hasErrors ? "bg-error" : isDirty ? "bg-warn" : "bg-ok",
              )}
            />
            <span className={cn("truncate", hasErrors ? "text-error" : "text-ink-3")}>
              {hasErrors
                ? `Corrige ${errorCount} ${errorCount === 1 ? "campo" : "campos"} antes de guardar`
                : isDirty
                  ? "Cambios sin guardar"
                  : `Todo guardado · última edición ${stamp}`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              as="button"
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isDirty}
              onClick={() => reset()}
            >
              Descartar
            </Button>
            <Button
              as="button"
              type="submit"
              size="sm"
              disabled={!isDirty || isSubmitting}
              onClick={() => setAttempted(true)}
            >
              {isSubmitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
