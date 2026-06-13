import { useMemo, useState } from "react";
import { Reveal } from "@luminova/ui";
import type { AreaOfOpportunity, ShowcaseItem } from "@luminova/types/engine";
import { AreaFilter } from "./area-filter";
import { ShowcaseCard } from "./showcase-card";

export function ShowcaseGrid({ items }: { items: ShowcaseItem[] }) {
  const [area, setArea] = useState<AreaOfOpportunity | null>(null);

  const filtered = useMemo(
    () => (area === null ? items : items.filter((it) => it.category === area)),
    [items, area],
  );

  return (
    <div>
      <AreaFilter value={area} onChange={setArea} />
      {filtered.length === 0 ? (
        <p className="showcase-empty">
          Pronto compartiremos aquí los proyectos que vamos completando.
        </p>
      ) : (
        <div className="showcase-grid">
          {filtered.map((item, i) => (
            <Reveal key={item.id} delay={i * 60}>
              <ShowcaseCard item={item} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
