export const BOARD_GROUPS = ["CEL", "JDL"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

/** Curated public projection of a current-term board member. Beacon writes it
 *  (from onBoardMemberWritten); world-read. Public fields only — no PII, no grants. */
export interface BoardShowcaseItem {
  id: string;
  name: string;
  /** Gender-aware Spanish role title, e.g. "Secretaria". */
  title: string;
  /** CEL (Comité Ejecutivo) or JDL (Direcciones) — drives spotlight grouping. */
  group: BoardGroup;
  /** Host-constrained Firebase Storage download URL (the member's profile photo). */
  portraitUrl: string;
}

/** Map a Position.category to its public board group. Comisión → null (not shown). */
export function boardGroupFromCategory(category: unknown): BoardGroup | null {
  return category === "CEL" || category === "JDL" ? category : null;
}
