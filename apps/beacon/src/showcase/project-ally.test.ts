import { describe, it, expect } from "vitest";
import { projectAlly } from "./project-ally.js";

const LOGO = "https://firebasestorage.googleapis.com/v0/b/jci/o/allies%2Fa1%2Flogo?alt=media";

const ok = {
  companyName: "Unifranz",
  logoUrl: LOGO,
  category: "University",
  active: true,
  deletedAt: null,
};

describe("projectAlly", () => {
  it("projects a complete active ally", () => {
    expect(projectAlly("a1", ok)).toEqual({
      id: "a1",
      name: "Unifranz",
      logoUrl: LOGO,
      category: "University",
    });
  });
  it("drops a soft-deleted ally", () => {
    expect(projectAlly("a1", { ...ok, active: false, deletedAt: {} })).toBeNull();
  });
  it("drops an ally with no logo", () => {
    expect(projectAlly("a1", { ...ok, logoUrl: null })).toBeNull();
  });
  it("drops a non-https logo (no public leak of http)", () => {
    expect(projectAlly("a1", { ...ok, logoUrl: LOGO.replace("https://", "http://") })).toBeNull();
  });
  it("drops a logo hosted off Firebase Storage (insider-injected url)", () => {
    expect(projectAlly("a1", { ...ok, logoUrl: "https://evil.example.com/x.png" })).toBeNull();
  });
  it("drops an unknown category", () => {
    expect(projectAlly("a1", { ...ok, category: "Nope" })).toBeNull();
  });
  it("drops an empty name", () => {
    expect(projectAlly("a1", { ...ok, companyName: "" })).toBeNull();
  });
});
