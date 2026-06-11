import { describe, expect, it } from "vitest";
import { toPositionCreateDoc, toPositionUpdateDoc } from "./position-mapper";

const input = {
  title: "Director de Comunicación",
  titleFemale: "Directora de Comunicación",
  category: "JDL" as const,
  grants: [],
  term: 2026,
  description: "Comunicación del capítulo.",
};

describe("position-mapper", () => {
  it("creates with system defaults", () => {
    expect(toPositionCreateDoc(input)).toEqual({ ...input, active: true, deletedAt: null });
  });
  it("updates editable fields only", () => {
    expect(toPositionUpdateDoc(input)).toEqual(input);
  });
});
