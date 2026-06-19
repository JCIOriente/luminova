import { Reveal } from "@luminova/ui";
import type { ShowcaseItem } from "@luminova/types/engine";
import { ShowcaseCard } from "./showcase-card";

export function ShowcaseCardGrid({ items }: { items: ShowcaseItem[] }) {
  return (
    <div className="showcase-grid">
      {items.map((item, i) => (
        <Reveal key={item.id} delay={i * 60}>
          <ShowcaseCard item={item} />
        </Reveal>
      ))}
    </div>
  );
}
