import { describe, expect, it } from "vitest";
import { sectionTitle } from "./breadcrumb";

describe("sectionTitle", () => {
  it("returns the nav label for a known path", () => {
    expect(sectionTitle("/")).toBe("Inicio");
    expect(sectionTitle("/members")).toBe("Miembros");
    expect(sectionTitle("/allies")).toBe("Aliados");
  });

  it("falls back to empty string for unknown paths", () => {
    expect(sectionTitle("/nope")).toBe("");
  });
});
