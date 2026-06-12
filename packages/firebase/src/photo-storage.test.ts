import { describe, it, expect } from "vitest";
import { initiativePhotoPath, activityPhotoPath } from "./photo-storage";

describe("photo-storage paths", () => {
  it("maps Project to the projects collection", () => {
    expect(initiativePhotoPath("Project", "p1", "abc")).toBe("projects/p1/photos/abc.jpg");
  });
  it("maps Program to the programs collection", () => {
    expect(initiativePhotoPath("Program", "g1", "xyz")).toBe("programs/g1/photos/xyz.jpg");
  });
  it("builds the activity path", () => {
    expect(activityPhotoPath("a1", "def")).toBe("activities/a1/photos/def.jpg");
  });
});
