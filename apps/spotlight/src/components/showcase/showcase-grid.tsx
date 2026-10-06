import { useMemo, useState } from "react";
import type { AreaOfOpportunity, ShowcaseItem } from "@luminova/types/engine";
import { AreaFilter } from "./area-filter";
import { ShowcaseCardGrid } from "./showcase-card-grid";

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
          Aún no hay proyectos publicados en esta área.
        </p>
      ) : (
        <ShowcaseCardGrid items={filtered} />
      )}
    </div>
  );
}
