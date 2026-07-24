import { CEL_POSITION_TITLES } from "./cel-titles.js";

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
  /** Statutory sort rank (gender-invariant): CEL by cargo order (0..7), JDL after
   *  all CEL. Spotlight breaks ties by name. Beacon computes it from the base title. */
  rank: number;
  /** Host-constrained Firebase Storage download URL (the member's profile photo). */
  portraitUrl: string;
}

/** Map a Position.category to its public board group. Comisión → null (not shown). */
export function boardGroupFromCategory(category: unknown): BoardGroup | null {
  return category === "CEL" || category === "JDL" ? category : null;
}

const CEL_ORDER = new Map(CEL_POSITION_TITLES.map((title, i) => [title, i]));
const JDL_RANK = 1000;

/** Gender-invariant sort rank from the cargo's BASE (masculine) title. CEL cargos
 *  rank by statutory order; an unknown CEL title sorts last within CEL; every JDL
 *  dirección shares one rank after all CEL (spotlight breaks the tie by name). */
export function boardRank(group: BoardGroup, baseTitle: string): number {
  if (group === "JDL") return JDL_RANK;
  return CEL_ORDER.get(baseTitle) ?? CEL_ORDER.size;
}
