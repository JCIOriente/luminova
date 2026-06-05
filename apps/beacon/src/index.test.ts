import { describe, expect, it } from "vitest";
import { FUNCTION_NAME, awardPoints, buildMemberPointsPath, getMemberPointsRef } from "./index";

describe("beacon", () => {
  it("exposes the awardPoints function name", () => {
    expect(FUNCTION_NAME).toBe("awardPoints");
  });

  it("exports the awardPoints trigger", () => {
    expect(awardPoints).toBeDefined();
  });

  it("exports a getMemberPointsRef helper", () => {
    expect(typeof getMemberPointsRef).toBe("function");
  });

  it("builds the memberPoints path from year/month/eventId", () => {
    expect(buildMemberPointsPath("2025", "03", "abc123")).toBe("memberPoints/2025/03/abc123");
  });
});
