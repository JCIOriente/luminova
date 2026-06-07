import { describe, expect, it } from "vitest";
import { awardPoints, onProgramWritten, onProjectWritten, setUserRoles } from "./index";

describe("beacon exports", () => {
  it("exports the awardPoints check-in trigger", () => {
    expect(awardPoints).toBeDefined();
  });
  it("exports the initiative-write triggers", () => {
    expect(onProgramWritten).toBeDefined();
    expect(onProjectWritten).toBeDefined();
  });
  it("re-exports the setUserRoles callable", () => {
    expect(setUserRoles).toBeDefined();
  });
});
