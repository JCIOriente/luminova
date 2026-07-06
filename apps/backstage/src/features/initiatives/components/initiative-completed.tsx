import type { Activity, InitiativeImpact } from "@luminova/types";
import { Card, EmptyState, KpiCard } from "@luminova/ui";
import { groupActivityPhotos } from "../lib/gallery";
import { PhotoGallery } from "./photo-gallery";

const NUMBER_ES_BO = new Intl.NumberFormat("es-BO");

interface InitiativeCompletedProps {
  impact: InitiativeImpact;
  activities: Activity[];
}

export function InitiativeCompleted({ impact, activities }: InitiativeCompletedProps) {
  const groups = groupActivityPhotos(activities);

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" className="flex flex-col gap-3">
        <h2 className="text-ui-lg font-semibold text-ink-1">Resumen de cierre</h2>
        <p className="max-w-2xl text-ui-md leading-relaxed text-ink-2">{impact.closingSummary}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-ui-lg font-semibold text-ink-1">Logros del proyecto</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Personas impactadas"
            value={NUMBER_ES_BO.format(impact.personsImpacted)}
          />
          <KpiCard label="Voluntarios" value={NUMBER_ES_BO.format(impact.volunteers)} />
          {impact.custom.map((metric, i) => (
            <KpiCard key={`${metric.label}-${i}`} label={metric.label} value={metric.value} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ui-lg font-semibold text-ink-1">Galería de actividades</h2>
        {groups.length === 0 ? (
          <EmptyState title="Aún no hay fotos de actividades" />
        ) : (
          groups.map((group) => (
            <div key={group.activityId} className="flex flex-col gap-3">
              <h3 className="text-ui-2xs font-semibold uppercase tracking-wide text-ink-4">
                {group.title}
              </h3>
              <PhotoGallery photos={group.photos} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}
