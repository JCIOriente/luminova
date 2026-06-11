import type { Timestamp } from "firebase/firestore";
import type { Role } from "./permission-role.js";
import type { MemberGender } from "./member.js";

export const POSITION_CATEGORIES = ["CEL", "JDL", "Comision"] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];

/** Catalog entry: a CEL cargo (fixed), JDL dirección (per term) or comisión (evergreen). */
export interface Position {
  id: string;
  title: string;
  /** Override for the feminine form. When absent, derived by femaleTitle(). */
  titleFemale?: string | null;
  /** Comisión acronym, unused for CEL/JDL. */
  sigla?: string | null;
  category: PositionCategory;
  /** Permission claim roles this position confers. Empty = chip only, no power. */
  grants: Role[];
  /** JDL direcciones belong to one term (year); CEL and comisiones are evergreen. */
  term: number | null;
  description: string;
  active: boolean;
  deletedAt: Timestamp | null;
}

/** A member's assignments within one term: at most one cargo + any comisiones. */
export interface TermPositions {
  cargoId: string | null;
  comisionIds: string[];
  /** Uid of whoever wrote this term's assignment. Drives the claims-sync trust
   *  gate: power grants are honored only when this uid is an Admin. Absent on
   *  pre-K4 (K2) docs → treated as untrusted (power grants dropped). */
  assignedBy?: string;
}

/** Derive the feminine form: feminize the FIRST word (-o→-a, -e→-a, else +a),
 *  keep the rest. Irregular multi-word titles need an explicit titleFemale. */
export function femaleTitle(title: string): string {
  const words = title.split(" ");
  const first = words[0] ?? "";
  const rest = words.slice(1);
  let f: string;
  if (/o$/.test(first)) f = first.replace(/o$/, "a");
  else if (/e$/.test(first)) f = first.replace(/e$/, "a");
  else f = first + "a";
  return [f, ...rest].join(" ");
}

export function positionTitle(
  position: Pick<Position, "title" | "titleFemale">,
  gender: MemberGender | undefined,
): string {
  if (gender !== "Femenino") return position.title;
  return position.titleFemale ?? femaleTitle(position.title);
}

export function currentTermKey(now = new Date()): string {
  return String(now.getUTCFullYear());
}
