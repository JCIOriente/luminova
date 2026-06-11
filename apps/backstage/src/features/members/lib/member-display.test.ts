import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { avatarColor, joinYear, actionMessage, memberPositionLabel } from "./member-display";

const positions = new Map([["pos-pres", { title: "Presidente", titleFemale: "Presidenta" }]]);

describe("memberPositionLabel", () => {
  it("resolves the gendered cargo title for the term", () => {
    const member = {
      gender: "Femenino" as const,
      role: "",
      positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } },
    };
    expect(memberPositionLabel(member, positions, "2026")).toBe("Presidenta");
  });
  it("falls back to the legacy role string", () => {
    expect(memberPositionLabel({ role: "Vocal" }, positions, "2026")).toBe("Vocal");
  });
  it("falls back to legacy role when cargoId is present but not in positionsById (dangling id)", () => {
    const member = {
      gender: "Masculino" as const,
      role: "Vocal",
      positions: { "2026": { cargoId: "pos-deleted", comisionIds: [] } },
    };
    expect(memberPositionLabel(member, positions, "2026")).toBe("Vocal");
  });
  it("falls back to Miembro when nothing is set", () => {
    expect(memberPositionLabel({ role: "" }, positions, "2026")).toBe("Miembro");
  });
});

describe("avatarColor", () => {
  it("is deterministic per id and returns a hex from the palette", () => {
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
    expect(avatarColor("abc")).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe("joinYear", () => {
  it("returns the UTC year of joinDate", () => {
    expect(joinYear(Timestamp.fromDate(new Date("2021-07-09T00:00:00Z")))).toBe(2021);
  });
});

describe("actionMessage", () => {
  it("uses feminine form when first name ends in a", () => {
    expect(actionMessage("María José", "deactivated")).toBe("María José fue desactivada");
    expect(actionMessage("Ana Gómez", "deleted")).toBe("Ana Gómez fue eliminada");
    expect(actionMessage("Sofía Paz", "disaffiliated")).toBe("Sofía Paz fue desafiliada");
  });
  it("uses masculine form otherwise", () => {
    expect(actionMessage("Carlos Ruiz", "deactivated")).toBe("Carlos Ruiz fue desactivado");
    expect(actionMessage("Beto Paz", "reactivated")).toBe("Beto Paz fue reactivado");
  });
  it("renamed/saved/created/invited copy", () => {
    expect(actionMessage("Ana", "saved")).toBe("Se guardaron los cambios de Ana");
    expect(actionMessage("Ana", "created")).toBe("Ana fue agregada");
    expect(actionMessage("Beto", "created")).toBe("Beto fue agregado");
    expect(actionMessage("Ana", "invited")).toBe("Invitación enviada a Ana");
  });
});
