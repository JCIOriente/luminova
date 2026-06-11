import type { TermPositions } from "@luminova/types";

export interface SafeMember {
  uid?: string;
  positions: Record<string, TermPositions>;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Extract a structurally-safe member from raw Firestore data. Malformed term
 *  entries are dropped (not thrown) so a bad doc can't cause a retry storm.
 *  An absent comisionIds defaults to [] (the cargo grant is still honored);
 *  a present-but-malformed comisionIds drops the entry. */
export function parseMember(raw: unknown): SafeMember {
  const data = (raw ?? {}) as { uid?: unknown; positions?: unknown };
  const uid = typeof data.uid === "string" ? data.uid : undefined;
  const positions: Record<string, TermPositions> = {};
  if (data.positions && typeof data.positions === "object" && !Array.isArray(data.positions)) {
    for (const [term, value] of Object.entries(data.positions as Record<string, unknown>)) {
      const v = value as { cargoId?: unknown; comisionIds?: unknown; assignedBy?: unknown };
      if (!v || typeof v !== "object") continue;
      const cargoId =
        typeof v.cargoId === "string" ? v.cargoId : v.cargoId === null ? null : undefined;
      if (cargoId === undefined) continue;
      if (v.comisionIds !== undefined && !isStringArray(v.comisionIds)) continue;
      positions[term] = {
        cargoId,
        comisionIds: isStringArray(v.comisionIds) ? v.comisionIds : [],
        ...(typeof v.assignedBy === "string" ? { assignedBy: v.assignedBy } : {}),
      };
    }
  }
  return { uid, positions };
}
