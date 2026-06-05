import { describe, expect, it } from "vitest";
import { FUNCTION_NAME, awardPoints, getMemberPointsRef } from "./index";

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
});
