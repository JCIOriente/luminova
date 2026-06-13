import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { ImgSlot } from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS, type AreaOfOpportunity } from "@luminova/types/engine";
import type { ShowcaseItem } from "@luminova/types/engine";
import { formatES, formatMonthYear } from "./format";

const AREA_TINT: Record<AreaOfOpportunity, "blue" | "teal" | "navy"> = {
  DesarrolloIndividual: "blue",
  DesarrolloComunitario: "teal",
  NegociosEmprendimiento: "navy",
  CooperacionInternacional: "blue",
};

export const ShowcaseCard = memo(function ShowcaseCard({ item }: { item: ShowcaseItem }) {
  const cover = item.photos[0]?.url ?? null;
  const areaLabel = AREA_OF_OPPORTUNITY_LABELS[item.category];
  const completed = formatMonthYear(item.completedAt);

  return (
    <Link to="/impacto/$id" params={{ id: item.id }} className="showcase-card">
      <div className="showcase-card-cover">
        {cover ? (
          <img src={cover} alt={item.title} loading="lazy" />
        ) : (
          <ImgSlot
            label={areaLabel}
            tint={AREA_TINT[item.category]}
            aspect="3/2"
            className="h-full rounded-none border-0"
          />
        )}
      </div>
      <div className="showcase-card-body">
        <span className="showcase-card-area">{areaLabel}</span>
        <h3 className="t-h4 showcase-card-title">{item.title}</h3>
        <p className="showcase-card-impact t-num">
          {formatES(item.impact.personsImpacted)} personas impactadas
        </p>
        <p className="showcase-card-date">{completed}</p>
      </div>
    </Link>
  );
});
