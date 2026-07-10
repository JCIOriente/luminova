import { Reveal } from "@luminova/ui";
import clsx from "clsx";
import type { ShowcaseItem } from "@luminova/types/engine";
import { ShowcaseCard } from "./showcase-card";

export function ShowcaseCardGrid({
  items,
  variant = "default",
}: {
  items: ShowcaseItem[];
  variant?: "default" | "featured";
}) {
  return (
    <div className={clsx("showcase-grid", variant === "featured" && "showcase-grid-featured")}>
      {items.map((item, i) => (
        <Reveal key={item.id} delay={i * 60}>
          <ShowcaseCard item={item} />
        </Reveal>
      ))}
    </div>
  );
}
