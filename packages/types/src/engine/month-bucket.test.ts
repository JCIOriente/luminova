import { describe, expect, it } from "vitest";
import { monthBucketFromMillis } from "./month-bucket.js";

describe("monthBucketFromMillis", () => {
  it("returns UTC YYYY-MM", () => {
    expect(monthBucketFromMillis(Date.UTC(2026, 5, 14, 19, 0))).toBe("2026-06");
    expect(monthBucketFromMillis(Date.UTC(2026, 0, 1, 0, 0))).toBe("2026-01");
    expect(monthBucketFromMillis(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12");
  });

  it("keys by the UTC instant, not any local offset", () => {
    // 2026-07-01T02:00Z is still June 30 in Bolivia (UTC-4) but the bucket is UTC
    expect(monthBucketFromMillis(Date.UTC(2026, 6, 1, 2, 0))).toBe("2026-07");
  });
});
