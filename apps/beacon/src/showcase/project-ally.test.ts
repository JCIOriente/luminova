import { describe, it, expect } from "vitest";
import { projectAlly } from "./project-ally.js";

const ok = {
  companyName: "Unifranz",
  logoUrl: "https://cdn/x.png",
  category: "University",
  active: true,
  deletedAt: null,
};

describe("projectAlly", () => {
  it("projects a complete active ally", () => {
    expect(projectAlly("a1", ok)).toEqual({
      id: "a1",
      name: "Unifranz",
      logoUrl: "https://cdn/x.png",
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
    expect(projectAlly("a1", { ...ok, logoUrl: "http://cdn/x.png" })).toBeNull();
  });
  it("drops an unknown category", () => {
    expect(projectAlly("a1", { ...ok, category: "Nope" })).toBeNull();
  });
  it("drops an empty name", () => {
    expect(projectAlly("a1", { ...ok, companyName: "" })).toBeNull();
  });
});
