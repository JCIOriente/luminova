import type { Activity, InitiativeImpact } from "@luminova/types";
import { EmptyState } from "@luminova/ui";
import { groupActivityPhotos } from "../lib/gallery";
import { InitiativeStatCard } from "./initiative-stat-card";
import { PhotoGallery } from "./photo-gallery";
import type { InitiativeListItem } from "../lib/initiative-list-item";

interface InitiativeCompletedProps {
  impact: InitiativeImpact;
  activities: Activity[];
  item: InitiativeListItem;
}

export function InitiativeCompleted({ impact, activities, item }: InitiativeCompletedProps) {
  const groups = groupActivityPhotos(activities);
  const hasDestacadas = item.photos.length > 0;
  const hasGallery = hasDestacadas || groups.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <h2 className="text-[15px] font-semibold text-ink-1">Resumen de cierre</h2>
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">{impact.closingSummary}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink-1">Logros del proyecto</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InitiativeStatCard
            label="Personas impactadas"
            value={impact.personsImpacted.toLocaleString("es")}
          />
          <InitiativeStatCard label="Voluntarios" value={impact.volunteers.toLocaleString("es")} />
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
        {!hasGallery ? (
          <EmptyState title="Aún no hay fotos de actividades" />
        ) : (
          <>
            {hasDestacadas && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                  Destacadas
                </h3>
                <PhotoGallery photos={item.photos} showCover />
              </div>
            )}
            {groups.map((group) => (
              <div key={group.activityId} className="flex flex-col gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                  {group.title}
                </h3>
                <PhotoGallery photos={group.photos} />
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
