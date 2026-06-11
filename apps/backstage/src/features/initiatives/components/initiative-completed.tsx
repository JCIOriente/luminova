import type { InitiativeImpact } from "@luminova/types";
import { InitiativeStatCard } from "./initiative-stat-card";

interface InitiativeCompletedProps {
  impact: InitiativeImpact;
}

export function InitiativeCompleted({ impact }: InitiativeCompletedProps) {
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
          <InitiativeStatCard
            label="Voluntarios"
            value={impact.volunteers.toLocaleString("es")}
          />
          {impact.custom.map((metric, i) => (
            <InitiativeStatCard key={`${metric.label}-${i}`} label={metric.label} value={metric.value} />
          ))}
        </div>
      </section>
    </div>
  );
}
