import { describe, expect, it } from "vitest";
import { activityKeys } from "./activity-keys";

describe("activityKeys", () => {
  it("builds a stable byId key", () => {
    expect(activityKeys.byId("act_1")).toEqual(["activities", "detail", "act_1"]);
  });
});
