import { describe, expect, it } from "vitest";
import { positionSchema } from "./position-schema.js";

const base = {
  title: "Director de Miembro Individual",
  titleFemale: "Directora de Miembro Individual",
  category: "JDL" as const,
  grants: ["Membership" as const],
  term: 2026,
  description: "Acompaña a los miembros individuales.",
};

const comision = {
  title: "Comisión de Conducta y Ética",
  sigla: "CCE",
  category: "Comision" as const,
  grants: [] as const,
  term: null,
  description: "Vela por la conducta y la ética.",
};

describe("positionSchema", () => {
  it("accepts a JDL dirección with a term", () => {
    expect(positionSchema.safeParse(base).success).toBe(true);
  });
  it("accepts a CEL cargo without titleFemale (derived)", () => {
    const cel = { ...base, category: "CEL" as const, term: null, titleFemale: undefined };
    expect(positionSchema.safeParse(cel).success).toBe(true);
  });
  it("rejects JDL without term", () => {
    expect(positionSchema.safeParse({ ...base, term: null }).success).toBe(false);
  });
  it("rejects CEL with term", () => {
    expect(positionSchema.safeParse({ ...base, category: "CEL", term: 2026 }).success).toBe(false);
  });
  it("accepts a comisión with sigla and no grants", () => {
    expect(positionSchema.safeParse(comision).success).toBe(true);
  });
  it("rejects a comisión without sigla", () => {
    expect(positionSchema.safeParse({ ...comision, sigla: undefined }).success).toBe(false);
  });
  it("rejects a comisión that grants permissions", () => {
    expect(positionSchema.safeParse({ ...comision, grants: ["Admin"] }).success).toBe(false);
  });
  it("rejects a comisión with a term", () => {
    expect(positionSchema.safeParse({ ...comision, term: 2026 }).success).toBe(false);
  });
  it("rejects a non-comisión carrying a sigla", () => {
    expect(positionSchema.safeParse({ ...base, sigla: "XYZ" }).success).toBe(false);
  });
  it("rejects unknown grant roles", () => {
    expect(positionSchema.safeParse({ ...base, grants: ["SuperUser"] }).success).toBe(false);
  });
});
