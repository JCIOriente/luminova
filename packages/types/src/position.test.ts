import { describe, expect, it } from "vitest";
import { femaleTitle, positionTitle } from "./position.js";

describe("femaleTitle", () => {
  it("maps -o to -a", () => {
    expect(femaleTitle("Tesorero")).toBe("Tesorera");
    expect(femaleTitle("Secretario")).toBe("Secretaria");
  });
  it("maps -e to -a", () => {
    expect(femaleTitle("Presidente")).toBe("Presidenta");
  });
  it("adds -a to a consonant ending", () => {
    expect(femaleTitle("Director")).toBe("Directora");
    expect(femaleTitle("Asesor")).toBe("Asesora");
  });
  it("feminizes only the first word, keeping the rest", () => {
    expect(femaleTitle("Vicepresidente de Área")).toBe("Vicepresidenta de Área");
    expect(femaleTitle("Asesor Legal")).toBe("Asesora Legal");
  });
});

describe("positionTitle", () => {
  const base = { title: "Director" };
  it("returns title for non-female", () => {
    expect(positionTitle(base, "Masculino")).toBe("Director");
    expect(positionTitle(base, undefined)).toBe("Director");
  });
  it("derives the feminine when no override", () => {
    expect(positionTitle(base, "Femenino")).toBe("Directora");
  });
  it("uses an explicit titleFemale override when present", () => {
    expect(
      positionTitle({ title: "Pasado Presidente", titleFemale: "Pasada Presidenta" }, "Femenino"),
    ).toBe("Pasada Presidenta");
  });
});
