import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EFFICIENCY_PCT_MAX,
  EFFICIENCY_PCT_MIN,
  LINKTREE_ICONS,
  LINKTREE_SOCIAL_PLATFORMS,
  siteConfigSchema,
  type LinktreeSocialPlatform,
  type SiteConfigInput,
} from "@luminova/types";
import { Button, Card, Checkbox, Field, Icon, Input, Select, Textarea, cn } from "@luminova/ui";
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
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
};

const SOCIAL_LABELS: Record<LinktreeSocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
};

const CONTACT_SOCIALS = (["instagram", "facebook", "tiktok", "linkedin"] as const).map((key) => ({
  key,
  label: SOCIAL_LABELS[key],
}));

const stampFormatter = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Top-level sections in render order — each maps to a key in the RHF error tree
// and an id we scroll to when its section holds the first invalid field.
const SECTION_META = [
  { key: "hero", id: "cfg-hero" },
  { key: "stats", id: "cfg-stats" },
  { key: "timeline", id: "cfg-timeline" },
  { key: "mvv", id: "cfg-mvv" },
  { key: "reasons", id: "cfg-reasons" },
  { key: "contact", id: "cfg-contact" },
  { key: "linktree", id: "cfg-linktree" },
] as const;

/** Count actual field-level errors, not top-level sections — the RHF error tree
 *  is nested, so a leaf is any node carrying a string `message`. */
