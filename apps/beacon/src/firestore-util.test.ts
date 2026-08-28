import { describe, expect, it } from "vitest";
import { truncateForLog } from "./firestore-util.js";

// A shared primitive across three claims-sync log sites, previously exercised only through
// them — so its boundary was never asserted anywhere. It exists because `isSafeDocId` tolerates
// 1500 bytes and Cloud Logging drops an over-large entry ENTIRELY, which loses the anomaly
// exactly when it is biggest.
describe("truncateForLog", () => {
  it("returns a short value unchanged, with no marker", () => {
    expect(truncateForLog("pos-presidente")).toBe("pos-presidente");
    expect(truncateForLog("")).toBe("");
  });

  it("BLOCKING: bounds anything longer, keeping the head and marking the cut", () => {
    const long = "x".repeat(1500);
    const out = truncateForLog(long);
    expect(out).toHaveLength(65); // 64 + the ellipsis
    expect(out.startsWith("x".repeat(64))).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not truncate at exactly the cap, and does one char past it", () => {
    // The off-by-one that a `>=` would introduce: a 64-char id is representable in full, so
    // marking it as cut would misreport the anomaly it exists to describe.
    expect(truncateForLog("y".repeat(64))).toBe("y".repeat(64));
    expect(truncateForLog("y".repeat(65))).toBe(`${"y".repeat(64)}…`);
  });

  // This case used to be asserted with an ALL-astral fixture, which cannot produce it: pairs
  // are 2 units each and the cap is 64, an even index, so the cut always landed ON a boundary.
  // Both of its assertions were unconditionally true besides — JSON.stringify has not thrown on
  // a lone surrogate since ES2019, and `expect(JSON.parse(…)).toBeTruthy()` holds for every
  // object. A leading BMP character is what shifts the pairs onto odd indices.
  it("BLOCKING: never emits a lone surrogate, even when the cut lands mid-pair", () => {
    const mixed = `a${"𝒳".repeat(40)}`;
    // The premise, asserted rather than claimed: this fixture really does split a pair.
    expect(mixed.slice(0, 64).isWellFormed()).toBe(false);

    const out = truncateForLog(mixed);
    expect(out.isWellFormed()).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    // Round-trips as the SAME string — an escaped orphan would come back as \uD835.
    expect(JSON.parse(JSON.stringify({ id: out })).id).toBe(out);
  });

  it("keeps the full cap when the boundary is clean", () => {
    // The orphan trim must cost one char only when there IS an orphan.
    const astral = "𝒳".repeat(40); // pairs on even indices: the 64-char cut is a boundary
    expect(truncateForLog(astral)).toBe(`${astral.slice(0, 64)}…`);
  });
});
