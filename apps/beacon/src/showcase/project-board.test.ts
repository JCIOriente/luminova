import { describe, it, expect } from "vitest";
import { projectBoard, currentCargoId, type BoardCargo } from "./project-board.js";

const PHOTO =
  "https://firebasestorage.googleapis.com/v0/b/jci/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t";

const member = {
  name: "Arnold Gandarillas",
  profilePicture: PHOTO,
  publicProfile: true,
  gender: "Masculino",
  active: true,
  deletedAt: null,
};

const celCargo: BoardCargo = {
  category: "CEL",
  title: "Secretario",
  titleFemale: "Secretaria",
};

describe("projectBoard", () => {
  it("projects a published CEL member", () => {
    expect(projectBoard("m1", member, celCargo)).toEqual({
      id: "m1",
      name: "Arnold Gandarillas",
      title: "Secretario",
      group: "CEL",
      portraitUrl: PHOTO,
    });
  });

  it("projects a JDL director into the JDL group", () => {
    const item = projectBoard("m1", member, { category: "JDL", title: "Director de Programas" });
    expect(item?.group).toBe("JDL");
    expect(item?.title).toBe("Director de Programas");
  });

  it("uses the feminine title for a female member (derived)", () => {
    const item = projectBoard(
      "m1",
      { ...member, gender: "Femenino" },
      { category: "CEL", title: "Tesorero" },
    );
    expect(item?.title).toBe("Tesorera");
  });

  it("prefers an explicit titleFemale over the derived form", () => {
    const item = projectBoard("m1", { ...member, gender: "Femenino" }, celCargo);
    expect(item?.title).toBe("Secretaria");
  });

  it("drops a member who has not opted in", () => {
    expect(projectBoard("m1", { ...member, publicProfile: false }, celCargo)).toBeNull();
    expect(projectBoard("m1", { ...member, publicProfile: undefined }, celCargo)).toBeNull();
  });

  it("drops a member with no current-term board cargo", () => {
    expect(projectBoard("m1", member, null)).toBeNull();
  });

  it("drops a Comisión cargo (chip-only, never public)", () => {
    expect(projectBoard("m1", member, { category: "Comision", title: "Comité X" })).toBeNull();
  });

  it("drops a portrait hosted off Firebase Storage (insider-injected url)", () => {
    expect(
      projectBoard("m1", { ...member, profilePicture: "https://evil.example.com/x.jpg" }, celCargo),
    ).toBeNull();
  });

  it("drops a non-https portrait", () => {
    expect(
      projectBoard(
        "m1",
        { ...member, profilePicture: PHOTO.replace("https://", "http://") },
        celCargo,
      ),
    ).toBeNull();
  });

  it("drops a member with no photo", () => {
    expect(projectBoard("m1", { ...member, profilePicture: null }, celCargo)).toBeNull();
  });

  it("drops a soft-deleted member", () => {
    expect(projectBoard("m1", { ...member, active: false, deletedAt: {} }, celCargo)).toBeNull();
  });

  it("drops a cargo with an empty title", () => {
    expect(projectBoard("m1", member, { category: "CEL", title: "" })).toBeNull();
  });
});

describe("currentCargoId", () => {
  const termKey = "2026";

  it("returns the cargo id for the current term", () => {
    expect(currentCargoId({ positions: { "2026": { cargoId: "pos-sec" } } }, termKey)).toBe(
      "pos-sec",
    );
  });

  it("returns null when the term has no cargo", () => {
    expect(currentCargoId({ positions: { "2026": { cargoId: null } } }, termKey)).toBeNull();
  });

  it("returns null for a different term", () => {
    expect(currentCargoId({ positions: { "2025": { cargoId: "pos-sec" } } }, termKey)).toBeNull();
  });

  it("returns null when positions is missing or malformed", () => {
    expect(currentCargoId({}, termKey)).toBeNull();
    expect(currentCargoId({ positions: [] }, termKey)).toBeNull();
  });
});
