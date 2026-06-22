import { Reveal, ImgSlot } from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS, type AreaOfOpportunity } from "@luminova/types/engine";
import type { ShowcaseItem } from "@luminova/types/engine";
import { useFeaturedList } from "../showcase/use-showcase";
import { ProgramsSkeleton } from "./programs-skeleton";

const AREA_TINT: Record<AreaOfOpportunity, "blue" | "teal" | "navy"> = {
  DesarrolloIndividual: "blue",
  DesarrolloComunitario: "teal",
  NegociosEmprendimiento: "navy",
  CooperacionInternacional: "blue",
};

function ShowcaseProgramCard({ item, index }: { item: ShowcaseItem; index: number }) {
  const areaLabel = AREA_OF_OPPORTUNITY_LABELS[item.category];
  const cover = item.photos[0]?.url ?? null;
  const tint = AREA_TINT[item.category];

  return (
    <Reveal delay={index * 60}>
      <article className="program-card">
        {cover ? (
          <div className="showcase-card-cover" style={{ aspectRatio: "3/2" }}>
            <img
              src={cover}
              alt={item.title}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <ImgSlot label={areaLabel} tint={tint} className="rounded-none border-0" />
        )}
        <div className="body">
          <div className="tag">{areaLabel}</div>
          <h3 className="t-h4" style={{ margin: 0 }}>
            {item.title}
          </h3>
          <p style={{ margin: "10px 0 0", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
            {item.description}
          </p>
        </div>
      </article>
    </Reveal>
  );
}

export default function HomePrograms() {
  const { data, loading, error } = useFeaturedList();

  if (loading) {
    return <ProgramsSkeleton />;
  }

  if (error || data.length === 0) {
    return null;
  }

  return (
    <div className="program-grid">
      {data.map((item, i) => (
        <ShowcaseProgramCard key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}
