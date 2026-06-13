import { describe, it, expect } from "vitest";
import { isReportGatedRole, PARTICIPATION_ROLES } from "./participation.js";

describe("isReportGatedRole", () => {
  it("does not gate attendance", () => {
    expect(isReportGatedRole("Attendee")).toBe(false);
  });

  it("gates every leadership role", () => {
    for (const role of PARTICIPATION_ROLES) {
      if (role === "Attendee") continue;
      expect(isReportGatedRole(role)).toBe(true);
    }
  });
});
