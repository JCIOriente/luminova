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

describe("positionSchema", () => {
  it("accepts a JDL dirección with a term", () => {
    expect(positionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects JDL without term", () => {
    expect(positionSchema.safeParse({ ...base, term: null }).success).toBe(false);
  });
  it("rejects CEL with term", () => {
    expect(positionSchema.safeParse({ ...base, category: "CEL", term: 2026 }).success).toBe(false);
  });
  it("accepts an evergreen comisión without grants", () => {
    const comision = { ...base, category: "Comision" as const, term: null, grants: [] };
    expect(positionSchema.safeParse(comision).success).toBe(true);
  });
  it("rejects unknown grant roles", () => {
    expect(positionSchema.safeParse({ ...base, grants: ["SuperUser"] }).success).toBe(false);
  });
});
