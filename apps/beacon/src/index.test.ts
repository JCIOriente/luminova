import { describe, expect, it } from "vitest";
import { awardPoints, confirmOnProgramReport, confirmOnProjectReport, setUserRoles } from "./index";

describe("beacon exports", () => {
  it("exports the awardPoints check-in trigger", () => {
    expect(awardPoints).toBeDefined();
  });
  it("exports the report-confirmation triggers", () => {
    expect(confirmOnProgramReport).toBeDefined();
    expect(confirmOnProjectReport).toBeDefined();
  });
  it("re-exports the setUserRoles callable", () => {
    expect(setUserRoles).toBeDefined();
  });
});
