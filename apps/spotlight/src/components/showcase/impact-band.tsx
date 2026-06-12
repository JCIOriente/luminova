import type { ShowcaseItem } from "@luminova/types/engine";
import { formatES } from "./format";

function Stat({
  value,
  label,
  emphasis,
}: {
  value: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "showcase-detail-stat"
          : "showcase-detail-stat showcase-detail-stat--custom"
      }
    >
      <div className="v t-num">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function ImpactBand({ impact }: { impact: ShowcaseItem["impact"] }) {
  return (
    <div className="showcase-detail-band">
      <Stat value={formatES(impact.personsImpacted)} label="personas impactadas" emphasis />
      <Stat value={formatES(impact.volunteers)} label="voluntarios" emphasis />
      {impact.custom.map((metric, i) => (
        <Stat
          key={`${metric.label}-${i}`}
          value={metric.value}
          label={metric.label}
        />
      ))}
    </div>
  );
}
