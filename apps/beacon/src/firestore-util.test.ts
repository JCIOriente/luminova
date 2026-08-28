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

  it("stays serializable when the cut lands mid-surrogate-pair", () => {
    // `.slice` can split an astral pair into a lone surrogate. JSON.stringify has been
    // well-formed since ES2019 and escapes it, so the log entry survives — this pins that the
    // helper never produces something the structured sink would reject.
    const astral = "𝒳".repeat(40); // 2 UTF-16 units each, so the 64-char cut lands mid-pair
    expect(() => JSON.stringify({ id: truncateForLog(astral) })).not.toThrow();
    expect(JSON.parse(JSON.stringify({ id: truncateForLog(astral) }))).toBeTruthy();
  });
});
