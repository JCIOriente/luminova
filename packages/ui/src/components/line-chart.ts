export function scaleY(value: number, min: number, max: number, h: number): number {
  const span = max - min;
  const t = span === 0 ? 0.5 : (value - min) / span;
  return Number((h * (1 - t)).toFixed(10));
}

function xAt(i: number, n: number, w: number): number {
  return n <= 1 ? 0 : (w * i) / (n - 1);
}

export function seriesPath(
  values: readonly number[],
  w: number,
  h: number,
  min: number,
  max: number,
): string {
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i, values.length, w).toFixed(2)} ${scaleY(v, min, max, h).toFixed(2)}`,
    )
    .join(" ");
}

export function areaPath(
  values: readonly number[],
  w: number,
  h: number,
  min: number,
  max: number,
): string {
  const line = seriesPath(values, w, h, min, max);
  return `${line} L${w.toFixed(2)} ${h.toFixed(2)} L0.00 ${h.toFixed(2)} Z`;
}

export interface ChartSeries {
  label: string;
  color: string;
  values: readonly number[];
}

/** Shared min/max across all series so they sit on one Y scale, with a small pad. */
export function sharedDomain(series: readonly ChartSeries[]): { min: number; max: number } {
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || 1;
  return { min: lo - pad, max: hi + pad };
}
