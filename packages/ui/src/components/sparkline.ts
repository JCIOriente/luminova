export interface Point {
  x: number;
  y: number;
}

/** Map a number series into a w×h box. Y is flipped so larger values sit higher.
 *  A flat series is centered vertically. `pad` insets all edges. */
export function sparklinePoints(values: number[], w: number, h: number, pad = 2): Point[] {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return values.map((v, i) => {
    const x = n === 1 ? pad + innerW / 2 : pad + (innerW * i) / (n - 1);
    const t = span === 0 ? 0.5 : (v - min) / span;
    const y = pad + innerH * (1 - t);
    return { x, y };
  });
}

export function pointsToPath(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}
