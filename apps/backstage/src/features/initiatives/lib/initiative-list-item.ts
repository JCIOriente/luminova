import type { InitiativeCore, InitiativeKind } from "@luminova/types";

export type InitiativeListItem = InitiativeCore & { kind: InitiativeKind };

export function tagKind(rows: InitiativeCore[], kind: InitiativeKind): InitiativeListItem[] {
  return rows.map((r) => ({ ...r, kind }));
}
