import { describe, expect, it } from "vitest";
import { needsPublicProfileDefault, PUBLIC_PROFILE_DEFAULT } from "./default-public-profile.js";
import { projectBoard, type BoardCargo } from "./project-board.js";

const PROJECT = "jci-oriente";
const boardMember = {
  name: "Arnold Gandarillas",
  profilePicture: `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t`,
  uid: "auth-uid-1",
  status: "Activo",
  active: true,
  deletedAt: null,
};
const celCargo: BoardCargo = { category: "CEL", title: "Secretario" };
const project = (id: string, member: Record<string, unknown>, cargo: BoardCargo | null) =>
  projectBoard(id, member, cargo, PROJECT);

describe("needsPublicProfileDefault", () => {
  it("stamps a doc created without the key", () => {
    expect(needsPublicProfileDefault({ name: "Ana" })).toBe(true);
  });

  it("never overwrites a decision already on the doc", () => {
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: false })).toBe(false);
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: true })).toBe(false);
    // An explicit null is still a present key — re-stamping would fight the writer, and
    // the write itself would re-fire this trigger.
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: null })).toBe(false);
  });

  it("does nothing without a document", () => {
    expect(needsPublicProfileDefault(undefined)).toBe(false);
  });

  it("stamps a value the public projection actually publishes on", () => {
    // projectBoard gates on `publicProfile !== true`, so the default is only a default
    // if it is exactly `true` — this pins the two ends together rather than echoing the
    // constant back at itself.
    expect(
      project("m1", { ...boardMember, publicProfile: PUBLIC_PROFILE_DEFAULT }, celCargo),
    ).not.toBeNull();
  });
});
