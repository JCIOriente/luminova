import {
  AREAS_OF_OPPORTUNITY,
  AREA_OF_OPPORTUNITY_LABELS,
  type AreaOfOpportunity,
} from "@luminova/types/engine";

export function AreaFilter({
  value,
  onChange,
}: {
  value: AreaOfOpportunity | null;
  onChange: (v: AreaOfOpportunity | null) => void;
}) {
  return (
    <div className="showcase-filter" role="group" aria-label="Filtrar por área de oportunidad">
      <button
        type="button"
        className="showcase-pill"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        Todas
      </button>
      {AREAS_OF_OPPORTUNITY.map((area) => (
        <button
          key={area}
          type="button"
          className="showcase-pill"
          aria-pressed={value === area}
          onClick={() => onChange(area)}
        >
          {AREA_OF_OPPORTUNITY_LABELS[area]}
        </button>
      ))}
    </div>
  );
}
