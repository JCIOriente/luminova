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
    expect(toPositionCreateDoc(input)).toEqual({
      ...input,
      sigla: null,
      active: true,
      deletedAt: null,
    });
  });
  it("updates editable fields only", () => {
    expect(toPositionUpdateDoc(input)).toEqual({ ...input, sigla: null });
  });
});

const cel = {
  title: "Presidente",
  titleFemale: undefined,
  sigla: undefined,
  category: "CEL" as const,
  grants: ["Admin" as const],
  term: null,
  description: "Dirige el capítulo.",
};

describe("position mapper null-coercion", () => {
  it("create: undefined titleFemale/sigla become null (Firestore-safe)", () => {
    const doc = toPositionCreateDoc(cel);
    expect(doc.titleFemale).toBeNull();
    expect(doc.sigla).toBeNull();
    expect(doc.active).toBe(true);
    expect(doc.deletedAt).toBeNull();
  });
  it("update: keeps provided values, nulls absent ones", () => {
    const doc = toPositionUpdateDoc({ ...cel, sigla: "CCE", category: "Comision", grants: [] });
    expect(doc.sigla).toBe("CCE");
    expect(doc.titleFemale).toBeNull();
  });
});