function countLeafErrors(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (typeof (node as { message?: unknown }).message === "string") return 1;
  return Object.values(node as Record<string, unknown>).reduce<number>(
    (total, child) => total + countLeafErrors(child),
    0,
  );
}

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
  const errorCount = countLeafErrors(errors);
  const hasErrors = attempted && errorCount > 0;
  const sectionHasError = (key: (typeof SECTION_META)[number]["key"]) => attempted && !!errors[key];

  const submit = handleSubmit(
    async (data) => {
      await onSubmit(data);
      // Re-baseline the form to the saved values so isDirty clears and Discard
      // restores what was actually persisted (RHF ignores defaultValues prop changes).
      reset(data);
      setAttempted(false);
    },
    // On invalid submit, reveal + scroll to the first section holding an error —
    // collapsed sections are unmounted, so otherwise the bad field is invisible.
    (formErrors) => {
      const first = SECTION_META.find((s) => formErrors[s.key]);
      if (!first) return;
      requestAnimationFrame(() => {
        document.getElementById(first.id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      });
    },
  );

  const err = (message: string | undefined) => (attempted ? message : undefined);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <CollapsibleSection
        id="cfg-hero"
        num="01"
        icon={Icon.megaphone({ s: 18 })}
        title="Portada"
        desc="Lema y sublema del encabezado de inicio"
        defaultOpen
        forceOpen={sectionHasError("hero")}
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Lema"
            htmlFor="hero-motto"
            required
            hint="Ej. el lema de la gestión o el lema institucional"
            error={err(errors.hero?.motto?.message)}
          >
            <Input id="hero-motto" {...register("hero.motto")} />
          </Field>
          <Field label="Sublema" htmlFor="hero-submotto" hint="Opcional — texto de acento debajo">
            <Input id="hero-submotto" {...register("hero.submotto")} />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="cfg-stats"
        num="02"
        icon={Icon.barChart({ s: 18 })}
        title="Estadísticas"
        desc="Cifras de impacto en la página de inicio"
        forceOpen={sectionHasError("stats")}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Programas activos"
            htmlFor="programCount"
            required
            error={err(errors.stats?.programCount?.message)}
          >
            <Input
              id="programCount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              {...register("stats.programCount", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Reconocimientos nacionales"
            htmlFor="nationalAwards"
            required
            error={err(errors.stats?.nationalAwards?.message)}
          >
            <Input
              id="nationalAwards"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              {...register("stats.nationalAwards", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Países"
            htmlFor="countries"
            required
            hint="Ej. 100+"
            error={err(errors.stats?.countries?.message)}
          >
            <Input id="countries" {...register("stats.countries")} />
          </Field>
          <Field
            label="Miembros en el mundo"
            htmlFor="membersWorldwide"
            required
            hint="Ej. 200.000+"
            error={err(errors.stats?.membersWorldwide?.message)}
          >
            <Input id="membersWorldwide" {...register("stats.membersWorldwide")} />
          </Field>
          <Field
            label="Eficiencia (%)"
            htmlFor="efficiencyPct"
            required
            error={err(errors.stats?.efficiencyPct?.message)}
          >
            <Input
              id="efficiencyPct"
              type="number"
              inputMode="decimal"
              min={EFFICIENCY_PCT_MIN}
              max={EFFICIENCY_PCT_MAX}
              {...register("stats.efficiencyPct", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <Card padding="sm" className="mt-5 flex flex-col gap-4 bg-surface-2 shadow-none">
          <span className="text-ui-xs font-semibold tracking-[0.02em] text-ink-3 uppercase">
            Premio destacado
          </span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Año"
              htmlFor="standoutYear"
              required
              error={err(errors.stats?.standoutOrg?.year?.message)}
            >
              <Input id="standoutYear" {...register("stats.standoutOrg.year")} />
            </Field>
            <Field
              label="Título"
              htmlFor="standoutTitle"
              required
              error={err(errors.stats?.standoutOrg?.title?.message)}
            >
              <Input id="standoutTitle" {...register("stats.standoutOrg.title")} />
            </Field>
          </div>
        </Card>
      </CollapsibleSection>

      <CollapsibleSection
        id="cfg-timeline"
        num="03"
        icon={Icon.calendar({ s: 18 })}
        title="Hitos"
        desc="Línea de tiempo de la historia del capítulo"
        forceOpen={sectionHasError("timeline")}
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
                  required
                  error={err(errors.timeline?.[index]?.year?.message)}
                >
                  <Input id={`timeline-year-${index}`} {...register(`timeline.${index}.year`)} />
                </Field>
                <Field
                  label="Título"
                  htmlFor={`timeline-title-${index}`}
                  required
                  error={err(errors.timeline?.[index]?.title?.message)}
                >
                  <Input id={`timeline-title-${index}`} {...register(`timeline.${index}.title`)} />
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
        id="cfg-mvv"
        num="04"
        icon={Icon.compass({ s: 18 })}
        title="Misión · Visión · Valores"
        desc="Declaraciones institucionales"
        forceOpen={sectionHasError("mvv")}
      >
        <div className="flex flex-col gap-4">
          <Field label="Misión" htmlFor="mision" required error={err(errors.mvv?.mision?.message)}>
            <Textarea id="mision" {...register("mvv.mision")} />
          </Field>
          <Field label="Visión" htmlFor="vision" required error={err(errors.mvv?.vision?.message)}>
            <Textarea id="vision" {...register("mvv.vision")} />
          </Field>
          <Field
            label="Valores"
            htmlFor="valores"
            required
            error={err(errors.mvv?.valores?.message)}
          >
            <Textarea id="valores" {...register("mvv.valores")} />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="cfg-reasons"
        num="05"
        icon={Icon.spark({ s: 18 })}
        title="Razones"
        desc="Motivos para unirse al capítulo"
        forceOpen={sectionHasError("reasons")}
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
                  required
                  error={err(errors.reasons?.[index]?.title?.message)}
                >
                  <Input id={`reason-title-${index}`} {...register(`reasons.${index}.title`)} />
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
        id="cfg-contact"
        num="06"
        icon={Icon.mail({ s: 18 })}
        title="Contacto"
        desc="Correo, ubicación y enlaces del capítulo"
        forceOpen={sectionHasError("contact")}
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Correo"
            htmlFor="contactEmail"
            required
            error={err(errors.contact?.email?.message)}
          >
            <Input
              id="contactEmail"
              type="email"
              autoComplete="off"
              {...register("contact.email")}
            />
          </Field>
          <Field
            label="Ubicación"
            htmlFor="contactLocation"
            required
            error={err(errors.contact?.location?.message)}
          >
            <Input id="contactLocation" {...register("contact.location")} />
          </Field>
          <Field
            label="Horario de reuniones"
            htmlFor="contactSchedule"
            required
            error={err(errors.contact?.meetingSchedule?.message)}
          >
            <Input id="contactSchedule" {...register("contact.meetingSchedule")} />
          </Field>
          <Field
            label="Mapa (Google Maps)"
            htmlFor="contactMapUrl"
            hint="Enlace a la ubicación de la sede"
            error={err(errors.contact?.mapUrl?.message)}
          >
            <Input id="contactMapUrl" inputMode="url" {...register("contact.mapUrl")} />
          </Field>
          <Field
            label="WhatsApp (chat directo)"
            htmlFor="contactWhatsapp"
            hint="Enlace wa.me, ej. https://wa.me/59170000000. Vacío = se oculta."
            error={err(errors.contact?.whatsapp?.message)}
          >
            <Input id="contactWhatsapp" inputMode="url" {...register("contact.whatsapp")} />
          </Field>
          <Field
            label="Canal Difusión Oriente"
            htmlFor="contactBroadcast"
            hint="Enlace de invitación al canal de difusión de WhatsApp. Vacío = se oculta."
            error={err(errors.contact?.broadcastChannel?.message)}
          >
            <Input
              id="contactBroadcast"
              inputMode="url"
              {...register("contact.broadcastChannel")}
            />
          </Field>

          <div>
            <span className="mb-2 block text-ui-sm font-semibold text-ink-1">Redes sociales</span>
            <div className="flex flex-col gap-3">
              {CONTACT_SOCIALS.map(({ key, label }) => (
                <Field
                  key={key}
                  label={label}
                  htmlFor={`contact-social-${key}`}
                  error={err(errors.contact?.socials?.[key]?.message)}
                >
                  <Input
                    id={`contact-social-${key}`}
                    inputMode="url"
                    {...register(`contact.socials.${key}`)}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-ui-sm font-semibold text-ink-1">Enlaces</span>
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
                    required
                    error={err(errors.contact?.links?.[index]?.label?.message)}
                  >
                    <Input
                      id={`link-label-${index}`}
                      {...register(`contact.links.${index}.label`)}
                    />
                  </Field>
                  <Field
                    label="URL"
                    htmlFor={`link-url-${index}`}
                    required
                    error={err(errors.contact?.links?.[index]?.url?.message)}
                  >
                    <Input
                      id={`link-url-${index}`}
                      inputMode="url"
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
        id="cfg-linktree"
        num="07"
        icon={Icon.globe({ s: 18 })}
        title="Enlaces (Linktree)"
        desc="Página pública /enlaces — botones, redes y encabezado"
        forceOpen={sectionHasError("linktree")}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Usuario"
              htmlFor="lt-handle"
              required
              hint="Ej. @jci.oriente"
              error={err(errors.linktree?.handle?.message)}
            >
              <Input id="lt-handle" {...register("linktree.handle")} />
            </Field>
            <Field
              label="Lema"
              htmlFor="lt-tagline"
              required
              hint="Ej. Lema 2026"
              error={err(errors.linktree?.tagline?.message)}
            >
              <Input id="lt-tagline" {...register("linktree.tagline")} />
            </Field>
            <Field label="Lema (acento azul)" htmlFor="lt-accent" hint="Ej. Sublema 2026">
              <Input id="lt-accent" {...register("linktree.taglineAccent")} />
            </Field>
          </div>

          <div>
            <span className="mb-2 block text-ui-sm font-semibold text-ink-1">Botones</span>
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
                      required
                      error={err(errors.linktree?.links?.[index]?.title?.message)}
                    >
                      <Input
                        id={`lt-link-title-${index}`}
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
                      required
                      hint="http(s):// o mailto:"
                      error={err(errors.linktree?.links?.[index]?.url?.message)}
                    >
                      <Input
                        id={`lt-link-url-${index}`}
                        inputMode="url"
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
            <span className="mb-2 block text-ui-sm font-semibold text-ink-1">Redes sociales</span>
            <div className="flex flex-col gap-3">
              {LINKTREE_SOCIAL_PLATFORMS.map((platform, index) => (
                <Field
                  key={platform}
                  label={SOCIAL_LABELS[platform]}
                  htmlFor={`lt-social-${platform}`}
                  error={err(errors.linktree?.socials?.[index]?.url?.message)}
                >
                  <Input
                    id={`lt-social-${platform}`}
                    inputMode="url"
                    {...register(`linktree.socials.${index}.url`)}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="sticky bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 text-ui-sm">
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
