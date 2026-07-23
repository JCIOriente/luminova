import { describe, it, expect } from "vitest";
import { projectBoard, currentCargoId, type BoardCargo } from "./project-board.js";

const PROJECT = "jci-oriente";
const PHOTO = `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t`;
const project = (id: string, member: Record<string, unknown>, cargo: BoardCargo | null) =>
  projectBoard(id, member, cargo, PROJECT);

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
    expect(project("m1", member, celCargo)).toEqual({
      id: "m1",
      name: "Arnold Gandarillas",
      title: "Secretario",
      group: "CEL",
      portraitUrl: PHOTO,
    });
  });

  it("projects a JDL director into the JDL group", () => {
    const item = project("m1", member, { category: "JDL", title: "Director de Programas" });
    expect(item?.group).toBe("JDL");
    expect(item?.title).toBe("Director de Programas");
  });

  it("uses the feminine title for a female member (derived)", () => {
    const item = project(
      "m1",
      { ...member, gender: "Femenino" },
      { category: "CEL", title: "Tesorero" },
    );
    expect(item?.title).toBe("Tesorera");
  });

  it("prefers an explicit titleFemale over the derived form", () => {
    const item = project("m1", { ...member, gender: "Femenino" }, celCargo);
    expect(item?.title).toBe("Secretaria");
  });

  it("drops a member who has not opted in", () => {
    expect(project("m1", { ...member, publicProfile: false }, celCargo)).toBeNull();
    expect(project("m1", { ...member, publicProfile: undefined }, celCargo)).toBeNull();
  });

  it("drops a member with no current-term board cargo", () => {
    expect(project("m1", member, null)).toBeNull();
  });

  it("drops a Comisión cargo (chip-only, never public)", () => {
    expect(project("m1", member, { category: "Comision", title: "Comité X" })).toBeNull();
  });

  it("drops a portrait hosted off Firebase Storage (insider-injected url)", () => {
    expect(
      project("m1", { ...member, profilePicture: "https://evil.example.com/x.jpg" }, celCargo),
    ).toBeNull();
  });

  it("drops a portrait on another Firebase project's bucket (H1 cross-project)", () => {
    const foreign = `https://firebasestorage.googleapis.com/v0/b/evil-project.appspot.com/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t`;
    expect(project("m1", { ...member, profilePicture: foreign }, celCargo)).toBeNull();
  });

  it("drops a portrait pointing at a different member's object", () => {
    const otherObject = `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/members%2FmOTHER%2Fprofile.jpg?alt=media&token=t`;
    expect(project("m1", { ...member, profilePicture: otherObject }, celCargo)).toBeNull();
  });

  it("accepts the newer .firebasestorage.app bucket spelling", () => {
    const appHost = `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.firebasestorage.app/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t`;
    expect(project("m1", { ...member, profilePicture: appHost }, celCargo)?.portraitUrl).toBe(
      appHost,
    );
  });

  it("drops a non-https portrait", () => {
    expect(
      project("m1", { ...member, profilePicture: PHOTO.replace("https://", "http://") }, celCargo),
    ).toBeNull();
  });

  it("drops a member with no photo", () => {
    expect(project("m1", { ...member, profilePicture: null }, celCargo)).toBeNull();
  });

  it("drops a soft-deleted member", () => {
    expect(project("m1", { ...member, active: false, deletedAt: {} }, celCargo)).toBeNull();
  });

  it("drops a cargo with an empty title", () => {
    expect(project("m1", member, { category: "CEL", title: "" })).toBeNull();
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

  it("rejects a cargoId containing a slash (path-injection guard)", () => {
    expect(
      currentCargoId({ positions: { "2026": { cargoId: "pos/../secret" } } }, termKey),
    ).toBeNull();
  });
});
