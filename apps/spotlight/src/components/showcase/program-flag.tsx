import type { ShowcaseItem } from "@luminova/types/engine";

export function ProgramFlag({ kind }: { kind: ShowcaseItem["kind"] }) {
  if (kind !== "Program") return null;
  return <span className="showcase-flag">Programa anual</span>;
}
