import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { computePunctualityFactor } from "./compute-punctuality";

const start = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));
const within = Timestamp.fromDate(new Date("2026-06-06T18:14:00Z"));
const late = Timestamp.fromDate(new Date("2026-06-06T18:16:00Z"));
const exactly15 = Timestamp.fromDate(new Date("2026-06-06T18:15:00Z"));

describe("computePunctualityFactor", () => {
  it("is 1.0 for non-attendee roles regardless of timing", () => {
    expect(computePunctualityFactor({ role: "Director", checkInAt: late, startAt: start })).toBe(1);
    expect(computePunctualityFactor({ role: "Team", checkInAt: null, startAt: start })).toBe(1);
  });

  it("is 1.0 for an attendee within the 15-minute tolerance (inclusive)", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: within, startAt: start })).toBe(
      1,
    );
    expect(
      computePunctualityFactor({ role: "Attendee", checkInAt: exactly15, startAt: start }),
    ).toBe(1);
  });

  it("is 0.5 for an attendee past the tolerance", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: late, startAt: start })).toBe(
      0.5,
    );
  });

  it("is 0.5 for an attendee with no check-in", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: null, startAt: start })).toBe(
      0.5,
    );
  });
});
