export type PageToken = number | "…";

export function pageWindow(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (current <= 4) return [...range(1, 5), "…", total];
  if (current >= total - 3) return [1, "…", ...range(total - 4, total)];
  return [1, "…", current - 1, current, current + 1, "…", total];
}
