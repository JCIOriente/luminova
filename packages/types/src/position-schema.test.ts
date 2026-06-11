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
  it("rejects a comisión with a term", () => {
    expect(positionSchema.safeParse({ ...base, category: "Comision", term: 2026 }).success).toBe(
      false,
    );
  });
  it("rejects unknown grant roles", () => {
    expect(positionSchema.safeParse({ ...base, grants: ["SuperUser"] }).success).toBe(false);
  });

  it("rejects JDL with NaN term — produces 'Requerido.' error", () => {
    const result = positionSchema.safeParse({ ...base, term: NaN });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Requerido."))).toBe(true);
    }
  });

  it("rejects JDL with term before year 2000", () => {
    const result = positionSchema.safeParse({ ...base, term: 1999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Año inválido."))).toBe(true);
    }
  });
});
