import type { PositionInput } from "@luminova/types";

export function toPositionCreateDoc(data: PositionInput) {
  return { ...data, active: true, deletedAt: null };
}

export function toPositionUpdateDoc(data: PositionInput) {
  return { ...data };
}
