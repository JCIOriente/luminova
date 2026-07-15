import type { ReactNode } from "react";
import { RippleSVG } from "@luminova/ui";

export function AreaCard({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <article className="area-card">
      <div className="ripple-hover">
        <RippleSVG rings={4} stroke={5} size={200} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="num">{number}</span>
      </div>
      <div className="icon-box">{icon}</div>
      <h3 className="t-h4" style={{ margin: 0 }}>
        {title}
      </h3>
      <p
        className="t-body text-ui-lg"
        style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.55 }}
      >
        {description}
      </p>
    </article>
  );
}

export function TimelineItem({
  year,
  title,
  description,
}: {
  year: string;
  title: string;
  description: string;
}) {
  return (
    <div className="timeline-item">
      <div className="year">{year}</div>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ImpactStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="impact-stat">
      <div className="v t-num">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}
