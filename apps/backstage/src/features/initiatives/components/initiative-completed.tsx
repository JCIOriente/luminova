import type { Activity, InitiativeImpact } from "@luminova/types";
import { Card, EmptyState } from "@luminova/ui";
import { groupActivityPhotos } from "../lib/gallery";
import { InitiativeStatCard } from "./initiative-stat-card";
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
        <h2 className="text-[15px] font-semibold text-ink-1">Resumen de cierre</h2>
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">{impact.closingSummary}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink-1">Logros del proyecto</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InitiativeStatCard
            label="Personas impactadas"
            value={NUMBER_ES_BO.format(impact.personsImpacted)}
          />
          <InitiativeStatCard label="Voluntarios" value={NUMBER_ES_BO.format(impact.volunteers)} />
          {impact.custom.map((metric, i) => (
            <InitiativeStatCard
              key={`${metric.label}-${i}`}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold text-ink-1">Galería de actividades</h2>
        {groups.length === 0 ? (
          <EmptyState title="Aún no hay fotos de actividades" />
        ) : (
          groups.map((group) => (
            <div key={group.activityId} className="flex flex-col gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
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
