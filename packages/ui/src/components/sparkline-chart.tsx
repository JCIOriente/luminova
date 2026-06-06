import { sparklinePoints, pointsToPath } from "./sparkline";

export function Sparkline({
  values,
  width = 84,
  height = 34,
  className,
  strokeWidth = 1.8,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}) {
  if (values.length < 2) return null;
  const d = pointsToPath(sparklinePoints(values, width, height, 3));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
