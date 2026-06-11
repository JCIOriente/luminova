import type { PositionInput } from "@luminova/types";

/** Firestore rejects `undefined`; the optional override/sigla store as null. */
export function toPositionCreateDoc(data: PositionInput) {
  return {
    ...data,
    titleFemale: data.titleFemale ?? null,
    sigla: data.sigla ?? null,
    active: true,
    deletedAt: null,
  };
}

export function toPositionUpdateDoc(data: PositionInput) {
  return { ...data, titleFemale: data.titleFemale ?? null, sigla: data.sigla ?? null };
}
